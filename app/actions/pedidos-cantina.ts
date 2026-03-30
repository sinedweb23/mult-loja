'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PedidoStatus } from '@/lib/types/database'

export interface ItemPedidoInput {
  produto_id: string
  kit_produto_id?: string | null
  quantidade: number
  preco_unitario: number
  subtotal: number
  /** Para kit lanche: data de retirada deste item. Se não informado, usa a data do pedido. */
  data_retirada?: string | null
  /** Nome do produto no momento da compra (para exibição em listas). */
  produto_nome?: string | null
  /** Variações escolhidas: { "Tamanho": "M", "Sabor": "Chocolate" } */
  variacoes_selecionadas?: Record<string, string> | null
  /** Opcionais selecionados (para descrição do evento Kit Festa). */
  opcionais_selecionados?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> | null
  /** Kit Festa */
  tema_festa?: string | null
  idade_festa?: number | null
  kit_festa_data?: string | null
  kit_festa_horario_inicio?: string | null
  kit_festa_horario_fim?: string | null
}

/** Normaliza string para comparação de variações */
function normalizarValorPedido(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).trim()
}

/** Abate estoque para pedidos online (loja), usando mesma regra do PDV */
async function abaterEstoquePedidoOnline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itens: ItemPedidoInput[]
): Promise<void> {
  for (const item of itens) {
    const variacoesSel = item.variacoes_selecionadas && Object.keys(item.variacoes_selecionadas).length > 0
      ? item.variacoes_selecionadas
      : null

    if (variacoesSel) {
      const { data: variacoes, error: errVar } = await supabase
        .from('variacoes')
        .select(`
          id,
          nome,
          valores:variacao_valores(id, valor, label, estoque)
        `)
        .eq('produto_id', item.produto_id)

      if (errVar) {
        console.error('[abaterEstoquePedidoOnline] Erro ao buscar variações:', errVar)
      }

      const valorSelNorm = (s: string) => normalizarValorPedido(s)
      let abateuEmVariacao = false
      for (const [nomeVariacao, valorSelecionado] of Object.entries(variacoesSel)) {
        const variacao = (variacoes || []).find((v: any) => valorSelNorm(v.nome) === valorSelNorm(nomeVariacao))
        if (!variacao) continue
        const valores = (variacao as any).valores as Array<{ id: string; valor: string; label: string | null; estoque: number | null }> | undefined
        if (!valores?.length) continue
        const busca = valorSelNorm(valorSelecionado)
        const valor = valores.find(
          (v) => normalizarValorPedido(v.label) === busca || normalizarValorPedido(v.valor) === busca
        )
        if (valor && valor.estoque != null) {
          const novoEstoque = Math.max(0, valor.estoque - item.quantidade)
          const { error: updateErr } = await supabase
            .from('variacao_valores')
            .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
            .eq('id', valor.id)
          if (updateErr) {
            console.error('[abaterEstoquePedidoOnline] Erro ao atualizar estoque da variação:', valor.id, updateErr)
          } else {
            abateuEmVariacao = true
          }
          break
        }
      }

      if (abateuEmVariacao) continue
    }

    const { data: produto } = await supabase
      .from('produtos')
      .select('estoque')
      .eq('id', item.produto_id)
      .single()

    if (produto && produto.estoque !== null) {
      const novoEstoque = Math.max(0, produto.estoque - item.quantidade)
      await supabase
        .from('produtos')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.produto_id)
    }
  }
}

/**
 * Cria pedido online (responsável): pedido com data_retirada, origem ONLINE.
 * Itens podem ter data_retirada própria (kit lanche por dia); senão usa a data do pedido.
 */
export async function criarPedidoOnline(
  alunoId: string,
  dataRetirada: string,
  itens: ItemPedidoInput[]
): Promise<{ ok: boolean; pedidoId?: string; erro?: string }> {
  if (!dataRetirada || itens.length === 0) return { ok: false, erro: 'Dados inválidos' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado' }

  const { data: aluno } = await supabase
    .from('alunos')
    .select('empresa_id, unidade_id')
    .eq('id', alunoId)
    .single()
  if (!aluno) return { ok: false, erro: 'Aluno não encontrado' }

  const total = itens.reduce((s, i) => s + i.subtotal, 0)

  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .insert({
      empresa_id: aluno.empresa_id,
      unidade_id: aluno.unidade_id,
      usuario_id: usuario.id,
      aluno_id: alunoId,
      status: 'PAGO',
      total,
      data_retirada: dataRetirada,
      origem: 'ONLINE',
      tipo_beneficiario: 'ALUNO',
    })
    .select('id')
    .single()

  if (errPedido || !pedido) return { ok: false, erro: errPedido?.message || 'Erro ao criar pedido' }

  const itensInsert = itens.map((i) => ({
    pedido_id: pedido.id,
    produto_id: i.produto_id,
    kit_produto_id: i.kit_produto_id || null,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    subtotal: i.subtotal,
    data_retirada: i.data_retirada || dataRetirada,
    variacoes_selecionadas: i.variacoes_selecionadas ?? {},
  }))
  const { error: errItens } = await supabase.from('pedido_itens').insert(itensInsert)
  if (errItens) return { ok: false, erro: errItens.message }

  // Abater estoque (produto ou variação) igual ao PDV
  await abaterEstoquePedidoOnline(supabase, itens)

  return { ok: true, pedidoId: pedido.id }
}

/**
 * Lista pedidos para retirada no dia (PDV): considera apenas data_retirada da tabela pedido_itens.
 * Inclui pedidos que tenham pelo menos um item com data_retirada no dia; mostra só os itens daquela data.
 */
export async function listarPedidosParaRetirada(data: string): Promise<{
  id: string
  status: PedidoStatus
  total: number
  data_retirada: string | null
  created_at: string
  aluno: { id: string; nome: string; prontuario: string; turma_nome: string | null; turma_turno: 'MANHA' | 'TARDE' | null; turma_segmento: string | null }
  beneficiario_nome: string
  tipo_beneficiario: string | null
  itens: { produto_nome: string; quantidade: number; subtotal: number; data_retirada: string | null; variacoes_selecionadas: Record<string, string>; categoria_id: string | null; categoria_nome: string | null }[]
}[]> {
  const supabase = await createClient()

  const { data: itensComData } = await supabase
    .from('pedido_itens')
    .select('pedido_id')
    .eq('data_retirada', data)

  const todosIds = [...new Set((itensComData || []).map((i: { pedido_id: string }) => i.pedido_id))]
  if (todosIds.length === 0) return []

  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id,
      status,
      total,
      data_retirada,
      created_at,
      aluno_id,
      tipo_beneficiario,
      colaborador_id,
      origem,
      alunos!inner ( id, nome, prontuario, turmas:turma_id ( descricao, turno, segmento ) ),
      colaborador:colaborador_id ( nome )
    `)
    .in('id', todosIds)
    .in('status', ['PAGO', 'ENTREGUE'])
    .order('created_at', { ascending: false })

  if (error || !pedidos) return []

  // Buscar itens com admin (evita RLS); pedidos já foram filtrados pelo usuário. Sem join para evitar falha de permissão.
  const admin = createAdminClient()
  const { data: itens } = await admin
    .from('pedido_itens')
    .select('pedido_id, quantidade, subtotal, data_retirada, variacoes_selecionadas, produto_nome, produto_id, kit_produto_id')
    .in('pedido_id', todosIds)

  // Mapa produto_id -> { categoria_id, categoria_nome } e set de ids de produtos tipo KIT_LANCHE (para exibir pedidos PDV com kit lanche)
  const produtoIds = [...new Set((itens || []).map((i: { produto_id?: string; kit_produto_id?: string | null }) => i.produto_id).filter(Boolean))] as string[]
  const kitProdutoIds = [...new Set((itens || []).map((i: { kit_produto_id?: string | null }) => i.kit_produto_id).filter(Boolean))] as string[]
  const todosProdutoIds = [...new Set([...produtoIds, ...kitProdutoIds])]
  let categoriaPorProduto = new Map<string, { categoria_id: string | null; categoria_nome: string | null }>()
  const kitLancheProdutoIds = new Set<string>()
  if (todosProdutoIds.length > 0) {
    try {
      const { data: prods } = await admin
        .from('produtos')
        .select('id, categoria_id, tipo, categoria:categorias(id, nome)')
        .in('id', todosProdutoIds)
      for (const prod of prods || []) {
        const raw = (prod as unknown as { categoria?: { nome?: string } | { nome?: string }[] | null }).categoria
        const cat = Array.isArray(raw) ? raw[0] : raw
        categoriaPorProduto.set(String(prod.id), {
          categoria_id: prod.categoria_id ?? null,
          categoria_nome: cat && typeof cat === 'object' && 'nome' in cat ? (cat.nome ?? null) : null,
        })
        if (prod.tipo === 'KIT_LANCHE') kitLancheProdutoIds.add(String(prod.id))
      }
    } catch {
      // Se falhar (ex.: permissão em categorias), filtro por categoria fica sem opções; itens continuam visíveis
    }
  }

  type ItemRetorno = {
    produto_nome: string
    quantidade: number
    subtotal: number
    data_retirada: string | null
    variacoes_selecionadas: Record<string, string>
    categoria_id: string | null
    categoria_nome: string | null
  }
  type PedidoRetorno = {
    id: string
    status: PedidoStatus
    total: number
    data_retirada: string | null
    created_at: string
    aluno: { id: string; nome: string; prontuario: string; turma_nome: string | null; turma_turno: 'MANHA' | 'TARDE' | null; turma_segmento: string | null }
    beneficiario_nome: string
    tipo_beneficiario: string | null
    origem?: string
    itens: ItemRetorno[]
  }

  const mapeados = pedidos.map((p: any): PedidoRetorno & { _temKitLanche?: boolean } => {
    const itensDoPedido = (itens || []).filter((i: any) => i.pedido_id === p.id && i.data_retirada === data)
    const totalDoDia = itensDoPedido.reduce((s: number, i: any) => s + Number(i.subtotal), 0)
    const temKitLanche = itensDoPedido.some(
      (i: any) => kitLancheProdutoIds.has(String(i.produto_id ?? '')) || kitLancheProdutoIds.has(String(i.kit_produto_id ?? ''))
    )
    const ehColaborador = p.tipo_beneficiario === 'COLABORADOR'
    const colab = p.colaborador ?? (p as any).usuarios
    const colaboradorNome = colab && (typeof colab === 'object' && colab !== null && 'nome' in colab) ? String((colab as { nome: string }).nome) : null
    const beneficiario_nome = ehColaborador && colaboradorNome ? colaboradorNome : String(p.alunos?.nome ?? '')
    return {
      id: String(p.id),
      status: p.status as PedidoStatus,
      total: totalDoDia,
      data_retirada: data,
      created_at: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      aluno: (() => {
        const t = (p.alunos as any)?.turmas
        const turma = t != null ? (Array.isArray(t) ? t[0] : t) : null
        const desc = turma?.descricao
        const turno = turma?.turno === 'MANHA' || turma?.turno === 'TARDE' ? turma.turno : null
        const segmento = turma?.segmento != null ? String(turma.segmento) : null
        return {
          id: String(p.alunos?.id ?? ''),
          nome: String(p.alunos?.nome ?? ''),
          prontuario: String(p.alunos?.prontuario ?? ''),
          turma_nome: desc != null ? String(desc) : null,
          turma_turno: turno,
          turma_segmento: segmento,
        }
      })(),
      beneficiario_nome,
      tipo_beneficiario: p.tipo_beneficiario ?? null,
      origem: p.origem ?? 'ONLINE',
      itens: itensDoPedido.map((i: any): ItemRetorno => {
        const catInfo = categoriaPorProduto.get(String(i.produto_id ?? ''))
        return {
          produto_nome: String(i.produto_nome ?? 'Produto'),
          quantidade: Number(i.quantidade),
          subtotal: Number(i.subtotal),
          data_retirada: i.data_retirada ?? null,
          variacoes_selecionadas: (i.variacoes_selecionadas && typeof i.variacoes_selecionadas === 'object') ? (i.variacoes_selecionadas as Record<string, string>) : {},
          categoria_id: catInfo?.categoria_id ?? null,
          categoria_nome: catInfo?.categoria_nome ?? null,
        }
      }),
      _temKitLanche: temKitLanche,
    }
  })

  // Não exibir venda direta nem venda colaborador; só online e PDV com kit lanche
  const filtrados = mapeados.filter((p) => {
    if (p.tipo_beneficiario === 'COLABORADOR') return false
    if (p.aluno.prontuario === 'VENDA_DIRETA') return false
    const orig = p.origem ?? 'ONLINE'
    if (orig === 'PDV' && !p._temKitLanche) return false
    return true
  }).map(({ _temKitLanche, ...rest }) => rest as PedidoRetorno)

  // Ordenar: MANHA primeiro, depois TARDE, depois sem turno; dentro de cada grupo por nome do beneficiário
  const ordemTurno = (t: 'MANHA' | 'TARDE' | null) => (t === 'MANHA' ? 0 : t === 'TARDE' ? 1 : 2)
  return filtrados.sort((a, b) => {
    const ta = ordemTurno(a.aluno.turma_turno)
    const tb = ordemTurno(b.aluno.turma_turno)
    if (ta !== tb) return ta - tb
    return (a.beneficiario_nome || a.aluno.nome).localeCompare(b.beneficiario_nome || b.aluno.nome)
  })
}

/**
 * Lista pedidos que ainda NÃO foram entregues, considerando o histórico:
 * - pega pedidos com status 'PAGO'
 * - considera itens com data_retirada <= `data`
 * - retorna a lista já agregada no formato do PDV (itens dentro do pedido)
 */
export async function listarPedidosNaoEntreguesAte(data: string): Promise<{
  id: string
  status: PedidoStatus
  total: number
  data_retirada: string | null
  created_at: string
  aluno: { id: string; nome: string; prontuario: string; turma_nome: string | null; turma_turno: 'MANHA' | 'TARDE' | null; turma_segmento: string | null }
  beneficiario_nome: string
  tipo_beneficiario: string | null
  itens: { produto_nome: string; quantidade: number; subtotal: number; data_retirada: string | null; variacoes_selecionadas: Record<string, string>; categoria_id: string | null; categoria_nome: string | null }[]
}[]> {
  const supabase = await createClient()

  // IDs dos pedidos a partir dos itens (evita depender de RLS/join em pedidos)
  const { data: itensAte } = await supabase
    .from('pedido_itens')
    .select('pedido_id')
    .lte('data_retirada', data)
    .not('data_retirada', 'is', null)

  const todosIds = [...new Set((itensAte || []).map((i: { pedido_id: string }) => i.pedido_id))]
  if (todosIds.length === 0) return []

  // Somente pedidos ainda em aberto (não entregues)
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id,
      status,
      total,
      data_retirada,
      created_at,
      aluno_id,
      tipo_beneficiario,
      colaborador_id,
      origem,
      alunos!inner ( id, nome, prontuario, turmas:turma_id ( descricao, turno, segmento ) ),
      colaborador:colaborador_id ( nome )
    `)
    .in('id', todosIds)
    .eq('status', 'PAGO')
    .order('created_at', { ascending: false })

  if (error || !pedidos) return []

  // Buscar itens com admin (evita RLS); pedidos já foram filtrados pelo usuário.
  const admin = createAdminClient()
  const { data: itens } = await admin
    .from('pedido_itens')
    .select('pedido_id, quantidade, subtotal, data_retirada, variacoes_selecionadas, produto_nome, produto_id, kit_produto_id')
    .in('pedido_id', todosIds)
    .lte('data_retirada', data)

  // Mapa produto_id -> { categoria_id, categoria_nome } e set de ids de produtos tipo KIT_LANCHE (para exibir pedidos PDV com kit lanche)
  const produtoIds = [...new Set((itens || []).map((i: { produto_id?: string; kit_produto_id?: string | null }) => i.produto_id).filter(Boolean))] as string[]
  const kitProdutoIds = [...new Set((itens || []).map((i: { kit_produto_id?: string | null }) => i.kit_produto_id).filter(Boolean))] as string[]
  const todosProdutoIds = [...new Set([...produtoIds, ...kitProdutoIds])]
  let categoriaPorProduto = new Map<string, { categoria_id: string | null; categoria_nome: string | null }>()
  const kitLancheProdutoIds = new Set<string>()
  if (todosProdutoIds.length > 0) {
    try {
      const { data: prods } = await admin
        .from('produtos')
        .select('id, categoria_id, tipo, categoria:categorias(id, nome)')
        .in('id', todosProdutoIds)
      for (const prod of prods || []) {
        const raw = (prod as unknown as { categoria?: { nome?: string } | { nome?: string }[] | null }).categoria
        const cat = Array.isArray(raw) ? raw[0] : raw
        categoriaPorProduto.set(String(prod.id), {
          categoria_id: prod.categoria_id ?? null,
          categoria_nome: cat && typeof cat === 'object' && 'nome' in cat ? (cat.nome ?? null) : null,
        })
        if (prod.tipo === 'KIT_LANCHE') kitLancheProdutoIds.add(String(prod.id))
      }
    } catch {
      // Se falhar (ex.: permissão em categorias), filtro por categoria fica sem opções; itens continuam visíveis
    }
  }

  type ItemRetorno = {
    produto_nome: string
    quantidade: number
    subtotal: number
    data_retirada: string | null
    variacoes_selecionadas: Record<string, string>
    categoria_id: string | null
    categoria_nome: string | null
  }
  type PedidoRetorno = {
    id: string
    status: PedidoStatus
    total: number
    data_retirada: string | null
    created_at: string
    aluno: { id: string; nome: string; prontuario: string; turma_nome: string | null; turma_turno: 'MANHA' | 'TARDE' | null; turma_segmento: string | null }
    beneficiario_nome: string
    tipo_beneficiario: string | null
    origem?: string
    itens: ItemRetorno[]
  }

  const mapeados = pedidos.map((p: any): PedidoRetorno & { _temKitLanche?: boolean } => {
    const itensDoPedido = (itens || []).filter((i: any) => i.pedido_id === p.id && (i.data_retirada == null || i.data_retirada <= data))
    const totalDoPeriodo = itensDoPedido.reduce((s: number, i: any) => s + Number(i.subtotal ?? 0), 0)
    const temKitLanche = itensDoPedido.some(
      (i: any) => kitLancheProdutoIds.has(String(i.produto_id ?? '')) || kitLancheProdutoIds.has(String(i.kit_produto_id ?? ''))
    )

    const ehColaborador = p.tipo_beneficiario === 'COLABORADOR'
    const colab = p.colaborador ?? (p as any).usuarios
    const colaboradorNome = colab && (typeof colab === 'object' && colab !== null && 'nome' in colab) ? String((colab as { nome: string }).nome) : null
    const beneficiario_nome = ehColaborador && colaboradorNome ? colaboradorNome : String(p.alunos?.nome ?? '')

    return {
      id: String(p.id),
      status: p.status as PedidoStatus,
      // total do PDV na tela deve refletir apenas itens incluídos (<= data)
      total: totalDoPeriodo,
      data_retirada: data,
      created_at: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      aluno: (() => {
        const t = (p.alunos as any)?.turmas
        const turma = t != null ? (Array.isArray(t) ? t[0] : t) : null
        const desc = turma?.descricao
        const turno = turma?.turno === 'MANHA' || turma?.turno === 'TARDE' ? turma.turno : null
        const segmento = turma?.segmento != null ? String(turma.segmento) : null
        return {
          id: String(p.alunos?.id ?? ''),
          nome: String(p.alunos?.nome ?? ''),
          prontuario: String(p.alunos?.prontuario ?? ''),
          turma_nome: desc != null ? String(desc) : null,
          turma_turno: turno,
          turma_segmento: segmento,
        }
      })(),
      beneficiario_nome,
      tipo_beneficiario: p.tipo_beneficiario ?? null,
      origem: p.origem ?? 'ONLINE',
      itens: itensDoPedido.map((i: any): ItemRetorno => {
        const catInfo = categoriaPorProduto.get(String(i.produto_id ?? ''))
        return {
          produto_nome: String(i.produto_nome ?? 'Produto'),
          quantidade: Number(i.quantidade),
          subtotal: Number(i.subtotal),
          data_retirada: i.data_retirada ?? null,
          variacoes_selecionadas:
            i.variacoes_selecionadas && typeof i.variacoes_selecionadas === 'object' ? (i.variacoes_selecionadas as Record<string, string>) : {},
          categoria_id: catInfo?.categoria_id ?? null,
          categoria_nome: catInfo?.categoria_nome ?? null,
        }
      }),
      _temKitLanche: temKitLanche,
    }
  })

  // Não exibir venda direta nem venda colaborador; só online e PDV com kit lanche
  const filtrados = mapeados.filter((p) => {
    if (p.tipo_beneficiario === 'COLABORADOR') return false
    if (p.aluno.prontuario === 'VENDA_DIRETA') return false
    const orig = p.origem ?? 'ONLINE'
    if (orig === 'PDV' && !p._temKitLanche) return false
    return true
  }).map(({ _temKitLanche, ...rest }) => rest as PedidoRetorno)

  // Ordenar: MANHA primeiro, depois TARDE, depois sem turno; dentro de cada grupo por nome do beneficiário
  const ordemTurno = (t: 'MANHA' | 'TARDE' | null) => (t === 'MANHA' ? 0 : t === 'TARDE' ? 1 : 2)
  return filtrados.sort((a, b) => {
    const ta = ordemTurno(a.aluno.turma_turno)
    const tb = ordemTurno(b.aluno.turma_turno)
    if (ta !== tb) return ta - tb
    return (a.beneficiario_nome || a.aluno.nome).localeCompare(b.beneficiario_nome || b.aluno.nome)
  })
}

/**
 * Marca pedido como entregue (PDV).
 */
export async function marcarPedidoEntregue(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pedidos')
    .update({ status: 'ENTREGUE', updated_at: new Date().toISOString() })
    .eq('id', pedidoId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/**
 * Desmarca pedido entregue (PDV) — volta status para PAGO.
 */
export async function desmarcarPedidoEntregue(pedidoId: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pedidos')
    .update({ status: 'PAGO', updated_at: new Date().toISOString() })
    .eq('id', pedidoId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
