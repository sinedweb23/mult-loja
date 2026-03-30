'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PagamentoMetodo } from '@/lib/types/database'

interface ResultadoCancelamentoItem {
  ok: boolean
  erro?: string
}

/**
 * Cancela um único item de uma venda do PDV,
 * devolvendo estoque, ajustando saldo de aluno (quando houver SALDO),
 * ajustando consumo de colaborador e atualizando o total do pedido.
 *
 * Não altera os registros da tabela pagamentos (exceto via saldo),
 * portanto qualquer ajuste de caixa para dinheiro/cartão deve ser feito manualmente.
 */
export async function cancelarItemVendaPdv(params: {
  pedidoId: string
  itemId: string
}): Promise<ResultadoCancelamentoItem> {
  const { pedidoId, itemId } = params
  if (!pedidoId || !itemId) {
    return { ok: false, erro: 'Dados inválidos para cancelamento do item.' }
  }

  const admin = createAdminClient()

  // Carregar pedido básico
  const { data: pedido, error: pedidoErr } = await admin
    .from('pedidos')
    .select(
      'id, aluno_id, colaborador_id, caixa_id, empresa_id, status, total, origem, tipo_beneficiario'
    )
    .eq('id', pedidoId)
    .maybeSingle()

  if (pedidoErr || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado.' }
  }

  if (pedido.origem !== 'PDV') {
    return { ok: false, erro: 'Somente pedidos do PDV podem ter itens cancelados por aqui.' }
  }

  if (pedido.status === 'CANCELADO' || pedido.status === 'ESTORNADO') {
    return { ok: false, erro: 'Pedido já está cancelado/estornado.' }
  }

  if (pedido.status !== 'PAGO' && pedido.status !== 'ENTREGUE') {
    return { ok: false, erro: 'Só é possível cancelar itens de pedidos pagos ou entregues.' }
  }

  // Carregar item alvo
  const { data: item, error: itemErr } = await admin
    .from('pedido_itens')
    .select('id, pedido_id, produto_id, quantidade, subtotal')
    .eq('id', itemId)
    .eq('pedido_id', pedidoId)
    .maybeSingle()

  if (itemErr || !item) {
    return { ok: false, erro: 'Item do pedido não encontrado.' }
  }

  const subtotalItem = Number(item.subtotal ?? 0)
  const agora = new Date().toISOString()

  // Carregar pagamentos para saber se houve SALDO
  const { data: pagamentos, error: pagErr } = await admin
    .from('pagamentos')
    .select('id, metodo, valor, caixa_id')
    .eq('pedido_id', pedidoId)

  if (pagErr) {
    return { ok: false, erro: 'Erro ao carregar pagamentos do pedido.' }
  }

  const temSaldo = (pagamentos ?? []).some((p) => p.metodo === 'SALDO')

  try {
    // 1) Devolver estoque apenas do produto deste item
    const { data: produto } = await admin
      .from('produtos')
      .select('id, estoque')
      .eq('id', item.produto_id)
      .maybeSingle()

    if (produto && produto.estoque != null) {
      const novoEstoque = Number(produto.estoque) + Number(item.quantidade ?? 0)
      await admin
        .from('produtos')
        .update({ estoque: novoEstoque, updated_at: agora })
        .eq('id', produto.id)
    }

    // 2) Ajustar saldo de aluno, se houver pagamento com SALDO
    if (temSaldo && pedido.aluno_id && subtotalItem > 0) {
      const { data: saldoRow } = await admin
        .from('aluno_saldos')
        .select('saldo')
        .eq('aluno_id', pedido.aluno_id)
        .maybeSingle()

      const saldoAtual = Number(saldoRow?.saldo ?? 0)
      const novoSaldo = saldoAtual + subtotalItem
      await admin
        .from('aluno_saldos')
        .update({ saldo: novoSaldo, updated_at: agora })
        .eq('aluno_id', pedido.aluno_id)

      // Registrar estorno parcial no histórico de movimentações
      const caixaId =
        (pagamentos?.[0] as { caixa_id?: string } | undefined)?.caixa_id ?? pedido.caixa_id ?? null

      await admin.from('aluno_movimentacoes').insert({
        aluno_id: pedido.aluno_id,
        tipo: 'ESTORNO',
        valor: subtotalItem,
        pedido_id: pedido.id,
        caixa_id: caixaId,
        observacao: 'Cancelamento parcial de item no PDV',
      })
    }

    // 3) Ajustar consumo mensal de colaborador (se aplicável)
    if (pedido.tipo_beneficiario === 'COLABORADOR' && pedido.colaborador_id && subtotalItem > 0) {
      const ano = new Date(agora).getFullYear()
      const mes = new Date(agora).getMonth() + 1
      const { data: consumo } = await admin
        .from('consumo_colaborador_mensal')
        .select('id, valor_total')
        .eq('usuario_id', pedido.colaborador_id)
        .eq('empresa_id', pedido.empresa_id)
        .eq('ano', ano)
        .eq('mes', mes)
        .maybeSingle()

      if (consumo) {
        const novoValor = Math.max(0, Number(consumo.valor_total ?? 0) - subtotalItem)
        await admin
          .from('consumo_colaborador_mensal')
          .update({ valor_total: novoValor, updated_at: agora })
          .eq('id', consumo.id)
      }
    }

    // 4) Remover o item do pedido
    await admin.from('pedido_itens').delete().eq('id', item.id)

    // 5) Recalcular total do pedido com base nos itens restantes
    const { data: itensRestantes } = await admin
      .from('pedido_itens')
      .select('subtotal')
      .eq('pedido_id', pedidoId)

    const novoTotal = (itensRestantes ?? []).reduce(
      (acc, it) => acc + Number((it as { subtotal?: number }).subtotal ?? 0),
      0
    )

    await admin
      .from('pedidos')
      .update({
        total: novoTotal,
        // Se não restar nenhum item, marcamos o pedido como CANCELADO
        status: novoTotal > 0 ? pedido.status : 'CANCELADO',
        updated_at: agora,
      })
      .eq('id', pedidoId)

    return { ok: true }
  } catch (e: any) {
    console.error('[cancelarItemVendaPdv] Erro ao cancelar item:', e)
    return { ok: false, erro: e?.message || 'Erro inesperado ao cancelar item.' }
  }
}

