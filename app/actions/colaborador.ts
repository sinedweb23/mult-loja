'use server'

import { createClient } from '@/lib/supabase/server'

export interface ConsumoMensalColaborador {
  id: string
  ano: number
  mes: number
  valor_total: number
  valor_abatido: number
  created_at: string
  updated_at: string
  empresa_nome?: string
}

export interface BaixaColaborador {
  id: string
  ano: number
  mes: number
  valor_abatido: number
  updated_at: string
  empresa_nome?: string
}

export interface PedidoColaborador {
  id: string
  status: string
  total: number
  created_at: string
  origem: string | null
  itens: { produto_nome: string; quantidade: number; preco_unitario: number; subtotal: number }[]
}

/**
 * Retorna o usuário logado (id) se for colaborador. Senão null.
 */
async function obterUsuarioColaborador() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .single()
  return usuario?.id ?? null
}

/**
 * Retorna o nome do colaborador logado (para exibição). Senão null.
 */
export async function obterNomeColaborador(): Promise<string | null> {
  const usuarioId = await obterUsuarioColaborador()
  if (!usuarioId) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('usuarios')
    .select('nome')
    .eq('id', usuarioId)
    .single()
  return (data?.nome as string) ?? null
}

/**
 * Saldo negativo do colaborador = soma (valor_total - valor_abatido) de todos os meses.
 */
export async function obterSaldoNegativoColaborador(): Promise<number> {
  const usuarioId = await obterUsuarioColaborador()
  if (!usuarioId) return 0
  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('consumo_colaborador_mensal')
    .select('valor_total, valor_abatido')
    .eq('usuario_id', usuarioId)
  if (!rows?.length) return 0
  const total = rows.reduce((acc, r) => acc + Number(r.valor_total) - Number(r.valor_abatido), 0)
  return Math.round(total * 100) / 100
}

/**
 * Extrato de consumo mensal do colaborador (para consulta de compras por mês).
 */
export async function obterExtratoConsumoColaborador(): Promise<ConsumoMensalColaborador[]> {
  const usuarioId = await obterUsuarioColaborador()
  if (!usuarioId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('consumo_colaborador_mensal')
    .select(`
      id,
      ano,
      mes,
      valor_total,
      valor_abatido,
      created_at,
      updated_at,
      empresas!empresa_id ( nome )
    `)
    .eq('usuario_id', usuarioId)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(60)
  if (!data) return []
  return (data as any[]).map((r) => ({
    id: r.id,
    ano: r.ano,
    mes: r.mes,
    valor_total: Number(r.valor_total),
    valor_abatido: Number(r.valor_abatido),
    created_at: r.created_at,
    updated_at: r.updated_at,
    empresa_nome: r.empresas?.nome,
  }))
}

/**
 * Extrato de baixas de pagamento (valor_abatido > 0) feitas pelo financeiro.
 */
export async function obterExtratoBaixasColaborador(): Promise<BaixaColaborador[]> {
  const usuarioId = await obterUsuarioColaborador()
  if (!usuarioId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('consumo_colaborador_mensal')
    .select(`
      id,
      ano,
      mes,
      valor_abatido,
      updated_at,
      empresas!empresa_id ( nome )
    `)
    .eq('usuario_id', usuarioId)
    .gt('valor_abatido', 0)
    .order('updated_at', { ascending: false })
    .limit(60)
  if (!data) return []
  return (data as any[]).map((r) => ({
    id: r.id,
    ano: r.ano,
    mes: r.mes,
    valor_abatido: Number(r.valor_abatido),
    updated_at: r.updated_at,
    empresa_nome: r.empresas?.nome,
  }))
}

/**
 * Pedidos em que o colaborador é o beneficiário (compras no caixa).
 */
export async function obterPedidosColaborador(): Promise<PedidoColaborador[]> {
  const usuarioId = await obterUsuarioColaborador()
  if (!usuarioId) return []
  const supabase = await createClient()
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, status, total, created_at, origem')
    .eq('colaborador_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error || !pedidos?.length) return []
  const pedidoIds = pedidos.map((p: any) => p.id)
  const { data: itens } = await supabase
    .from('pedido_itens')
    .select('pedido_id, produto_nome, quantidade, preco_unitario, subtotal')
    .in('pedido_id', pedidoIds)
  const itensPorPedido = new Map<string, any[]>()
  for (const i of itens || []) {
    const list = itensPorPedido.get((i as any).pedido_id) || []
    list.push(i)
    itensPorPedido.set((i as any).pedido_id, list)
  }
  return pedidos.map((p: any) => ({
    id: p.id,
    status: p.status,
    total: Number(p.total),
    created_at: p.created_at,
    origem: p.origem ?? null,
    itens: (itensPorPedido.get(p.id) || []).map((item: any) => ({
      produto_nome: item.produto_nome || '-',
      quantidade: item.quantidade,
      preco_unitario: Number(item.preco_unitario),
      subtotal: Number(item.subtotal),
    })),
  }))
}
