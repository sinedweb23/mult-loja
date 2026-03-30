'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminData } from '@/app/actions/admin'

export interface FiltroConsumoInterno {
  dataInicio: string
  dataFim: string
  departamentoId?: string | 'todos'
  segmentoId?: string | 'todos'
  solicitanteId?: string | 'todos'
}

export interface ConsumoInternoItem {
  produto_nome: string
  unidade: string | null
  quantidade: number
  quantidade_display?: string
  custo_unitario: number
  total_custo: number
}

export interface ConsumoInternoLancamento {
  id: string
  created_at: string
  status?: 'ATIVO' | 'CANCELADO'
  departamento_nome: string
  segmento_nome: string
  operador_nome: string
  solicitante_nome: string
  retirado_por_nome: string
  total_custo: number
  itens: ConsumoInternoItem[]
}

export interface ConsumoInternoResumoDepartamento {
  departamento_id: string
  departamento_nome: string
  total_custo: number
}

export interface ConsumoInternoResumoSegmento {
  segmento_id: string
  segmento_nome: string
  total_custo: number
}

export interface RelatorioConsumoInternoPayload {
  lancamentos: ConsumoInternoLancamento[]
  total_geral: number
  por_departamento: ConsumoInternoResumoDepartamento[]
  por_segmento: ConsumoInternoResumoSegmento[]
  solicitantes: { id: string; nome: string }[]
}

function parseDateISO(s: string): { inicio: string; fim: string } {
  const dInicio = new Date(s + 'T00:00:00')
  const dFim = new Date(s + 'T00:00:00')
  if (isNaN(dInicio.getTime())) {
    const hoje = new Date()
    return {
      inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString(),
      fim: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999).toISOString(),
    }
  }
  dFim.setHours(23, 59, 59, 999)
  return { inicio: dInicio.toISOString(), fim: dFim.toISOString() }
}

export async function obterRelatorioConsumoInterno(
  filtro: FiltroConsumoInterno
): Promise<RelatorioConsumoInternoPayload> {
  const adminUser = await getAdminData()
  const empresaId: string | null = (adminUser as any).empresa_id ?? adminUser.empresas?.id ?? null
  if (!empresaId) {
    throw new Error('Empresa do admin não encontrada')
  }

  const admin = createAdminClient()
  const { inicio, fim } = parseDateISO(filtro.dataInicio || filtro.dataFim)
  const dataFimStr = filtro.dataFim || filtro.dataInicio || filtro.dataInicio
  const range = parseDateISO(dataFimStr)

  const isoInicio = inicio
  const isoFim = range.fim

  let query = admin
    .from('consumo_interno')
    .select(
      `
      id,
      status,
      empresa_id,
      operador_id,
      solicitante_id,
      retirado_por_id,
      departamento_id,
      segmento_id,
      created_at,
      operadores:operador_id ( nome ),
      solicitante:solicitante_id ( nome ),
      retirou:retirado_por_id ( nome ),
      departamentos:departamento_id ( nome ),
      segmentos:segmento_id ( nome )
    `
    )
    .eq('empresa_id', empresaId)
    .gte('created_at', isoInicio)
    .lte('created_at', isoFim)
    .order('created_at', { ascending: false })

  if (filtro.departamentoId && filtro.departamentoId !== 'todos') {
    query = query.eq('departamento_id', filtro.departamentoId)
  }
  if (filtro.segmentoId && filtro.segmentoId !== 'todos') {
    query = query.eq('segmento_id', filtro.segmentoId)
  }
  if (filtro.solicitanteId && filtro.solicitanteId !== 'todos') {
    query = query.eq('solicitante_id', filtro.solicitanteId)
  }

  const { data: cabecalhos, error } = await query.limit(10000)
  if (error) {
    console.error('[obterRelatorioConsumoInterno] erro ao buscar cabecalhos', error)
    throw new Error('Erro ao carregar relatórios de consumo interno')
  }

  const lancamentosRaw = (cabecalhos ?? []) as Array<{
    id: string
    created_at: string
    status?: 'ATIVO' | 'CANCELADO'
    departamento_id: string
    segmento_id: string
    operadores: { nome: string } | { nome: string }[] | null
    solicitante: { nome: string } | { nome: string }[] | null
    retirou: { nome: string } | { nome: string }[] | null
    departamentos: { nome: string } | { nome: string }[] | null
    segmentos: { nome: string } | { nome: string }[] | null
  }>

  if (lancamentosRaw.length === 0) {
    return {
      lancamentos: [],
      total_geral: 0,
      por_departamento: [],
      por_segmento: [],
      solicitantes: [],
    }
  }

  // Buscar lista de solicitantes distintos para o filtro (apenas quem já consumiu no período)
  const solicitanteIds = [
    ...new Set(
      lancamentosRaw
        .map((c: any) => c.solicitante_id)
        .filter((id: string | null) => !!id)
    ),
  ] as string[]
  let solicitantes: { id: string; nome: string }[] = []
  if (solicitanteIds.length) {
    const { data: users } = await admin
      .from('usuarios')
      .select('id, nome')
      .in('id', solicitanteIds)
    solicitantes =
      (users || []).map((u: any) => ({
        id: u.id,
        nome: (u.nome || '').trim() || 'Sem nome',
      })) ?? []
  }

  const consumoIds = lancamentosRaw.map((c) => c.id)
  const itens: ConsumoInternoItem[] = []
  const itensPorConsumo = new Map<string, ConsumoInternoItem[]>()

  const chunk = 200
  for (let i = 0; i < consumoIds.length; i += chunk) {
    const ids = consumoIds.slice(i, i + chunk)
    const { data: itensData, error: errItens } = await admin
      .from('consumo_interno_itens')
      .select(
        `
        consumo_interno_id,
        produto_id,
        variacao_valor_id,
        quantidade,
        custo_unitario,
        total_custo,
        produtos:produto_id ( nome, unidade )
      `
      )
      .in('consumo_interno_id', ids)

    if (errItens) {
      console.error('[obterRelatorioConsumoInterno] erro ao buscar itens', errItens)
      throw new Error('Erro ao carregar itens de consumo interno')
    }

    for (const row of itensData ?? []) {
      const unidade: string | null = (row as any).produtos?.unidade ?? null
      const qtd: number = Number(row.quantidade ?? 0)
      const custoUnit: number = Number(row.custo_unitario ?? 0)
      const total: number = Number(row.total_custo ?? 0)
      const isKg = unidade === 'KG'
      const item: ConsumoInternoItem = {
        produto_nome: (row as any).produtos?.nome ?? 'Produto',
        unidade,
        quantidade: qtd,
        quantidade_display: isKg ? `${qtd}g` : undefined,
        custo_unitario: custoUnit,
        total_custo: total,
      }
      const list = itensPorConsumo.get(row.consumo_interno_id as string) ?? []
      list.push(item)
      itensPorConsumo.set(row.consumo_interno_id as string, list)
    }
  }

  const lancamentos: ConsumoInternoLancamento[] = []
  const totalPorDept = new Map<string, ConsumoInternoResumoDepartamento>()
  const totalPorSeg = new Map<string, ConsumoInternoResumoSegmento>()
  let totalGeral = 0

  for (const c of lancamentosRaw) {
    const itensC = itensPorConsumo.get(c.id) ?? []
    const totalC = itensC.reduce((s, it) => s + Number(it.total_custo ?? 0), 0)
    const isCancelado = (c as any).status === 'CANCELADO'
    const totalConsiderado = isCancelado ? 0 : totalC
    totalGeral += totalConsiderado

    const depNome =
      c.departamentos && !Array.isArray(c.departamentos)
        ? c.departamentos.nome
        : Array.isArray(c.departamentos)
          ? c.departamentos[0]?.nome
          : ''
    const segNome =
      c.segmentos && !Array.isArray(c.segmentos)
        ? c.segmentos.nome
        : Array.isArray(c.segmentos)
          ? c.segmentos[0]?.nome
          : ''

    const operadorNome =
      c.operadores && !Array.isArray(c.operadores)
        ? c.operadores.nome
        : Array.isArray(c.operadores)
          ? c.operadores[0]?.nome
          : ''
    const solicitanteNome =
      c.solicitante && !Array.isArray(c.solicitante)
        ? c.solicitante.nome
        : Array.isArray(c.solicitante)
          ? c.solicitante[0]?.nome
          : ''
    const retirouNome =
      c.retirou && !Array.isArray(c.retirou)
        ? c.retirou.nome
        : Array.isArray(c.retirou)
          ? c.retirou[0]?.nome
          : ''

    lancamentos.push({
      id: c.id,
      created_at: c.created_at,
      status: (c.status as 'ATIVO' | 'CANCELADO' | undefined) ?? 'ATIVO',
      departamento_nome: depNome,
      segmento_nome: segNome,
      operador_nome: operadorNome,
      solicitante_nome: solicitanteNome,
      retirado_por_nome: retirouNome,
      total_custo: totalC,
      itens: itensC,
    })

    const depEntry = totalPorDept.get(c.departamento_id) ?? {
      departamento_id: c.departamento_id,
      departamento_nome: depNome,
      total_custo: 0,
    }
    depEntry.total_custo += totalConsiderado
    totalPorDept.set(c.departamento_id, depEntry)

    const segEntry = totalPorSeg.get(c.segmento_id) ?? {
      segmento_id: c.segmento_id,
      segmento_nome: segNome,
      total_custo: 0,
    }
    segEntry.total_custo += totalConsiderado
    totalPorSeg.set(c.segmento_id, segEntry)
  }

  const por_departamento = Array.from(totalPorDept.values()).sort((a, b) =>
    a.departamento_nome.localeCompare(b.departamento_nome)
  )
  const por_segmento = Array.from(totalPorSeg.values()).sort((a, b) =>
    a.segmento_nome.localeCompare(b.segmento_nome)
  )

  return {
    lancamentos,
    total_geral: totalGeral,
    por_departamento,
    por_segmento,
    solicitantes,
  }
}

