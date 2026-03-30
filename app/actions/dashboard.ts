'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verificarSeEhAdmin } from './admin'
import { todayISO } from '@/lib/date'
import { listarPedidosNaoEntreguesAte, listarPedidosParaRetirada } from './pedidos-cantina'

export interface EstatisticasAcessoCompra {
  responsaveisTotal: number
  responsaveisComLogin: number
  responsaveisComPedido: number
  colaboradoresTotal: number
  colaboradoresComLogin: number
  colaboradoresComConsumo: number
}

export interface DashboardPayload {
  creditosCarteira: number
  pedidosNaoTratados: number
  pedidosEntregues: number
  pedidosTotal: number
  consumoPorCategoria: { categoria: string; quantidade: number; valor: number }[]
  topProdutos: { produto_nome: string; quantidade: number; valor: number }[]
  estatisticasAcessoCompra: EstatisticasAcessoCompra
}

function consumoPeriodoUTC(dataInicio: string, dataFim: string): { isoInicio: string; isoFimExclusivo: string } {
  const start = new Date(dataInicio + 'T00:00:00-03:00')
  const endExclusive = new Date(dataFim + 'T00:00:00-03:00')
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { isoInicio: start.toISOString(), isoFimExclusivo: endExclusive.toISOString() }
}

/**
 * Créditos em carteira = soma do saldo de todos os alunos (aluno_saldos).
 * Pedidos não tratados = pedidos `PAGO` que ainda não foram entregues considerando itens com data_retirada <= data.
 * Pedidos entregues = apenas por data_retirada em pedido_itens no dia.
 * Estatísticas de consumo = vendas (pedidos PAGO/ENTREGUE) no período, agregadas por itens (consistência com admin/relatorios Por produto).
 */
export async function obterDashboard(
  dataFiltro?: string,
  dataInicioConsumo?: string,
  dataFimConsumo?: string
): Promise<DashboardPayload | null> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) return null

  const admin = createAdminClient()

  // Créditos: soma saldos de todos os alunos
  const { data: saldosRows } = await admin
    .from('aluno_saldos')
    .select('saldo')
  const creditosCarteira = (saldosRows ?? []).reduce((s, r) => s + Number(r.saldo ?? 0), 0)

  // Pedidos: mesma lista que PDV/Pedidos (apenas com data_retirada no dia, status PAGO/ENTREGUE)
  const dia = dataFiltro
    ? todayISO(new Date(dataFiltro + 'T12:00:00'))
    : todayISO()

  const [pedidosParaRetirada, pedidosNaoEntregues] = await Promise.all([
    listarPedidosParaRetirada(dia),
    listarPedidosNaoEntreguesAte(dia),
  ])

  const pedidosNaoTratados = pedidosNaoEntregues.length
  const pedidosEntregues = pedidosParaRetirada.filter((p) => p.status === 'ENTREGUE').length
  const pedidosTotal = pedidosParaRetirada.length

  // Estatísticas de acesso e compra (responsáveis e colaboradores)
  // Responsáveis = quem tem papel RESPONSAVEL em usuario_papeis OU vínculo em usuario_aluno (igual ao resto do sistema)
  const [respPapeisRes, usuarioAlunoRes, colabIdsRes, respComPedidoRes, colabComConsumoRes] = await Promise.all([
    admin.from('usuario_papeis').select('usuario_id').eq('papel', 'RESPONSAVEL'),
    admin.from('usuario_aluno').select('usuario_id'),
    admin.from('usuario_papeis').select('usuario_id').eq('papel', 'COLABORADOR'),
    admin.from('pedidos').select('usuario_id').eq('origem', 'ONLINE'),
    admin
      .from('pedidos')
      .select('colaborador_id')
      .eq('tipo_beneficiario', 'COLABORADOR')
      .in('status', ['PAGO', 'ENTREGUE']),
  ])
  const responsavelIds = new Set<string>([
    ...(respPapeisRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id),
    ...(usuarioAlunoRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id),
  ])
  const colaboradorIds = new Set((colabIdsRes.data ?? []).map((r: { usuario_id: string }) => r.usuario_id))
  const responsaveisComPedidoIds = new Set(
    (respComPedidoRes.data ?? []).map((r: { usuario_id: string | null }) => r.usuario_id).filter(Boolean) as string[]
  )
  const colaboradoresComConsumoIds = new Set(
    (colabComConsumoRes.data ?? [])
      .map((r: { colaborador_id: string | null }) => r.colaborador_id)
      .filter(Boolean) as string[]
  )

  const responsaveisIdsArr = [...responsavelIds]
  const colaboradoresIdsArr = [...colaboradorIds]
  const CHUNK = 300
  const fetchUsuariosByIds = async (ids: string[]) => {
    if (ids.length === 0) return []
    const out: Array<{ id: string; auth_user_id: string | null; ativo?: boolean }> = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { data } = await admin.from('usuarios').select('id, auth_user_id, ativo').in('id', chunk)
      out.push(...(data ?? []))
    }
    return out
  }
  const [usuariosRespList, usuariosColab] = await Promise.all([
    fetchUsuariosByIds(responsaveisIdsArr),
    colaboradoresIdsArr.length > 0
      ? admin
          .from('usuarios')
          .select('id, auth_user_id, ativo')
          .in('id', colaboradoresIdsArr)
      : { data: [] },
  ])
  const usuariosResp = { data: usuariosRespList }
  const respAtivos = (usuariosResp.data ?? []).filter((u: { ativo?: boolean }) => u.ativo !== false)
  const colabAtivos = (usuariosColab.data ?? []).filter((u: { ativo?: boolean }) => u.ativo !== false)
  const responsaveisTotal = respAtivos.length
  const responsaveisComLogin = respAtivos.filter((u: { auth_user_id?: string | null }) => u.auth_user_id != null).length
  const colaboradoresTotal = colabAtivos.length
  const colaboradoresComLogin = colabAtivos.filter((u: { auth_user_id?: string | null }) => u.auth_user_id != null).length
  const responsaveisComPedido = [...responsaveisComPedidoIds].filter((id) => responsavelIds.has(id)).length
  const colaboradoresComConsumo = colaboradoresComConsumoIds.size

  const estatisticasAcessoCompra: EstatisticasAcessoCompra = {
    responsaveisTotal,
    responsaveisComLogin,
    responsaveisComPedido,
    colaboradoresTotal,
    colaboradoresComLogin,
    colaboradoresComConsumo,
  }

  // Estatísticas de consumo: apenas pedido_itens com data_retirada no período
  let inicioConsumo = dataInicioConsumo ? todayISO(new Date(dataInicioConsumo + 'T12:00:00')) : dia
  let fimConsumo = dataFimConsumo ? todayISO(new Date(dataFimConsumo + 'T12:00:00')) : dia
  if (inicioConsumo > fimConsumo) {
    ;[inicioConsumo, fimConsumo] = [fimConsumo, inicioConsumo]
  }
  const { isoInicio: isoInicioConsumo, isoFimExclusivo: isoFimExclusivoConsumo } = consumoPeriodoUTC(inicioConsumo, fimConsumo)

  // Importante: buscar pedidos com paginação (evita limite 1000 do PostgREST) e depois itens por pedido_id
  type PedidoConsumo = { id: string; aluno_id: string | null; created_at: string; data_retirada: string | null }
  let pedidosConsumoList: PedidoConsumo[] = []
  const pageSizePedidos = 1000
  for (let from = 0; ; from += pageSizePedidos) {
    const to = from + pageSizePedidos - 1
    const { data } = await admin
      .from('pedidos')
      .select('id, aluno_id, created_at, data_retirada')
      .in('status', ['PAGO', 'ENTREGUE'])
      .gte('created_at', isoInicioConsumo)
      .lt('created_at', isoFimExclusivoConsumo)
      .order('created_at', { ascending: false })
      .range(from, to)
    const page = (data ?? []) as PedidoConsumo[]
    pedidosConsumoList = pedidosConsumoList.concat(page)
    if (page.length < pageSizePedidos) break
  }

  const pedidoIdsConsumo = pedidosConsumoList.map((p) => p.id)
  if (pedidoIdsConsumo.length === 0) {
    return {
      creditosCarteira,
      pedidosNaoTratados,
      pedidosEntregues,
      pedidosTotal,
      consumoPorCategoria: [],
      topProdutos: [],
      estatisticasAcessoCompra,
    }
  }

  let itens: Array<{
    pedido_id: string
    produto_id: string
    produto_nome: string | null
    quantidade: number
    subtotal: number
    data_retirada: string | null
  }> = []
  const chunk = 200
  for (let i = 0; i < pedidoIdsConsumo.length; i += chunk) {
    const ids = pedidoIdsConsumo.slice(i, i + chunk)
    const { data } = await admin
      .from('pedido_itens')
      .select('pedido_id, produto_id, produto_nome, quantidade, subtotal, data_retirada')
      .in('pedido_id', ids)
    itens = itens.concat((data ?? []) as typeof itens)
  }

  if (itens.length === 0) {
    return {
      creditosCarteira,
      pedidosNaoTratados,
      pedidosEntregues,
      pedidosTotal,
      consumoPorCategoria: [],
      topProdutos: [],
      estatisticasAcessoCompra,
    }
  }

  const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))]
  const { data: produtos } = produtoIds.length > 0
    ? await admin
        .from('produtos')
        .select('id, categoria_id, tipo, tipo_kit')
        .in('id', produtoIds)
    : { data: [] }
  const produtoPorId = new Map((produtos ?? []).map((p: { id: string; categoria_id: string | null }) => [p.id, p.categoria_id]))
  const kitMensalProdutoIds = new Set(
    (produtos ?? []).filter((p: { tipo?: string; tipo_kit?: string }) => p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL').map((p: { id: string }) => p.id)
  )

  const pedidoPorId = new Map(pedidosConsumoList.map((p) => [p.id, p]))
  const itensByPedidoDash = new Map<string, typeof itens>()
  for (const item of itens) {
    const list = itensByPedidoDash.get(item.pedido_id) ?? []
    list.push(item)
    itensByPedidoDash.set(item.pedido_id, list)
  }
  const kitGroupTotalsDash = new Map<string, number>()
  for (const p of pedidosConsumoList) {
    const itensPed = itensByPedidoDash.get(p.id) ?? []
    if (itensPed.length === 0) continue
    const allKitMensal = itensPed.every((i) => kitMensalProdutoIds.has(i.produto_id))
    if (!allKitMensal) continue
    const primeiro = itensPed[0]
    const pedido = pedidoPorId.get(p.id)
    const dataRef = primeiro.data_retirada ?? pedido?.data_retirada ?? pedido?.created_at ?? ''
    if (!dataRef) continue
    const ano = new Date(dataRef).getFullYear()
    const mes = new Date(dataRef).getMonth() + 1
    const groupKey = `${p.aluno_id ?? ''}|${primeiro.produto_id}|${ano}|${mes}`
    const somaPedido = itensPed.reduce((s, i) => s + Number(i.subtotal ?? 0), 0)
    kitGroupTotalsDash.set(groupKey, (kitGroupTotalsDash.get(groupKey) ?? 0) + somaPedido)
  }
  const kitGroupsByProdutoDash = new Map<string, { count: number; valorTotal: number }>()
  for (const [groupKey, totalSum] of kitGroupTotalsDash) {
    const parts = groupKey.split('|')
    const pid = parts[1]
    if (!pid) continue
    const exist = kitGroupsByProdutoDash.get(pid)
    if (exist) {
      exist.count += 1
      exist.valorTotal += totalSum
    } else {
      kitGroupsByProdutoDash.set(pid, { count: 1, valorTotal: totalSum })
    }
  }

  const categoriaIds = [...new Set(produtoPorId.values())].filter((id): id is string => Boolean(id))
  const { data: categorias } = categoriaIds.length > 0
    ? await admin.from('categorias').select('id, nome').in('id', categoriaIds)
    : { data: [] }
  const categoriaPorId = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  const consumoPorCategoriaMap = new Map<string, { quantidade: number; valor: number }>()
  const topProdutosMap = new Map<string, { quantidade: number; valor: number }>()

  for (const item of itens) {
    if (kitMensalProdutoIds.has(item.produto_id)) continue
    const qtd = Number(item.quantidade ?? 0)
    const sub = Number(item.subtotal ?? 0)
    const catId = produtoPorId.get(item.produto_id)
    const catNome = catId ? (categoriaPorId.get(catId) ?? 'Sem categoria') : 'Sem categoria'
    const existCat = consumoPorCategoriaMap.get(catNome)
    if (existCat) {
      existCat.quantidade += qtd
      existCat.valor += sub
    } else {
      consumoPorCategoriaMap.set(catNome, { quantidade: qtd, valor: sub })
    }

    const nomeProd = item.produto_nome ?? 'Produto'
    const existProd = topProdutosMap.get(nomeProd)
    if (existProd) {
      existProd.quantidade += qtd
      existProd.valor += sub
    } else {
      topProdutosMap.set(nomeProd, { quantidade: qtd, valor: sub })
    }
  }
  for (const [pid, v] of kitGroupsByProdutoDash) {
    const catId = produtoPorId.get(pid)
    const catNome = catId ? (categoriaPorId.get(catId) ?? 'Sem categoria') : 'Sem categoria'
    const existCat = consumoPorCategoriaMap.get(catNome)
    if (existCat) {
      existCat.quantidade += v.count
      existCat.valor += v.valorTotal
    } else {
      consumoPorCategoriaMap.set(catNome, { quantidade: v.count, valor: v.valorTotal })
    }
    const nomeProd = itens.find((i) => i.produto_id === pid)?.produto_nome ?? 'Produto'
    const existProd = topProdutosMap.get(nomeProd)
    if (existProd) {
      existProd.quantidade += v.count
      existProd.valor += v.valorTotal
    } else {
      topProdutosMap.set(nomeProd, { quantidade: v.count, valor: v.valorTotal })
    }
  }

  const consumoPorCategoria = Array.from(consumoPorCategoriaMap.entries())
    .map(([categoria, v]) => ({ categoria, quantidade: v.quantidade, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor)

  const topProdutos = Array.from(topProdutosMap.entries())
    .map(([produto_nome, v]) => ({ produto_nome, quantidade: v.quantidade, valor: v.valor }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5)

  return {
    creditosCarteira,
    pedidosNaoTratados,
    pedidosEntregues,
    pedidosTotal,
    consumoPorCategoria,
    topProdutos,
    estatisticasAcessoCompra,
  }
}
