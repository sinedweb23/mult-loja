'use server'

import { createClient } from '@/lib/supabase/server'
import type { Caixa } from '@/lib/types/database'

/**
 * Caixa aberto pelo operador logado (último com status ABERTO).
 */
export async function obterCaixaAberto(): Promise<Caixa | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return null

  const { data } = await supabase
    .from('caixas')
    .select('*')
    .eq('operador_id', usuario.id)
    .eq('status', 'ABERTO')
    .order('aberto_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    empresa_id: data.empresa_id,
    unidade_id: data.unidade_id,
    operador_id: data.operador_id,
    aberto_em: data.aberto_em,
    fechado_em: data.fechado_em,
    fundo_troco: Number(data.fundo_troco),
    status: data.status,
  }
}

/**
 * Abre caixa para o operador (empresa e fundo de troco).
 */
export async function abrirCaixa(
  empresaId: string,
  fundoTroco: number,
  unidadeId?: string | null
): Promise<{ ok: boolean; caixa?: Caixa; erro?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado' }

  const { data: existente } = await supabase
    .from('caixas')
    .select('id')
    .eq('operador_id', usuario.id)
    .eq('status', 'ABERTO')
    .maybeSingle()
  if (existente) return { ok: false, erro: 'Já existe um caixa aberto' }

  const { data: novo, error } = await supabase
    .from('caixas')
    .insert({
      empresa_id: empresaId,
      unidade_id: unidadeId || null,
      operador_id: usuario.id,
      fundo_troco: fundoTroco,
      status: 'ABERTO',
    })
    .select()
    .single()

  if (error) return { ok: false, erro: error.message }
  return {
    ok: true,
    caixa: {
      id: novo.id,
      empresa_id: novo.empresa_id,
      unidade_id: novo.unidade_id,
      operador_id: novo.operador_id,
      aberto_em: novo.aberto_em,
      fechado_em: novo.fechado_em,
      fundo_troco: Number(novo.fundo_troco),
      status: novo.status,
    },
  }
}

export interface ResumoFechamentoCaixa {
  fundo_troco: number
  dinheiro_esperado: number
  debito: number
  credito: number
  saldo_aluno: number
  colaboradores: number
  total_geral: number
  /** Valor total dos pedidos cancelados (pagamentos estornados) neste caixa */
  valor_cancelado: number
  /** Quantidade de vendas canceladas (comprovantes de cancelamento) */
  comprovantes_cancelados: number
}

/**
 * Resumo do caixa para conferência antes do fechamento.
 * dinheiro_esperado = fundo_troco + vendas em dinheiro.
 */
export async function obterResumoFechamentoCaixa(
  caixaId: string
): Promise<ResumoFechamentoCaixa | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: caixa } = await supabase
    .from('caixas')
    .select('fundo_troco')
    .eq('id', caixaId)
    .single()
  if (!caixa) return null

  const fundo = Number(caixa.fundo_troco ?? 0)

  const { data: pagamentos } = await supabase
    .from('pagamentos')
    .select('metodo, valor, status, pedido_id')
    .eq('caixa_id', caixaId)

  let dinheiro = 0,
    debito = 0,
    credito = 0,
    saldo_aluno = 0
  let valor_cancelado = 0
  const pedidoIdsCancelados = new Set<string>()
  for (const p of pagamentos ?? []) {
    const v = Number(p.valor)
    if (p.status === 'ESTORNADO') {
      valor_cancelado += v
      if (p.pedido_id) pedidoIdsCancelados.add(p.pedido_id)
      continue
    }
    if (p.status !== 'APROVADO') continue
    switch (p.metodo) {
      case 'DINHEIRO':
        dinheiro += v
        break
      case 'DEBITO':
        debito += v
        break
      case 'CREDITO':
        credito += v
        break
      case 'SALDO':
        saldo_aluno += v
        break
      default:
        break
    }
  }

  const { data: pedidosColab } = await supabase
    .from('pedidos')
    .select('total')
    .eq('caixa_id', caixaId)
    .eq('tipo_beneficiario', 'COLABORADOR')
    .in('status', ['PAGO', 'ENTREGUE'])

  const colaboradores = (pedidosColab ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0)

  const dinheiro_esperado = fundo + dinheiro
  const total_geral = dinheiro_esperado + debito + credito + saldo_aluno + colaboradores

  return {
    fundo_troco: fundo,
    dinheiro_esperado,
    debito,
    credito,
    saldo_aluno,
    colaboradores,
    total_geral,
    valor_cancelado,
    comprovantes_cancelados: pedidoIdsCancelados.size,
  }
}

/**
 * Dados completos para o comprovante de fechamento de caixa (impressão).
 */
export interface DadosComprovanteFechamento extends ResumoFechamentoCaixa {
  operador_nome: string
  aberto_em: string
  movimentacoes: Array<{ metodo: string; valor: number; created_at: string }>
}

/**
 * Retorna resumo + nome do operador + lista de movimentações para o comprovante de fechamento.
 */
export async function obterDadosFechamentoParaComprovante(
  caixaId: string
): Promise<DadosComprovanteFechamento | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: caixa } = await supabase
    .from('caixas')
    .select('fundo_troco, aberto_em, operador_id')
    .eq('id', caixaId)
    .single()
  if (!caixa) return null

  const { data: operador } = await supabase
    .from('usuarios')
    .select('nome, nome_financeiro')
    .eq('id', caixa.operador_id)
    .single()

  const operador_nome =
    (operador?.nome ?? operador?.nome_financeiro ?? '').trim() || 'Operador'

  const { data: pagamentos } = await supabase
    .from('pagamentos')
    .select('metodo, valor, status, pedido_id, created_at')
    .eq('caixa_id', caixaId)
    .order('created_at', { ascending: true })

  const fundo = Number(caixa.fundo_troco ?? 0)
  let dinheiro = 0,
    debito = 0,
    credito = 0,
    saldo_aluno = 0
  let valor_cancelado = 0
  const pedidoIdsCancelados = new Set<string>()
  for (const p of pagamentos ?? []) {
    const v = Number(p.valor)
    if (p.status === 'ESTORNADO') {
      valor_cancelado += v
      if (p.pedido_id) pedidoIdsCancelados.add(p.pedido_id)
      continue
    }
    if (p.status !== 'APROVADO') continue
    switch (p.metodo) {
      case 'DINHEIRO':
        dinheiro += v
        break
      case 'DEBITO':
        debito += v
        break
      case 'CREDITO':
        credito += v
        break
      case 'SALDO':
        saldo_aluno += v
        break
      default:
        break
    }
  }

  const { data: pedidosColab } = await supabase
    .from('pedidos')
    .select('total')
    .eq('caixa_id', caixaId)
    .eq('tipo_beneficiario', 'COLABORADOR')
    .in('status', ['PAGO', 'ENTREGUE'])

  const colaboradores = (pedidosColab ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0)
  const dinheiro_esperado = fundo + dinheiro
  const total_geral = dinheiro_esperado + debito + credito + saldo_aluno + colaboradores

  return {
    fundo_troco: fundo,
    dinheiro_esperado,
    debito,
    credito,
    saldo_aluno,
    colaboradores,
    total_geral,
    valor_cancelado,
    comprovantes_cancelados: pedidoIdsCancelados.size,
    operador_nome,
    aberto_em: caixa.aberto_em,
    movimentacoes: (pagamentos ?? [])
      .filter((p) => p.status === 'APROVADO')
      .map((p) => ({
        metodo: p.metodo,
        valor: Number(p.valor),
        created_at: p.created_at,
      })),
  }
}

/**
 * Fecha o caixa atual do operador.
 */
export async function fecharCaixa(): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const caixa = await obterCaixaAberto()
  if (!caixa) return { ok: false, erro: 'Nenhum caixa aberto' }

  const { error } = await supabase
    .from('caixas')
    .update({ status: 'FECHADO', fechado_em: new Date().toISOString() })
    .eq('id', caixa.id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
