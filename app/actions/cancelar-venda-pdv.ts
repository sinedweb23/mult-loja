'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PagamentoStatus, PagamentoMetodo } from '@/lib/types/database'

interface ResultadoCancelamento {
  ok: boolean
  erro?: string
  comprovante?: {
    pedidoId: string
    operadorNome: string | null
    tipo: 'DIRETA' | 'ALUNO' | 'COLABORADOR'
    beneficiarioNome: string | null
    alunoProntuario?: string | null
    total: number
    canceladoEm: string
    itens: Array<{
      produto_nome: string
      quantidade: number
      preco_unitario: number
      subtotal: number
      variacoes_selecionadas?: Record<string, string> | null
    }>
    formasPagamento: Array<{
      metodo: PagamentoMetodo
      valor: number
      troco?: number
    }>
  }
}

/**
 * Cancela uma venda do PDV (pedido vinculado a caixa),
 * atualizando status do pedido/pagamentos, devolvendo estoque
 * e estornando saldo de aluno quando o método foi SALDO.
 */
export async function cancelarVendaPdv(pedidoId: string): Promise<ResultadoCancelamento> {
  const admin = createAdminClient()

  // Carregar pedido (select simples para evitar falha de join no Supabase)
  const { data: pedido, error: pedidoErr } = await admin
    .from('pedidos')
    .select('id, aluno_id, colaborador_id, caixa_id, empresa_id, status, total, origem, tipo_beneficiario')
    .eq('id', pedidoId)
    .maybeSingle()

  if (pedidoErr || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado' }
  }

  if (pedido.origem !== 'PDV') {
    return { ok: false, erro: 'Somente pedidos do PDV podem ser cancelados por aqui.' }
  }

  if (pedido.status === 'CANCELADO' || pedido.status === 'ESTORNADO') {
    return { ok: false, erro: 'Pedido já está cancelado/estornado.' }
  }

  if (pedido.status !== 'PAGO' && pedido.status !== 'ENTREGUE') {
    return { ok: false, erro: 'Só é possível cancelar pedidos pagos ou entregues.' }
  }

  const { data: itens, error: itensErr } = await admin
    .from('pedido_itens')
    .select('id, produto_id, quantidade, subtotal, produto_nome, variacoes_selecionadas, data_retirada')
    .eq('pedido_id', pedidoId)

  if (itensErr) {
    return { ok: false, erro: 'Erro ao carregar itens do pedido.' }
  }

  const { data: pagamentos, error: pagErr } = await admin
    .from('pagamentos')
    .select('id, metodo, status, valor, caixa_id, provider_data')
    .eq('pedido_id', pedidoId)

  if (pagErr) {
    return { ok: false, erro: 'Erro ao carregar pagamentos do pedido.' }
  }

  const total = Number(pedido.total ?? 0)
  const agora = new Date().toISOString()

  // Início da "transação" lógica (não é transação real de banco)
  try {
    // 1) Devolver estoque dos produtos (modo simples: apenas produto.estoque)
    const produtoIds = Array.from(new Set((itens ?? []).map((i) => i.produto_id)))
    if (produtoIds.length > 0) {
      const { data: produtosEstoque } = await admin
        .from('produtos')
        .select('id, estoque')
        .in('id', produtoIds)

      for (const item of itens ?? []) {
        const produto = (produtosEstoque ?? []).find((p: any) => p.id === item.produto_id)
        if (!produto) continue
        if (produto.estoque == null) continue
        const novoEstoque = Number(produto.estoque) + Number(item.quantidade ?? 0)
        await admin
          .from('produtos')
          .update({ estoque: novoEstoque, updated_at: agora })
          .eq('id', item.produto_id)
      }
    }

    // 2) Se houve pagamento com SALDO, devolver para o aluno e remover movimentação de COMPRA
    const temSaldo = (pagamentos ?? []).some((p) => p.metodo === 'SALDO')
    if (temSaldo && pedido.aluno_id) {
      // devolver saldo
      const { data: saldoRow } = await admin
        .from('aluno_saldos')
        .select('saldo')
        .eq('aluno_id', pedido.aluno_id)
        .maybeSingle()

      const saldoAtual = Number(saldoRow?.saldo ?? 0)
      const novoSaldo = saldoAtual + total
      await admin
        .from('aluno_saldos')
        .update({ saldo: novoSaldo, updated_at: agora })
        .eq('aluno_id', pedido.aluno_id)

      // remover movimentações de COMPRA vinculadas ao pedido
      await admin
        .from('aluno_movimentacoes')
        .delete()
        .eq('pedido_id', pedido.id)
        .eq('tipo', 'COMPRA')
    }

    // 3) Atualizar status dos pagamentos para RECUSADO/ESTORNADO (não contar mais no caixa)
    const novoStatus: PagamentoStatus = 'ESTORNADO'
    await admin
      .from('pagamentos')
      .update({ status: novoStatus, updated_at: agora })
      .eq('pedido_id', pedidoId)

    // 4) Se venda colaborador: abater do consumo_colaborador_mensal (cancelar saldo devedor)
    if (pedido.tipo_beneficiario === 'COLABORADOR' && pedido.colaborador_id) {
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
        const novoValor = Math.max(0, Number(consumo.valor_total ?? 0) - total)
        await admin
          .from('consumo_colaborador_mensal')
          .update({ valor_total: novoValor, updated_at: agora })
          .eq('id', consumo.id)
      }
    }

    // 5) Marcar pedido como CANCELADO
    await admin
      .from('pedidos')
      .update({ status: 'CANCELADO', updated_at: agora })
      .eq('id', pedidoId)

    // Nome do operador para o comprovante (consulta separada)
    let operadorNome: string | null = null
    const caixaId = (pagamentos?.[0] as { caixa_id?: string } | undefined)?.caixa_id ?? pedido.caixa_id
    if (caixaId) {
      const { data: caixa } = await admin
        .from('caixas')
        .select('operador_id')
        .eq('id', caixaId)
        .maybeSingle()
      if (caixa?.operador_id) {
        const { data: usuario } = await admin
          .from('usuarios')
          .select('nome, nome_financeiro')
          .eq('id', caixa.operador_id)
          .maybeSingle()
        operadorNome = usuario
          ? (usuario.nome_financeiro ?? usuario.nome ?? null)
          : null
      }
    }

    // Beneficiário (aluno ou colaborador) para o comprovante
    let beneficiarioNome: string | null = null
    let alunoProntuario: string | null = null
    if (pedido.aluno_id) {
      const { data: aluno } = await admin
        .from('alunos')
        .select('nome, prontuario')
        .eq('id', pedido.aluno_id)
        .maybeSingle()
      if (aluno) {
        beneficiarioNome = (aluno as any).nome ?? null
        alunoProntuario = (aluno as any).prontuario ?? null
      }
    } else if (pedido.colaborador_id) {
      const { data: colab } = await admin
        .from('usuarios')
        .select('nome')
        .eq('id', pedido.colaborador_id)
        .maybeSingle()
      if (colab) {
        beneficiarioNome = (colab as any).nome ?? null
      }
    }

    // Tipo de venda para o comprovante
    let tipoComprovante: 'DIRETA' | 'ALUNO' | 'COLABORADOR' = 'DIRETA'
    if (pedido.tipo_beneficiario === 'COLABORADOR') {
      tipoComprovante = 'COLABORADOR'
    } else if (pedido.tipo_beneficiario === 'ALUNO' || temSaldo) {
      tipoComprovante = 'ALUNO'
    }

    const itensComprovante =
      (itens ?? []).map((i) => {
        const subtotalNum = Number(i.subtotal ?? 0)
        const qtd = Number(i.quantidade ?? 0) || 1
        return {
          produto_nome: (i.produto_nome as string | null) ?? 'Produto',
          quantidade: qtd,
          preco_unitario: subtotalNum / qtd,
          subtotal: subtotalNum,
          variacoes_selecionadas: (i.variacoes_selecionadas as Record<string, string> | null) ?? null,
        }
      }) ?? []

    const formasPagamento =
      (pagamentos ?? []).map((p) => ({
        metodo: p.metodo as PagamentoMetodo,
        valor: Number(p.valor ?? 0),
        troco: (p as any).provider_data?.troco ?? undefined,
      })) ?? []

    return {
      ok: true,
      comprovante: {
        pedidoId,
        operadorNome,
        tipo: tipoComprovante,
        beneficiarioNome,
        alunoProntuario: alunoProntuario ?? undefined,
        total,
        canceladoEm: agora,
        itens: itensComprovante,
        formasPagamento,
      },
    }
  } catch (e: any) {
    console.error('[cancelarVendaPdv] Erro ao cancelar venda:', e)
    return { ok: false, erro: e?.message || 'Erro inesperado ao cancelar venda.' }
  }
}

