'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LISTA_RECURSOS } from '@/lib/admin-recursos'

export interface PerfilComPermissoes {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  permissoes: string[]
}

/**
 * Listar todos os perfis (para super admins).
 * Se as tabelas perfis/perfil_permissoes não existirem (migration não aplicada), retorna [].
 */
export async function listarPerfis(): Promise<PerfilComPermissoes[]> {
  const supabase = await createClient()

  const { data: perfis, error: errPerfis } = await supabase
    .from('perfis')
    .select('id, nome, descricao, ativo, created_at, updated_at')
    .order('nome')

  if (errPerfis) {
    console.error('Erro ao listar perfis (talvez a migration de perfis não foi aplicada no Supabase):', errPerfis)
    return []
  }

  if (!perfis?.length) return []

  const { data: permissões, error: errPerm } = await supabase
    .from('perfil_permissoes')
    .select('perfil_id, recurso')
    .in('perfil_id', perfis.map((p) => p.id))

  if (errPerm) {
    console.error('Erro ao listar permissões:', errPerm)
    return perfis.map((p) => ({ ...p, permissoes: [] }))
  }

  const mapPerm = new Map<string, string[]>()
  for (const p of permissões || []) {
    const list = mapPerm.get(p.perfil_id) || []
    list.push(p.recurso)
    mapPerm.set(p.perfil_id, list)
  }

  return perfis.map((p) => ({
    ...p,
    permissoes: mapPerm.get(p.id) || [],
  }))
}

/**
 * Obter um perfil com suas permissões.
 */
export async function obterPerfil(id: string): Promise<PerfilComPermissoes | null> {
  const supabase = await createClient()

  const { data: perfil, error: errPerfil } = await supabase
    .from('perfis')
    .select('id, nome, descricao, ativo, created_at, updated_at')
    .eq('id', id)
    .single()

  if (errPerfil || !perfil) return null

  const { data: permissões } = await supabase
    .from('perfil_permissoes')
    .select('recurso')
    .eq('perfil_id', id)

  return {
    ...perfil,
    permissoes: (permissões || []).map((p) => p.recurso),
  }
}

export type ResultadoPerfil = { success: true; id: string } | { success: false; error: string }

/**
 * Criar perfil com permissões. Apenas super admin.
 * Retorna { success: false, error } em caso de falha (ex.: migration não aplicada no Supabase).
 */
export async function criarPerfil(dados: {
  nome: string
  descricao?: string | null
  ativo?: boolean
  recursos: string[]
}): Promise<ResultadoPerfil> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Não autenticado' }

    const { data: u } = await supabase
      .from('usuarios')
      .select('super_admin')
      .eq('auth_user_id', user.id)
      .eq('super_admin', true)
      .single()

    if (!u) return { success: false, error: 'Apenas super administradores podem criar perfis' }

    const recursos = dados.recursos.filter((r) => LISTA_RECURSOS.includes(r as any))

    const { data: perfil, error: errPerfil } = await supabase
      .from('perfis')
      .insert({
        nome: dados.nome.trim(),
        descricao: dados.descricao?.trim() || null,
        ativo: dados.ativo !== false,
      })
      .select('id')
      .single()

    if (errPerfil || !perfil) {
      console.error('Erro ao criar perfil:', errPerfil)
      let msg = 'Erro ao criar perfil.'
      if (errPerfil) {
        if (errPerfil.message?.includes('relation') || errPerfil.message?.includes('does not exist')) {
          msg = 'Tabela de perfis não encontrada. Aplique a migration 025 no Supabase (supabase/migrations/025_perfis_permissoes.sql).'
        } else if (errPerfil.message?.toLowerCase().includes('row-level security') || errPerfil.code === '42501') {
          msg = 'Sem permissão para criar perfil. Verifique se seu usuário é Super Admin e se as políticas RLS da migration 025 estão aplicadas.'
        } else {
          msg = `Erro ao criar perfil: ${errPerfil.message || errPerfil.code || 'erro desconhecido'}`
        }
      }
      return { success: false, error: msg }
    }

    if (recursos.length > 0) {
      const { error: errPerm } = await supabase.from('perfil_permissoes').insert(
        recursos.map((recurso) => ({ perfil_id: perfil.id, recurso }))
      )
      if (errPerm) {
        console.error('Erro ao salvar permissões:', errPerm)
        await supabase.from('perfis').delete().eq('id', perfil.id)
        const permMsg = errPerm.message?.includes('relation') || errPerm.message?.includes('does not exist')
          ? 'Tabela perfil_permissoes não encontrada. Aplique a migration 025 no Supabase.'
          : `Erro ao salvar permissões: ${errPerm.message || errPerm.code || ''}`
        return { success: false, error: permMsg }
      }
    }

    return { success: true, id: perfil.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar perfil.'
    return { success: false, error: msg }
  }
}

/**
 * Atualizar perfil e permissões. Apenas super admin.
 */
export async function atualizarPerfil(
  id: string,
  dados: {
    nome?: string
    descricao?: string | null
    ativo?: boolean
    recursos?: string[]
  }
): Promise<ResultadoPerfil> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Não autenticado' }

    const { data: u } = await supabase
      .from('usuarios')
      .select('super_admin')
      .eq('auth_user_id', user.id)
      .eq('super_admin', true)
      .single()

    if (!u) return { success: false, error: 'Apenas super administradores podem editar perfis' }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (dados.nome !== undefined) update.nome = dados.nome.trim()
    if (dados.descricao !== undefined) update.descricao = dados.descricao?.trim() || null
    if (dados.ativo !== undefined) update.ativo = dados.ativo

    const { error: errPerfil } = await supabase.from('perfis').update(update).eq('id', id)
    if (errPerfil) {
      console.error('Erro ao atualizar perfil:', errPerfil)
      return { success: false, error: 'Erro ao atualizar perfil.' }
    }

    if (dados.recursos !== undefined) {
      await supabase.from('perfil_permissoes').delete().eq('perfil_id', id)
      const recursos = dados.recursos.filter((r) => LISTA_RECURSOS.includes(r as any))
      if (recursos.length > 0) {
        const { error: errPerm } = await supabase.from('perfil_permissoes').insert(
          recursos.map((recurso) => ({ perfil_id: id, recurso }))
        )
        if (errPerm) {
          console.error('Erro ao atualizar permissões:', errPerm)
          return { success: false, error: 'Erro ao atualizar permissões do perfil.' }
        }
      }
    }

    return { success: true, id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar perfil.' }
  }
}

/**
 * Excluir perfil. Apenas super admin. Usuários com este perfil ficam com perfil_id = null (acesso total).
 */
export async function excluirPerfil(id: string): Promise<ResultadoPerfil> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Não autenticado' }

    const { data: u } = await supabase
      .from('usuarios')
      .select('super_admin')
      .eq('auth_user_id', user.id)
      .eq('super_admin', true)
      .single()

    if (!u) return { success: false, error: 'Apenas super administradores podem excluir perfis' }

    const { error } = await supabase.from('perfis').delete().eq('id', id)
    if (error) {
      console.error('Erro ao excluir perfil:', error)
      return { success: false, error: 'Erro ao excluir perfil.' }
    }
    return { success: true, id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao excluir perfil.' }
  }
}

/**
 * Retorna a lista de recursos (páginas) que o usuário logado pode acessar no admin.
 * - Super admin: todos.
 * - Admin com perfil_id: recursos do perfil.
 * - Admin sem perfil_id (legado): todos.
 * - Não admin: [].
 * Se a coluna perfil_id ou tabela perfil_permissoes não existir, retorna acesso total.
 */
export async function obterRecursosDoUsuario(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: usuarioRow } = await admin
    .from('usuarios')
    .select('id, super_admin')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (!usuarioRow) return []

  const { data: cache } = await admin
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const { data: perfilRows } = await admin
    .from('usuario_perfis')
    .select('perfil_id')
    .eq('usuario_id', usuarioRow.id)
  const perfilIds = (perfilRows ?? []).map((p: { perfil_id: string }) => p.perfil_id)

  if (cache?.is_admin) {
    if (usuarioRow.super_admin || perfilIds.length === 0) {
      return LISTA_RECURSOS as unknown as string[]
    }
    const { data: rows, error: errPerm } = await admin
      .from('perfil_permissoes')
      .select('recurso')
      .in('perfil_id', perfilIds)
    if (errPerm) return LISTA_RECURSOS as unknown as string[]
    const recursos = [...new Set((rows || []).map((r: { recurso: string }) => r.recurso))]
    return recursos.filter((r) => r !== 'admin.auditoria')
  }

  if (perfilIds.length === 0) {
    // Sem perfil em usuario_perfis: verifica papel RH em usuario_papeis (legado)
    const { data: papeis } = await admin
      .from('usuario_papeis')
      .select('papel')
      .eq('usuario_id', usuarioRow.id)
    const temPapelRH = (papeis ?? []).some(
      (p: { papel: string }) => p.papel === 'RH' || String(p.papel).toUpperCase() === 'RH'
    )
    return temPapelRH ? ['admin.rh'] : []
  }
  const { data: rows, error: errPerm } = await admin
    .from('perfil_permissoes')
    .select('recurso')
    .in('perfil_id', perfilIds)
  if (errPerm) return []
  let recursos = [...new Set((rows || []).map((r: { recurso: string }) => r.recurso))]
  // Se tem perfil mas não tem admin.rh, verifica papel RH (perfil RH sem recurso cadastrado)
  if (!recursos.includes('admin.rh')) {
    const { data: papeis } = await admin
      .from('usuario_papeis')
      .select('papel')
      .eq('usuario_id', usuarioRow.id)
    const temPapelRH = (papeis ?? []).some(
      (p: { papel: string }) => p.papel === 'RH' || String(p.papel).toUpperCase() === 'RH'
    )
    if (temPapelRH) recursos = [...recursos, 'admin.rh']
  }
  return recursos.filter((r) => r !== 'admin.auditoria')
}

/**
 * Verifica se o usuário pode acessar o módulo RH (lista colaboradores, consumo, abatimentos, etc.).
 * True se for admin (cache), se tiver recurso admin.rh no perfil (usuario_perfis + perfil_permissoes),
 * ou se tiver papel RH em usuario_papeis (legado / quando o perfil RH não tem admin.rh cadastrado).
 * Usa admin client para não depender de RLS.
 */
export async function podeAcessarRH(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (!usuario) return false

  const { data: cache } = await admin
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (cache?.is_admin) return true

  // Perfil com recurso admin.rh (usuario_perfis + perfil_permissoes)
  const { data: perfis } = await admin
    .from('usuario_perfis')
    .select('perfil_id')
    .eq('usuario_id', usuario.id)
  const perfilIds = (perfis ?? []).map((p: { perfil_id: string }) => p.perfil_id)
  if (perfilIds.length > 0) {
    const { data: perm } = await admin
      .from('perfil_permissoes')
      .select('recurso')
      .in('perfil_id', perfilIds)
      .eq('recurso', 'admin.rh')
      .limit(1)
      .maybeSingle()
    if (perm) return true
  }

  // Papel RH em usuario_papeis (legado / perfil RH sem admin.rh no banco)
  const { data: papeis } = await admin
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuario.id)
  const temPapelRH = (papeis ?? []).some(
    (p: { papel: string }) => p.papel === 'RH' || String(p.papel).toUpperCase() === 'RH'
  )
  return temPapelRH
}

/**
 * Retorna a URL da primeira página do admin que o usuário pode acessar.
 * Uso em redirecionamentos (ex.: após login, página inicial).
 */
export async function obterPrimeiraPaginaAdmin(): Promise<string> {
  const { primeiraPaginaPermitida } = await import('@/lib/admin-recursos')
  const recursos = await obterRecursosDoUsuario()
  return primeiraPaginaPermitida(recursos)
}

/**
 * Retorna true se o usuário (ex.: só RH) tem outro contexto para trocar:
 * mais de um papel (escolher-modo) ou tem filhos (acessar Loja).
 * Uso: mostrar botão "Trocar perfil" no header admin quando usuário é apenas RH.
 */
export async function temOutroContextoParaTrocarPerfil(): Promise<boolean> {
  const { obterPapeisDoUsuario } = await import('@/app/actions/papeis')
  const { temFilhosAtivos } = await import('@/app/actions/responsavel')
  const [papeis, filhos] = await Promise.all([obterPapeisDoUsuario(), temFilhosAtivos()])
  return (papeis?.length ?? 0) > 1 || !!filhos
}

/**
 * Verifica se o usuário logado pode acessar o PDV.
 * True se tiver papel OPERADOR ou se for admin com recurso 'pdv' no perfil.
 */
export async function podeAcessarPdv(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (!usuario) return false
  const { data: papeis } = await supabase
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuario.id)
  if (papeis?.some((p: { papel: string }) => p.papel === 'OPERADOR')) return true
  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!cache?.is_admin) return false
  const recursos = await obterRecursosDoUsuario()
  return recursos.includes('pdv')
}
