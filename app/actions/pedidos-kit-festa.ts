'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { verificarSeEhAdmin } from '@/app/actions/admin'
import { verificarSlotKitFestaDisponivel } from '@/app/actions/kit-festa'
import { criarEventoKitFesta, atualizarEventoKitFesta } from '@/lib/google-calendar'

export interface PedidoKitFestaItem {
  id: string
  produto_id: string | null
  produto_nome: string | null
  quantidade: number
  preco_unitario: number
  subtotal: number
  tema_festa: string | null
  idade_festa: number | null
  kit_festa_data: string | null
  kit_festa_horario_inicio: string | null
  kit_festa_horario_fim: string | null
  google_event_id: string | null
  google_event_link: string | null
  variacoes_selecionadas: Record<string, string> | null
  opcionais_selecionados: Array<{ opcional_id?: string; nome?: string; quantidade?: number }> | null
  kit_festa_pedido_feito: boolean
}

export interface PedidoKitFestaCompleto {
  id: string
  status: string
  total: number
  created_at: string
  data_retirada: string | null
  aluno: { id: string; nome: string; prontuario: string }
  turma: string | null
  itens: PedidoKitFestaItem[]
}

/**
 * Lista pedidos que possuem pelo menos um item Kit Festa (para admin).
 */
export interface ListarPedidosKitFestaParams {
  dataPedidoInicio?: string
  dataPedidoFim?: string
  dataFestaInicio?: string
  dataFestaFim?: string
  incluirRealizados?: boolean
  buscaAluno?: string
  page?: number
  pageSize?: number
}

export interface ListarPedidosKitFestaResult {
  pedidos: PedidoKitFestaCompleto[]
  total: number
  page: number
  pageSize: number
}

export async function listarPedidosKitFesta(
  params?: ListarPedidosKitFestaParams,
): Promise<ListarPedidosKitFestaResult> {
  try {
    const dataPedidoInicio = (params?.dataPedidoInicio ?? '').trim() || null
    const dataPedidoFim = (params?.dataPedidoFim ?? '').trim() || null
    const dataFestaInicio = (params?.dataFestaInicio ?? '').trim() || null
    const dataFestaFim = (params?.dataFestaFim ?? '').trim() || null
    const buscaAluno = (params?.buscaAluno ?? '').trim()
    const page = Math.max(1, params?.page ?? 1)
    const pageSize = Math.min(100, Math.max(5, params?.pageSize ?? 20))

    const supabase = await createClient()
    const { data: itensKitFesta, error: errItens } = await supabase
      .from('pedido_itens')
      .select('pedido_id')
      .not('kit_festa_data', 'is', null)
    if (errItens) {
      console.error('[listarPedidosKitFesta]', errItens)
      return { pedidos: [], total: 0, page: 1, pageSize }
    }
    const pedidoIds = [...new Set((itensKitFesta ?? []).map((r) => r.pedido_id))]
    if (pedidoIds.length === 0) return { pedidos: [], total: 0, page, pageSize }

    let queryPedidos = supabase
      .from('pedidos')
      .select(`
        id,
        status,
        total,
        created_at,
        data_retirada,
        aluno_id,
        alunos:alunos!inner (
          id,
          nome,
          prontuario,
          turmas:turma_id ( descricao )
        )
      `)
      .in('id', pedidoIds)

    // Filtro por data do pedido (no banco, por created_at)
    if (dataPedidoInicio) {
      queryPedidos = queryPedidos.gte('created_at', `${dataPedidoInicio}T00:00:00`)
    }
    if (dataPedidoFim) {
      queryPedidos = queryPedidos.lte('created_at', `${dataPedidoFim}T23:59:59.999999`)
    }

    // Filtro por nome do aluno
    if (buscaAluno) {
      const term = `%${buscaAluno.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
      queryPedidos = queryPedidos.ilike('alunos.nome', term)
    }

    const { data: pedidos, error: errPedidos } = await queryPedidos.order('created_at', {
      ascending: true,
    })
    if (errPedidos) {
      console.error('[listarPedidosKitFesta] pedidos', errPedidos)
      return { pedidos: [], total: 0, page, pageSize }
    }

    const { data: itensTodos, error: errItensTodos } = await supabase
      .from('pedido_itens')
      .select(
        'id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, subtotal, tema_festa, idade_festa, kit_festa_data, kit_festa_horario_inicio, kit_festa_horario_fim, google_event_id, google_event_link, variacoes_selecionadas, opcionais_selecionados, kit_festa_pedido_feito',
      )
      .in('pedido_id', pedidoIds)
      .not('kit_festa_data', 'is', null)
    if (errItensTodos) {
      console.error('[listarPedidosKitFesta] itens (todos)', errItensTodos)
      return { pedidos: [], total: 0, page, pageSize }
    }

    const itensPorPedido = new Map<string, any[]>()
    for (const it of itensTodos ?? []) {
      const pid = (it as any).pedido_id as string
      if (!pid) continue
      const arr = itensPorPedido.get(pid) ?? []
      arr.push(it)
      itensPorPedido.set(pid, arr)
    }

    const resultadoBase: PedidoKitFestaCompleto[] = []
    for (const p of pedidos ?? []) {
      const aluno = (p as any).alunos
      if (!aluno) continue
      const turmaRef = (aluno as any).turmas
      const turmaDesc =
        (Array.isArray(turmaRef) ? turmaRef[0]?.descricao : turmaRef?.descricao) ?? null

      const itens = itensPorPedido.get(p.id) ?? []
      if (itens.length === 0) continue

      resultadoBase.push({
        id: p.id,
        status: p.status,
        total: Number(p.total),
        created_at: p.created_at,
        data_retirada: p.data_retirada,
        aluno: { id: aluno.id, nome: aluno.nome ?? '', prontuario: aluno.prontuario ?? '' },
        turma: turmaDesc,
        itens: itens.map((i) => ({
          id: i.id,
          produto_id: i.produto_id ?? null,
          produto_nome: i.produto_nome,
          quantidade: i.quantidade,
          preco_unitario: Number(i.preco_unitario),
          subtotal: Number(i.subtotal),
          tema_festa: i.tema_festa,
          idade_festa: i.idade_festa,
          kit_festa_data: i.kit_festa_data,
          kit_festa_horario_inicio: i.kit_festa_horario_inicio,
          kit_festa_horario_fim: i.kit_festa_horario_fim,
          google_event_id: i.google_event_id,
          google_event_link: i.google_event_link,
          variacoes_selecionadas: (i.variacoes_selecionadas as Record<string, string>) ?? null,
          opcionais_selecionados:
            (i.opcionais_selecionados as PedidoKitFestaItem['opcionais_selecionados']) ?? null,
          kit_festa_pedido_feito: Boolean(i.kit_festa_pedido_feito),
        })),
      })
    }

    const getDatasFesta = (p: PedidoKitFestaCompleto): string[] =>
      p.itens
        .map((i) => i.kit_festa_data)
        .filter((d): d is string => !!d)

    const getDataMaisProxima = (p: PedidoKitFestaCompleto): number | null => {
      const datas = getDatasFesta(p).map((d) => new Date(d + 'T00:00:00').getTime())
      if (!datas.length) return null
      return Math.min(...datas)
    }

    let filtrados = resultadoBase

    // Filtro por data do pedido (created_at, parte da data)
    if (dataPedidoInicio || dataPedidoFim) {
      filtrados = filtrados.filter((p) => {
        const dataPed = (p.created_at ?? '').slice(0, 10)
        if (!dataPed) return false
        if (dataPedidoInicio && dataPed < dataPedidoInicio) return false
        if (dataPedidoFim && dataPed > dataPedidoFim) return false
        return true
      })
    }

    // Filtro por data da festa (intervalo)
    if (dataFestaInicio || dataFestaFim) {
      filtrados = filtrados.filter((p) => {
        const datas = getDatasFesta(p)
        if (!datas.length) return false
        return datas.some((d) => {
          if (dataFestaInicio && d < dataFestaInicio) return false
          if (dataFestaFim && d > dataFestaFim) return false
          return true
        })
      })
    }

    // Ordenar:
    // 1) Festas futuras / hoje primeiro, ordenadas pela data mais próxima
    // 2) Depois festas já realizadas, também ordenadas pela data (mais recente primeiro dentro do grupo)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const getChaveOrdenacao = (p: PedidoKitFestaCompleto): { grupo: number; data: number } => {
      const datas = getDatasFesta(p).map((d) => {
        const dt = new Date(d + 'T00:00:00')
        dt.setHours(0, 0, 0, 0)
        return dt.getTime()
      })
      if (!datas.length) {
        // Sem data de festa: trata como grupo “futuro”, mas vai para o fim desse grupo
        return { grupo: 0, data: Number.MAX_SAFE_INTEGER }
      }
      const menor = Math.min(...datas)
      const grupo = menor < hoje.getTime() ? 1 : 0 // 0 = hoje/futuro, 1 = já realizada
      return { grupo, data: menor }
    }

    filtrados.sort((a, b) => {
      const ka = getChaveOrdenacao(a)
      const kb = getChaveOrdenacao(b)
      if (ka.grupo !== kb.grupo) return ka.grupo - kb.grupo
      return ka.data - kb.data
    })

    const total = filtrados.length
    const from = (page - 1) * pageSize
    const to = from + pageSize
    const pagina = filtrados.slice(from, to)

    return {
      pedidos: pagina,
      total,
      page,
      pageSize,
    }
  } catch (e) {
    console.error('[listarPedidosKitFesta]', e)
    return { pedidos: [], total: 0, page: 1, pageSize: 20 }
  }
}

/** Busca um único pedido Kit Festa por ID (para página de impressão). */
export async function obterPedidoKitFestaPorId(
  pedidoId: string,
): Promise<PedidoKitFestaCompleto | null> {
  try {
    const supabase = await createClient()
    const { data: pedido, error: errPedido } = await supabase
      .from('pedidos')
      .select(
        `
        id,
        status,
        total,
        created_at,
        data_retirada,
        aluno_id,
        alunos:alunos!inner (
          id,
          nome,
          prontuario,
          turmas:turma_id ( descricao )
        )
      `,
      )
      .eq('id', pedidoId)
      .single()
    if (errPedido || !pedido) return null

    const aluno = (pedido as any).alunos
    if (!aluno) return null

    const { data: itens, error: errItens } = await supabase
      .from('pedido_itens')
      .select(
        'id, produto_id, produto_nome, quantidade, preco_unitario, subtotal, tema_festa, idade_festa, kit_festa_data, kit_festa_horario_inicio, kit_festa_horario_fim, google_event_id, google_event_link, variacoes_selecionadas, opcionais_selecionados, kit_festa_pedido_feito',
      )
      .eq('pedido_id', pedidoId)
      .not('kit_festa_data', 'is', null)
    if (errItens || !itens?.length) return null

    const turmaRef = (aluno as any).turmas
    const turmaDesc =
      (Array.isArray(turmaRef) ? turmaRef[0]?.descricao : turmaRef?.descricao) ?? null

    return {
      id: pedido.id,
      status: pedido.status,
      total: Number(pedido.total),
      created_at: pedido.created_at,
      data_retirada: pedido.data_retirada,
      aluno: { id: aluno.id, nome: aluno.nome ?? '', prontuario: aluno.prontuario ?? '' },
      turma: turmaDesc,
      itens: itens.map((i) => ({
        id: i.id,
        produto_id: i.produto_id ?? null,
        produto_nome: i.produto_nome,
        quantidade: i.quantidade,
        preco_unitario: Number(i.preco_unitario),
        subtotal: Number(i.subtotal),
        tema_festa: i.tema_festa,
        idade_festa: i.idade_festa,
        kit_festa_data: i.kit_festa_data,
        kit_festa_horario_inicio: i.kit_festa_horario_inicio,
        kit_festa_horario_fim: i.kit_festa_horario_fim,
        google_event_id: i.google_event_id,
        google_event_link: i.google_event_link,
        variacoes_selecionadas: (i.variacoes_selecionadas as Record<string, string>) ?? null,
        opcionais_selecionados:
          (i.opcionais_selecionados as PedidoKitFestaItem['opcionais_selecionados']) ?? null,
        kit_festa_pedido_feito: Boolean(i.kit_festa_pedido_feito),
      })),
    }
  } catch (e) {
    console.error('[obterPedidoKitFestaPorId]', e)
    return null
  }
}

export async function marcarPedidoKitFestaFeito(itemId: string, feito: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('pedido_itens')
    .update({ kit_festa_pedido_feito: feito })
    .eq('id', itemId)

  if (error) {
    console.error('[marcarPedidoKitFestaFeito]', error)
    throw new Error('Não foi possível atualizar o status do pedido de Kit Festa.')
  }
}

export async function marcarPedidoFeitoAction(formData: FormData) {
  const itemId = String(formData.get('itemId') ?? '').trim()
  if (!itemId) return
  await marcarPedidoKitFestaFeito(itemId, true)
  revalidatePath('/admin/pedidos-kit-festa')
}

export async function alterarDataKitFestaAdmin(params: {
  itemId: string
  novaData: string
  novoHorarioInicio: string
  novoHorarioFim: string
}): Promise<{ ok: boolean; erro?: string }> {
  const itemId = (params.itemId ?? '').trim()
  const novaData = (params.novaData ?? '').trim()
  const novoHorarioInicio = (params.novoHorarioInicio ?? '').trim()
  const novoHorarioFim = (params.novoHorarioFim ?? '').trim()

  if (!itemId) return { ok: false, erro: 'Item inválido.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, erro: 'Data inválida.' }
  if (!/^\d{2}:\d{2}$/.test(novoHorarioInicio) || !/^\d{2}:\d{2}$/.test(novoHorarioFim)) {
    return { ok: false, erro: 'Horário inválido.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado.' }

  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) return { ok: false, erro: 'Sem permissão.' }

  const admin = createAdminClient()

  const { data: itemRow, error: errItem } = await admin
    .from('pedido_itens')
    .select('id, pedido_id, produto_id, produto_nome, kit_festa_data, kit_festa_horario_inicio, kit_festa_horario_fim, google_event_id, google_event_link, tema_festa, idade_festa, variacoes_selecionadas, opcionais_selecionados')
    .eq('id', itemId)
    .maybeSingle()

  if (errItem) return { ok: false, erro: errItem.message }
  if (!itemRow) return { ok: false, erro: 'Item não encontrado.' }
  if (!itemRow.produto_id) return { ok: false, erro: 'Produto do item não encontrado.' }

  // Verificar disponibilidade na agenda (ignorando o próprio evento, se existir)
  const { disponivel, erro: erroDisp } = await verificarSlotKitFestaDisponivel(
    itemRow.produto_id,
    novaData,
    novoHorarioInicio,
    novoHorarioFim,
    { ignoreEventId: itemRow.google_event_id ?? undefined }
  )
  if (!disponivel) {
    return { ok: false, erro: erroDisp || 'O horário selecionado não está disponível na agenda.' }
  }

  // Buscar dados do pedido/aluno para título/descrição do evento
  const { data: pedido, error: errPedido } = await admin
    .from('pedidos')
    .select(`id, alunos:aluno_id ( nome, prontuario )`)
    .eq('id', itemRow.pedido_id)
    .maybeSingle()

  if (errPedido) return { ok: false, erro: errPedido.message }

  const alunoNome = (pedido as any)?.alunos?.nome ?? 'Aluno'
  const prontuario = (pedido as any)?.alunos?.prontuario ?? ''

  // Atualizar evento na agenda (ou criar se não existir)
  try {
    const titulo = `Festa: ${alunoNome}`
    const dataFormatada = new Date(novaData + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    // Descrição no mesmo padrão da compra (transacoes.ts)
    const linhasDesc: string[] = [
      String(alunoNome || 'Aluno').toUpperCase(),
      prontuario ? `Prontuário: ${prontuario}` : '',
      itemRow.tema_festa ? `Tema: ${itemRow.tema_festa}` : '',
      `Idade: ${itemRow.idade_festa ?? '?'} anos`,
      `Data: ${dataFormatada}`,
    ].filter(Boolean)

    const variacoes = (itemRow.variacoes_selecionadas as Record<string, string>) ?? {}
    if (Object.keys(variacoes).length > 0) {
      linhasDesc.push('', ...Object.entries(variacoes).map(([k, v]) => `${k}: ${v}`))
    }

    const opcionais =
      (itemRow.opcionais_selecionados as Array<{ opcional_id?: string; nome: string; quantidade?: number }>) ??
      []
    if (opcionais.length > 0) {
      let opcionaisLinhas: string[] = []
      const produtoId = itemRow.produto_id as string
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
          const grupoNome =
            o.opcional_id && opcionalIdToGrupoNome[o.opcional_id]
              ? opcionalIdToGrupoNome[o.opcional_id]
              : 'Adicionais'
          const texto = `${o.nome}${(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}`
          if (!porGrupo[grupoNome]) porGrupo[grupoNome] = []
          porGrupo[grupoNome].push(texto)
        }
        opcionaisLinhas = Object.entries(porGrupo).map(
          ([titulo, itens]) => `${titulo}: ${itens.join(', ')}`
        )
      } else {
        opcionaisLinhas = opcionais.map(
          (o) => `${o.nome}${(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}`
        )
      }
      linhasDesc.push('', ...opcionaisLinhas)
    }

    const evento = itemRow.google_event_id
      ? await atualizarEventoKitFesta(
          itemRow.google_event_id,
          novaData,
          novoHorarioInicio,
          novoHorarioFim,
          titulo,
          linhasDesc.join('\n')
        )
      : await criarEventoKitFesta(
          novaData,
          novoHorarioInicio,
          novoHorarioFim,
          titulo,
          linhasDesc.join('\n')
        )

    const { error: upErr } = await admin
      .from('pedido_itens')
      .update({
        kit_festa_data: novaData,
        kit_festa_horario_inicio: novoHorarioInicio,
        kit_festa_horario_fim: novoHorarioFim,
        google_event_id: evento.id,
        google_event_link: evento.htmlLink || null,
      })
      .eq('id', itemId)

    if (upErr) return { ok: false, erro: upErr.message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao atualizar agenda.'
    return { ok: false, erro: msg }
  }

  revalidatePath('/admin/pedidos-kit-festa')
  return { ok: true }
}
