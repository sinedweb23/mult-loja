'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminData } from '@/app/actions/admin'
import { podeAcessarPdv, podeAcessarRH } from '@/app/actions/perfis'
import { listarEmpresas } from '@/app/actions/empresas'

export interface ResultadoImportacaoColaboradores {
  sucesso: boolean
  criados: number
  atualizados: number
  erros: Array<{ linha: number; cpf: string; mensagem: string }>
}

function normalizarCPF(cpf: string): string {
  return (cpf || '').replace(/\D/g, '').trim()
}

/** CPF normalizado em 11 dígitos para uso como chave. Se vier 10 dígitos (zero à esquerda perdido no DB), completa. */
function cpfParaChave(cpf: string | number | null | undefined): string | null {
  const s = normalizarCPF(String(cpf ?? ''))
  if (s.length === 11) return s
  if (s.length === 10 && /^\d+$/.test(s)) return '0' + s
  return null
}

/** Separa uma linha CSV respeitando aspas duplas (campos entre "..." são um só, mesmo com vírgula dentro). */
function splitCSVLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === sep) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function parseCSV(content: string): Array<{ nome: string; cpf: string; email: string; re: string }> {
  // Remove BOM (Excel/Windows às vezes salva com BOM e quebra o reconhecimento do cabeçalho)
  const cleanContent = (content || '').replace(/^\uFEFF/, '').trim()
  const allLines = cleanContent.split(/\r?\n/).map((l) => l.trim())
  const lines = allLines.filter((l) => Boolean(l) && !l.startsWith('#'))
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase()
  // Aceita tab (TSV), ponto e vírgula ou vírgula como separador
  const sep = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ','
  const cols = splitCSVLine(lines[0], sep).map((c) => c.trim().replace(/^\uFEFF/, '').toLowerCase())
  let idxNome = cols.findIndex((c) => c === 'nome' || c === 'nome completo' || c === 'nome_completo')
  let idxCpf = cols.findIndex((c) => c === 'cpf')
  let idxEmail = cols.findIndex((c) => c === 'email')
  let idxRe = cols.findIndex((c) => c === 're' || c === 'registro')

  // Arquivo sem cabeçalho? Assume ordem: nome, cpf, email, re (índices 0, 1, 2, 3)
  let startRow = 1
  if (idxNome < 0 || idxCpf < 0) {
    const firstData = splitCSVLine(lines[0], sep).map((c) => c.trim())
    const firstCpfNorm = normalizarCPF((firstData[1] ?? ''))
    if (firstData.length >= 2 && firstCpfNorm.length === 11) {
      idxNome = 0
      idxCpf = 1
      idxEmail = 2
      idxRe = 3
      startRow = 0
    } else {
      return []
    }
  }

  const rows: Array<{ nome: string; cpf: string; email: string; re: string }> = []
  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], sep).map((c) => c.trim())
    const nome = (cells[idxNome] ?? '').trim()
    const cpf = (cells[idxCpf] ?? '').trim()
    const re = idxRe >= 0 ? (cells[idxRe] ?? '').trim() : ''
    const email = idxEmail >= 0 ? (cells[idxEmail] ?? '').trim() : ''
    if (nome || normalizarCPF(cpf)) {
      rows.push({ nome, cpf, email, re })
    }
  }
  return rows
}

/**
 * Processa CSV de colaboradores: por CPF, cria novo usuário (com perfil Colaborador) ou adiciona o perfil ao usuário existente.
 * Colunas esperadas: nome (ou "nome completo"), cpf, email (opcional), re.
 */
export async function processarImportacaoColaboradoresCSV(
  csvContent: string
): Promise<ResultadoImportacaoColaboradores> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) {
    return { sucesso: false, criados: 0, atualizados: 0, erros: [{ linha: 0, cpf: '', mensagem: 'Sem permissão' }] }
  }

  const empresas = await listarEmpresas()
  const listaEmpresas = Array.isArray(empresas) ? empresas : []
  let empresaId: string | null = null
  if (listaEmpresas.length === 1) {
    empresaId = (listaEmpresas[0] as { id: string }).id
  } else {
    try {
      const adminData = await getAdminData()
      empresaId = adminData?.empresa_id ?? null
    } catch {
      empresaId = null
    }
    if (!empresaId && listaEmpresas.length > 0) {
      empresaId = (listaEmpresas[0] as { id: string }).id
    }
  }

  const rows = parseCSV(csvContent)
  if (rows.length === 0) {
    return {
      sucesso: false,
      criados: 0,
      atualizados: 0,
      erros: [{ linha: 1, cpf: '', mensagem: 'CSV inválido ou vazio. Use o modelo: nome, cpf, email (opcional), re (opcional)' }],
    }
  }

  const admin = createAdminClient()
  const resultado: ResultadoImportacaoColaboradores = { sucesso: true, criados: 0, atualizados: 0, erros: [] }

  const { data: todosUsuarios } = await admin
    .from('usuarios')
    .select('id, nome, cpf, email')
  type UsuarioRow = { id: string; nome: string | null; cpf: string | null; email: string | null }
  const mapaPorCPF = new Map<string, UsuarioRow>()
  // Para cada CPF, manter só o usuário com menor id. Usar cpfParaChave para DB (pode vir 04921558876 ou 4921558876)
  for (const u of (todosUsuarios ?? []) as UsuarioRow[]) {
    const c = cpfParaChave(u.cpf)
    if (!c) continue
    const existente = mapaPorCPF.get(c)
    if (!existente || existente.id > u.id) mapaPorCPF.set(c, u)
  }

  for (let i = 0; i < rows.length; i++) {
    const linha = i + 2
    const { nome, cpf, email, re } = rows[i]
    // CSV pode vir 049.215.588-76 ou 04921558876; normalizar sempre para 11 dígitos
    const cpfNorm = cpfParaChave(cpf)

    if (!cpfNorm) {
      resultado.erros.push({ linha, cpf: cpf || '(vazio)', mensagem: 'CPF inválido (deve ter 10 ou 11 dígitos)' })
      continue
    }
    if (!nome) {
      resultado.erros.push({ linha, cpf: cpfNorm, mensagem: 'Nome completo é obrigatório' })
      continue
    }

    const usuarioExistente = mapaPorCPF.get(cpfNorm)

    if (usuarioExistente) {
      const { data: papeis } = await admin
        .from('usuario_papeis')
        .select('papel')
        .eq('usuario_id', usuarioExistente.id)
      const jaTemColaborador = (papeis ?? []).some((p: { papel: string }) => p.papel === 'COLABORADOR')

      const updates: Record<string, unknown> = {
        nome: nome || usuarioExistente.nome,
        cpf: cpfNorm,
        email: (email || usuarioExistente.email) || null,
        re_colaborador: re || null,
        updated_at: new Date().toISOString(),
      }
      if (empresaId) {
        updates.empresa_id = empresaId
      }
      const { error: errUp } = await admin
        .from('usuarios')
        .update(updates)
        .eq('id', usuarioExistente.id)
      if (errUp) {
        resultado.erros.push({ linha, cpf: cpfNorm, mensagem: errUp.message })
        continue
      }

      // Só adiciona o perfil COLABORADOR; nunca remove outros perfis (Admin, Operador, etc.)
      if (!jaTemColaborador) {
        const { error: errPapel } = await admin
          .from('usuario_papeis')
          .insert({ usuario_id: usuarioExistente.id, papel: 'COLABORADOR' })
        if (errPapel) {
          resultado.erros.push({ linha, cpf: cpfNorm, mensagem: 'Erro ao adicionar perfil: ' + errPapel.message })
        }
      }
      resultado.atualizados++
    } else {
      const { data: novoUsuario, error: errIns } = await admin
        .from('usuarios')
        .insert({
          auth_user_id: null,
          nome,
          cpf: cpfNorm,
          email: email || null,
          re_colaborador: re || null,
          empresa_id: empresaId,
          ativo: true,
        })
        .select('id')
        .single()

      if (errIns || !novoUsuario) {
        resultado.erros.push({ linha, cpf: cpfNorm, mensagem: errIns?.message ?? 'Erro ao criar usuário' })
        continue
      }

      const { error: errPapel } = await admin
        .from('usuario_papeis')
        .insert({ usuario_id: novoUsuario.id, papel: 'COLABORADOR' })
      if (errPapel) {
        resultado.erros.push({ linha, cpf: cpfNorm, mensagem: 'Usuário criado mas falha ao adicionar perfil: ' + errPapel.message })
      }
      resultado.criados++
      // Incluir no mapa para que o mesmo CPF em linhas seguintes do CSV atualize em vez de criar de novo
      mapaPorCPF.set(cpfNorm, {
        id: novoUsuario.id,
        nome,
        cpf: cpfNorm,
        email: email || null,
      } as UsuarioRow)
    }
  }

  return resultado
}

export interface ColaboradorListagem {
  id: string
  nome: string | null
  cpf: string | null
  email: string | null
  re_colaborador: string | null
  ativo: boolean
  empresa_id: string | null
  empresa_nome?: string | null
}

/** Lista colaboradores (usuários com perfil COLABORADOR em usuario_papeis). Admin ou RH. */
export async function listarColaboradores(): Promise<ColaboradorListagem[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const supabase = createAdminClient()
  const { data: papeis } = await supabase
    .from('usuario_papeis')
    .select('usuario_id')
    .eq('papel', 'COLABORADOR')
  const ids = [...new Set((papeis ?? []).map((p: { usuario_id: string }) => p.usuario_id))]
  if (ids.length === 0) return []

  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select(`
      id,
      nome,
      cpf,
      email,
      re_colaborador,
      ativo,
      empresa_id,
      empresas:empresa_id ( nome )
    `)
    .in('id', ids)
    .order('nome')

  if (error || !usuarios) return []
  return (usuarios as any[]).map((u) => ({
    id: u.id,
    nome: u.nome ?? null,
    cpf: u.cpf ?? null,
    email: u.email ?? null,
    re_colaborador: u.re_colaborador ?? null,
    ativo: !!u.ativo,
    empresa_id: u.empresa_id ?? null,
    empresa_nome: u.empresas?.nome ?? null,
  }))
}

/** Retorna os IDs de colaboradores que já tiveram movimentação (pedidos, consumo, transações ou abatimento). */
export async function getColaboradoresComMovimentacao(): Promise<string[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const admin = createAdminClient()
  const ids = new Set<string>()

  const [pedidosRes, consumoRes, transacoesRes] = await Promise.all([
    admin.from('pedidos').select('colaborador_id').not('colaborador_id', 'is', null),
    admin.from('consumo_colaborador_mensal').select('usuario_id'),
    admin.from('transacoes').select('usuario_id'),
  ])
  for (const p of pedidosRes.data ?? []) {
    const id = (p as { colaborador_id: string | null }).colaborador_id
    if (id) ids.add(id)
  }
  for (const c of consumoRes.data ?? []) {
    ids.add((c as { usuario_id: string }).usuario_id)
  }
  for (const t of transacoesRes.data ?? []) {
    ids.add((t as { usuario_id: string }).usuario_id)
  }
  try {
    const abatimentoRes = await admin.from('abatimento_colaborador_lancamento').select('usuario_id')
    for (const a of abatimentoRes.data ?? []) {
      ids.add((a as { usuario_id: string }).usuario_id)
    }
  } catch {
    // Tabela pode não existir em todos os projetos
  }
  return [...ids]
}

export type ColaboradorForm = {
  nome: string
  cpf: string
  email?: string | null
  re_colaborador?: string | null
  empresa_id?: string | null
}

/** Atualiza dados do colaborador. Apenas admin ou RH. */
export async function atualizarColaborador(
  usuarioId: string,
  dados: ColaboradorForm
): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }

  const cpfNorm = normalizarCPF(dados.cpf || '')
  if (!cpfNorm || cpfNorm.length !== 11) return { ok: false, erro: 'CPF inválido (11 dígitos)' }
  if (!(dados.nome || '').trim()) return { ok: false, erro: 'Nome é obrigatório' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('usuarios')
    .update({
      nome: (dados.nome || '').trim(),
      cpf: cpfNorm,
      email: (dados.email || '').trim() || null,
      re_colaborador: (dados.re_colaborador || '').trim() || null,
      empresa_id: dados.empresa_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuarioId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Inativa o colaborador (ativo = false). Apenas admin ou RH. */
export async function inativarColaborador(usuarioId: string): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('usuarios')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', usuarioId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Reativa o colaborador (ativo = true). Apenas admin ou RH. */
export async function reativarColaborador(usuarioId: string): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('usuarios')
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq('id', usuarioId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Exclui colaborador apenas se nunca teve movimentação. Remove usuário e perfil. Apenas admin ou RH. */
export async function excluirColaborador(usuarioId: string): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }

  const comMov = await getColaboradoresComMovimentacao()
  if (comMov.includes(usuarioId)) {
    return { ok: false, erro: 'Não é possível excluir: colaborador já teve movimentação. Use Inativar.' }
  }

  const admin = createAdminClient()
  const { error: errDel } = await admin.from('usuarios').delete().eq('id', usuarioId)
  if (errDel) return { ok: false, erro: errDel.message }
  return { ok: true }
}

/** Cadastra novo colaborador manualmente. RE opcional. Apenas admin ou RH. */
export async function criarColaboradorManual(dados: ColaboradorForm): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }

  const cpfNorm = normalizarCPF(dados.cpf || '')
  if (!cpfNorm || cpfNorm.length !== 11) return { ok: false, erro: 'CPF inválido (11 dígitos)' }
  if (!(dados.nome || '').trim()) return { ok: false, erro: 'Nome é obrigatório' }

  const admin = createAdminClient()
  const { data: existente } = await admin
    .from('usuarios')
    .select('id')
    .eq('cpf', cpfNorm)
    .maybeSingle()
  if (existente) {
    return { ok: false, erro: 'Já existe um usuário com este CPF. Use Editar no cadastro existente.' }
  }

  const { data: novo, error: errIns } = await admin
    .from('usuarios')
    .insert({
      auth_user_id: null,
      nome: (dados.nome || '').trim(),
      cpf: cpfNorm,
      email: (dados.email || '').trim() || null,
      re_colaborador: (dados.re_colaborador || '').trim() || null,
      empresa_id: dados.empresa_id || null,
      ativo: true,
    })
    .select('id')
    .single()
  if (errIns || !novo) return { ok: false, erro: errIns?.message ?? 'Erro ao criar usuário' }

  const { error: errPapel } = await admin
    .from('usuario_papeis')
    .insert({ usuario_id: novo.id, papel: 'COLABORADOR' })
  if (errPapel) return { ok: false, erro: 'Usuário criado mas falha ao adicionar perfil: ' + errPapel.message }
  return { ok: true }
}

export interface SaldoDevedorColaborador {
  usuario_id: string
  nome: string
  re_colaborador: string | null
  cpf: string | null
  empresa_nome: string
  saldo_devedor: number
}

export interface ConsumoMensalPorPeriodoItem {
  id: string
  usuario_id: string
  nome: string
  empresa_nome: string
  ano: number
  mes: number
  valor_total: number
  valor_abatido: number
  saldo_devedor: number
}

/** Lista consumo colaborador mensal recente (para a aba principal do RH). Usa admin client para evitar RLS. */
export async function listarConsumoColaboradorMensalRecente(): Promise<
  Array<{
    id: string
    ano: number
    mes: number
    valor_total: number
    valor_abatido: number
    usuarios: { nome: string | null } | null
    empresas: { nome: string | null } | null
  }>
> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('consumo_colaborador_mensal')
    .select(`
      id,
      ano,
      mes,
      valor_total,
      valor_abatido,
      usuarios!usuario_id ( nome ),
      empresas!empresa_id ( nome )
    `)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(500)

  if (error || !data) return []
  return data as any[]
}

/** Lista consumo mensal por período (ano e opcionalmente mês inicial/final). Cada linha = um mês de um colaborador. */
export async function listarConsumoMensalPorPeriodo(
  ano: number,
  mesIni?: number,
  mesFim?: number
): Promise<ConsumoMensalPorPeriodoItem[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const supabase = createAdminClient()
  let query = supabase
    .from('consumo_colaborador_mensal')
    .select(`
      id,
      usuario_id,
      ano,
      mes,
      valor_total,
      valor_abatido,
      usuarios!usuario_id ( nome ),
      empresas!empresa_id ( nome )
    `)
    .eq('ano', ano)
    .order('mes', { ascending: true })
    .order('usuario_id', { ascending: true })

  if (mesIni != null && mesIni >= 1 && mesIni <= 12) {
    query = query.gte('mes', mesIni)
  }
  if (mesFim != null && mesFim >= 1 && mesFim <= 12) {
    query = query.lte('mes', mesFim)
  }

  const { data, error } = await query
  if (error || !data) return []

  return (data as any[]).map((r) => {
    const total = Number(r.valor_total) || 0
    const abatido = Number(r.valor_abatido) || 0
    return {
      id: r.id,
      usuario_id: r.usuario_id,
      nome: r.usuarios?.nome ?? 'Sem nome',
      empresa_nome: r.empresas?.nome ?? '-',
      ano: r.ano,
      mes: r.mes,
      valor_total: total,
      valor_abatido: abatido,
      saldo_devedor: Math.round((total - abatido) * 100) / 100,
    }
  })
}

/** Lista colaboradores com saldo devedor (soma valor_total - valor_abatido por usuario_id). Apenas admin ou RH. */
export async function listarConsumoComSaldoDevedor(): Promise<SaldoDevedorColaborador[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('consumo_colaborador_mensal')
    .select(`
      usuario_id,
      valor_total,
      valor_abatido,
      usuarios!usuario_id ( nome, cpf, re_colaborador ),
      empresas!empresa_id ( nome )
    `)

  if (error || !rows?.length) return []

  const map = new Map<
    string,
    { nome: string; empresa_nome: string; saldo: number; re_colaborador: string | null; cpf: string | null }
  >()
  for (const r of rows as any[]) {
    const uid = r.usuario_id
    const total = Number(r.valor_total) || 0
    const abatido = Number(r.valor_abatido) || 0
    const saldo = total - abatido
    if (saldo <= 0) continue
    const nome = r.usuarios?.nome ?? 'Sem nome'
    const empresa_nome = r.empresas?.nome ?? '-'
    const re_colaborador = (r.usuarios?.re_colaborador as string | null) ?? null
    const cpf = (r.usuarios?.cpf as string | null) ?? null
    const atual = map.get(uid)
    if (atual) {
      atual.saldo += saldo
    } else {
      map.set(uid, { nome, empresa_nome, saldo, re_colaborador, cpf })
    }
  }
  return [...map.entries()].map(([usuario_id, v]) => ({
    usuario_id,
    nome: v.nome,
    re_colaborador: v.re_colaborador,
    cpf: v.cpf,
    empresa_nome: v.empresa_nome,
    saldo_devedor: Math.round(v.saldo * 100) / 100,
  }))
}

/** Registra abatimento (pagamento) no saldo devedor do colaborador. Distribui por mês (mais antigo primeiro). */
export async function registrarAbatimentoColaborador(
  usuarioId: string,
  valor: number
): Promise<{ ok: boolean; erro?: string }> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return { ok: false, erro: 'Sem permissão' }
  if (valor <= 0) return { ok: false, erro: 'Valor deve ser positivo' }

  const clientAuth = await createClient()
  const { data: { user: authUser } } = await clientAuth.auth.getUser()
  let operadorId: string | null = null
  if (authUser) {
    const admin = createAdminClient()
    const { data: operador } = await admin.from('usuarios').select('id').eq('auth_user_id', authUser.id).maybeSingle()
    operadorId = (operador as { id: string } | null)?.id ?? null
  }

  const admin = createAdminClient()
  const { data: rows, error: errFetch } = await admin
    .from('consumo_colaborador_mensal')
    .select('id, ano, mes, valor_total, valor_abatido')
    .eq('usuario_id', usuarioId)
    .order('ano', { ascending: true })
    .order('mes', { ascending: true })

  if (errFetch || !rows?.length) return { ok: false, erro: 'Nenhum consumo encontrado para este colaborador' }

  let restante = Math.round(valor * 100) / 100
  const updates: { id: string; valor_abatido: number }[] = []
  for (const r of rows as any[]) {
    if (restante <= 0) break
    const total = Number(r.valor_total) || 0
    const abatido = Number(r.valor_abatido) || 0
    const devedor = total - abatido
    if (devedor <= 0) continue
    const aAbater = Math.min(restante, devedor)
    const novoAbatido = Math.round((abatido + aAbater) * 100) / 100
    restante = Math.round((restante - aAbater) * 100) / 100
    updates.push({ id: r.id, valor_abatido: novoAbatido })
  }

  for (const u of updates) {
    const { error: errUp } = await admin
      .from('consumo_colaborador_mensal')
      .update({ valor_abatido: u.valor_abatido, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (errUp) return { ok: false, erro: errUp.message }
  }

  const { error: errLanc } = await admin.from('abatimento_colaborador_lancamento').insert({
    usuario_id: usuarioId,
    valor: Math.round(valor * 100) / 100,
    operador_id: operadorId,
  })
  if (errLanc) console.error('Erro ao registrar lançamento de abatimento:', errLanc)

  return { ok: true }
}

export interface MovimentacaoMensal {
  id: string
  ano: number
  mes: number
  valor_total: number
  valor_abatido: number
  saldo_devedor: number
  empresa_nome: string | null
  updated_at: string
}

/** Movimentação (consumo mensal) de um colaborador para o relatório. */
export async function listarMovimentacaoColaborador(usuarioId: string): Promise<MovimentacaoMensal[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('consumo_colaborador_mensal')
    .select(`
      id,
      ano,
      mes,
      valor_total,
      valor_abatido,
      updated_at,
      empresas!empresa_id ( nome )
    `)
    .eq('usuario_id', usuarioId)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(60)

  if (error || !data) return []
  return (data as any[]).map((r) => {
    const total = Number(r.valor_total) || 0
    const abatido = Number(r.valor_abatido) || 0
    return {
      id: r.id,
      ano: r.ano,
      mes: r.mes,
      valor_total: total,
      valor_abatido: abatido,
      saldo_devedor: Math.round((total - abatido) * 100) / 100,
      empresa_nome: r.empresas?.nome ?? null,
      updated_at: r.updated_at,
    }
  })
}

export type TipoMovimentacaoRH = 'compra' | 'baixa'

export interface MovimentacaoRHCompra {
  tipo: 'compra'
  id: string
  data_hora: string
  total: number
  /** Status do pedido (ex.: PAGO, ENTREGUE, CANCELADO) para exibir no relatório RH */
  status?: string
  itens: Array<{ produto_nome: string; quantidade: number; preco_unitario: number; subtotal: number }>
}

export interface MovimentacaoRHBaxia {
  tipo: 'baixa'
  id: string
  data_hora: string
  valor: number
}

export type MovimentacaoRH = MovimentacaoRHCompra | MovimentacaoRHBaxia

/** Lista movimentações (compras e baixas) do colaborador no período para o relatório RH. */
export async function listarMovimentacoesColaboradorPeriodo(
  usuarioId: string,
  dataIni: string,
  dataFim: string
): Promise<MovimentacaoRH[]> {
  const podeRH = await podeAcessarRH()
  if (!podeRH) return []

  const supabase = createAdminClient()
  const ini = dataIni ? new Date(dataIni + 'T00:00:00') : new Date(0)
  const fim = dataFim ? new Date(dataFim + 'T23:59:59.999') : new Date(8640000000000000)

  const [pedidosRes, baixasRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, total, created_at, status')
      .eq('colaborador_id', usuarioId)
      .gte('created_at', ini.toISOString())
      .lte('created_at', fim.toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('abatimento_colaborador_lancamento')
      .select('id, valor, created_at')
      .eq('usuario_id', usuarioId)
      .gte('created_at', ini.toISOString())
      .lte('created_at', fim.toISOString())
      .order('created_at', { ascending: false }),
  ])

  const pedidos = (pedidosRes.data || []) as { id: string; total: number; created_at: string; status?: string }[]
  const baixas = (baixasRes.data || []) as { id: string; valor: number; created_at: string }[]

  const pedidoIds = pedidos.map((p) => p.id)
  let itensPorPedido = new Map<string, Array<{ produto_nome: string; quantidade: number; preco_unitario: number; subtotal: number }>>()
  if (pedidoIds.length > 0) {
    const { data: itens } = await supabase
      .from('pedido_itens')
      .select('pedido_id, produto_nome, quantidade, preco_unitario, subtotal')
      .in('pedido_id', pedidoIds)
    for (const i of itens || []) {
      const row = i as any
      const list = itensPorPedido.get(row.pedido_id) || []
      list.push({
        produto_nome: row.produto_nome ?? row.produtos?.nome ?? '-',
        quantidade: row.quantidade ?? 0,
        preco_unitario: Number(row.preco_unitario) || 0,
        subtotal: Number(row.subtotal) || 0,
      })
      itensPorPedido.set(row.pedido_id, list)
    }
  }

  const lista: MovimentacaoRH[] = [
    ...pedidos.map((p) => ({
      tipo: 'compra' as const,
      id: p.id,
      data_hora: p.created_at,
      total: Number(p.total) || 0,
      status: p.status ?? undefined,
      itens: itensPorPedido.get(p.id) || [],
    })),
    ...baixas.map((b) => ({
      tipo: 'baixa' as const,
      id: b.id,
      data_hora: b.created_at,
      valor: Number(b.valor) || 0,
    })),
  ]
  lista.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())
  return lista
}

/**
 * Saldo devedor atual consolidado do colaborador (para exibição no PDV).
 * Soma (valor_total - valor_abatido) de todas as linhas em consumo_colaborador_mensal.
 * Operadores de PDV e RH podem ver esse saldo.
 */
export async function obterSaldoDevedorColaboradorParaPdv(
  usuarioId: string
): Promise<number> {
  if (!usuarioId) return 0

  const [temPermissaoPdv, temPermissaoRh] = await Promise.all([
    podeAcessarPdv(),
    podeAcessarRH(),
  ])

  if (!temPermissaoPdv && !temPermissaoRh) {
    return 0
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('consumo_colaborador_mensal')
    .select('valor_total, valor_abatido')
    .eq('usuario_id', usuarioId)

  if (error || !data?.length) return 0

  const saldo = (data as Array<{ valor_total: number; valor_abatido: number }>).reduce(
    (acc, row) => {
      const total = Number(row.valor_total) || 0
      const abatido = Number(row.valor_abatido) || 0
      return acc + (total - abatido)
    },
    0
  )

  return Math.round(saldo * 100) / 100
}

/** Retorna o conteúdo do CSV modelo para download */
export async function obterModeloCSVColaboradores(): Promise<string> {
  const BOM = '\uFEFF'
  const header = 'nome,cpf,email,re'
  const exemplo = 'Maria da Silva,12345678901,maria@empresa.com,1001'
  const instrucoes = [
    '# Modelo de importação de colaboradores',
    '# Colunas: nome (obrigatório), cpf (obrigatório, 11 dígitos), email (opcional), re (opcional - Registro do Empregado)',
    '# CPF é a chave: se já existir cadastro, será atualizado. Remova as linhas de instrução (#) antes de importar.',
    '#',
    header,
    exemplo,
  ]
  return BOM + instrucoes.join('\r\n')
}
