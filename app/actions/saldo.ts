'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MovimentoSaldoTipo } from '@/lib/types/database'

/** Onde a movimentação ocorreu: loja online ou cantina/PDV */
export type ExtratoOrigem = 'LOJA_ONLINE' | 'CANTINA'

/** Item de produto em uma compra (para exibir no extrato) */
export interface ExtratoItemProduto {
  produto_nome: string
  quantidade: number
  preco_unitario: number
  subtotal: number
}

export interface ExtratoItem {
  id: string
  tipo: MovimentoSaldoTipo
  valor: number
  descricao: string
  created_at: string
  pedido_id?: string
  /** Onde: loja online ou cantina (caixa) */
  origem?: ExtratoOrigem
  /** Data de retirada (quando houver agendamento de retirada para pedidos online). */
  data_retirada?: string | null
  /** Data/hora em que o pedido foi marcado como ENTREGUE no PDV, quando aplicável. */
  data_entrega?: string | null
  /** Forma de pagamento (quando for recarga/pagamento via gateway) */
  metodo_pagamento?: 'PIX' | 'CARTAO'
  /** ID da transação no gateway (Rede) para rastreabilidade */
  gateway_id?: string
  /** Produtos da compra (quando tipo COMPRA ou ESTORNO com pedido) */
  itens?: ExtratoItemProduto[]
}

/**
 * Gasto do aluno hoje (soma de movimentações tipo COMPRA no dia atual, horário do servidor).
 */
export async function obterGastoAlunoHoje(alunoId: string): Promise<number> {
  const supabase = await createClient()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const { data: movs } = await supabase
    .from('aluno_movimentacoes')
    .select('valor')
    .eq('aluno_id', alunoId)
    .eq('tipo', 'COMPRA')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
  const total = (movs || []).reduce((s, m) => s + Number(m.valor || 0), 0)
  return total
}

/**
 * Gasto do aluno hoje para uso no PDV (usa admin client para o operador poder ver).
 */
export async function obterGastoAlunoHojeParaPdv(alunoId: string): Promise<number> {
  const supabase = createAdminClient()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const { data: movs } = await supabase
    .from('aluno_movimentacoes')
    .select('valor')
    .eq('aluno_id', alunoId)
    .eq('tipo', 'COMPRA')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
  const total = (movs || []).reduce((s, m) => s + Number(m.valor || 0), 0)
  return total
}

/**
 * Saldo atual do aluno. Garante uma linha em aluno_saldos com 0 se não existir (upsert sem sobrescrever).
 */
export async function obterSaldoAluno(alunoId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('aluno_saldos')
    .select('saldo')
    .eq('aluno_id', alunoId)
    .maybeSingle()
  if (data) return Number(data.saldo)
  await supabase
    .from('aluno_saldos')
    .upsert({ aluno_id: alunoId, saldo: 0 }, { onConflict: 'aluno_id', ignoreDuplicates: true })
  const { data: after } = await supabase
    .from('aluno_saldos')
    .select('saldo')
    .eq('aluno_id', alunoId)
    .maybeSingle()
  return after ? Number(after.saldo) : 0
}

/**
 * Extrato (movimentações) do aluno para o responsável.
 */
export async function obterExtratoAluno(alunoId: string): Promise<ExtratoItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return []

  const { data: movs, error } = await supabase
    .from('aluno_movimentacoes')
    .select('id, tipo, valor, pedido_id, caixa_id, transacao_id, created_at, observacao')
    .eq('aluno_id', alunoId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !movs) return []

  const pedidoIds = [...new Set((movs as { pedido_id: string | null }[]).map((m) => m.pedido_id).filter(Boolean))] as string[]
  const transacaoIds = [...new Set((movs as { transacao_id: string | null }[]).map((m) => m.transacao_id).filter(Boolean))] as string[]

  let origensPedidos: Record<string, string> = {}
  let pedidoInfoMap: Record<string, { origem: string; created_at: string; updated_at: string; data_retirada: string | null }> = {}
  if (pedidoIds.length > 0) {
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, origem, created_at, updated_at, data_retirada, status')
      .in('id', pedidoIds)
    for (const p of pedidos ?? []) {
      const origem = p.origem === 'PDV' ? 'CANTINA' : 'LOJA_ONLINE'
      origensPedidos[p.id] = origem
      pedidoInfoMap[p.id] = {
        origem,
        created_at: p.created_at as string,
        updated_at: p.updated_at as string,
        data_retirada: (p.data_retirada as string | null) ?? null,
      }
    }
  }

  // Itens dos pedidos (compras) para exibir produtos no extrato
  let itensPorPedido: Record<string, ExtratoItemProduto[]> = {}
  let dataRetiradaPorPedido: Record<string, string | null> = {}
  if (pedidoIds.length > 0) {
    const { data: itensRows } = await supabase
      .from('pedido_itens')
      .select('pedido_id, produto_nome, quantidade, preco_unitario, subtotal, data_retirada')
      .in('pedido_id', pedidoIds)
    for (const row of itensRows ?? []) {
      const pid = row.pedido_id as string
      if (!itensPorPedido[pid]) itensPorPedido[pid] = []
      itensPorPedido[pid].push({
        produto_nome: (row.produto_nome as string) ?? 'Produto',
        quantidade: Number(row.quantidade),
        preco_unitario: Number(row.preco_unitario),
        subtotal: Number(row.subtotal),
      })
      const dr = (row.data_retirada as string | null) ?? null
      if (dr && !dataRetiradaPorPedido[pid]) {
        dataRetiradaPorPedido[pid] = dr
      }
    }
  }

  let transacoesMap: Record<string, { metodo: string; gateway_id: string | null }> = {}
  if (transacaoIds.length > 0) {
    const { data: transacoes } = await supabase
      .from('transacoes')
      .select('id, metodo, gateway_id')
      .in('id', transacaoIds)
    for (const t of transacoes ?? []) {
      transacoesMap[t.id] = { metodo: t.metodo, gateway_id: t.gateway_id ?? null }
    }
  }

  const labels: Record<MovimentoSaldoTipo, string> = {
    RECARGA: 'Recarga online',
    RECARGA_PRESENCIAL: 'Recarga presencial',
    COMPRA: 'Compra / consumo',
    ESTORNO: 'Estorno',
    DESCONTO: 'Desconto',
    MIGRACAO_SALDO: 'Migração de saldo do sistema antigo',
  }

  type Mov = {
    id: string
    tipo: MovimentoSaldoTipo
    valor: number
    pedido_id: string | null
    caixa_id: string | null
    transacao_id: string | null
    created_at: string
    observacao: string | null
  }

  // Primeiro, enriquecemos as movimentações com origem, método, itens etc.
  const enriquecidas = (movs as Mov[]).map((m) => {
    let origem: ExtratoOrigem | undefined
    if (m.tipo === 'RECARGA') origem = 'LOJA_ONLINE'
    else if (m.tipo === 'RECARGA_PRESENCIAL') origem = 'CANTINA'
    else if (m.pedido_id) origem = (origensPedidos[m.pedido_id] as ExtratoOrigem) || (m.caixa_id ? 'CANTINA' : 'LOJA_ONLINE')
    else if (m.caixa_id) origem = 'CANTINA'
    const tx = m.transacao_id ? transacoesMap[m.transacao_id] : undefined
    const metodoPagamento = tx?.metodo === 'PIX' || tx?.metodo === 'CARTAO' ? tx.metodo : undefined
    let descricao = labels[m.tipo] || m.tipo
    if (m.tipo === 'COMPRA' && origem === 'LOJA_ONLINE') descricao = 'Compra de lanche online'
    if (m.tipo === 'ESTORNO' && m.observacao?.trim()) descricao = m.observacao.trim()
    const infoPedido = m.pedido_id ? pedidoInfoMap[m.pedido_id] : undefined
    const dataRetirada =
      m.pedido_id && (dataRetiradaPorPedido[m.pedido_id] ?? infoPedido?.data_retirada ?? null)
    const dataEntrega =
      m.pedido_id && infoPedido && (infoPedido as any).status === 'ENTREGUE'
        ? infoPedido.updated_at
        : null
    return {
      id: m.id,
      tipo: m.tipo,
      valor: Number(m.valor),
      descricao,
      created_at: m.created_at,
      pedido_id: m.pedido_id ?? null,
      origem,
      metodo_pagamento: metodoPagamento,
      gateway_id: tx?.gateway_id ?? null,
      itens: m.pedido_id ? itensPorPedido[m.pedido_id] : undefined,
      transacao_id: m.transacao_id ?? null,
      data_retirada: dataRetirada ?? null,
      data_entrega: dataEntrega ?? null,
    }
  })

  // Depois, agrupamos compras online da mesma transação (ex.: kit mensal com vários pedidos/dias)
  const agrupado: Record<string, typeof enriquecidas[0]> = {}
  for (const m of enriquecidas) {
    const isCompraOnline =
      m.tipo === 'COMPRA' && m.origem === 'LOJA_ONLINE' && m.transacao_id
    const key = isCompraOnline ? `TX-${m.transacao_id}` : `ID-${m.id}`
    if (!agrupado[key]) {
      agrupado[key] = { ...m }
    } else {
      agrupado[key].valor += m.valor
      if (m.itens && m.itens.length) {
        agrupado[key].itens = [...(agrupado[key].itens ?? []), ...m.itens]
      }
    }
  }

  // Mantém ordenação por created_at desc (já vem assim do banco)
  const ordenadas = Object.values(agrupado).sort(
    (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
  )

  return ordenadas.map((m): ExtratoItem => ({
    id: m.id,
    tipo: m.tipo,
    valor: m.valor,
    descricao: m.descricao,
    created_at: m.created_at,
    pedido_id: m.pedido_id ?? undefined,
    origem: m.origem,
    metodo_pagamento:
      (m.metodo_pagamento === 'PIX' || m.metodo_pagamento === 'CARTAO' ? m.metodo_pagamento : undefined) as
        | 'PIX'
        | 'CARTAO'
        | undefined,
    gateway_id: m.gateway_id ?? undefined,
    itens: m.itens,
    data_retirada: (m as any).data_retirada ?? null,
    data_entrega: (m as any).data_entrega ?? null,
  }))
}

/**
 * Extrato do aluno para uso no painel admin (relatórios). Usa admin client para garantir
 * acesso aos itens dos pedidos independente de RLS.
 */
export async function obterExtratoAlunoParaAdmin(alunoId: string): Promise<ExtratoItem[]> {
  const supabase = createAdminClient()
  const { data: movs, error } = await supabase
    .from('aluno_movimentacoes')
    .select('id, tipo, valor, pedido_id, caixa_id, transacao_id, created_at, observacao')
    .eq('aluno_id', alunoId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error || !movs) return []

  const pedidoIds = [...new Set((movs as { pedido_id: string | null }[]).map((m) => m.pedido_id).filter(Boolean))] as string[]
  const transacaoIds = [...new Set((movs as { transacao_id: string | null }[]).map((m) => m.transacao_id).filter(Boolean))] as string[]

  let origensPedidos: Record<string, string> = {}
  let pedidoStatus: Record<string, string | null> = {}
  let pedidoUpdatedAt: Record<string, string | null> = {}
  let pedidoDataRetirada: Record<string, string | null> = {}
  if (pedidoIds.length > 0) {
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, origem, status, updated_at, data_retirada')
      .in('id', pedidoIds)
    for (const p of (pedidos ?? []) as Array<{
      id: string
      origem: string | null
      status: string | null
      updated_at: string | null
      data_retirada: string | null
    }>) {
      origensPedidos[p.id] = p.origem === 'PDV' ? 'CANTINA' : 'LOJA_ONLINE'
      pedidoStatus[p.id] = p.status
      pedidoUpdatedAt[p.id] = p.updated_at
      pedidoDataRetirada[p.id] = p.data_retirada
    }
  }

  let itensPorPedido: Record<string, ExtratoItemProduto[]> = {}
  // primeira data_retirada por pedido (se houver em algum item)
  let primeiraDataRetiradaPorPedido: Record<string, string | null> = {}
  if (pedidoIds.length > 0) {
    const { data: itensRows } = await supabase
      .from('pedido_itens')
      .select('pedido_id, produto_nome, quantidade, preco_unitario, subtotal, data_retirada')
      .in('pedido_id', pedidoIds)
    for (const row of (itensRows ?? []) as Array<{
      pedido_id: string
      produto_nome: string | null
      quantidade: number
      preco_unitario: number
      subtotal: number
      data_retirada: string | null
    }>) {
      const pid = row.pedido_id
      if (!itensPorPedido[pid]) itensPorPedido[pid] = []
      itensPorPedido[pid].push({
        produto_nome: row.produto_nome ?? 'Produto',
        quantidade: Number(row.quantidade),
        preco_unitario: Number(row.preco_unitario),
        subtotal: Number(row.subtotal),
      })
      if (!primeiraDataRetiradaPorPedido[pid] && row.data_retirada) {
        primeiraDataRetiradaPorPedido[pid] = row.data_retirada
      }
    }
  }

  let transacoesMap: Record<string, { metodo: string; gateway_id: string | null }> = {}
  if (transacaoIds.length > 0) {
    const { data: transacoes } = await supabase
      .from('transacoes')
      .select('id, metodo, gateway_id')
      .in('id', transacaoIds)
    for (const t of transacoes ?? []) {
      transacoesMap[t.id] = { metodo: t.metodo, gateway_id: t.gateway_id ?? null }
    }
  }

  const labels: Record<MovimentoSaldoTipo, string> = {
    RECARGA: 'Recarga online',
    RECARGA_PRESENCIAL: 'Recarga presencial',
    COMPRA: 'Compra / consumo',
    ESTORNO: 'Estorno',
    DESCONTO: 'Desconto',
    MIGRACAO_SALDO: 'Migração de saldo do sistema antigo',
  }

  type Mov = {
    id: string
    tipo: MovimentoSaldoTipo
    valor: number
    pedido_id: string | null
    caixa_id: string | null
    transacao_id: string | null
    created_at: string
    observacao: string | null
  }

  const enriquecidas = (movs as Mov[]).map((m) => {
    let origem: ExtratoOrigem | undefined
    if (m.tipo === 'RECARGA') origem = 'LOJA_ONLINE'
    else if (m.tipo === 'RECARGA_PRESENCIAL') origem = 'CANTINA'
    else if (m.pedido_id) origem = (origensPedidos[m.pedido_id] as ExtratoOrigem) || (m.caixa_id ? 'CANTINA' : 'LOJA_ONLINE')
    else if (m.caixa_id) origem = 'CANTINA'
    const tx = m.transacao_id ? transacoesMap[m.transacao_id] : undefined
    const metodoPagamento = tx?.metodo === 'PIX' || tx?.metodo === 'CARTAO' ? tx.metodo : undefined
    let descricao = labels[m.tipo] || m.tipo
    if (m.tipo === 'COMPRA' && origem === 'LOJA_ONLINE') descricao = 'Compra de lanche online'
    if (m.tipo === 'ESTORNO' && m.observacao?.trim()) descricao = m.observacao.trim()
    const dataRetirada =
      m.pedido_id &&
      (primeiraDataRetiradaPorPedido[m.pedido_id] ??
        pedidoDataRetirada[m.pedido_id] ??
        null)
    const dataEntrega =
      m.pedido_id && pedidoStatus[m.pedido_id] === 'ENTREGUE'
        ? pedidoUpdatedAt[m.pedido_id] ?? null
        : null
    return {
      id: m.id,
      tipo: m.tipo,
      valor: Number(m.valor),
      descricao,
      created_at: m.created_at,
      pedido_id: m.pedido_id ?? null,
      origem,
      metodo_pagamento: metodoPagamento,
      gateway_id: tx?.gateway_id ?? null,
      itens: m.pedido_id ? itensPorPedido[m.pedido_id] : undefined,
      transacao_id: m.transacao_id ?? null,
      data_retirada: dataRetirada,
      data_entrega: dataEntrega,
    }
  })

  const agrupado: Record<string, typeof enriquecidas[0]> = {}
  for (const m of enriquecidas) {
    const isCompraOnline =
      m.tipo === 'COMPRA' && m.origem === 'LOJA_ONLINE' && m.transacao_id
    const key = isCompraOnline ? `TX-${m.transacao_id}` : `ID-${m.id}`
    if (!agrupado[key]) {
      agrupado[key] = { ...m }
    } else {
      agrupado[key].valor += m.valor
      if (m.itens && m.itens.length) {
        agrupado[key].itens = [...(agrupado[key].itens ?? []), ...m.itens]
      }
    }
  }

  const ordenadas = Object.values(agrupado).sort(
    (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
  )

  return ordenadas.map((m): ExtratoItem => ({
    id: m.id,
    tipo: m.tipo,
    valor: m.valor,
    descricao: m.descricao,
    created_at: m.created_at,
    pedido_id: m.pedido_id ?? undefined,
    origem: m.origem,
    metodo_pagamento:
      (m.metodo_pagamento === 'PIX' || m.metodo_pagamento === 'CARTAO' ? m.metodo_pagamento : undefined) as
        | 'PIX'
        | 'CARTAO'
        | undefined,
    gateway_id: m.gateway_id ?? undefined,
    itens: m.itens,
    data_retirada: (m as any).data_retirada ?? null,
    data_entrega: (m as any).data_entrega ?? null,
  }))
}

/**
 * Recarga online: responsável adiciona crédito para o aluno.
 * Usa RPC atômica para evitar duplicate key e race; depois cria movimentação RECARGA.
 */
export async function recargaOnline(
  alunoId: string,
  valor: number,
  usuarioId: string
): Promise<{ ok: boolean; erro?: string }> {
  if (valor <= 0) return { ok: false, erro: 'Valor deve ser positivo' }
  const supabase = await createClient()

  const { error: rpcErr } = await supabase.rpc('incrementar_saldo_aluno', {
    p_aluno_id: alunoId,
    p_valor: valor,
  })
  if (rpcErr) return { ok: false, erro: rpcErr.message }

  const { error: movErr } = await supabase.from('aluno_movimentacoes').insert({
    aluno_id: alunoId,
    tipo: 'RECARGA',
    valor,
    usuario_id: usuarioId,
    observacao: 'Recarga online',
  })
  if (movErr) return { ok: false, erro: movErr.message }
  return { ok: true }
}
