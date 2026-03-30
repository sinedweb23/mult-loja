'use server'

import { createClient } from '@/lib/supabase/server'
import {
  listarDatasDiasUteisMesCalendario,
  obterDiasUteisCalendario,
} from '@/app/actions/calendario'
import { todayISO } from '@/lib/date'

/** Tabela antiga (número por mês) - mantida para compatibilidade. */
export interface DiasUteisMes {
  id: string
  empresa_id: string
  ano: number
  mes: number
  dias_uteis: number
}

/**
 * Lista as datas (YYYY-MM-DD) que são dias úteis em um mês/ano.
 * Usa o Calendário (Admin > Calendário): feriados fixos, eventos e configuração de fim de semana.
 */
export async function listarDatasDiasUteisMes(
  empresaId: string,
  ano: number,
  mes: number
): Promise<string[]> {
  return listarDatasDiasUteisMesCalendario(empresaId, ano, mes)
}

/**
 * Retorna a quantidade de dias úteis de um mês/ano conforme o Calendário.
 */
export async function obterDiasUteis(empresaId: string, ano: number, mes: number): Promise<number> {
  return obterDiasUteisCalendario(empresaId, ano, mes)
}

/**
 * Salva a seleção de dias úteis de um mês: remove as datas desse mês e insere as novas.
 * datas: array de strings YYYY-MM-DD.
 */
export async function salvarDiasUteisMesDatas(
  empresaId: string,
  ano: number,
  mes: number,
  datas: string[]
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const ultimo = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

  const { error: delErr } = await supabase
    .from('dias_uteis_config')
    .delete()
    .eq('empresa_id', empresaId)
    .gte('data', primeiro)
    .lte('data', ultimo)
  if (delErr) return { ok: false, erro: delErr.message }

  if (datas.length > 0) {
    const rows = datas.map((data) => ({ empresa_id: empresaId, data }))
    const { error: insErr } = await supabase.from('dias_uteis_config').insert(rows)
    if (insErr) return { ok: false, erro: insErr.message }
  }
  return { ok: true }
}

/**
 * Retorna as datas de dias úteis do mês (para checkout MENSAL).
 */
export async function obterDatasDiasUteisMes(
  empresaId: string,
  ano: number,
  mes: number
): Promise<string[]> {
  return listarDatasDiasUteisMes(empresaId, ano, mes)
}

/** @deprecated Usar listarDatasDiasUteisMes. Lista por ano na tabela antiga dias_uteis_mes. */
export async function listarDiasUteisAno(empresaId: string, ano: number): Promise<DiasUteisMes[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dias_uteis_mes')
    .select('id, empresa_id, ano, mes, dias_uteis')
    .eq('empresa_id', empresaId)
    .eq('ano', ano)
    .order('mes', { ascending: true })
  if (error) throw error
  return (data || []) as DiasUteisMes[]
}

/** @deprecated Usar salvarDiasUteisMesDatas. */
export async function salvarDiasUteisMes(
  empresaId: string,
  ano: number,
  mes: number,
  dias_uteis: number
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('dias_uteis_mes').upsert(
    {
      empresa_id: empresaId,
      ano,
      mes,
      dias_uteis,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'empresa_id,ano,mes' }
  )
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

/** @deprecated Usar calendário e salvarDiasUteisMesDatas. */
export async function salvarDiasUteisAno(
  empresaId: string,
  ano: number,
  meses: number[]
): Promise<{ ok: boolean; erro?: string }> {
  for (let mes = 1; mes <= 12; mes++) {
    const dias = meses[mes - 1] ?? 0
    const res = await salvarDiasUteisMes(empresaId, ano, mes, dias)
    if (!res.ok) return res
  }
  return { ok: true }
}

/**
 * Retorna a empresa do responsável e as datas disponíveis para retirada (dias úteis do calendário).
 * Usado no carrinho para exibir o calendário (apenas dias úteis) e validar a data escolhida.
 */
export async function obterDatasRetiradaDisponiveis(): Promise<{
  datas: string[]
  empresaId: string | null
  erro?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { datas: [], empresaId: null, erro: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!usuario) return { datas: [], empresaId: null, erro: 'Responsável não encontrado' }

  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', usuario.id)
    .limit(1)
  const alunoId = vinculos?.[0]?.aluno_id
  if (!alunoId) return { datas: [], empresaId: null, erro: 'Nenhum aluno vinculado' }

  const { data: aluno } = await supabase
    .from('alunos')
    .select('empresa_id')
    .eq('id', alunoId)
    .eq('situacao', 'ATIVO')
    .maybeSingle()
  const empresaId = (aluno as { empresa_id?: string } | null)?.empresa_id
  if (!empresaId) return { datas: [], empresaId: null, erro: 'Empresa do aluno não encontrada' }

  const hoje = todayISO()
  const datas: string[] = []
  const d = new Date()
  for (let i = 0; i < 3; i++) {
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    const doMes = await listarDatasDiasUteisMes(empresaId, ano, mes)
    for (const data of doMes) {
      if (data >= hoje) datas.push(data)
    }
    d.setMonth(d.getMonth() + 1)
  }
  datas.sort()
  return { datas, empresaId }
}
