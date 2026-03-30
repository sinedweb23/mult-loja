'use server'

import { createAdminClient } from '@/lib/supabase/admin'

interface ResultadoAtualizacaoDataRetirada {
  ok: boolean
  erro?: string
}

/**
 * Atualiza a data de retirada de um pedido do PDV e de seus itens.
 * Apenas permitido para pedidos com data de retirada já definida
 * (no pedido ou em pelo menos um item) e com origem PDV.
 */
export async function atualizarDataRetiradaPedidoPdv(params: {
  pedidoId: string
  novaDataRetirada: string
}): Promise<ResultadoAtualizacaoDataRetirada> {
  const { pedidoId, novaDataRetirada } = params
  if (!pedidoId || !novaDataRetirada) {
    return { ok: false, erro: 'Dados inválidos para atualização da data de retirada.' }
  }

  const admin = createAdminClient()

  const { data: pedido, error: pedidoErr } = await admin
    .from('pedidos')
    .select('id, origem, status, data_retirada')
    .eq('id', pedidoId)
    .maybeSingle()

  if (pedidoErr || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado.' }
  }

  if (pedido.origem !== 'PDV') {
    return { ok: false, erro: 'Somente pedidos do PDV podem ter data de retirada alterada aqui.' }
  }

  if (pedido.status !== 'PAGO' && pedido.status !== 'ENTREGUE') {
    return { ok: false, erro: 'Só é possível alterar a data de retirada de pedidos pagos ou entregues.' }
  }

  // Verificar se existe alguma data de retirada já cadastrada (no pedido ou em itens)
  let temDataRetirada = !!pedido.data_retirada
  if (!temDataRetirada) {
    const { data: itemComData } = await admin
      .from('pedido_itens')
      .select('id')
      .eq('pedido_id', pedidoId)
      .not('data_retirada', 'is', null)
      .limit(1)
      .maybeSingle()

    temDataRetirada = !!itemComData
  }

  if (!temDataRetirada) {
    return { ok: false, erro: 'Este pedido não possui data de retirada cadastrada.' }
  }

  const agora = new Date().toISOString()

  try {
    // Atualiza a data no pedido
    await admin
      .from('pedidos')
      .update({ data_retirada: novaDataRetirada, updated_at: agora })
      .eq('id', pedidoId)

    // Atualiza a data em todos os itens do pedido (quando houver)
    await admin
      .from('pedido_itens')
      .update({ data_retirada: novaDataRetirada })
      .eq('pedido_id', pedidoId)

    return { ok: true }
  } catch (e: any) {
    console.error('[atualizarDataRetiradaPedidoPdv] Erro ao atualizar data de retirada:', e)
    return { ok: false, erro: e?.message || 'Erro inesperado ao atualizar data de retirada.' }
  }
}

