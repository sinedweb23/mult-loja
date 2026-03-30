'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const empresaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().optional(),
  tenant_id: z.string().uuid().optional().nullable(),
})

const unidadeSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  empresa_id: z.string().uuid('Empresa é obrigatória'),
})

/**
 * Listar todas as empresas
 */
export async function listarEmpresas() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('empresas')
    .select(`
      id,
      nome,
      cnpj,
      tenant_id,
      created_at,
      updated_at,
      tenants:tenant_id (
        id,
        nome
      )
    `)
    .order('nome')

  if (error) {
    console.error('Erro ao listar empresas:', error)
    throw new Error('Erro ao carregar empresas')
  }

  return data || []
}

/**
 * Obter uma empresa por ID
 */
export async function obterEmpresa(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Erro ao obter empresa:', error)
    throw new Error('Erro ao carregar empresa')
  }

  return data
}

/**
 * Criar empresa
 */
export async function criarEmpresa(dados: z.infer<typeof empresaSchema>) {
  const supabase = await createClient()

  const dadosValidados = empresaSchema.parse(dados)

  const { data, error } = await supabase
    .from('empresas')
    .insert({
      nome: dadosValidados.nome,
      cnpj: dadosValidados.cnpj || null,
      tenant_id: dadosValidados.tenant_id || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar empresa:', error)
    throw new Error('Erro ao criar empresa')
  }

  return data
}

/**
 * Atualizar empresa
 */
export async function atualizarEmpresa(id: string, dados: z.infer<typeof empresaSchema>) {
  const supabase = await createClient()

  const dadosValidados = empresaSchema.parse(dados)

  const { data, error } = await supabase
    .from('empresas')
    .update({
      nome: dadosValidados.nome,
      cnpj: dadosValidados.cnpj || null,
      tenant_id: dadosValidados.tenant_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar empresa:', error)
    throw new Error('Erro ao atualizar empresa')
  }

  return data
}

/**
 * Deletar empresa
 */
export async function deletarEmpresa(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('empresas')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao deletar empresa:', error)
    throw new Error('Erro ao deletar empresa')
  }
}

/**
 * Listar unidades de uma empresa
 */
export async function listarUnidades(empresaId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('unidades')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome')

  if (error) {
    console.error('Erro ao listar unidades:', error)
    throw new Error('Erro ao carregar unidades')
  }

  return data || []
}

/**
 * Criar unidade
 */
export async function criarUnidade(dados: z.infer<typeof unidadeSchema>) {
  const supabase = await createClient()

  const dadosValidados = unidadeSchema.parse(dados)

  const { data, error } = await supabase
    .from('unidades')
    .insert({
      nome: dadosValidados.nome,
      empresa_id: dadosValidados.empresa_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar unidade:', error)
    throw new Error('Erro ao criar unidade')
  }

  return data
}

/**
 * Atualizar unidade
 */
export async function atualizarUnidade(id: string, dados: z.infer<typeof unidadeSchema>) {
  const supabase = await createClient()

  const dadosValidados = unidadeSchema.parse(dados)

  const { data, error } = await supabase
    .from('unidades')
    .update({
      nome: dadosValidados.nome,
      empresa_id: dadosValidados.empresa_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar unidade:', error)
    throw new Error('Erro ao atualizar unidade')
  }

  return data
}

/**
 * Deletar unidade
 */
export async function deletarUnidade(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('unidades')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao deletar unidade:', error)
    throw new Error('Erro ao deletar unidade')
  }
}
