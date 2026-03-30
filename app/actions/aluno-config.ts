'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Produto resumido para lista de bloqueio (cardápio). */
export interface ProdutoCardapioItem {
  id: string
  nome: string
  preco: number
}

/**
 * Lista produtos do cardápio visíveis no app para o aluno (para o responsável bloquear itens).
 * Respeita visibilidade (APP/AMBOS) e produto_disponibilidade configurados em /admin/produtos.
 */
export async function listarProdutosCardapioParaBloqueio(alunoId: string): Promise<ProdutoCardapioItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return []

  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuario.id)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return []

  const { data: aluno } = await supabase
    .from('alunos')
    .select('empresa_id, unidade_id, turma_id')
    .eq('id', alunoId)
    .single()
  if (!aluno) return []

  // Segmento do aluno (usado em produto_disponibilidade SEGMENTO)
  let segmento: string | null = null
  if (aluno.turma_id) {
    const { data: turma } = await supabase
      .from('turmas')
      .select('tipo_curso, segmento')
      .eq('id', aluno.turma_id)
      .single()
    if (turma) {
      segmento = (turma.tipo_curso && String(turma.tipo_curso).trim()) || (turma.segmento != null ? String(turma.segmento) : null)
    }
  }

  const { data: produtosRaw } = await supabase
    .from('produtos')
    .select('id, nome, preco, visibilidade')
    .eq('ativo', true)
    .eq('empresa_id', aluno.empresa_id)
    .or(aluno.unidade_id ? `unidade_id.is.null,unidade_id.eq.${aluno.unidade_id}` : 'unidade_id.is.null')
    .order('nome')

  if (!produtosRaw || produtosRaw.length === 0) return []

  // Filtrar por visibilidade: apenas APP ou AMBOS (não CONSUMO_INTERNO)
  const produtosBase = produtosRaw.filter((p: { visibilidade?: string | null }) => {
    const v = p.visibilidade
    if (v === 'CONSUMO_INTERNO') return false
    if (!v) return true // sem config = disponível
    return v === 'APP' || v === 'AMBOS'
  })

  if (produtosBase.length === 0) return []

  const produtoIds = produtosBase.map((p: { id: string }) => p.id)
  const { data: disponibilidades } = await supabase
    .from('produto_disponibilidade')
    .select('*')
    .in('produto_id', produtoIds)
    .limit(10000)

  const agora = new Date()
  const produtosDisponiveis: ProdutoCardapioItem[] = []

  const segmentoNorm = (segmento ?? '').trim().toLowerCase()
  const turmaIdNorm = (aluno.turma_id ?? '').trim().toLowerCase()
  const alunoIdNorm = (alunoId ?? '').trim().toLowerCase()

  for (const p of produtosBase) {
    const disps = (disponibilidades || []).filter((d: { produto_id: string }) => d.produto_id === p.id)
    if (disps.length === 0) continue

    let disponivel = false
    for (const d of disps) {
      if (d.disponivel_de) {
        const de = new Date(d.disponivel_de)
        if (agora < de) continue
      }
      if (d.disponivel_ate) {
        const ate = new Date(d.disponivel_ate)
        if (agora > ate) continue
      }
      if (d.tipo === 'TODOS') {
        disponivel = true
        break
      }
      const segDisp = (d.segmento != null ? String(d.segmento) : '').trim().toLowerCase()
      if (d.tipo === 'SEGMENTO' && segDisp && segmentoNorm === segDisp) {
        disponivel = true
        break
      }
      const turmaDisp = (d.turma_id ?? '').trim().toLowerCase()
      if (d.tipo === 'TURMA' && turmaDisp && turmaIdNorm === turmaDisp) {
        disponivel = true
        break
      }
      const alDisp = (d.aluno_id ?? '').trim().toLowerCase()
      if (d.tipo === 'ALUNO' && alDisp && alunoIdNorm === alDisp) {
        disponivel = true
        break
      }
    }
    if (disponivel) {
      produtosDisponiveis.push({
        id: p.id,
        nome: p.nome,
        preco: Number(p.preco),
      })
    }
  }

  return produtosDisponiveis
}

/**
 * Limite de gasto diário e lista de produto_ids bloqueados para (usuario_id, aluno_id).
 * @deprecated Use obterConfigAlunoParaLoja na tela de controle da loja para ver config compartilhada.
 */
export async function obterConfigAluno(alunoId: string, usuarioId: string): Promise<{
  limite_gasto_diario: number | null
  produtos_bloqueados_ids: string[]
}> {
  const supabase = await createClient()
  const { data: config } = await supabase
    .from('aluno_config')
    .select('limite_gasto_diario')
    .eq('aluno_id', alunoId)
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  const { data: bloqueios } = await supabase
    .from('aluno_produto_bloqueado')
    .select('produto_id')
    .eq('aluno_id', alunoId)
    .eq('usuario_id', usuarioId)

  return {
    limite_gasto_diario: config?.limite_gasto_diario != null ? Number(config.limite_gasto_diario) : null,
    produtos_bloqueados_ids: (bloqueios || []).map((b: { produto_id: string }) => b.produto_id),
  }
}

/**
 * Config do aluno para a loja (controle): limite e produtos bloqueados compartilhados
 * entre todos os responsáveis do aluno. Valida que o usuário é responsável do aluno.
 */
export async function obterConfigAlunoParaLoja(alunoId: string): Promise<{
  limite_gasto_diario: number | null
  produtos_bloqueados_ids: string[]
  bloquear_compra_saldo_negativo: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { limite_gasto_diario: null, produtos_bloqueados_ids: [], bloquear_compra_saldo_negativo: false }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return { limite_gasto_diario: null, produtos_bloqueados_ids: [], bloquear_compra_saldo_negativo: false }

  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuario.id)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return { limite_gasto_diario: null, produtos_bloqueados_ids: [], bloquear_compra_saldo_negativo: false }

  return obterConfigAlunoParaPdv(alunoId)
}

/**
 * Config do aluno para uso no PDV: limite diário, produtos bloqueados e bloqueio de saldo negativo.
 * Agrega por aluno_id (qualquer responsável). Usa admin client para o PDV poder ler.
 * bloquear_compra_saldo_negativo: true se algum responsável tiver ativado o bloqueio.
 */
export async function obterConfigAlunoParaPdv(alunoId: string): Promise<{
  limite_gasto_diario: number | null
  produtos_bloqueados_ids: string[]
  bloquear_compra_saldo_negativo: boolean
}> {
  const supabase = createAdminClient()
  const { data: configs } = await supabase
    .from('aluno_config')
    .select('limite_gasto_diario, bloquear_compra_saldo_negativo')
    .eq('aluno_id', alunoId)

  const { data: bloqueios } = await supabase
    .from('aluno_produto_bloqueado')
    .select('produto_id')
    .eq('aluno_id', alunoId)

  const limites = (configs || [])
    .map((c: { limite_gasto_diario: number | null }) => c.limite_gasto_diario)
    .filter((v: unknown) => v != null && !Number.isNaN(Number(v))) as number[]
  const limite = limites.length > 0 ? Math.min(...limites) : null
  const produtos_bloqueados_ids = [...new Set((bloqueios || []).map((b: { produto_id: string }) => b.produto_id))]
  const bloquear_compra_saldo_negativo = (configs || []).some(
    (c: { bloquear_compra_saldo_negativo?: boolean }) => c.bloquear_compra_saldo_negativo === true
  )

  return {
    limite_gasto_diario: limite,
    produtos_bloqueados_ids,
    bloquear_compra_saldo_negativo: !!bloquear_compra_saldo_negativo,
  }
}

/**
 * Define limite de gasto diário do aluno (responsável).
 * Propaga para todos os responsáveis do aluno para manter consistência.
 */
export async function definirLimiteDiario(
  alunoId: string,
  usuarioId: string,
  valor: number | null
): Promise<{ ok: boolean; erro?: string }> {
  if (valor != null && valor < 0) return { ok: false, erro: 'Limite não pode ser negativo' }

  const supabase = await createClient()
  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return { ok: false, erro: 'Responsável não vinculado ao aluno' }

  const admin = createAdminClient()
  const { data: responsaveis } = await admin
    .from('usuario_aluno')
    .select('usuario_id')
    .eq('aluno_id', alunoId)

  const ids = (responsaveis || []).map((r: { usuario_id: string }) => r.usuario_id)
  const now = new Date().toISOString()

  for (const uid of ids) {
    const { error } = await admin.from('aluno_config').upsert(
      {
        usuario_id: uid,
        aluno_id: alunoId,
        limite_gasto_diario: valor,
        updated_at: now,
      },
      { onConflict: 'usuario_id,aluno_id' }
    )
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}

/**
 * Define se o responsável bloqueia compra na cantina com saldo negativo para o aluno.
 * Propaga para todos os responsáveis do aluno.
 */
export async function definirBloquearCompraSaldoNegativo(
  alunoId: string,
  usuarioId: string,
  bloquear: boolean
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return { ok: false, erro: 'Responsável não vinculado ao aluno' }

  const admin = createAdminClient()
  const { data: responsaveis } = await admin
    .from('usuario_aluno')
    .select('usuario_id')
    .eq('aluno_id', alunoId)

  const ids = (responsaveis || []).map((r: { usuario_id: string }) => r.usuario_id)
  const now = new Date().toISOString()

  for (const uid of ids) {
    const { error } = await admin.from('aluno_config').upsert(
      {
        usuario_id: uid,
        aluno_id: alunoId,
        bloquear_compra_saldo_negativo: bloquear,
        updated_at: now,
      },
      { onConflict: 'usuario_id,aluno_id' }
    )
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}

/**
 * Bloqueia um produto para o aluno (responsável).
 * Propaga para todos os responsáveis do aluno para manter consistência.
 */
export async function bloquearProduto(
  alunoId: string,
  usuarioId: string,
  produtoId: string
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return { ok: false, erro: 'Responsável não vinculado ao aluno' }

  const admin = createAdminClient()
  const { data: responsaveis } = await admin
    .from('usuario_aluno')
    .select('usuario_id')
    .eq('aluno_id', alunoId)

  const ids = (responsaveis || []).map((r: { usuario_id: string }) => r.usuario_id)

  for (const uid of ids) {
    const { error } = await admin.from('aluno_produto_bloqueado').upsert(
      {
        usuario_id: uid,
        aluno_id: alunoId,
        produto_id: produtoId,
      },
      { onConflict: 'usuario_id,aluno_id,produto_id' }
    )
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}

/**
 * Desbloqueia um produto para o aluno (remove de todos os responsáveis).
 */
export async function desbloquearProduto(
  alunoId: string,
  usuarioId: string,
  produtoId: string
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('aluno_id', alunoId)
    .single()
  if (!vinculo) return { ok: false, erro: 'Responsável não vinculado ao aluno' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('aluno_produto_bloqueado')
    .delete()
    .eq('aluno_id', alunoId)
    .eq('produto_id', produtoId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
