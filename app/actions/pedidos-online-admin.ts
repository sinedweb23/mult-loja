'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PedidoStatus } from '@/lib/types/database'

export interface PedidoOnlineAdminItem {
  id: string
  pedido_id: string
  produto_id: string
  produto_nome: string | null
  quantidade: number
  preco_unitario: number
  subtotal: number
  data_retirada: string | null
  variacoes_selecionadas: Record<string, string>
}

export interface PedidoOnlineAdmin {
  id: string
  status: PedidoStatus
  total: number
  created_at: string
  data_retirada: string | null
  aluno: {
    id: string
    nome: string
    prontuario: string
    turma_nome: string | null
    turma_turno: 'MANHA' | 'TARDE' | null
    turma_segmento: string | null
  }
  itens: PedidoOnlineAdminItem[]
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Lista pedidos ONLINE de alunos para o admin, filtrando por período e termo do aluno (opcional). */
export async function listarPedidosOnlineAdmin(params: {
  dataInicio?: string | null
  dataFim?: string | null
  termoAluno?: string | null
}): Promise<PedidoOnlineAdmin[]> {
  const admin = createAdminClient()

  // Período padrão: de ontem até hoje (para ver pedidos do dia anterior e os de hoje, ex.: compra com saldo feita agora)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)

  const inicio =
    params.dataInicio && params.dataInicio.length === 10
      ? startOfDay(new Date(params.dataInicio + 'T00:00:00'))
      : startOfDay(ontem)
  const fim =
    params.dataFim && params.dataFim.length === 10
      ? endOfDay(new Date(params.dataFim + 'T00:00:00'))
      : endOfDay(hoje)

  const { data: pedidos, error } = await admin
    .from('pedidos')
    .select(
      `
      id,
      status,
      total,
      created_at,
      data_retirada,
      aluno_id,
      alunos:aluno_id (
        id,
        nome,
        prontuario,
        turmas:turma_id (descricao, turno, segmento)
      )
    `
    )
    .eq('origem', 'ONLINE')
    .eq('tipo_beneficiario', 'ALUNO')
    .gte('created_at', inicio.toISOString())
    .lte('created_at', fim.toISOString())
    .order('created_at', { ascending: false })

  if (error || !pedidos || pedidos.length === 0) {
    return []
  }

  const termo = (params.termoAluno || '').trim().toLowerCase()
  const filtrados = termo
    ? (pedidos as any[]).filter((p) => {
        const aluno = p.alunos
        if (!aluno) return false
        const nome = String(aluno.nome ?? '').toLowerCase()
        const prontuario = String(aluno.prontuario ?? '').toLowerCase()
        return nome.includes(termo) || prontuario.includes(termo)
      })
    : (pedidos as any[])

  if (filtrados.length === 0) {
    return []
  }

  const pedidoIds = filtrados.map((p) => p.id as string)

  const { data: itens } = await admin
    .from('pedido_itens')
    .select(
      'id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, subtotal, data_retirada, variacoes_selecionadas'
    )
    .in('pedido_id', pedidoIds)

  const itensPorPedido = new Map<string, PedidoOnlineAdminItem[]>()
  for (const row of (itens || []) as any[]) {
    const lista = itensPorPedido.get(row.pedido_id as string) ?? []
    const variacoes =
      row.variacoes_selecionadas && typeof row.variacoes_selecionadas === 'object'
        ? (row.variacoes_selecionadas as Record<string, string>)
        : {}
    lista.push({
      id: String(row.id),
      pedido_id: String(row.pedido_id),
      produto_id: String(row.produto_id),
      produto_nome: row.produto_nome ?? null,
      quantidade: Number(row.quantidade),
      preco_unitario: Number(row.preco_unitario),
      subtotal: Number(row.subtotal),
      data_retirada: row.data_retirada ?? null,
      variacoes_selecionadas: variacoes,
    })
    itensPorPedido.set(row.pedido_id as string, lista)
  }

  return filtrados.map((p: any): PedidoOnlineAdmin => {
    const aluno = p.alunos
    const turmaRaw = aluno?.turmas
    const turma = Array.isArray(turmaRaw) ? turmaRaw[0] : turmaRaw
    return {
      id: String(p.id),
      status: p.status as PedidoStatus,
      total: Number(p.total),
      created_at: p.created_at,
      data_retirada: p.data_retirada ?? null,
      aluno: {
        id: String(aluno?.id ?? ''),
        nome: String(aluno?.nome ?? ''),
        prontuario: String(aluno?.prontuario ?? ''),
        turma_nome: turma?.descricao != null ? String(turma.descricao) : null,
        turma_turno:
          turma?.turno === 'MANHA' || turma?.turno === 'TARDE' ? turma.turno : null,
        turma_segmento:
          turma?.segmento != null ? String(turma.segmento) : null,
      },
      itens: itensPorPedido.get(String(p.id)) ?? [],
    }
  })
}

/** Atualiza data de retirada de um item (e reflete também na tabela pedidos). */
export async function atualizarDataRetiradaItemPedidoOnline(params: {
  pedidoId: string
  itemId: string
  novaDataRetirada: string
}): Promise<{ ok: boolean; erro?: string }> {
  const { pedidoId, itemId, novaDataRetirada } = params
  if (!pedidoId || !itemId || !novaDataRetirada) {
    return { ok: false, erro: 'Dados inválidos' }
  }
  const admin = createAdminClient()

  const { error: errItem } = await admin
    .from('pedido_itens')
    .update({ data_retirada: novaDataRetirada })
    .eq('id', itemId)

  if (errItem) {
    return { ok: false, erro: errItem.message }
  }

  // Para simplificar, refletimos a mesma data no pedido (apenas se ainda for ONLINE).
  await admin
    .from('pedidos')
    .update({ data_retirada: novaDataRetirada })
    .eq('id', pedidoId)
    .eq('origem', 'ONLINE')
    .eq('tipo_beneficiario', 'ALUNO')

  return { ok: true }
}

/**
 * Cancela um pedido online: marca como CANCELADO, devolve o valor ao saldo do aluno
 * e registra no extrato (ESTORNO + observação de cancelamento).
 */
export async function cancelarPedidoOnline(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const admin = createAdminClient()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: pedido, error: errPedido } = await admin
    .from('pedidos')
    .select('id, aluno_id, total, status, origem, tipo_beneficiario')
    .eq('id', pedidoId)
    .single()

  if (errPedido || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado' }
  }
  if (String(pedido.origem) !== 'ONLINE' || String(pedido.tipo_beneficiario) !== 'ALUNO') {
    return { ok: false, erro: 'Apenas pedidos online de aluno podem ser cancelados por aqui.' }
  }
  if (pedido.status === 'CANCELADO' || pedido.status === 'ESTORNADO') {
    return { ok: false, erro: 'Pedido já está cancelado ou estornado.' }
  }

  const total = Number(pedido.total)
  if (total <= 0) {
    await admin.from('pedidos').update({ status: 'CANCELADO', updated_at: new Date().toISOString() }).eq('id', pedidoId)
    return { ok: true }
  }

  const { data: usuario } = await supabase.from('usuarios').select('id').eq('auth_user_id', user.id).maybeSingle()
  const usuarioId = usuario?.id ?? null

  const { data: rpcResult, error: rpcErr } = await admin.rpc('creditar_debitar_aluno_saldo', {
    p_aluno_id: pedido.aluno_id,
    p_valor: total,
    p_tipo: 'ESTORNO',
    p_pedido_id: pedidoId,
    p_transacao_id: null,
    p_caixa_id: null,
    p_usuario_id: usuarioId,
    p_observacao: 'Cancelamento do pedido - valor devolvido ao saldo',
  })

  if (rpcErr) {
    return { ok: false, erro: rpcErr.message }
  }
  const linha = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
  if (linha?.erro) {
    return { ok: false, erro: String(linha.erro) }
  }

  const { error: errStatus } = await admin
    .from('pedidos')
    .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
    .eq('id', pedidoId)

  if (errStatus) {
    return { ok: false, erro: errStatus.message }
  }

  return { ok: true }
}

