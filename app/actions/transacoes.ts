'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { criarEventoKitFesta } from '@/lib/google-calendar'
import type { ItemPedidoInput } from './pedidos-cantina'

/** Payload da transação PEDIDO_LOJA: um pedido por aluno. */
export interface PayloadPedidoLoja {
  pedidos: Array<{
    alunoId: string
    /** Nome do aluno (para exibição no checkout). */
    alunoNome?: string
    dataRetirada: string
    itens: ItemPedidoInput[]
  }>
}

/** Confirma uma transação APROVADA: cria pedido(s) + pagamento(s) ou recarga. Idempotente: evita dupla confirmação. */
export async function confirmarTransacaoAprovada(
  transacaoId: string
): Promise<{ ok: boolean; pedidoIds?: string[]; erro?: string }> {
  const admin = createAdminClient()
  const { data: transacao, error: errT } = await admin
    .from('transacoes')
    .select('*')
    .eq('id', transacaoId)
    .single()
  if (errT || !transacao) return { ok: false, erro: 'Transação não encontrada' }
  if (transacao.status !== 'APROVADO') return { ok: false, erro: 'Transação não está aprovada' }
  if (transacao.pedido_id) return { ok: true, pedidoIds: [transacao.pedido_id] }

  // Idempotência: só um processo confirma; os demais retornam o resultado já existente.
  const { error: lockErr } = await admin.from('transacao_confirmacao').insert({ transacao_id: transacaoId })
  if (lockErr) {
    const code = (lockErr as { code?: string }).code
    if (code === '23505') {
      const { data: tx } = await admin.from('transacoes').select('pedido_id').eq('id', transacaoId).single()
      if (tx?.pedido_id) return { ok: true, pedidoIds: [tx.pedido_id] }
      return { ok: true }
    }
    return { ok: false, erro: lockErr.message }
  }

  async function releaseLock() {
    await admin.from('transacao_confirmacao').delete().eq('transacao_id', transacaoId)
  }

  const now = new Date().toISOString()
  if (transacao.tipo === 'RECARGA_SALDO') {
    const valor = Number(transacao.valor)
    const alunoId = transacao.aluno_id
    if (!alunoId || valor <= 0) {
      await releaseLock()
      return { ok: false, erro: 'Dados de recarga inválidos' }
    }
    const { error: rpcErr } = await admin.rpc('incrementar_saldo_aluno', { p_aluno_id: alunoId, p_valor: valor })
    if (rpcErr) {
      await releaseLock()
      return { ok: false, erro: rpcErr.message }
    }
    const { error: movErr } = await admin.from('aluno_movimentacoes').insert({
      aluno_id: alunoId,
      tipo: 'RECARGA',
      valor,
      usuario_id: transacao.usuario_id,
      observacao: 'Recarga online (gateway)',
      transacao_id: transacaoId,
    })
    if (movErr) {
      await releaseLock()
      return { ok: false, erro: movErr.message }
    }
    return { ok: true }
  }

  if (transacao.tipo === 'PEDIDO_LOJA') {
    const payload = transacao.payload as PayloadPedidoLoja
    const pedidosPayload = payload?.pedidos
    if (!Array.isArray(pedidosPayload) || pedidosPayload.length === 0) {
      await releaseLock()
      return { ok: false, erro: 'Payload do pedido inválido' }
    }
    const pedidoIds: string[] = []
    for (const p of pedidosPayload) {
      const { data: aluno } = await admin.from('alunos').select('empresa_id, unidade_id').eq('id', p.alunoId).single()
      if (!aluno) {
        await releaseLock()
        return { ok: false, erro: `Aluno ${p.alunoId} não encontrado` }
      }
      const total = p.itens.reduce((s, i) => s + i.subtotal, 0)
      const { data: pedido, error: errPedido } = await admin
        .from('pedidos')
        .insert({
          empresa_id: aluno.empresa_id,
          unidade_id: aluno.unidade_id,
          usuario_id: transacao.usuario_id,
          aluno_id: p.alunoId,
          status: 'PAGO',
          total,
          data_retirada: p.dataRetirada,
          origem: 'ONLINE',
          tipo_beneficiario: 'ALUNO',
        })
        .select('id')
        .single()
      if (errPedido || !pedido) {
        await releaseLock()
        return { ok: false, erro: errPedido?.message ?? 'Erro ao criar pedido' }
      }
      pedidoIds.push(pedido.id)
      const itensInsert = p.itens.map((i) => ({
        pedido_id: pedido.id,
        produto_id: i.produto_id,
        kit_produto_id: i.kit_produto_id ?? null,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
        data_retirada: i.data_retirada || p.dataRetirada,
        variacoes_selecionadas: i.variacoes_selecionadas ?? {},
        produto_nome: i.produto_nome ?? null,
        tema_festa: i.tema_festa ?? null,
        idade_festa: i.idade_festa ?? null,
        kit_festa_data: i.kit_festa_data ?? null,
        kit_festa_horario_inicio: i.kit_festa_horario_inicio ?? null,
        kit_festa_horario_fim: i.kit_festa_horario_fim ?? null,
        opcionais_selecionados: Array.isArray(i.opcionais_selecionados) ? i.opcionais_selecionados : [],
      }))
      const { data: itensInseridos, error: errItens } = await admin
        .from('pedido_itens')
        .insert(itensInsert)
        .select('id, produto_id, tema_festa, idade_festa, kit_festa_data, kit_festa_horario_inicio, kit_festa_horario_fim, produto_nome, variacoes_selecionadas, opcionais_selecionados')
      if (errItens) {
        await releaseLock()
        return { ok: false, erro: errItens.message }
      }
      const alunoNome = p.alunoNome ?? (await admin.from('alunos').select('nome').eq('id', p.alunoId).single()).data?.nome ?? 'Aluno'
      const { data: turmaRow } = await admin.from('alunos').select('turmas:turma_id(descricao)').eq('id', p.alunoId).single()
      const turmaDescricao = (turmaRow as any)?.turmas?.descricao ?? (Array.isArray((turmaRow as any)?.turmas) ? (turmaRow as any).turmas[0]?.descricao : null) ?? '—'
      for (const row of itensInseridos ?? []) {
        if (!row.kit_festa_data || !row.kit_festa_horario_inicio || !row.kit_festa_horario_fim || row.tema_festa == null) continue
        const dataFormatada = new Date(row.kit_festa_data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const linhasDesc = [
          alunoNome.toUpperCase(),
          `Turma: ${turmaDescricao}`,
          `Tema: ${row.tema_festa}`,
          `Idade: ${row.idade_festa ?? '?'} anos`,
          `Data: ${dataFormatada}`,
        ]
        const variacoes = (row.variacoes_selecionadas as Record<string, string>) ?? {}
        if (Object.keys(variacoes).length > 0) {
          linhasDesc.push('', ...Object.entries(variacoes).map(([k, v]) => `${k}: ${v}`))
        }
        const opcionais = (row.opcionais_selecionados as Array<{ opcional_id?: string; nome: string; quantidade?: number }>) ?? []
        if (opcionais.length > 0) {
          let opcionaisLinhas: string[] = []
          const produtoId = (row as { produto_id?: string }).produto_id
          if (produtoId) {
            const { data: grupos } = await admin
              .from('grupos_opcionais')
              .select('id, nome, opcionais(id)')
              .eq('produto_id', produtoId)
            const opcionalIdToGrupoNome: Record<string, string> = {}
            for (const g of grupos ?? []) {
              const opcionaisIds = (g as { opcionais?: { id: string }[] }).opcionais ?? []
              for (const op of opcionaisIds) {
                if (op?.id) opcionalIdToGrupoNome[op.id] = (g as { nome?: string }).nome ?? 'Adicionais'
              }
            }
            const porGrupo: Record<string, string[]> = {}
            for (const o of opcionais) {
              const grupoNome = (o.opcional_id && opcionalIdToGrupoNome[o.opcional_id]) ? opcionalIdToGrupoNome[o.opcional_id] : 'Adicionais'
              const texto = `${o.nome}${(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}`
              if (!porGrupo[grupoNome]) porGrupo[grupoNome] = []
              porGrupo[grupoNome].push(texto)
            }
            opcionaisLinhas = Object.entries(porGrupo).map(([titulo, itens]) => `${titulo}: ${itens.join(', ')}`)
          } else {
            opcionaisLinhas = opcionais.map((o) => `${o.nome}${(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}`)
          }
          linhasDesc.push('', ...opcionaisLinhas)
        }
        try {
          const evento = await criarEventoKitFesta(
            row.kit_festa_data,
            row.kit_festa_horario_inicio,
            row.kit_festa_horario_fim,
            `Festa: ${alunoNome}`,
            linhasDesc.join('\n')
          )
          await admin.from('pedido_itens').update({ google_event_id: evento.id, google_event_link: evento.htmlLink || null }).eq('id', row.id)
        } catch (err) {
          console.error('[confirmarTransacaoAprovada] Erro ao criar evento Google Agenda para item', row.id, err)
        }
      }
      const { error: errPag } = await admin.from('pagamentos').insert({
        pedido_id: pedido.id,
        metodo: transacao.metodo,
        status: 'APROVADO',
        valor: total,
        provider_id: transacao.gateway_id,
        provider_data: transacao.gateway_data ?? {},
        transacao_id: transacaoId,
      })
      if (errPag) {
        await releaseLock()
        return { ok: false, erro: errPag.message }
      }
      // Inserir movimentação para o extrato do aluno (compra lanche online – pagamento online)
      const { error: errMov } = await admin.from('aluno_movimentacoes').insert({
        aluno_id: p.alunoId,
        tipo: 'COMPRA',
        valor: total,
        pedido_id: pedido.id,
        transacao_id: transacaoId,
        usuario_id: transacao.usuario_id,
        observacao: 'Compra lanche online - pagamento online',
      })
      if (errMov) {
        console.error('[confirmarTransacaoAprovada] Erro ao criar movimentação extrato:', errMov)
      }
      const abate = await abaterEstoquePedido(admin, p.itens)
      if (!abate.ok) {
        await releaseLock()
        return { ok: false, erro: abate.erro ?? 'Estoque insuficiente' }
      }
    }
    await admin.from('transacoes').update({ pedido_id: pedidoIds[0], updated_at: now }).eq('id', transacaoId)
    return { ok: true, pedidoIds }
  }

  await releaseLock()
  return { ok: false, erro: 'Tipo de transação não suportado' }
}

function normalizar(s: string | null | undefined): string {
  return s == null ? '' : String(s).trim()
}

/** Abate estoque de forma atômica (evita race com PDV). Retorna { ok, erro } se algum abate falhar (estoque insuficiente). */
export async function abaterEstoquePedido(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  itens: ItemPedidoInput[]
): Promise<{ ok: boolean; erro?: string }> {
  for (const item of itens) {
    const variacoesSel = item.variacoes_selecionadas && Object.keys(item.variacoes_selecionadas).length > 0 ? item.variacoes_selecionadas : null
    if (variacoesSel) {
      const { data: variacoes } = await admin
        .from('variacoes')
        .select('id, nome, valores:variacao_valores(id, valor, label, estoque)')
        .eq('produto_id', item.produto_id)
      let abateu = false
      for (const [nomeVariacao, valorSelecionado] of Object.entries(variacoesSel)) {
        const variacao = (variacoes ?? []).find((v: { nome?: string }) => normalizar(v.nome) === normalizar(nomeVariacao))
        if (!variacao) continue
        const valores = (variacao as { valores?: Array<{ id: string; valor: string; label: string | null; estoque: number | null }> }).valores ?? []
        const valor = valores.find((v) => normalizar(v.label) === normalizar(valorSelecionado) || normalizar(v.valor) === normalizar(valorSelecionado))
        if (valor && valor.estoque != null) {
          const { data: ok } = await admin.rpc('decrementar_estoque_variacao_valor', { p_id: valor.id, p_quantidade: item.quantidade })
          if (!ok) return { ok: false, erro: `Estoque insuficiente para o item (variação)` }
          abateu = true
          break
        }
      }
      if (abateu) continue
    }
    const { data: produto } = await admin.from('produtos').select('id, estoque').eq('id', item.produto_id).single()
    if (produto && produto.estoque != null) {
      const { data: ok } = await admin.rpc('decrementar_estoque_produto', { p_id: item.produto_id, p_quantidade: item.quantidade })
      if (!ok) return { ok: false, erro: `Estoque insuficiente para o produto` }
    }
  }
  return { ok: true }
}
