'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import type { PapelUsuario } from '@/lib/types/database'

const smtpConfigSchema = z.object({
  smtp_enabled: z.boolean(),
  smtp_host: z.string().min(1, 'Host SMTP é obrigatório'),
  smtp_port: z.string().regex(/^\d+$/, 'Porta deve ser um número'),
  smtp_user: z.string().email('Email inválido'),
  smtp_password: z.string().min(1, 'Senha é obrigatória'),
  smtp_sender_email: z.string().email('Email remetente inválido'),
  smtp_sender_name: z.string().min(1, 'Nome do remetente é obrigatório'),
})

/**
 * Obter todas as configurações
 */
export async function obterConfiguracoes() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('configuracoes')
    .select('*')
    .order('chave')

  if (error) {
    console.error('Erro ao obter configurações:', error)
    throw new Error('Erro ao carregar configurações')
  }

  return data || []
}

/**
 * Obter uma configuração específica
 */
export async function obterConfiguracao(chave: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('configuracoes')
    .select('*')
    .eq('chave', chave)
    .single()

  if (error) {
    console.error('Erro ao obter configuração:', error)
    return null
  }

  return data
}

/**
 * Atualizar configurações SMTP
 */
export async function atualizarConfiguracaoSMTP(config: z.infer<typeof smtpConfigSchema>) {
  const supabase = await createClient()
  
  // Validar dados
  const dadosValidados = smtpConfigSchema.parse(config)

  // Atualizar cada configuração
  const atualizacoes = [
    { chave: 'smtp_enabled', valor: dadosValidados.smtp_enabled.toString() },
    { chave: 'smtp_host', valor: dadosValidados.smtp_host },
    { chave: 'smtp_port', valor: dadosValidados.smtp_port },
    { chave: 'smtp_user', valor: dadosValidados.smtp_user },
    { chave: 'smtp_password', valor: dadosValidados.smtp_password },
    { chave: 'smtp_sender_email', valor: dadosValidados.smtp_sender_email },
    { chave: 'smtp_sender_name', valor: dadosValidados.smtp_sender_name },
  ]

  for (const atualizacao of atualizacoes) {
    const { error } = await supabase
      .from('configuracoes')
      .update({ 
        valor: atualizacao.valor,
        updated_at: new Date().toISOString()
      })
      .eq('chave', atualizacao.chave)

    if (error) {
      console.error(`Erro ao atualizar ${atualizacao.chave}:`, error)
      throw new Error(`Erro ao atualizar configuração ${atualizacao.chave}`)
    }
  }

  // Se SMTP está habilitado, tentar configurar no Supabase
  if (dadosValidados.smtp_enabled) {
    await configurarSMTPNoSupabase(dadosValidados)
  }

  return { success: true }
}

/**
 * Configurar SMTP no Supabase via API Admin
 * Nota: O Supabase não expõe API pública para configurar SMTP,
 * então isso deve ser feito manualmente no dashboard.
 * Esta função apenas valida e prepara os dados.
 */
async function configurarSMTPNoSupabase(config: z.infer<typeof smtpConfigSchema>) {
  // O Supabase requer configuração manual no dashboard:
  // Settings > Auth > SMTP Settings
  // Por enquanto, apenas logamos as informações
  console.log('📧 Configuração SMTP salva. Configure manualmente no Supabase Dashboard:')
  console.log('   Host:', config.smtp_host)
  console.log('   Port:', config.smtp_port)
  console.log('   User:', config.smtp_user)
  console.log('   Sender:', config.smtp_sender_email)
  console.log('   Name:', config.smtp_sender_name)
  console.log('   Dashboard: https://supabase.com/dashboard/project/jznhaioobvjwjdmigxja/settings/auth')
}

/**
 * Obter configurações SMTP formatadas
 */
export async function obterConfiguracaoSMTP() {
  const supabase = await createClient()
  
  // Buscar todas as configurações SMTP
  const { data: configuracoes, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [
      'smtp_enabled',
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_password',
      'smtp_sender_email',
      'smtp_sender_name'
    ])

  if (error) {
    console.error('Erro ao buscar configurações SMTP:', error)
    return {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      sender_email: '',
      sender_name: '',
    }
  }

  // Mapear configurações
  const smtpConfig: Record<string, any> = {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    sender_email: '',
    sender_name: '',
  }

  if (configuracoes) {
    configuracoes.forEach((config: any) => {
      const valor = config.valor || ''
      
      switch (config.chave) {
        case 'smtp_enabled':
          smtpConfig.enabled = valor === 'true' || valor === true
          break
        case 'smtp_host':
          smtpConfig.host = valor
          break
        case 'smtp_port':
          smtpConfig.port = parseInt(valor || '587', 10)
          smtpConfig.secure = smtpConfig.port === 465
          break
        case 'smtp_user':
          smtpConfig.user = valor
          break
        case 'smtp_password':
          smtpConfig.password = valor
          break
        case 'smtp_sender_email':
          smtpConfig.sender_email = valor
          break
        case 'smtp_sender_name':
          smtpConfig.sender_name = valor
          break
      }
    })
  }

  // Se tem host e user, considerar habilitado (mesmo se enabled for false)
  if (smtpConfig.host && smtpConfig.user && smtpConfig.password) {
    smtpConfig.enabled = true
  }

  return smtpConfig
}

/**
 * Schema para configurações de aparência
 */
const aparenciaConfigSchema = z.object({
  loja_nome: z.string().min(1, 'Nome da loja é obrigatório'),
  loja_logo_url: z.string().refine(
    (val) => val === '' || z.string().url().safeParse(val).success,
    { message: 'URL do logo inválida' }
  ),
  loja_favicon_url: z.string().refine(
    (val) => val === '' || z.string().url().safeParse(val).success,
    { message: 'URL do favicon inválida' }
  ),
})

/**
 * Obter configurações de aparência (nome, logo, favicon).
 * Usa admin client para funcionar em telas públicas (login, layout) sem sessão.
 */
export async function obterConfiguracaoAparencia() {
  const supabase = createAdminClient()
  
  const { data: configuracoes, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [
      'loja_nome',
      'loja_logo_url',
      'loja_favicon_url'
    ])

  if (error) {
    console.error('Erro ao buscar configurações de aparência:', error)
    return {
      loja_nome: '',
      loja_logo_url: '',
      loja_favicon_url: '',
    }
  }

  const aparenciaConfig: Record<string, string> = {
    loja_nome: '',
    loja_logo_url: '',
    loja_favicon_url: '',
  }

  if (configuracoes) {
    configuracoes.forEach((config: any) => {
      aparenciaConfig[config.chave] = config.valor || ''
    })
  }

  return aparenciaConfig
}

/**
 * Atualizar configurações de aparência
 */
export async function atualizarConfiguracaoAparencia(config: z.infer<typeof aparenciaConfigSchema>) {
  const supabase = await createClient()
  
  // Validar dados
  const dadosValidados = aparenciaConfigSchema.parse(config)

  // Atualizar cada configuração
  const atualizacoes = [
    { chave: 'loja_nome', valor: dadosValidados.loja_nome },
    { chave: 'loja_logo_url', valor: dadosValidados.loja_logo_url || '' },
    { chave: 'loja_favicon_url', valor: dadosValidados.loja_favicon_url || '' },
  ]

  for (const atualizacao of atualizacoes) {
    const { error } = await supabase
      .from('configuracoes')
      .upsert({ 
        chave: atualizacao.chave,
        valor: atualizacao.valor,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'chave'
      })

    if (error) {
      console.error(`Erro ao atualizar ${atualizacao.chave}:`, error)
      throw new Error(`Erro ao atualizar configuração ${atualizacao.chave}`)
    }
  }

  return { success: true }
}

const TODOS_PAPEIS: PapelUsuario[] = ['RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'RH']
const CHAVE_PERFIS_PERMITIDOS_LOGIN = 'perfis_permitidos_login'

/**
 * Retorna os perfis (papéis) permitidos a fazer login.
 * Se a configuração não existir ou for inválida: todos podem acessar (retorna TODOS_PAPEIS).
 * Se existir e for array vazio: nenhum perfil pode acessar (retorna []).
 */
export async function obterConfiguracaoAcesso(): Promise<PapelUsuario[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', CHAVE_PERFIS_PERMITIDOS_LOGIN)
    .maybeSingle()

  if (error || data?.valor == null || String(data.valor).trim() === '') return [...TODOS_PAPEIS]
  try {
    const arr = JSON.parse(String(data.valor)) as unknown
    if (!Array.isArray(arr)) return [...TODOS_PAPEIS]
    return arr.filter((p): p is PapelUsuario => TODOS_PAPEIS.includes(p as PapelUsuario))
  } catch {
    return [...TODOS_PAPEIS]
  }
}

/**
 * Salva os perfis permitidos a fazer login. Apenas admin.
 */
export async function atualizarConfiguracaoAcesso(perfis: PapelUsuario[]) {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) throw new Error('Não autorizado')
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('configuracoes')
    .upsert({
      chave: CHAVE_PERFIS_PERMITIDOS_LOGIN,
      valor: JSON.stringify(perfis),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (error) throw new Error('Erro ao salvar configuração de acesso')
}

/**
 * Verifica se pelo menos um dos papéis do usuário está permitido a fazer login.
 * Usado no login e no callback OAuth. Se nenhum perfil estiver configurado, todos podem acessar.
 */
export async function verificarAcessoPermitido(papeisUsuario: PapelUsuario[]): Promise<boolean> {
  const permitidos = await obterConfiguracaoAcesso()
  if (permitidos.length === 0) return false
  if (permitidos.length >= TODOS_PAPEIS.length) return true
  return papeisUsuario.some((p) => permitidos.includes(p))
}

/**
 * Obter token da API externa de importação
 */
export async function obterTokenAPIExterna() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'importacao_api_token')
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar token da API externa:', error)
    return ''
  }

  return data?.valor || ''
}

/**
 * Salvar token da API externa de importação
 */
export async function salvarTokenAPIExterna(token: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'importacao_api_token',
      valor: token,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'chave'
    })

  if (error) {
    console.error('Erro ao salvar token da API externa:', error)
    throw new Error('Erro ao salvar token da API externa')
  }

  return { success: true }
}

// --- Produtos / Crédito Cantina ---
// Por padrão todas as turmas têm acesso. Lista de exceção = turmas que NÃO podem acessar (ids de turmas).

const excecoesTurmaIdsSchema = z.array(z.string().uuid())
const alunosIlimitadosIdsSchema = z.array(z.string().uuid())

const produtosCreditoConfigSchema = z.object({
  lanche_do_dia_produto_id: z.string().uuid().optional().or(z.literal('')),
  excecoes_turma_ids: excecoesTurmaIdsSchema,
  permitir_saldo_negativo: z.boolean(),
  limite_saldo_negativo: z.number().min(0).optional(),
  alunos_saldo_negativo_ilimitado_ids: alunosIlimitadosIdsSchema.optional(),
})

export type TurmaParaExcecao = { id: string; descricao: string; tipo_curso: string | null }

/**
 * Listar todas as turmas (id, descricao, tipo_curso) para montar a lista de exceção no admin.
 */
export async function listarTurmasParaExcecaoCreditoCantina(): Promise<TurmaParaExcecao[]> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('turmas')
    .select('id, descricao, tipo_curso')
    .order('tipo_curso', { ascending: true, nullsFirst: false })
    .order('descricao', { ascending: true })
  if (error) {
    console.error('Erro ao listar turmas para exceção:', error)
    return []
  }
  return (data || []).map((r) => ({
    id: r.id,
    descricao: r.descricao || '',
    tipo_curso: r.tipo_curso ?? null,
  }))
}

const CHAVES_CREDITO_CANTINA = [
  'lanche_do_dia_produto_id',
  'credito_cantina_excecoes_turma_ids',
  'credito_cantina_permitir_saldo_negativo',
  'credito_cantina_limite_saldo_negativo',
  'credito_cantina_alunos_saldo_negativo_ilimitado_ids',
] as const

/**
 * Obter configuração Produtos / Crédito Cantina (admin).
 */
export async function obterConfiguracaoProdutosCredito(): Promise<{
  lanche_do_dia_produto_id: string
  excecoes_turma_ids: string[]
  permitir_saldo_negativo: boolean
  limite_saldo_negativo: number
  alunos_saldo_negativo_ilimitado_ids: string[]
}> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [...CHAVES_CREDITO_CANTINA])

  if (error) {
    console.error('Erro ao obter config Produtos/Crédito:', error)
    return {
      lanche_do_dia_produto_id: '',
      excecoes_turma_ids: [],
      permitir_saldo_negativo: false,
      limite_saldo_negativo: 0,
      alunos_saldo_negativo_ilimitado_ids: [],
    }
  }

  let lanche_do_dia_produto_id = ''
  let excecoes_turma_ids: string[] = []
  let permitir_saldo_negativo = false
  let limite_saldo_negativo = 0
  let alunos_saldo_negativo_ilimitado_ids: string[] = []

  for (const r of rows || []) {
    if (r.chave === 'lanche_do_dia_produto_id') lanche_do_dia_produto_id = (r.valor || '').trim()
    if (r.chave === 'credito_cantina_excecoes_turma_ids') {
      try {
        const arr = JSON.parse(r.valor || '[]')
        excecoes_turma_ids = excecoesTurmaIdsSchema.parse(Array.isArray(arr) ? arr : [])
      } catch {
        excecoes_turma_ids = []
      }
    }
    if (r.chave === 'credito_cantina_permitir_saldo_negativo') {
      permitir_saldo_negativo = (r.valor || '').trim().toLowerCase() === 'true'
    }
    if (r.chave === 'credito_cantina_limite_saldo_negativo') {
      const n = Number(r.valor)
      limite_saldo_negativo = Number.isFinite(n) && n >= 0 ? n : 0
    }
    if (r.chave === 'credito_cantina_alunos_saldo_negativo_ilimitado_ids') {
      try {
        const arr = JSON.parse(r.valor || '[]')
        alunos_saldo_negativo_ilimitado_ids = alunosIlimitadosIdsSchema.parse(Array.isArray(arr) ? arr : [])
      } catch {
        alunos_saldo_negativo_ilimitado_ids = []
      }
    }
  }

  return {
    lanche_do_dia_produto_id,
    excecoes_turma_ids,
    permitir_saldo_negativo,
    limite_saldo_negativo,
    alunos_saldo_negativo_ilimitado_ids,
  }
}

/**
 * Obter apenas a config de saldo negativo (para uso no PDV). Usa admin client.
 */
export async function obterConfigCreditoCantinaSaldoNegativo(): Promise<{
  permitir_saldo_negativo: boolean
  limite_saldo_negativo: number
  alunos_ilimitados_ids: string[]
}> {
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [
      'credito_cantina_permitir_saldo_negativo',
      'credito_cantina_limite_saldo_negativo',
      'credito_cantina_alunos_saldo_negativo_ilimitado_ids',
    ])

  if (error) {
    console.error('Erro ao obter config saldo negativo:', error)
    return { permitir_saldo_negativo: false, limite_saldo_negativo: 0, alunos_ilimitados_ids: [] }
  }

  let permitir_saldo_negativo = false
  let limite_saldo_negativo = 0
  let alunos_ilimitados_ids: string[] = []

  for (const r of rows || []) {
    if (r.chave === 'credito_cantina_permitir_saldo_negativo') {
      permitir_saldo_negativo = (r.valor || '').trim().toLowerCase() === 'true'
    }
    if (r.chave === 'credito_cantina_limite_saldo_negativo') {
      const n = Number(r.valor)
      limite_saldo_negativo = Number.isFinite(n) && n >= 0 ? n : 0
    }
    if (r.chave === 'credito_cantina_alunos_saldo_negativo_ilimitado_ids') {
      try {
        const arr = JSON.parse(r.valor || '[]')
        alunos_ilimitados_ids = alunosIlimitadosIdsSchema.parse(Array.isArray(arr) ? arr : [])
      } catch {
        alunos_ilimitados_ids = []
      }
    }
  }

  return { permitir_saldo_negativo, limite_saldo_negativo, alunos_ilimitados_ids }
}

/**
 * Config de saldo negativo para exibir na loja/controle (limite liberado pela plataforma).
 */
export async function obterConfigCreditoCantinaParaResponsavel(): Promise<{
  permitir_saldo_negativo: boolean
  limite_saldo_negativo: number
}> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['credito_cantina_permitir_saldo_negativo', 'credito_cantina_limite_saldo_negativo'])

  if (error) {
    return { permitir_saldo_negativo: false, limite_saldo_negativo: 0 }
  }

  let permitir_saldo_negativo = false
  let limite_saldo_negativo = 0
  for (const r of rows || []) {
    if (r.chave === 'credito_cantina_permitir_saldo_negativo') {
      permitir_saldo_negativo = (r.valor || '').trim().toLowerCase() === 'true'
    }
    if (r.chave === 'credito_cantina_limite_saldo_negativo') {
      const n = Number(r.valor)
      limite_saldo_negativo = Number.isFinite(n) && n >= 0 ? n : 0
    }
  }
  return { permitir_saldo_negativo, limite_saldo_negativo }
}

export type AlunoParaCreditoIlimitado = { id: string; nome: string; prontuario: string; turma_descricao?: string | null }

/**
 * Buscar dados de alunos por IDs (admin, para exibir lista de saldo negativo ilimitado).
 */
export async function listarAlunosPorIds(ids: string[]): Promise<AlunoParaCreditoIlimitado[]> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return []
  if (!ids.length) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alunos')
    .select('id, nome, prontuario, turmas:turma_id(descricao)')
    .in('id', ids)

  if (error) {
    console.error('Erro ao listar alunos por ids:', error)
    return []
  }

  return (data || []).map((row: unknown) => {
    const r = row as { id: string; nome: string; prontuario: string; turmas?: unknown }
    const turmas = r.turmas
    const descricao =
      turmas != null && typeof turmas === 'object' && !Array.isArray(turmas) && 'descricao' in turmas
        ? String((turmas as { descricao: unknown }).descricao ?? '')
        : Array.isArray(turmas) && turmas[0] != null && typeof turmas[0] === 'object' && 'descricao' in turmas[0]
          ? String((turmas[0] as { descricao: unknown }).descricao ?? '')
          : null
    return {
      id: r.id,
      nome: r.nome || '',
      prontuario: r.prontuario || '',
      turma_descricao: descricao || null,
    }
  })
}

/**
 * Buscar alunos por nome ou prontuário (admin, para lista de saldo negativo ilimitado).
 */
export async function buscarAlunosParaCreditoIlimitado(termo: string): Promise<AlunoParaCreditoIlimitado[]> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return []
  const t = (termo || '').trim()
  if (!t || t.length < 2) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alunos')
    .select('id, nome, prontuario, turmas:turma_id(descricao)')
    .or(`nome.ilike.%${t}%,prontuario.ilike.%${t}%`)
    .order('nome')
    .limit(30)

  if (error) {
    console.error('Erro ao buscar alunos para crédito ilimitado:', error)
    return []
  }

  return (data || []).map((row: unknown) => {
    const r = row as { id: string; nome: string; prontuario: string; turmas?: unknown }
    const turmas = r.turmas
    const descricao =
      turmas != null && typeof turmas === 'object' && !Array.isArray(turmas) && 'descricao' in turmas
        ? String((turmas as { descricao: unknown }).descricao ?? '')
        : Array.isArray(turmas) && turmas[0] != null && typeof turmas[0] === 'object' && 'descricao' in turmas[0]
          ? String((turmas[0] as { descricao: unknown }).descricao ?? '')
          : null
    return {
      id: r.id,
      nome: r.nome || '',
      prontuario: r.prontuario || '',
      turma_descricao: descricao || null,
    }
  })
}

/**
 * Atualizar configuração Produtos / Crédito Cantina (admin).
 */
export async function atualizarConfiguracaoProdutosCredito(payload: z.infer<typeof produtosCreditoConfigSchema>) {
  const supabase = await createClient()
  const parsed = produtosCreditoConfigSchema.parse({
    ...payload,
    alunos_saldo_negativo_ilimitado_ids: payload.alunos_saldo_negativo_ilimitado_ids ?? [],
  })
  const {
    lanche_do_dia_produto_id,
    excecoes_turma_ids,
    permitir_saldo_negativo,
    limite_saldo_negativo,
    alunos_saldo_negativo_ilimitado_ids,
  } = parsed

  const produtoId = (lanche_do_dia_produto_id || '').trim()
  const { error: err1 } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'lanche_do_dia_produto_id',
      valor: produtoId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (err1) throw new Error('Erro ao salvar Lanche do Dia')

  const { error: err2 } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'credito_cantina_excecoes_turma_ids',
      valor: JSON.stringify(excecoes_turma_ids),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (err2) throw new Error('Erro ao salvar exceções Crédito Cantina')

  const { error: err3 } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'credito_cantina_permitir_saldo_negativo',
      valor: permitir_saldo_negativo ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (err3) throw new Error('Erro ao salvar permitir saldo negativo')

  const { error: err4 } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'credito_cantina_limite_saldo_negativo',
      valor: String(limite_saldo_negativo ?? 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (err4) throw new Error('Erro ao salvar limite saldo negativo')

  const { error: err5 } = await supabase
    .from('configuracoes')
    .upsert({
      chave: 'credito_cantina_alunos_saldo_negativo_ilimitado_ids',
      valor: JSON.stringify(alunos_saldo_negativo_ilimitado_ids ?? []),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chave' })
  if (err5) throw new Error('Erro ao salvar lista alunos saldo negativo ilimitado')

  return { success: true }
}

/**
 * Listar produtos ativos (id, nome) para o seletor de Lanche do Dia (admin).
 */
export async function listarProdutosParaLancheDoDia(): Promise<{ id: string; nome: string }[]> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  if (error) {
    console.error('Erro ao listar produtos para Lanche do Dia:', error)
    return []
  }
  return (data || []).map((p) => ({ id: p.id, nome: p.nome }))
}

/**
 * Retorna os IDs das turmas que estão na lista de exceção (sem acesso ao Crédito Cantina).
 * Usa admin client para poder ser chamado em contexto público (layout/loja).
 */
export async function obterExcecoesCreditoCantinaTurmaIds(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'credito_cantina_excecoes_turma_ids')
    .maybeSingle()
  if (error || !data?.valor) return []
  try {
    const arr = JSON.parse(data.valor)
    const ids = excecoesTurmaIdsSchema.parse(Array.isArray(arr) ? arr : [])
    return ids.map((id) => String(id).trim())
  } catch {
    return []
  }
}

/**
 * Verifica se a turma (por ID) está na lista de exceção e portanto bloqueada para recarga.
 * Use o turma_id do aluno selecionado (tabela alunos.turma_id, turmas.id).
 */
export async function turmaEstaBloqueadaParaRecarga(turmaId: string | null): Promise<boolean> {
  if (!turmaId || !String(turmaId).trim()) return false
  const excecoes = await obterExcecoesCreditoCantinaTurmaIds()
  const normalizado = String(turmaId).trim().toLowerCase()
  return excecoes.some((id) => String(id).trim().toLowerCase() === normalizado)
}

/**
 * Retorna, para cada aluno do responsável logado, se esse aluno tem acesso a recarga/saldo
 * (turma não está na lista de exceção). Usado na loja para ocultar botões por filho.
 */
export async function obterAcessoRecargaSaldoPorAluno(): Promise<Record<string, boolean>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const excecoesTurmaIds = await obterExcecoesCreditoCantinaTurmaIds()
  const setExcecoes = new Set(excecoesTurmaIds.map((id) => String(id).trim().toLowerCase()))

  const { data: responsavel } = await supabase
    .from('usuarios')
    .select('id')
    .or(`auth_user_id.eq.${user.id},email_financeiro.eq.${user.email},email_pedagogico.eq.${user.email}`)
    .maybeSingle()
  if (!responsavel) return {}

  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', responsavel.id)
  if (!vinculos?.length) return {}

  const alunoIds = vinculos.map((v) => v.aluno_id)
  const { data: alunos } = await supabase
    .from('alunos')
    .select('id, turma_id')
    .in('id', alunoIds)
  if (!alunos?.length) return {}

  const result: Record<string, boolean> = {}
  for (const a of alunos) {
    const turmaId = a.turma_id ? String(a.turma_id).trim().toLowerCase() : null
    const turmaNaExcecao = turmaId ? setExcecoes.has(turmaId) : false
    result[String(a.id)] = !turmaNaExcecao
  }
  return result
}

/**
 * Verifica se o usuário (responsável) tem pelo menos um aluno em turma que NÃO está na lista de exceção.
 * Por padrão todos têm acesso; só não têm quem estiver apenas em turmas da exceção.
 */
export async function usuarioTemAlgumAlunoComAcessoCreditoCantina(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const excecoesTurmaIds = await obterExcecoesCreditoCantinaTurmaIds()
  const setExcecoes = new Set(excecoesTurmaIds.map((id) => String(id).trim().toLowerCase()))

  const { data: responsavel } = await supabase
    .from('usuarios')
    .select('id')
    .or(`auth_user_id.eq.${user.id},email_financeiro.eq.${user.email},email_pedagogico.eq.${user.email}`)
    .maybeSingle()
  if (!responsavel) return false

  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', responsavel.id)
  if (!vinculos?.length) return false

  const alunoIds = vinculos.map((v) => v.aluno_id)
  const { data: alunos } = await supabase
    .from('alunos')
    .select('id, turma_id')
    .in('id', alunoIds)
  if (!alunos?.length) return false

  const turmaIdsAlunos = [...new Set(alunos.map((a) => a.turma_id).filter(Boolean))] as string[]
  if (turmaIdsAlunos.length === 0) return false
  const temAlgumForaDaExcecao = turmaIdsAlunos.some(
    (tid) => !setExcecoes.has(String(tid).trim().toLowerCase())
  )
  return temAlgumForaDaExcecao
}

/**
 * Obter ID do produto configurado como Lanche do Dia (para a Loja).
 * Retorna null se não houver configuração.
 */
export async function obterLancheDoDiaProdutoId(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'lanche_do_dia_produto_id')
    .maybeSingle()
  if (error || !data?.valor) return null
  const id = (data.valor as string).trim()
  return id || null
}

// --- Parcelamento (Admin > Configurações > Pagamento) ---

export interface RegraParcelamento {
  id: string
  valor_min: number
  valor_max: number | null
  max_parcelas: number
  tipo: 'SEM_JUROS' | 'COM_JUROS'
  taxa_juros_pct: number | null
  ordem: number
  created_at?: string
  updated_at?: string
}

const regraParcelamentoSchema = z.object({
  valor_min: z.number().min(0, 'Valor mínimo deve ser >= 0'),
  valor_max: z.number().min(0).nullable(),
  max_parcelas: z.number().int().min(1).max(10),
  tipo: z.enum(['SEM_JUROS', 'COM_JUROS']),
  taxa_juros_pct: z.number().min(0).max(100).nullable(),
  ordem: z.number().int().min(0),
})

/** Lista todas as regras de parcelamento (admin). */
export async function listarRegrasParcelamento(): Promise<RegraParcelamento[]> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parcelamento_regras')
    .select('*')
    .order('ordem', { ascending: true })
    .order('valor_min', { ascending: true })
  if (error) {
    console.error('Erro ao listar regras de parcelamento:', error)
    return []
  }
  return (data || []).map((r) => ({
    id: r.id,
    valor_min: Number(r.valor_min),
    valor_max: r.valor_max != null ? Number(r.valor_max) : null,
    max_parcelas: Number(r.max_parcelas),
    tipo: r.tipo as 'SEM_JUROS' | 'COM_JUROS',
    taxa_juros_pct: r.taxa_juros_pct != null ? Number(r.taxa_juros_pct) : null,
    ordem: Number(r.ordem ?? 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
}

/** Verifica se duas faixas [a1,a2] e [b1,b2] se sobrepõem (intervalos fechados; null = infinito). */
function faixasSobrepoem(
  aMin: number,
  aMax: number | null,
  bMin: number,
  bMax: number | null
): boolean {
  const aEnd = aMax ?? Infinity
  const bEnd = bMax ?? Infinity
  return aMin < bEnd && (bMin < aEnd)
}

/** Salva regras de parcelamento (substitui todas). Valida sobreposição de faixas. */
export async function salvarRegrasParcelamento(
  regras: Omit<RegraParcelamento, 'id' | 'created_at' | 'updated_at'>[]
): Promise<{ ok: boolean; erro?: string }> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) {
    return { ok: false, erro: 'Não autorizado' }
  }

  const parsed = z.array(regraParcelamentoSchema).safeParse(regras)
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors?.[0] ?? 'Dados inválidos'
    return { ok: false, erro: String(msg) }
  }

  const lista = parsed.data

  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i]
      const b = lista[j]
      if (faixasSobrepoem(a.valor_min, a.valor_max, b.valor_min, b.valor_max)) {
        return {
          ok: false,
          erro: `Conflito de faixas: "De R$ ${a.valor_min} ${a.valor_max != null ? `até R$ ${a.valor_max}` : 'acima'}" e "De R$ ${b.valor_min} ${b.valor_max != null ? `até R$ ${b.valor_max}` : 'acima'}". Não pode haver sobreposição.`,
        }
      }
    }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('parcelamento_regras').select('id')
  const ids = (existing || []).map((r) => r.id)

  if (ids.length > 0) {
    const { error: delErr } = await supabase.from('parcelamento_regras').delete().in('id', ids)
    if (delErr) {
      console.error('Erro ao remover regras antigas:', delErr)
      return { ok: false, erro: delErr.message }
    }
  }

  if (lista.length === 0) return { ok: true }

  const toInsert = lista.map((r, i) => ({
    valor_min: r.valor_min,
    valor_max: r.valor_max,
    max_parcelas: r.max_parcelas,
    tipo: r.tipo,
    taxa_juros_pct: r.tipo === 'COM_JUROS' ? (r.taxa_juros_pct ?? 0) : null,
    ordem: r.ordem ?? i,
    updated_at: new Date().toISOString(),
  }))

  const { error: insErr } = await supabase.from('parcelamento_regras').insert(toInsert)
  if (insErr) {
    console.error('Erro ao inserir regras:', insErr)
    return { ok: false, erro: insErr.message }
  }

  return { ok: true }
}

/** Remove uma regra por ID (admin). */
export async function removerRegraParcelamento(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) return { ok: false, erro: 'Não autorizado' }
  const supabase = await createClient()
  const { error } = await supabase.from('parcelamento_regras').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/**
 * Retorna a regra de parcelamento aplicável ao valor total do pedido (para checkout).
 * Regras ordenadas por valor_min; usa a primeira cujo intervalo contém o valor.
 * Usa admin client para garantir leitura mesmo no contexto da loja (responsável).
 */
export async function obterRegraParcelamentoParaValor(valorTotal: number): Promise<RegraParcelamento | null> {
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('parcelamento_regras')
    .select('*')
    .order('ordem', { ascending: true })
    .order('valor_min', { ascending: true })
  if (error) {
    console.error('[obterRegraParcelamentoParaValor]', error)
    return null
  }
  if (!rows?.length) return null

  const valor = Number(valorTotal)
  for (const r of rows) {
    const min = Number(r.valor_min)
    const maxRaw = r.valor_max
    const max =
      maxRaw !== null && maxRaw !== undefined && maxRaw !== '' && !Number.isNaN(Number(maxRaw))
        ? Number(maxRaw)
        : Infinity
    if (valor >= min && valor <= max) {
      return {
        id: r.id,
        valor_min: min,
        valor_max:
          maxRaw !== null && maxRaw !== undefined && maxRaw !== '' && !Number.isNaN(Number(maxRaw))
            ? Number(maxRaw)
            : null,
        max_parcelas: Number(r.max_parcelas),
        tipo: r.tipo as 'SEM_JUROS' | 'COM_JUROS',
        taxa_juros_pct: r.taxa_juros_pct != null ? Number(r.taxa_juros_pct) : null,
        ordem: Number(r.ordem ?? 0),
      }
    }
  }
  return null
}
