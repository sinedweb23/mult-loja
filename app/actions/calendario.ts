'use server'

import { createClient } from '@/lib/supabase/server'

export interface FeriadoFixo {
  id: string
  mes: number
  dia: number
  descricao: string | null
  created_at: string
}

export interface CalendarioEvento {
  id: string
  empresa_id: string | null
  data: string
  ano_especifico: number | null
  descricao: string | null
  created_at: string
}

export interface ConfigFimSemana {
  empresa_id: string
  sabado_util: boolean
  domingo_util: boolean
}

/** Lista feriados/datas fixos (repetem todo ano). */
export async function listarFeriadosFixos(): Promise<FeriadoFixo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendario_feriados_fixos')
    .select('id, mes, dia, descricao, created_at')
    .order('mes')
    .order('dia')
  if (error) throw error
  return (data || []) as FeriadoFixo[]
}

/** Cria feriado fixo (mes 1-12, dia 1-31). */
export async function criarFeriadoFixo(payload: {
  mes: number
  dia: number
  descricao?: string | null
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendario_feriados_fixos')
    .insert({ mes: payload.mes, dia: payload.dia, descricao: payload.descricao ?? null })
    .select('id')
    .single()
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id: data?.id }
}

/** Exclui feriado fixo. */
export async function excluirFeriadoFixo(id: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendario_feriados_fixos').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Lista eventos (datas específicas). empresaId opcional; ano opcional para filtrar. */
export async function listarEventos(filtros?: {
  empresa_id?: string | null
  ano?: number
}): Promise<CalendarioEvento[]> {
  const supabase = await createClient()
  let q = supabase
    .from('calendario_eventos')
    .select('id, empresa_id, data, ano_especifico, descricao, created_at')
    .order('data', { ascending: false })
  if (filtros?.empresa_id !== undefined && filtros.empresa_id !== null)
    q = q.eq('empresa_id', filtros.empresa_id)
  if (filtros?.empresa_id === null) q = q.is('empresa_id', null)
  if (filtros?.ano != null) {
    q = q.or(`ano_especifico.eq.${filtros.ano},ano_especifico.is.null`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data || []) as CalendarioEvento[]
}

/** Cria evento. ano_especifico null = recorrente (todo ano nessa data). */
export async function criarEvento(payload: {
  empresa_id?: string | null
  data: string
  ano_especifico?: number | null
  descricao?: string | null
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendario_eventos')
    .insert({
      empresa_id: payload.empresa_id ?? null,
      data: payload.data,
      ano_especifico: payload.ano_especifico ?? null,
      descricao: payload.descricao ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id: data?.id }
}

/**
 * Cria eventos para um período (todas as datas entre data_inicio e data_fim, inclusive).
 * Retorna quantas datas foram inseridas.
 */
export async function criarEventosPeriodo(payload: {
  data_inicio: string
  data_fim: string
  ano_especifico?: number | null
  descricao?: string | null
  empresa_id?: string | null
}): Promise<{ ok: boolean; quantidade?: number; erro?: string }> {
  const supabase = await createClient()
  const inicio = new Date(payload.data_inicio + 'T12:00:00Z')
  const fim = new Date(payload.data_fim + 'T12:00:00Z')
  if (inicio.getTime() > fim.getTime()) {
    return { ok: false, erro: 'Data inicial deve ser anterior ou igual à data final.' }
  }
  const datas: string[] = []
  const d = new Date(inicio)
  while (d.getTime() <= fim.getTime()) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    datas.push(`${y}-${m}-${day}`)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  if (datas.length > 366) {
    return { ok: false, erro: 'Período muito longo. Use no máximo 366 dias.' }
  }
  const rows = datas.map((data) => ({
    empresa_id: payload.empresa_id ?? null,
    data,
    ano_especifico: payload.ano_especifico ?? null,
    descricao: payload.descricao ?? null,
  }))
  const { error } = await supabase.from('calendario_eventos').insert(rows)
  if (error) return { ok: false, erro: error.message }
  return { ok: true, quantidade: datas.length }
}

/** Exclui evento. */
export async function excluirEvento(id: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendario_eventos').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** Obtém configuração de fim de semana para uma empresa. */
export async function obterConfigFimSemana(
  empresaId: string
): Promise<ConfigFimSemana | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendario_fim_semana')
    .select('empresa_id, sabado_util, domingo_util')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw error
  return data as ConfigFimSemana | null
}

/** Salva configuração de fim de semana (upsert por empresa). */
export async function salvarConfigFimSemana(
  empresaId: string,
  sabado_util: boolean,
  domingo_util: boolean
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('calendario_fim_semana').upsert(
    {
      empresa_id: empresaId,
      sabado_util,
      domingo_util,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'empresa_id' }
  )
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/**
 * Indica se uma data é dia útil.
 * Não útil quando: feriado fixo, evento cadastrado, ou sáb/dom conforme config (padrão: sáb e dom não úteis).
 */
export async function isDiaUtil(
  empresaId: string,
  data: string
): Promise<boolean> {
  const supabase = await createClient()
  const d = new Date(data + 'T12:00:00Z')
  const ano = d.getUTCFullYear()
  const mes = d.getUTCMonth() + 1
  const dia = d.getUTCDate()
  const diaSemana = d.getUTCDay() // 0 = domingo, 6 = sábado

  const [config, feriados, eventosRows] = await Promise.all([
    supabase
      .from('calendario_fim_semana')
      .select('sabado_util, domingo_util')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    supabase
      .from('calendario_feriados_fixos')
      .select('id')
      .eq('mes', mes)
      .eq('dia', dia),
    supabase
      .from('calendario_eventos')
      .select('data, ano_especifico')
      .or(`empresa_id.eq.${empresaId},empresa_id.is.null`),
  ])

  const feriadoFixo = (feriados.data || []).length > 0

  let eventoMatch = false
  const eventos = (eventosRows.data || []) as { data: string; ano_especifico: number | null }[]
  for (const row of eventos) {
    if (row.ano_especifico == null) {
      const evDate = new Date(row.data + 'T12:00:00Z')
      if (evDate.getUTCMonth() + 1 === mes && evDate.getUTCDate() === dia) {
        eventoMatch = true
        break
      }
    } else if (row.ano_especifico === ano && row.data === data) {
      eventoMatch = true
      break
    }
  }

  if (feriadoFixo || eventoMatch) return false

  const sabadoUtil = config.data?.sabado_util ?? false
  const domingoUtil = config.data?.domingo_util ?? false
  if (diaSemana === 6 && !sabadoUtil) return false
  if (diaSemana === 0 && !domingoUtil) return false

  return true
}

function ehDiaUtilEmMemoria(
  mes: number,
  dia: number,
  ano: number,
  dataStr: string,
  diaSemana: number,
  config: { sabado_util: boolean; domingo_util: boolean } | null,
  feriadosMesDia: Set<string>,
  eventosNaoUteis: Set<string>
): boolean {
  const chaveFeriado = `${mes}-${dia}`
  if (feriadosMesDia.has(chaveFeriado)) return false
  if (eventosNaoUteis.has(dataStr)) return false
  const sabadoUtil = config?.sabado_util ?? false
  const domingoUtil = config?.domingo_util ?? false
  if (diaSemana === 6 && !sabadoUtil) return false
  if (diaSemana === 0 && !domingoUtil) return false
  return true
}

/**
 * Lista as datas (YYYY-MM-DD) que são dias úteis em um mês/ano, conforme o Calendário
 * (feriados fixos, eventos e configuração de fim de semana). Usado pela loja e pelo PDV.
 */
export async function listarDatasDiasUteisMesCalendario(
  empresaId: string,
  ano: number,
  mes: number
): Promise<string[]> {
  const supabase = await createClient()
  const [configRes, feriadosRes, eventosRes] = await Promise.all([
    supabase
      .from('calendario_fim_semana')
      .select('sabado_util, domingo_util')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    supabase.from('calendario_feriados_fixos').select('mes, dia'),
    supabase
      .from('calendario_eventos')
      .select('data, ano_especifico')
      .or(`empresa_id.eq.${empresaId},empresa_id.is.null`),
  ])
  const feriadosMesDia = new Set(
    (feriadosRes.data || []).map((r: { mes: number; dia: number }) => `${r.mes}-${r.dia}`)
  )
  const eventos = (eventosRes.data || []) as { data: string; ano_especifico: number | null }[]
  const eventosNaoUteis = new Set<string>()
  for (const row of eventos) {
    const d = new Date(row.data + 'T12:00:00Z')
    const evMes = d.getUTCMonth() + 1
    const evDia = d.getUTCDate()
    if (row.ano_especifico == null) {
      if (evMes === mes) eventosNaoUteis.add(`${ano}-${String(mes).padStart(2, '0')}-${String(evDia).padStart(2, '0')}`)
    } else if (row.ano_especifico === ano && evMes === mes) {
      eventosNaoUteis.add(row.data)
    }
  }
  const config = configRes.data as { sabado_util: boolean; domingo_util: boolean } | null
  const datas: string[] = []
  const ultimoDia = new Date(ano, mes, 0).getDate()
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const dataStr = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    const d = new Date(ano, mes - 1, dia)
    const diaSemana = d.getDay()
    if (ehDiaUtilEmMemoria(mes, dia, ano, dataStr, diaSemana, config, feriadosMesDia, eventosNaoUteis)) {
      datas.push(dataStr)
    }
  }
  return datas
}

/**
 * Retorna a quantidade de dias úteis de um mês/ano conforme o Calendário.
 */
export async function obterDiasUteisCalendario(
  empresaId: string,
  ano: number,
  mes: number
): Promise<number> {
  const datas = await listarDatasDiasUteisMesCalendario(empresaId, ano, mes)
  return datas.length
}
