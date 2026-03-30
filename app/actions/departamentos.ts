'use server'

import { createClient } from '@/lib/supabase/server'

export type DepartamentoComSegmentos = {
  id: string
  empresa_id: string
  nome: string
  ordem: number
  segmentos: { id: string; departamento_id: string; nome: string; ordem: number }[]
}

export type Departamento = {
  id: string
  empresa_id: string
  nome: string
  ordem: number
}

export type Segmento = {
  id: string
  departamento_id: string
  nome: string
  ordem: number
}

async function verificarAdmin() {
  const { verificarSeEhAdmin } = await import('@/app/actions/admin')
  if (!(await verificarSeEhAdmin())) throw new Error('Não autorizado')
}

/**
 * Lista departamentos com segmentos para uso no PDV (Consumo Interno).
 * Não exige perfil admin; qualquer usuário autenticado da empresa pode listar.
 */
export async function listarDepartamentosComSegmentosParaPdv(empresaId: string): Promise<DepartamentoComSegmentos[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: deps, error: errDeps } = await supabase
    .from('departamentos')
    .select('id, empresa_id, nome, ordem')
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (errDeps || !deps?.length) return []

  const { data: segs, error: errSegs } = await supabase
    .from('segmentos')
    .select('id, departamento_id, nome, ordem')
    .in('departamento_id', deps.map((d) => d.id))
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  const segsByDep = (segs || []).reduce<Record<string, Segmento[]>>((acc, s) => {
    const list = acc[s.departamento_id] || []
    list.push({
      id: s.id,
      departamento_id: s.departamento_id,
      nome: s.nome,
      ordem: s.ordem ?? 0,
    })
    acc[s.departamento_id] = list
    return acc
  }, {})

  return deps.map((d) => ({
    id: d.id,
    empresa_id: d.empresa_id,
    nome: d.nome,
    ordem: d.ordem ?? 0,
    segmentos: (segsByDep[d.id] || []).sort((a, b) => a.ordem - b.ordem),
  }))
}

export async function listarDepartamentosComSegmentos(empresaId: string): Promise<DepartamentoComSegmentos[]> {
  await verificarAdmin()
  const supabase = await createClient()
  const { data: deps, error: errDeps } = await supabase
    .from('departamentos')
    .select('id, empresa_id, nome, ordem')
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (errDeps) {
    console.error('Erro ao listar departamentos:', errDeps)
    return []
  }

  if (!deps?.length) return []

  const { data: segs, error: errSegs } = await supabase
    .from('segmentos')
    .select('id, departamento_id, nome, ordem')
    .in('departamento_id', deps.map((d) => d.id))
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (errSegs) {
    console.error('Erro ao listar segmentos:', errSegs)
  }

  const segsByDep = (segs || []).reduce<Record<string, Segmento[]>>((acc, s) => {
    const list = acc[s.departamento_id] || []
    list.push({
      id: s.id,
      departamento_id: s.departamento_id,
      nome: s.nome,
      ordem: s.ordem ?? 0,
    })
    acc[s.departamento_id] = list
    return acc
  }, {})

  return (deps || []).map((d) => ({
    id: d.id,
    empresa_id: d.empresa_id,
    nome: d.nome,
    ordem: d.ordem ?? 0,
    segmentos: (segsByDep[d.id] || []).sort((a, b) => a.ordem - b.ordem),
  }))
}

export async function criarDepartamento(empresaId: string, dados: { nome: string; ordem?: number }): Promise<Departamento | null> {
  await verificarAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('departamentos')
    .insert({
      empresa_id: empresaId,
      nome: (dados.nome || '').trim(),
      ordem: dados.ordem ?? 0,
    })
    .select('id, empresa_id, nome, ordem')
    .single()
  if (error) {
    console.error('Erro ao criar departamento:', error)
    throw new Error(error.message || 'Erro ao criar departamento')
  }
  return data as Departamento
}

export async function atualizarDepartamento(id: string, dados: { nome?: string; ordem?: number }): Promise<Departamento | null> {
  await verificarAdmin()
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (dados.nome !== undefined) update.nome = (dados.nome || '').trim()
  if (dados.ordem !== undefined) update.ordem = dados.ordem
  if (Object.keys(update).length === 0) return null
  const { data, error } = await supabase
    .from('departamentos')
    .update(update)
    .eq('id', id)
    .select('id, empresa_id, nome, ordem')
    .single()
  if (error) throw new Error(error.message || 'Erro ao atualizar departamento')
  return data as Departamento
}

export async function removerDepartamento(id: string): Promise<void> {
  await verificarAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('departamentos').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao remover departamento')
}

export async function criarSegmento(departamentoId: string, dados: { nome: string; ordem?: number }): Promise<Segmento | null> {
  await verificarAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('segmentos')
    .insert({
      departamento_id: departamentoId,
      nome: (dados.nome || '').trim(),
      ordem: dados.ordem ?? 0,
    })
    .select('id, departamento_id, nome, ordem')
    .single()
  if (error) throw new Error(error.message || 'Erro ao criar segmento')
  return data as Segmento
}

export async function atualizarSegmento(id: string, dados: { nome?: string; ordem?: number }): Promise<Segmento | null> {
  await verificarAdmin()
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (dados.nome !== undefined) update.nome = (dados.nome || '').trim()
  if (dados.ordem !== undefined) update.ordem = dados.ordem
  if (Object.keys(update).length === 0) return null
  const { data, error } = await supabase
    .from('segmentos')
    .update(update)
    .eq('id', id)
    .select('id, departamento_id, nome, ordem')
    .single()
  if (error) throw new Error(error.message || 'Erro ao atualizar segmento')
  return data as Segmento
}

export async function removerSegmento(id: string): Promise<void> {
  await verificarAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('segmentos').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao remover segmento')
}
