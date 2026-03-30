'use server'

import { createClient } from '@/lib/supabase/server'
import { listarDatasDiasUteisMesCalendario } from '@/app/actions/calendario'
import { filtrarSlotsDisponiveis } from '@/lib/google-calendar'

export interface SlotDisponivel {
  inicio: string
  fim: string
}

/**
 * Lista datas disponíveis para Kit Festa: dias úteis dentro do intervalo de antecedência (min/max) do produto.
 */
export async function listarDatasDisponiveisKitFesta(
  empresaId: string,
  produtoId: string
): Promise<{ datas: string[]; erro?: string }> {
  const supabase = await createClient()
  const { data: prod, error } = await supabase
    .from('produtos')
    .select('kit_festa_dias_antecedencia_min, kit_festa_dias_antecedencia_max')
    .eq('id', produtoId)
    .single()

  if (error || !prod) {
    return { datas: [], erro: 'Produto não encontrado.' }
  }

  const minDias = (prod as any).kit_festa_dias_antecedencia_min ?? 0
  const maxDias = (prod as any).kit_festa_dias_antecedencia_max ?? 365

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataMin = new Date(hoje)
  dataMin.setDate(dataMin.getDate() + minDias)
  const dataMax = new Date(hoje)
  dataMax.setDate(dataMax.getDate() + maxDias)

  const todasDatas: string[] = []
  const anoMin = dataMin.getFullYear()
  const anoMax = dataMax.getFullYear()

  for (let ano = anoMin; ano <= anoMax; ano++) {
    const mesInicio = ano === anoMin ? dataMin.getMonth() + 1 : 1
    const mesFim = ano === anoMax ? dataMax.getMonth() + 1 : 12
    for (let mes = mesInicio; mes <= mesFim; mes++) {
      const diasUteis = await listarDatasDiasUteisMesCalendario(empresaId, ano, mes)
      for (const dataStr of diasUteis) {
        const d = new Date(dataStr + 'T12:00:00')
        if (d >= dataMin && d <= dataMax) todasDatas.push(dataStr)
      }
    }
  }

  todasDatas.sort()
  return { datas: todasDatas }
}

/**
 * Retorna horários disponíveis para Kit Festa na data e turno informados,
 * excluindo slots com conflito na Google Agenda.
 * erroOrigem: 'produto' = configuração do produto; 'agenda' = falha na consulta Google Agenda.
 */
export async function getHorariosDisponiveisKitFesta(
  produtoId: string,
  dataStr: string,
  turno: 'MANHA' | 'TARDE',
  opts?: { ignoreEventId?: string }
): Promise<{ horarios: SlotDisponivel[]; erro?: string; erroOrigem?: 'produto' | 'agenda' }> {
  const supabase = await createClient()
  const { data: prod, error } = await supabase
    .from('produtos')
    .select('kit_festa_horarios')
    .eq('id', produtoId)
    .single()

  if (error || !prod) {
    return { horarios: [], erro: 'Produto não encontrado.', erroOrigem: 'produto' }
  }

  const horarios = (prod as any).kit_festa_horarios as Array<{ periodo: string; inicio: string; fim: string }> | null
  if (!Array.isArray(horarios) || horarios.length === 0) {
    return { horarios: [], erro: 'Produto sem horários configurados (configurações do Kit Festa).', erroOrigem: 'produto' }
  }

  const slotsTurno = horarios
    .filter((h) => h.periodo === turno)
    .map((h) => ({ inicio: h.inicio, fim: h.fim }))

  if (slotsTurno.length === 0) {
    return { horarios: [], erro: `Nenhum horário cadastrado para o turno ${turno === 'MANHA' ? 'manhã' : 'tarde'} (configurações do produto).`, erroOrigem: 'produto' }
  }

  try {
    const disponiveis = await filtrarSlotsDisponiveis(dataStr, slotsTurno, 'America/Sao_Paulo', opts?.ignoreEventId)
    return { horarios: disponiveis }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar agenda.'
    return { horarios: [], erro: `Google Agenda: ${msg}`, erroOrigem: 'agenda' }
  }
}

/**
 * Verifica se o horário (data + início + fim) ainda está disponível na Google Agenda.
 * Usado antes de finalizar compra para evitar conflito se o usuário deixou no carrinho por dias.
 */
export async function verificarSlotKitFestaDisponivel(
  produtoId: string,
  dataStr: string,
  horarioInicio: string,
  horarioFim: string,
  opts?: { ignoreEventId?: string }
): Promise<{ disponivel: boolean; erro?: string }> {
  const supabase = await createClient()
  const { data: prod, error } = await supabase
    .from('produtos')
    .select('kit_festa_horarios')
    .eq('id', produtoId)
    .single()
  if (error || !prod) return { disponivel: false, erro: 'Produto não encontrado.' }
  const horarios = (prod as any).kit_festa_horarios as Array<{ periodo: string; inicio: string; fim: string }> | null
  if (!Array.isArray(horarios) || horarios.length === 0) return { disponivel: false, erro: 'Produto sem horários configurados.' }
  const todosSlots = horarios.map((h) => ({ inicio: h.inicio, fim: h.fim }))
  try {
    const disponiveis = await filtrarSlotsDisponiveis(dataStr, todosSlots, 'America/Sao_Paulo', opts?.ignoreEventId)
    const normalizar = (t: string) => (t || '').replace(/^(\d):/, '0$1:')
    const aindaDisponivel = disponiveis.some(
      (s) => normalizar(s.inicio) === normalizar(horarioInicio) && normalizar(s.fim) === normalizar(horarioFim)
    )
    return { disponivel: aindaDisponivel }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar agenda.'
    return { disponivel: false, erro: msg }
  }
}

/**
 * Admin: retorna TODOS os horários disponíveis do Kit Festa em uma data (manhã+tarde),
 * com opção de ignorar um evento existente (remarcação).
 */
export async function getHorariosDisponiveisKitFestaAdmin(
  produtoId: string,
  dataStr: string,
  opts?: { ignoreEventId?: string }
): Promise<{ horarios: SlotDisponivel[]; erro?: string; erroOrigem?: 'produto' | 'agenda' }> {
  const supabase = await createClient()
  const { data: prod, error } = await supabase
    .from('produtos')
    .select('kit_festa_horarios')
    .eq('id', produtoId)
    .single()

  if (error || !prod) {
    return { horarios: [], erro: 'Produto não encontrado.', erroOrigem: 'produto' }
  }

  const horarios = (prod as any).kit_festa_horarios as Array<{ periodo: string; inicio: string; fim: string }> | null
  if (!Array.isArray(horarios) || horarios.length === 0) {
    return { horarios: [], erro: 'Produto sem horários configurados (configurações do Kit Festa).', erroOrigem: 'produto' }
  }

  const slots = horarios.map((h) => ({ inicio: h.inicio, fim: h.fim }))
  if (slots.length === 0) return { horarios: [], erro: 'Produto sem horários configurados.', erroOrigem: 'produto' }

  try {
    const disponiveis = await filtrarSlotsDisponiveis(dataStr, slots, 'America/Sao_Paulo', opts?.ignoreEventId)
    // Ordenar por início
    const norm = (t: string) => (t || '').replace(/^(\d):/, '0$1:')
    disponiveis.sort((a, b) => norm(a.inicio).localeCompare(norm(b.inicio)))
    return { horarios: disponiveis }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar agenda.'
    return { horarios: [], erro: `Google Agenda: ${msg}`, erroOrigem: 'agenda' }
  }
}
