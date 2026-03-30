'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verificarSeEhAdmin, getAdminData } from './admin'
import { listarCategorias } from './produtos-admin'
import { listarProdutos } from './produtos-admin'

export interface RelatoriosFiltro {
  dataInicio: string // YYYY-MM-DD
  dataFim: string   // YYYY-MM-DD
}

export interface ComprasPorAlunoItem {
  aluno_id: string
  aluno_nome: string
  aluno_prontuario: string
  total: number
  quantidade_pedidos: number
  online: number
  pdv: number
  /** Total de adições de saldo online no período */
  recarga_saldo: number
}

export interface VendasColaboradorItem {
  colaborador_id: string
  colaborador_nome: string
  total: number
  quantidade_pedidos: number
}

export interface VendaDiretaItem {
  id: string
  created_at: string
  total: number
  operador_nome?: string
}

export interface SaldosPorAlunoItem {
  aluno_id: string
  aluno_nome: string
  aluno_prontuario: string
  saldo: number
}

export interface VendasPorOperadorItem {
  operador_id: string
  operador_nome: string
  total: number
  quantidade_pedidos: number
  quantidade_vendas: number
}

export interface ComprasMensaisPorAlunoItem {
  aluno_id: string
  aluno_nome: string
  ano: number
  mes: number
  total: number
  quantidade_pedidos: number
}

export interface ComprasMensaisPedidoDetalheItem {
  id: string
  created_at: string
  total: number
  origem: 'ONLINE' | 'PDV'
  /** Data de retirada (para compras online com agendamento); pode vir de pedido_itens.data_retirada ou pedidos.data_retirada. */
  data_retirada: string | null
  /** Data/hora em que o pedido foi marcado como ENTREGUE no PDV (usa pedidos.updated_at quando status = ENTREGUE). */
  data_entrega: string | null
  itens: {
    produto_id: string
    produto_nome: string | null
    quantidade: number
    subtotal: number
  }[]
}

export type ComprasMensaisDetalheMap = Record<
  string,
  {
    pedidos: ComprasMensaisPedidoDetalheItem[]
  }
>

export interface VendasPorPeriodoItem {
  data: string
  online_total: number
  online_pedidos: number
  pdv_total: number
  pdv_pedidos: number
  total: number
}

/** Tipo de beneficiário da venda PDV para exibição no relatório (aluno, colaborador ou venda direta). */
export type BeneficioTipoPdv = 'aluno' | 'colaborador' | 'venda_direta'

export interface VendaDetalheItem {
  id: string
  created_at: string
  total: number
  aluno_nome?: string
  colaborador_nome?: string
  /** Define se a linha é aluno, colaborador ou venda direta (evita mostrar placeholder como "Colaborador" com sufixo aluno). */
  beneficio_tipo?: BeneficioTipoPdv
  operador_nome?: string
  operador_id?: string | null
  caixa_id?: string | null
  /** Status do pedido (PAGO, ENTREGUE, CANCELADO, etc.) para exibição em relatórios detalhados. */
  status?: string
}

export interface VendaItemDetalhe {
  id: string
  produto_id: string
  produto_nome: string | null
  quantidade: number
  subtotal: number
  data_retirada: string | null
}

export type VendasDetalheMap = Record<
  string,
  {
    data_retirada: string | null
    itens: VendaItemDetalhe[]
  }
>

/** Item da lista unificada de pagamentos online (compra de lanche + adição de saldo) */
export interface PagamentoOnlineItem {
  id: string
  created_at: string
  total: number
  aluno_nome?: string
  tipo: 'COMPRA_LANCHE' | 'ADICAO_SALDO'
  referencia: string
}

/** Item do relatório de pagamentos online por forma de pagamento (transações gateway) */
export interface PagamentoOnlineTransacaoItem {
  id: string
  created_at: string
  referencia: string
  responsavel_nome: string
  responsavel_email: string | null
  beneficiario: string
  valor: number
  forma: 'PIX' | 'CARTAO'
  parcelas: number | null
  nsu: string | null
  tipo: 'PEDIDO_LOJA' | 'RECARGA_SALDO'
  /** Preenchido quando tipo === 'PEDIDO_LOJA' para expandir itens do pedido */
  pedido_id?: string | null
}

/** Totais por forma de pagamento (PIX, cartão à vista, cartão parcelado) */
export interface TotaisPagamentosOnline {
  pix_valor: number
  pix_quantidade: number
  cartaoAVista_valor: number
  cartaoAVista_quantidade: number
  cartaoParcelado_valor: number
  cartaoParcelado_quantidade: number
}

export interface ProdutoMaisVendidoItem {
  produto_id: string
  produto_nome: string
  quantidade: number
  valor_total: number
}

export interface RelatoriosPayload {
  comprasPorAluno: ComprasPorAlunoItem[]
  vendasColaborador: VendasColaboradorItem[]
  vendasDiretas: VendaDiretaItem[]
  saldosPorAluno: SaldosPorAlunoItem[]
  vendasPorOperador: VendasPorOperadorItem[]
  comprasMensaisPorAluno: ComprasMensaisPorAlunoItem[]
  vendasPorPeriodo: VendasPorPeriodoItem[]
  vendasOnline: VendaDetalheItem[]
  vendasPdv: VendaDetalheItem[]
  /** Lista unificada: compra de lanche + adição de saldo, com coluna tipo */
  pagamentosOnline: PagamentoOnlineItem[]
  /** Transações gateway (forma de pagamento): para relatório PIX / cartão / parcelado com impressão */
  pagamentosOnlineTransacoes: PagamentoOnlineTransacaoItem[]
  totaisPagamentosOnline: TotaisPagamentosOnline
  resumoOnlineVsPdv: {
    online_total: number
    online_pedidos: number
    online_compra_lanche: number
    online_adicao_saldo: number
    pdv_total: number
    pdv_pedidos: number
  }
  /** Totais por tipo (venda direta, aluno, colaborador, online lanche, online adição saldo) para relatório por período */
  totaisVendasPorTipo: {
    vendaDireta: number
    vendaAluno: number
    vendaColaborador: number
    onlineCompraLanche: number
    onlineAdicaoSaldo: number
  }
  produtosMaisVendidos: ProdutoMaisVendidoItem[]
  /** Detalhamento de pedidos/itens por aluno/mês para o relatório de compras mensais por aluno */
  comprasMensaisDetalhe: ComprasMensaisDetalheMap
  /** Itens por pedido (com data de retirada vinda de pedido_itens) para relatório por período */
  vendasDetalhe: VendasDetalheMap
  /** Pedidos por colaborador_id (para expandir Compras por modalidade → Colaborador) */
  vendasColaboradorPedidos: Record<string, Array<{ id: string; created_at: string; total: number }>>
  /** Pedidos por aluno_id (para expandir Compras por modalidade → Aluno) */
  comprasPorAlunoPedidos: Record<string, Array<{ id: string; created_at: string; total: number }>>
}

/** Filtro do relatório por produto */
export interface RelatorioPorProdutoFiltro {
  dataInicio: string
  dataFim: string
  produtoId?: string | null
  categoriaId?: string | null
}

/** Comprador (aluno, colaborador ou venda direta) no relatório por produto */
export interface RelatorioPorProdutoComprador {
  aluno_nome?: string
  colaborador_nome?: string
  /** True quando for venda direta (não vinculada a ninguém; não tem turma). */
  venda_direta?: boolean
  turma: string
}

/** Linha do relatório por produto */
export interface RelatorioPorProdutoItem {
  produto_id: string
  produto_nome: string
  categoria_nome: string | null
  quantidade: number
  valor_total: number
  /** Alunos que compraram este produto no período (nome e turma) */
  compradores: RelatorioPorProdutoComprador[]
}

/** Opções para dropdowns + itens do relatório por produto */
export interface RelatorioPorProdutoPayload {
  opcoesProdutos: { id: string; nome: string; categoria_id: string | null }[]
  opcoesCategorias: { id: string; nome: string }[]
  itens: RelatorioPorProdutoItem[]
}

function parseDate(s: string): Date {
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? new Date() : d
}

/** Intervalo do dia em UTC para relatórios: usa timezone Brasil (-03:00) para que "dia 11" seja 00:00–23:59 no Brasil (conciliação bancária correta). */
function periodoRelatorioUTC(dataInicio: string, dataFim: string): { isoInicio: string; isoFim: string } {
  const isoInicio = new Date(dataInicio + 'T00:00:00-03:00').toISOString()
  const isoFim = new Date(dataFim + 'T23:59:59.999-03:00').toISOString()
  return { isoInicio, isoFim }
}

export async function obterRelatorios(filtro: RelatoriosFiltro): Promise<RelatoriosPayload | null> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) return null

  const admin = createAdminClient()
  const { isoInicio, isoFim } = periodoRelatorioUTC(filtro.dataInicio, filtro.dataFim)

  const [pedidosRes, saldosRes, recargasOnlineRes, transacoesRes] = await Promise.all([
    admin
      .from('pedidos')
      .select(`
        id,
        status,
        aluno_id,
        colaborador_id,
        tipo_beneficiario,
        total,
        origem,
        created_at,
        updated_at,
        data_retirada,
        caixa_id,
        alunos ( id, nome, prontuario ),
        colaborador:colaborador_id ( nome )
      `)
      .in('status', ['PAGO', 'ENTREGUE', 'CANCELADO'])
      .gte('created_at', isoInicio)
      .lte('created_at', isoFim)
      .order('created_at', { ascending: false })
      .limit(10000),
    admin.from('aluno_saldos').select('aluno_id, saldo'),
    admin
      .from('aluno_movimentacoes')
      .select('id, aluno_id, valor, created_at')
      .eq('tipo', 'RECARGA')
      .gte('created_at', isoInicio)
      .lte('created_at', isoFim)
      .order('created_at', { ascending: true })
      .limit(10000),
    admin
      .from('transacoes')
      .select(`
        id, tipo, valor, metodo, created_at, gateway_nsu, gateway_data, usuario_id, aluno_id, pedido_id,
        usuarios!usuario_id(nome, email),
        alunos!aluno_id(nome)
      `)
      .eq('status', 'APROVADO')
      .gte('created_at', isoInicio)
      .lte('created_at', isoFim)
      .order('created_at', { ascending: true })
      .limit(10000),
  ])

  const pedidos = (pedidosRes.data ?? []) as Array<{
    id: string
    aluno_id: string | null
    colaborador_id: string | null
    tipo_beneficiario: string | null
    total: number
    origem: string | null
    created_at: string
    updated_at: string
    data_retirada: string | null
    caixa_id: string | null
    status: string
    alunos: { id: string; nome: string; prontuario: string } | { id: string; nome: string; prontuario: string }[] | null
    colaborador: { nome: string } | { nome: string }[] | null
  }>
  const saldos = (saldosRes.data ?? []) as Array<{ aluno_id: string; saldo: number }>

  // Buscar apenas os caixas referenciados pelos pedidos do período (evita limite 1000 e garante vendas colaborador no relatório)
  const caixaIds = [...new Set(pedidos.map((p) => p.caixa_id).filter(Boolean))] as string[]
  let caixas: Array<{
    id: string
    operador_id: string
    usuarios: { nome: string } | { nome: string }[] | null
  }> = []
  if (caixaIds.length > 0) {
    const chunk = 200
    for (let i = 0; i < caixaIds.length; i += chunk) {
      const ids = caixaIds.slice(i, i + chunk)
      const { data } = await admin
        .from('caixas')
        .select('id, operador_id, usuarios!operador_id(nome)')
        .in('id', ids)
      caixas = caixas.concat((data ?? []) as typeof caixas)
    }
  }

  const pedidoIds = pedidos.map((p) => p.id)
let itens: Array<{
    id: string
    pedido_id: string
    produto_id: string
    quantidade: number
    subtotal: number
    produto_nome: string | null
    data_retirada: string | null
  }> = []
  if (pedidoIds.length > 0) {
    const chunk = 200
    for (let i = 0; i < pedidoIds.length; i += chunk) {
      const ids = pedidoIds.slice(i, i + chunk)
      const itensRes = await admin
        .from('pedido_itens')
        .select('id, pedido_id, produto_id, quantidade, subtotal, produto_nome, data_retirada')
        .in('pedido_id', ids)
      itens = itens.concat((itensRes.data ?? []) as typeof itens)
    }
  }

  // Produtos KIT_LANCHE MENSAL: contar 1 kit por (aluno_id, produto_id, ano, mes) em vez de 1 por pedido
  const produtoIdsItens = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))] as string[]
  const { data: produtosTipo } = produtoIdsItens.length > 0
    ? await admin.from('produtos').select('id, tipo, tipo_kit').in('id', produtoIdsItens)
    : { data: [] }
  const kitMensalProdutoIds = new Set(
    (produtosTipo ?? []).filter((p: { tipo?: string; tipo_kit?: string }) => p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL').map((p: { id: string }) => p.id)
  )
  const itensByPedido = new Map<string, typeof itens>()
  for (const item of itens) {
    const list = itensByPedido.get(item.pedido_id) ?? []
    list.push(item)
    itensByPedido.set(item.pedido_id, list)
  }
  type KitGroup = { aluno_id: string | null; colaborador_id: string | null; caixa_id: string | null; origem: string; total: number }
  const kitGroupMap = new Map<string, KitGroup>()
  const pedidoIdsKitMensalOnly = new Set<string>()
  for (const p of pedidos) {
    const status = p.status
    const itensPed = itensByPedido.get(p.id) ?? []
    if (itensPed.length === 0) continue
    const allKitMensal = itensPed.every((i) => kitMensalProdutoIds.has(i.produto_id))
    if (!allKitMensal) continue
    pedidoIdsKitMensalOnly.add(p.id)
    const primeiro = itensPed[0]
    const dataRef = primeiro.data_retirada ?? p.data_retirada ?? p.created_at
    const ano = new Date(dataRef).getFullYear()
    const mes = new Date(dataRef).getMonth() + 1
    const groupKey = `${p.aluno_id ?? ''}|${primeiro.produto_id}|${ano}|${mes}`
    const exist = kitGroupMap.get(groupKey)
    if (exist) {
      exist.total += Number(p.total ?? 0)
    } else {
      kitGroupMap.set(groupKey, {
        aluno_id: p.aluno_id,
        colaborador_id: p.colaborador_id ?? null,
        caixa_id: p.caixa_id,
        origem: p.origem ?? 'ONLINE',
        total: Number(p.total ?? 0),
      })
    }
  }

  const caixaPorId = new Map(caixas.map((c) => [c.id, c]))
  const recargasOnlineList = (recargasOnlineRes.data ?? []) as Array<{
    id: string
    aluno_id: string
    valor: number
    created_at: string
  }>
  const onlineAdicaoSaldo = recargasOnlineList.reduce((s, r) => s + Number(r.valor ?? 0), 0)
  const alunosIdsPedidos = [...new Set(pedidos.map((p) => p.aluno_id).filter(Boolean))] as string[]
  const alunosIdsSaldos = [...new Set(saldos.map((s) => s.aluno_id))] as string[]
  const alunosIdsRecargas = [...new Set(recargasOnlineList.map((r) => r.aluno_id))]
  const todosAlunosIds = [...new Set([...alunosIdsPedidos, ...alunosIdsSaldos, ...alunosIdsRecargas])]
  const alunosRes = todosAlunosIds.length
    ? await admin.from('alunos').select('id, nome, prontuario').in('id', todosAlunosIds)
    : { data: [] }
  const alunosList = (alunosRes.data ?? []) as Array<{ id: string; nome: string; prontuario: string }>
  const alunoPorId = new Map(alunosList.map((a) => [a.id, a]))

  const comprasPorAlunoMap = new Map<string, ComprasPorAlunoItem>()
  const vendasColaboradorMap = new Map<string, VendasColaboradorItem>()
  const vendasColaboradorPedidosMap = new Map<string, Array<{ id: string; created_at: string; total: number }>>()
  const comprasPorAlunoPedidosMap = new Map<string, Array<{ id: string; created_at: string; total: number }>>()
  const vendasDiretasList: VendaDiretaItem[] = []
  const comprasMensaisMap = new Map<string, ComprasMensaisPorAlunoItem>()
  const comprasMensaisDetalhe: ComprasMensaisDetalheMap = {}
  const vendasDetalhe: VendasDetalheMap = {}
  const vendasPorOperadorMap = new Map<string, VendasPorOperadorItem>()
  const vendasPorDiaMap = new Map<string, { online_total: number; online_pedidos: number; pdv_total: number; pdv_pedidos: number }>()
  const produtosMap = new Map<string, { nome: string; quantidade: number; valor_total: number }>()
  const vendasOnlineList: Array<{ id: string; created_at: string; total: number; aluno_nome?: string }> = []
  const vendasPdvList: VendaDetalheItem[] = []

  let online_total = 0
  let online_pedidos = 0
  let pdv_total = 0
  let pdv_pedidos = 0

  const getColabNome = (colab: { nome: string } | { nome: string }[] | null) =>
    colab && !Array.isArray(colab) ? colab.nome : Array.isArray(colab) ? colab[0]?.nome : undefined

  for (const p of pedidos) {
    const status = (p as { status?: string }).status ?? 'PAGO'
    const itensPed = itensByPedido.get(p.id) ?? []
    if (itensPed.length) {
      const primeiraRetirada = itensPed.find((i) => i.data_retirada)?.data_retirada ?? p.data_retirada ?? null
      vendasDetalhe[p.id] = {
        data_retirada: primeiraRetirada,
        itens: itensPed.map((i) => ({
          id: String(i.id),
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          subtotal: i.subtotal,
          data_retirada: i.data_retirada,
        })),
      }
    }

    if (pedidoIdsKitMensalOnly.has(p.id)) continue
    const isCancelado = status === 'CANCELADO'
    const aluno = p.aluno_id ? alunoPorId.get(p.aluno_id) : null
    const nome = aluno?.nome ?? '-'
    const prontuario = aluno?.prontuario ?? '-'
    const total = Number(p.total ?? 0)
    const isOnline = (p.origem ?? 'ONLINE') === 'ONLINE'
    const ehColaborador = p.tipo_beneficiario === 'COLABORADOR' || p.colaborador_id != null
    const ehVendaDireta = p.aluno_id != null && prontuario === 'VENDA_DIRETA'
    const ehAluno = p.aluno_id != null && prontuario !== 'VENDA_DIRETA' && !ehColaborador

    if (!isCancelado && ehColaborador) {
      const colabId = p.colaborador_id ?? 'unknown'
      const colabNome = getColabNome(p.colaborador) ?? '-'
      const exist = vendasColaboradorMap.get(colabId)
      if (exist) {
        exist.total += total
        exist.quantidade_pedidos += 1
      } else {
        vendasColaboradorMap.set(colabId, {
          colaborador_id: colabId,
          colaborador_nome: colabNome,
          total,
          quantidade_pedidos: 1,
        })
      }
      const listColab = vendasColaboradorPedidosMap.get(colabId) ?? []
      listColab.push({ id: p.id, created_at: p.created_at, total })
      vendasColaboradorPedidosMap.set(colabId, listColab)
    } else if (!isCancelado && ehVendaDireta) {
      const caixa = p.caixa_id ? caixaPorId.get(p.caixa_id) : null
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? undefined
      vendasDiretasList.push({
        id: p.id,
        created_at: p.created_at,
        total,
        operador_nome: opNome,
      })
    }

    if (!isCancelado && isOnline) {
      online_total += total
      online_pedidos += 1
      vendasOnlineList.push({
        id: p.id,
        created_at: p.created_at,
        total,
        aluno_nome: p.aluno_id ? (alunoPorId.get(p.aluno_id)?.nome ?? undefined) : undefined,
      })
    } else if (!isOnline) {
      // PDV: incluir na lista sempre (PAGO, ENTREGUE ou CANCELADO); totais só se não cancelado
      const caixa = p.caixa_id ? caixaPorId.get(p.caixa_id) : null
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? undefined
      if (!isCancelado) {
        pdv_total += total
        pdv_pedidos += 1
      }
      // Classificar por prontuario quando tipo_beneficiario/colaborador_id não estiverem preenchidos (ex.: pedidos antigos)
      const beneficioTipo: BeneficioTipoPdv =
        ehColaborador ? 'colaborador' : ehVendaDireta ? 'venda_direta' : prontuario === 'COLABORADOR' ? 'colaborador' : prontuario === 'VENDA_DIRETA' ? 'venda_direta' : 'aluno'
      const nomeColaborador = beneficioTipo === 'colaborador' ? (getColabNome(p.colaborador) ?? nome) : undefined
      const nomeAluno = beneficioTipo === 'aluno' ? (alunoPorId.get(p.aluno_id!)?.nome ?? undefined) : undefined
      vendasPdvList.push({
        id: p.id,
        created_at: p.created_at,
        total,
        aluno_nome: nomeAluno,
        colaborador_nome: nomeColaborador,
        beneficio_tipo: beneficioTipo,
        operador_nome: opNome,
        operador_id: caixa?.operador_id ?? null,
        caixa_id: p.caixa_id,
        status,
      })
    }

    if (!isCancelado && ehAluno) {
      const key = p.aluno_id!
      const exist = comprasPorAlunoMap.get(key)
      if (exist) {
        exist.total += total
        exist.quantidade_pedidos += 1
        if (isOnline) exist.online += total
        else exist.pdv += total
      } else {
        comprasPorAlunoMap.set(key, {
          aluno_id: key,
          aluno_nome: nome,
          aluno_prontuario: prontuario,
          total,
          quantidade_pedidos: 1,
          online: isOnline ? total : 0,
          pdv: isOnline ? 0 : total,
          recarga_saldo: 0,
        })
      }
      const listAluno = comprasPorAlunoPedidosMap.get(key) ?? []
      listAluno.push({ id: p.id, created_at: p.created_at, total })
      comprasPorAlunoPedidosMap.set(key, listAluno)
    }

    const dt = p.created_at.slice(0, 10)
    const diaExist = vendasPorDiaMap.get(dt)
    if (diaExist) {
      if (isOnline) {
        diaExist.online_total += total
        diaExist.online_pedidos += 1
      } else {
        diaExist.pdv_total += total
        diaExist.pdv_pedidos += 1
      }
    } else {
      vendasPorDiaMap.set(dt, {
        online_total: isOnline ? total : 0,
        online_pedidos: isOnline ? 1 : 0,
        pdv_total: isOnline ? 0 : total,
        pdv_pedidos: isOnline ? 0 : 1,
      })
    }

    const ano = new Date(p.created_at).getFullYear()
    const mes = new Date(p.created_at).getMonth() + 1
    if (!isCancelado && ehAluno) {
      const keyM = `${p.aluno_id}-${ano}-${mes}`
      const existM = comprasMensaisMap.get(keyM)
      if (existM) {
        existM.total += total
        existM.quantidade_pedidos += 1
      } else {
        comprasMensaisMap.set(keyM, {
          aluno_id: p.aluno_id!,
          aluno_nome: nome,
          ano,
          mes,
          total,
          quantidade_pedidos: 1,
        })
      }

      const itensPed = itensByPedido.get(p.id) ?? []
      const detalheKey = keyM
      if (!comprasMensaisDetalhe[detalheKey]) {
        comprasMensaisDetalhe[detalheKey] = { pedidos: [] }
      }
      const primeiraRetiradaPedido =
        itensPed.find((i) => i.data_retirada)?.data_retirada ?? p.data_retirada ?? null
      const dataEntrega = status === 'ENTREGUE' ? p.updated_at : null
      comprasMensaisDetalhe[detalheKey].pedidos.push({
        id: p.id,
        created_at: p.created_at,
        total,
        origem: isOnline ? 'ONLINE' : 'PDV',
        data_retirada: primeiraRetiradaPedido,
        data_entrega: dataEntrega,
        itens: itensPed.map((i) => ({
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          subtotal: i.subtotal,
        })),
      })
    }

    if (!isCancelado && p.caixa_id) {
      const caixa = caixaPorId.get(p.caixa_id)
      const opId = caixa?.operador_id ?? 'unknown'
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? 'Operador'
      const existOp = vendasPorOperadorMap.get(opId)
      if (existOp) {
        existOp.total += total
        existOp.quantidade_pedidos += 1
      } else {
        vendasPorOperadorMap.set(opId, {
          operador_id: opId,
          operador_nome: opNome,
          total,
          quantidade_pedidos: 1,
          quantidade_vendas: 1,
        })
      }
    }
  }

  // Adições de saldo online por aluno (não contam como pedido, mas aparecem no total de recarga_saldo)
  for (const r of recargasOnlineList) {
    const key = r.aluno_id
    const valor = Number(r.valor ?? 0)
    const aluno = alunoPorId.get(key)
    const nome = aluno?.nome ?? '-'
    const prontuario = aluno?.prontuario ?? '-'
    const exist = comprasPorAlunoMap.get(key)
    if (exist) {
      exist.recarga_saldo += valor
    } else {
      comprasPorAlunoMap.set(key, {
        aluno_id: key,
        aluno_nome: nome,
        aluno_prontuario: prontuario,
        total: 0,
        quantidade_pedidos: 0,
        online: 0,
        pdv: 0,
        recarga_saldo: valor,
      })
    }
  }

  for (const [groupKey, g] of kitGroupMap) {
    const [, , anoStr, mesStr] = groupKey.split('|')
    const ano = parseInt(anoStr, 10)
    const mes = parseInt(mesStr, 10)
    const dt = `${ano}-${String(mes).padStart(2, '0')}-01`
    const isOnline = g.origem === 'ONLINE'
    const total = g.total
    if (isOnline) {
      online_total += total
      online_pedidos += 1
    } else {
      pdv_total += total
      pdv_pedidos += 1
    }
    const ehColaborador = g.colaborador_id != null
    const aluno = g.aluno_id ? alunoPorId.get(g.aluno_id) : null
    const nome = aluno?.nome ?? '-'
    const prontuario = aluno?.prontuario ?? '-'
    const ehVendaDireta = g.aluno_id != null && prontuario === 'VENDA_DIRETA'
    const ehAluno = g.aluno_id != null && prontuario !== 'VENDA_DIRETA' && !ehColaborador
    if (ehColaborador) {
      const colabId = g.colaborador_id ?? 'unknown'
      const colabPedido = pedidos.find((p) => p.colaborador_id === colabId)
      const colabNome = getColabNome(colabPedido?.colaborador ?? null) ?? '-'
      const exist = vendasColaboradorMap.get(colabId)
      if (exist) {
        exist.total += total
        exist.quantidade_pedidos += 1
      } else {
        vendasColaboradorMap.set(colabId, {
          colaborador_id: colabId,
          colaborador_nome: colabNome,
          total,
          quantidade_pedidos: 1,
        })
      }
    } else if (ehVendaDireta && g.caixa_id) {
      const caixa = caixaPorId.get(g.caixa_id)
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? undefined
      vendasDiretasList.push({
        id: `kit-${groupKey}`,
        created_at: `${dt}T12:00:00.000Z`,
        total,
        operador_nome: opNome,
      })
    }
    if (ehAluno) {
      const key = g.aluno_id!
      const exist = comprasPorAlunoMap.get(key)
      if (exist) {
        exist.total += total
        exist.quantidade_pedidos += 1
        if (isOnline) exist.online += total
        else exist.pdv += total
      } else {
        comprasPorAlunoMap.set(key, {
          aluno_id: key,
          aluno_nome: nome,
          aluno_prontuario: prontuario,
          total,
          quantidade_pedidos: 1,
          online: isOnline ? total : 0,
          pdv: isOnline ? 0 : total,
          recarga_saldo: 0,
        })
      }
    }
    const diaExist = vendasPorDiaMap.get(dt)
    if (diaExist) {
      if (isOnline) {
        diaExist.online_total += total
        diaExist.online_pedidos += 1
      } else {
        diaExist.pdv_total += total
        diaExist.pdv_pedidos += 1
      }
    } else {
      vendasPorDiaMap.set(dt, {
        online_total: isOnline ? total : 0,
        online_pedidos: isOnline ? 1 : 0,
        pdv_total: isOnline ? 0 : total,
        pdv_pedidos: isOnline ? 0 : 1,
      })
    }
    if (ehAluno) {
      const keyM = `${g.aluno_id}-${ano}-${mes}`
      const existM = comprasMensaisMap.get(keyM)
      if (existM) {
        existM.total += total
        existM.quantidade_pedidos += 1
      } else {
        comprasMensaisMap.set(keyM, {
          aluno_id: g.aluno_id!,
          aluno_nome: nome,
          ano,
          mes,
          total,
          quantidade_pedidos: 1,
        })
      }

      const detalheKey = keyM
      if (!comprasMensaisDetalhe[detalheKey]) {
        comprasMensaisDetalhe[detalheKey] = { pedidos: [] }
      }
      const parts = groupKey.split('|')
      const produtoId = parts[1]
      const exemploItem = itens.find((i) => i.produto_id === produtoId) ?? null
      comprasMensaisDetalhe[detalheKey].pedidos.push({
        id: `kit-${groupKey}`,
        created_at: `${dt}T12:00:00.000Z`,
        total,
        origem: isOnline ? 'ONLINE' : 'PDV',
        // Para kits mensais, usamos o próprio dia de referência do grupo como data de retirada
        data_retirada: dt,
        // Kits não têm “entrega” marcada no PDV; mantemos null
        data_entrega: null,
        itens: [
          {
            produto_id: produtoId,
            produto_nome: exemploItem?.produto_nome ?? 'Kit mensal',
            quantidade: 1,
            subtotal: total,
          },
        ],
      })
    }
    if (g.caixa_id) {
      const caixa = caixaPorId.get(g.caixa_id)
      const opId = caixa?.operador_id ?? 'unknown'
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? 'Operador'
      const existOp = vendasPorOperadorMap.get(opId)
      if (existOp) {
        existOp.total += total
        existOp.quantidade_pedidos += 1
      } else {
        vendasPorOperadorMap.set(opId, {
          operador_id: opId,
          operador_nome: opNome,
          total,
          quantidade_pedidos: 1,
          quantidade_vendas: 1,
        })
      }
    }
    if (isOnline) {
      vendasOnlineList.push({
        id: `kit-${groupKey}`,
        created_at: `${dt}T12:00:00.000Z`,
        total,
        aluno_nome: g.aluno_id ? alunoPorId.get(g.aluno_id)?.nome : undefined,
      })
    } else {
      const caixa = g.caixa_id ? caixaPorId.get(g.caixa_id) : null
      const u = caixa?.usuarios
      const opNome = (u && !Array.isArray(u) ? u.nome : (Array.isArray(u) ? u[0]?.nome : undefined)) ?? undefined
      const beneficioTipoKit: BeneficioTipoPdv = ehColaborador ? 'colaborador' : ehVendaDireta ? 'venda_direta' : 'aluno'
      const nomeColabKit = beneficioTipoKit === 'colaborador' ? (() => { const colabPedido = pedidos.find((p) => p.colaborador_id === g.colaborador_id); return getColabNome(colabPedido?.colaborador ?? null) ?? nome })() : undefined
      const nomeAlunoKit = beneficioTipoKit === 'aluno' ? nome : undefined
      vendasPdvList.push({
        id: `kit-${groupKey}`,
        created_at: `${dt}T12:00:00.000Z`,
        total,
        aluno_nome: nomeAlunoKit,
        colaborador_nome: nomeColabKit,
        beneficio_tipo: beneficioTipoKit,
        operador_nome: opNome,
        operador_id: caixa?.operador_id ?? null,
        caixa_id: g.caixa_id,
      })
    }
  }

  const kitGroupsByProduto = new Map<string, { count: number; valorTotal: number }>()
  for (const [groupKey, g] of kitGroupMap) {
    const parts = groupKey.split('|')
    const produtoId = parts[1]
    if (!produtoId) continue
    const exist = kitGroupsByProduto.get(produtoId)
    if (exist) {
      exist.count += 1
      exist.valorTotal += g.total
    } else {
      kitGroupsByProduto.set(produtoId, { count: 1, valorTotal: g.total })
    }
  }
  for (const item of itens) {
    const pid = item.produto_id
    const nome = item.produto_nome ?? 'Produto'
    const qtd = Number(item.quantidade ?? 0)
    const sub = Number(item.subtotal ?? 0)
    if (kitMensalProdutoIds.has(pid)) continue
    const exist = produtosMap.get(pid)
    if (exist) {
      exist.quantidade += qtd
      exist.valor_total += sub
    } else {
      produtosMap.set(pid, { nome, quantidade: qtd, valor_total: sub })
    }
  }
  for (const [pid, v] of kitGroupsByProduto) {
    const nome = itens.find((i) => i.produto_id === pid)?.produto_nome ?? 'Produto'
    produtosMap.set(pid, { nome, quantidade: v.count, valor_total: v.valorTotal })
  }

  // Saldos por aluno: apenas da tabela aluno_saldos (saldo atual dos alunos na cantina).
  // Não inclui colaborador nem venda direta – só crédito de alunos.
  const saldosPorAluno: SaldosPorAlunoItem[] = []
  const alunosParaSaldo = new Set(alunosIdsSaldos)
  for (const aid of alunosParaSaldo) {
    const aluno = alunoPorId.get(aid)
    const saldoRow = saldos.find((s) => s.aluno_id === aid)
    saldosPorAluno.push({
      aluno_id: aid,
      aluno_nome: aluno?.nome ?? '-',
      aluno_prontuario: aluno?.prontuario ?? '-',
      saldo: Number(saldoRow?.saldo ?? 0),
    })
  }
  saldosPorAluno.sort((a, b) => a.aluno_nome.localeCompare(b.aluno_nome))

  const vendasPorPeriodo = Array.from(vendasPorDiaMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, v]) => ({
      data,
      ...v,
      total: v.online_total + v.pdv_total,
    }))
  const vendasOnline = vendasOnlineList.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const vendasPdv = vendasPdvList.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const pagamentosOnlineList: PagamentoOnlineItem[] = [
    ...vendasOnlineList.map((p) => ({
      id: p.id,
      created_at: p.created_at,
      total: p.total,
      aluno_nome: p.aluno_nome,
      tipo: 'COMPRA_LANCHE' as const,
      referencia: `#${p.id.slice(0, 8)}`,
    })),
    ...recargasOnlineList.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      total: Number(r.valor ?? 0),
      aluno_nome: alunoPorId.get(r.aluno_id)?.nome,
      tipo: 'ADICAO_SALDO' as const,
      referencia: 'Recarga',
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pagamentosOnline = pagamentosOnlineList

  const transacoesData = (transacoesRes?.data ?? []) as Array<{
    id: string
    tipo: string
    valor: number
    metodo: string
    created_at: string
    gateway_nsu: string | null
    gateway_data: { parcelas?: number } | null
    usuario_id: string | null
    aluno_id: string | null
    pedido_id: string | null
    usuarios?: { nome: string; email: string | null } | Array<{ nome: string; email: string | null }> | null
    alunos?: { nome: string } | Array<{ nome: string }> | null
  }>
  const pagamentosOnlineTransacoes: PagamentoOnlineTransacaoItem[] = transacoesData
    .map((t) => {
    const valor = Number(t.valor ?? 0)
    const forma = t.metodo === 'PIX' ? 'PIX' as const : 'CARTAO' as const
    const parcelasRaw = t.metodo === 'CARTAO' ? (t.gateway_data?.parcelas ?? 1) : null
    const parcelas = forma === 'CARTAO' ? (typeof parcelasRaw === 'number' ? parcelasRaw : 1) : null
    const usuariosNorm = t.usuarios == null ? null : Array.isArray(t.usuarios) ? t.usuarios[0] ?? null : t.usuarios
    const alunosNorm = t.alunos == null ? null : Array.isArray(t.alunos) ? t.alunos[0] ?? null : t.alunos
    const usuario = usuariosNorm
    const aluno = alunosNorm
    const referencia = t.tipo === 'PEDIDO_LOJA'
      ? `PED-${t.pedido_id ?? t.id}`
      : `REC-${t.id}`
    return {
      id: t.id,
      created_at: t.created_at,
      referencia,
      responsavel_nome: usuario?.nome ?? '-',
      responsavel_email: usuario?.email ?? null,
      beneficiario: aluno?.nome ?? '-',
      valor,
      forma,
      parcelas,
      nsu: t.gateway_nsu ?? null,
      tipo: t.tipo === 'RECARGA_SALDO' ? 'RECARGA_SALDO' as const : 'PEDIDO_LOJA' as const,
      pedido_id: t.pedido_id ?? null,
    }
  })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const totaisPagamentosOnline: TotaisPagamentosOnline = {
    pix_valor: 0,
    pix_quantidade: 0,
    cartaoAVista_valor: 0,
    cartaoAVista_quantidade: 0,
    cartaoParcelado_valor: 0,
    cartaoParcelado_quantidade: 0,
  }
  for (const t of pagamentosOnlineTransacoes) {
    if (t.forma === 'PIX') {
      totaisPagamentosOnline.pix_valor += t.valor
      totaisPagamentosOnline.pix_quantidade += 1
    } else {
      const p = t.parcelas ?? 1
      if (p <= 1) {
        totaisPagamentosOnline.cartaoAVista_valor += t.valor
        totaisPagamentosOnline.cartaoAVista_quantidade += 1
      } else {
        totaisPagamentosOnline.cartaoParcelado_valor += t.valor
        totaisPagamentosOnline.cartaoParcelado_quantidade += 1
      }
    }
  }

  const produtosMaisVendidos = Array.from(produtosMap.entries())
    .map(([produto_id, v]) => ({
      produto_id,
      produto_nome: v.nome,
      quantidade: v.quantidade,
      valor_total: v.valor_total,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 50)

  const vendasDiretas = vendasDiretasList.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const totalVendaDireta = vendasDiretasList.reduce((s, p) => s + p.total, 0)
  const totalVendaColaborador = Array.from(vendasColaboradorMap.values()).reduce((s, v) => s + v.total, 0)
  const totalVendaAlunoPdv = Array.from(comprasPorAlunoMap.values()).reduce((s, v) => s + v.pdv, 0)
  const onlineCompraLanche = online_total

  return {
    comprasPorAluno: Array.from(comprasPorAlunoMap.values()).sort((a, b) => b.total - a.total),
    vendasColaborador: Array.from(vendasColaboradorMap.values()).sort((a, b) => b.total - a.total),
    vendasDiretas,
    saldosPorAluno,
    vendasPorOperador: Array.from(vendasPorOperadorMap.values()).sort((a, b) => b.total - a.total),
    comprasMensaisPorAluno: Array.from(comprasMensaisMap.values()).sort(
      (a, b) => b.ano - a.ano || b.mes - a.mes || b.total - a.total
    ),
    vendasPorPeriodo,
    vendasOnline,
    vendasPdv,
    pagamentosOnline,
    pagamentosOnlineTransacoes,
    totaisPagamentosOnline,
    resumoOnlineVsPdv: {
      online_total: onlineCompraLanche + onlineAdicaoSaldo,
      online_pedidos,
      online_compra_lanche: onlineCompraLanche,
      online_adicao_saldo: onlineAdicaoSaldo,
      pdv_total,
      pdv_pedidos,
    },
    totaisVendasPorTipo: {
      vendaDireta: totalVendaDireta,
      vendaAluno: totalVendaAlunoPdv,
      vendaColaborador: totalVendaColaborador,
      onlineCompraLanche,
      onlineAdicaoSaldo,
    },
    produtosMaisVendidos,
    comprasMensaisDetalhe,
    vendasDetalhe,
    vendasColaboradorPedidos: Object.fromEntries(vendasColaboradorPedidosMap),
    comprasPorAlunoPedidos: Object.fromEntries(comprasPorAlunoPedidosMap),
  }
}

/**
 * Relatório por produto: vendas agregadas por produto no período, com filtro opcional por produto ou categoria.
 * Retorna também opções para dropdowns (produtos e categorias da empresa do admin).
 */
export async function obterRelatorioPorProduto(
  filtro: RelatorioPorProdutoFiltro
): Promise<RelatorioPorProdutoPayload | null> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) return null

  const admin = createAdminClient()
  const inicio = parseDate(filtro.dataInicio)
  const fim = parseDate(filtro.dataFim)
  fim.setHours(23, 59, 59, 999)
  const isoInicio = inicio.toISOString()
  const isoFim = fim.toISOString()

  // Opções para filtros: produtos e categorias da empresa do admin
  let opcoesProdutos: { id: string; nome: string; categoria_id: string | null }[] = []
  let opcoesCategorias: { id: string; nome: string }[] = []
  try {
    const adminData = await getAdminData()
    const empresaId = (adminData as { empresa_id?: string | null }).empresa_id
    if (empresaId) {
      const [cats, prods] = await Promise.all([
        listarCategorias(empresaId),
        listarProdutos(empresaId),
      ])
      opcoesCategorias = cats.map((c) => ({ id: c.id, nome: c.nome }))
      opcoesProdutos = prods.map((p) => ({
        id: p.id,
        nome: p.nome,
        categoria_id: p.categoria_id ?? null,
      }))
    }
  } catch {
    // Se falhar (ex.: admin sem empresa), dropdowns ficam vazios; relatório ainda pode ter dados
  }

  type PedidoRel = {
    id: string
    aluno_id: string | null
    colaborador_id: string | null
    tipo_beneficiario: string | null
    data_retirada: string | null
    created_at: string
    colaborador: { nome: string } | { nome: string }[] | null
  }
  // Pedidos pagos ou entregues no período (com paginação para não truncar em períodos grandes)
  let pedidosPorProduto: PedidoRel[] = []
  const pageSizePedidos = 1000
  for (let from = 0; ; from += pageSizePedidos) {
    const to = from + pageSizePedidos - 1
    const { data } = await admin
      .from('pedidos')
      .select('id, aluno_id, colaborador_id, tipo_beneficiario, data_retirada, created_at, colaborador:colaborador_id(nome)')
      .in('status', ['PAGO', 'ENTREGUE'])
      .gte('created_at', isoInicio)
      .lte('created_at', isoFim)
      .order('created_at', { ascending: false })
      .range(from, to)
    const page = (data ?? []) as PedidoRel[]
    pedidosPorProduto = pedidosPorProduto.concat(page)
    if (page.length < pageSizePedidos) break
  }
  const getColabNomeRel = (colab: { nome: string } | { nome: string }[] | null) =>
    colab && !Array.isArray(colab) ? colab.nome : Array.isArray(colab) ? colab[0]?.nome : undefined
  const colaboradorIdToNome = new Map<string, string>()
  for (const p of pedidosPorProduto) {
    if (p.colaborador_id) {
      const nome = getColabNomeRel(p.colaborador)
      if (nome) colaboradorIdToNome.set(p.colaborador_id, nome)
    }
  }
  const pedidoIds = pedidosPorProduto.map((p) => p.id)
  if (pedidoIds.length === 0) {
    return { opcoesProdutos, opcoesCategorias, itens: [] }
  }

  let itens: Array<{ id: string; pedido_id: string; produto_id: string; quantidade: number; subtotal: number; produto_nome: string | null; data_retirada: string | null }> = []
  const chunk = 200
  for (let i = 0; i < pedidoIds.length; i += chunk) {
    const ids = pedidoIds.slice(i, i + chunk)
    const itensRes = await admin
      .from('pedido_itens')
      .select('id, pedido_id, produto_id, quantidade, subtotal, produto_nome, data_retirada')
      .in('pedido_id', ids)
    itens = itens.concat((itensRes.data ?? []) as typeof itens)
  }

  const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))] as string[]
  if (produtoIds.length === 0) {
    return { opcoesProdutos, opcoesCategorias, itens: [] }
  }

  // Produto -> categoria, tipo, tipo_kit (para kit lanche mensal = 1 kit por grupo)
  const categoriaIdPorProduto = new Map<string, string | null>()
  const categoriaNomePorProduto = new Map<string, string | null>()
  const { data: prodsCategoria } = await admin
    .from('produtos')
    .select('id, tipo, tipo_kit, categoria_id, categoria:categorias(id, nome)')
    .in('id', produtoIds)
  const kitMensalProdutoIdsRel = new Set(
    (prodsCategoria ?? []).filter((p: { tipo?: string; tipo_kit?: string }) => p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL').map((p: { id: string }) => p.id)
  )
  try {
    for (const prod of prodsCategoria ?? []) {
      const raw = (prod as unknown as { categoria?: { nome?: string } | { nome?: string }[] | null }).categoria
      const cat = Array.isArray(raw) ? raw[0] : raw
      categoriaIdPorProduto.set(String(prod.id), prod.categoria_id ?? null)
      categoriaNomePorProduto.set(String(prod.id), cat && typeof cat === 'object' && 'nome' in cat ? (cat.nome ?? null) : null)
    }
  } catch {
    // segue com categoria null
  }

  const itensByPedidoRel = new Map<string, typeof itens>()
  for (const item of itens) {
    const list = itensByPedidoRel.get(item.pedido_id) ?? []
    list.push(item)
    itensByPedidoRel.set(item.pedido_id, list)
  }
  const kitGroupTotalsRel = new Map<string, number>()
  for (const p of pedidosPorProduto) {
    const itensPed = itensByPedidoRel.get(p.id) ?? []
    if (itensPed.length === 0) continue
    const allKitMensal = itensPed.every((i) => kitMensalProdutoIdsRel.has(i.produto_id))
    if (!allKitMensal) continue
    const primeiro = itensPed[0]
    const dataRef = primeiro.data_retirada ?? p.data_retirada ?? p.created_at
    const ano = new Date(dataRef).getFullYear()
    const mes = new Date(dataRef).getMonth() + 1
    const groupKey = `${p.aluno_id ?? ''}|${primeiro.produto_id}|${ano}|${mes}`
    const somaPedido = itensPed.reduce((s, i) => s + Number(i.subtotal ?? 0), 0)
    kitGroupTotalsRel.set(groupKey, (kitGroupTotalsRel.get(groupKey) ?? 0) + somaPedido)
  }
  const kitGroupsByProdutoRel = new Map<string, { count: number; valorTotal: number }>()
  for (const [groupKey, totalSum] of kitGroupTotalsRel) {
    const parts = groupKey.split('|')
    const pid = parts[1]
    if (!pid) continue
    const exist = kitGroupsByProdutoRel.get(pid)
    if (exist) {
      exist.count += 1
      exist.valorTotal += totalSum
    } else {
      kitGroupsByProdutoRel.set(pid, { count: 1, valorTotal: totalSum })
    }
  }

  // Aplicar filtros opcionais
  let itensFiltrados = itens
  if (filtro.produtoId) {
    itensFiltrados = itensFiltrados.filter((i) => i.produto_id === filtro.produtoId)
  }
  if (filtro.categoriaId) {
    itensFiltrados = itensFiltrados.filter(
      (i) => categoriaIdPorProduto.get(i.produto_id) === filtro.categoriaId
    )
  }

  // Agregar por produto (kit mensal = 1 por grupo, não soma de itens)
  const agregado = new Map<string, { produto_nome: string; quantidade: number; valor_total: number }>()
  for (const i of itensFiltrados) {
    if (kitMensalProdutoIdsRel.has(i.produto_id)) continue
    const nome = i.produto_nome ?? 'Produto'
    const qtd = Number(i.quantidade ?? 0)
    const sub = Number(i.subtotal ?? 0)
    const exist = agregado.get(i.produto_id)
    if (exist) {
      exist.quantidade += qtd
      exist.valor_total += sub
    } else {
      agregado.set(i.produto_id, { produto_nome: nome, quantidade: qtd, valor_total: sub })
    }
  }
  for (const [pid, v] of kitGroupsByProdutoRel) {
    if (filtro.produtoId && pid !== filtro.produtoId) continue
    if (filtro.categoriaId && categoriaIdPorProduto.get(pid) !== filtro.categoriaId) continue
    const nome = itens.find((i) => i.produto_id === pid)?.produto_nome ?? 'Produto'
    agregado.set(pid, { produto_nome: nome, quantidade: v.count, valor_total: v.valorTotal })
  }

  // Venda direta não é vinculada a ninguém: identificar alunos VENDA_DIRETA para não listar como comprador
  const alunoIdsEmPedidos = [...new Set(pedidosPorProduto.map((p) => p.aluno_id).filter(Boolean))] as string[]
  const alunoIdsEmKits = [...new Set(Array.from(kitGroupTotalsRel.keys()).map((k) => k.split('|')[0]).filter(Boolean))]
  const todosAlunoIdsParaProntuario = [...new Set([...alunoIdsEmPedidos, ...alunoIdsEmKits])]
  const alunoIdsVendaDireta = new Set<string>()
  if (todosAlunoIdsParaProntuario.length > 0) {
    const { data: prontRes } = await admin
      .from('alunos')
      .select('id, prontuario')
      .in('id', todosAlunoIdsParaProntuario)
    for (const row of prontRes ?? []) {
      if (row.prontuario === 'VENDA_DIRETA') alunoIdsVendaDireta.add(row.id)
    }
  }

  // Compradores por produto: alunos, colaboradores e venda direta (venda direta sem turma)
  const compradoresPorProduto = new Map<string, { alunoIds: Set<string>; colaboradorIds: Set<string>; vendaDireta: boolean }>()
  const pedidoToTipo = new Map<string, { tipo: 'aluno'; id: string } | { tipo: 'colaborador'; id: string } | { tipo: 'venda_direta' }>()
  for (const p of pedidosPorProduto) {
    const ehColab = p.tipo_beneficiario === 'COLABORADOR' || p.colaborador_id != null
    const ehVendaDireta = p.tipo_beneficiario === 'VENDA_DIRETA' || (p.aluno_id != null && alunoIdsVendaDireta.has(p.aluno_id))
    if (ehColab && p.colaborador_id) {
      pedidoToTipo.set(p.id, { tipo: 'colaborador', id: p.colaborador_id })
    } else if (ehVendaDireta) {
      pedidoToTipo.set(p.id, { tipo: 'venda_direta' })
    } else if (p.aluno_id) {
      pedidoToTipo.set(p.id, { tipo: 'aluno', id: p.aluno_id })
    }
  }
  for (const i of itensFiltrados) {
    if (kitMensalProdutoIdsRel.has(i.produto_id)) continue
    const comp = pedidoToTipo.get(i.pedido_id)
    if (!comp) continue
    let entry = compradoresPorProduto.get(i.produto_id)
    if (!entry) {
      entry = { alunoIds: new Set(), colaboradorIds: new Set(), vendaDireta: false }
      compradoresPorProduto.set(i.produto_id, entry)
    }
    if (comp.tipo === 'aluno') entry.alunoIds.add(comp.id)
    else if (comp.tipo === 'colaborador') entry.colaboradorIds.add(comp.id)
    else entry.vendaDireta = true
  }
  for (const [groupKey] of kitGroupTotalsRel) {
    const parts = groupKey.split('|')
    const alunoId = parts[0]
    const pid = parts[1]
    if (!alunoId || !pid) continue
    let entry = compradoresPorProduto.get(pid)
    if (!entry) {
      entry = { alunoIds: new Set(), colaboradorIds: new Set(), vendaDireta: false }
      compradoresPorProduto.set(pid, entry)
    }
    if (alunoIdsVendaDireta.has(alunoId)) entry.vendaDireta = true
    else entry.alunoIds.add(alunoId)
  }

  const alunoIdsUnicos = [...new Set(Array.from(compradoresPorProduto.values()).flatMap((e) => [...e.alunoIds]))]
  const alunoToInfo = new Map<string, { aluno_nome: string; turma: string }>()
  if (alunoIdsUnicos.length > 0) {
    const { data: alunosRes } = await admin
      .from('alunos')
      .select('id, nome, prontuario, turma_id, turmas(descricao)')
      .in('id', alunoIdsUnicos)
    const alunosData = (alunosRes ?? []) as Array<{
      id: string
      nome: string | null
      prontuario: string | null
      turma_id: string | null
      turmas?: { descricao: string | null } | { descricao: string | null }[] | null
    }>
    for (const a of alunosData) {
      const turmaRaw = a.turmas == null ? null : Array.isArray(a.turmas) ? a.turmas[0] : a.turmas
      const turmaDesc = turmaRaw && typeof turmaRaw === 'object' && 'descricao' in turmaRaw ? (turmaRaw.descricao ?? '-') : '-'
      const turma = a.prontuario === 'COLABORADOR' ? 'Colaborador' : turmaDesc
      alunoToInfo.set(a.id, { aluno_nome: a.nome ?? '-', turma })
    }
  }

  const itensRelatorio: RelatorioPorProdutoItem[] = Array.from(agregado.entries()).map(
    ([produto_id, v]) => {
      const entry = compradoresPorProduto.get(produto_id)
      const compradores: RelatorioPorProdutoComprador[] = []
      if (entry) {
        for (const aid of entry.alunoIds) {
          const info = alunoToInfo.get(aid)
          if (info) compradores.push({ aluno_nome: info.aluno_nome, turma: info.turma })
        }
        for (const cid of entry.colaboradorIds) {
          const nome = colaboradorIdToNome.get(cid) ?? 'Colaborador'
          compradores.push({ colaborador_nome: nome, turma: 'Colaborador' })
        }
        if (entry.vendaDireta) compradores.push({ venda_direta: true, turma: '-' })
        compradores.sort((a, b) => {
          const nomeA = a.venda_direta ? 'Venda direta' : (a.colaborador_nome ?? a.aluno_nome ?? '')
          const nomeB = b.venda_direta ? 'Venda direta' : (b.colaborador_nome ?? b.aluno_nome ?? '')
          return nomeA.localeCompare(nomeB)
        })
      }
      return {
        produto_id,
        produto_nome: v.produto_nome,
        categoria_nome: categoriaNomePorProduto.get(produto_id) ?? null,
        quantidade: v.quantidade,
        valor_total: v.valor_total,
        compradores,
      }
    }
  )
  itensRelatorio.sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
    if (b.valor_total !== a.valor_total) return b.valor_total - a.valor_total
    return a.produto_nome.localeCompare(b.produto_nome)
  })
  const itensTop50 = itensRelatorio.slice(0, 50)

  return { opcoesProdutos, opcoesCategorias, itens: itensTop50 }
}
