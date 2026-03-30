'use server'

import { createClient } from '@/lib/supabase/server'

/** Admin vem de usuario_admin_cache (sincronizado a partir de usuario_perfis). */
export async function verificarSeEhAdmin(): Promise<boolean> {
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

  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (cache?.is_admin) return true

  // Fallback: se o cache estiver atrasado/desatualizado, considerar papel ADMIN em usuario_papeis.
  // Isso alinha com o fluxo do modal "Configurar acesso", que grava o papel ADMIN em usuario_papeis.
  const { data: papelAdmin } = await supabase
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuario.id)
    .eq('papel', 'ADMIN')
    .limit(1)
    .maybeSingle()
  return !!papelAdmin
}

export async function verificarSeEhSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, super_admin, ativo')
    .eq('auth_user_id', user.id)
    .eq('super_admin', true)
    .eq('ativo', true)
    .maybeSingle()

  return !!usuario
}

export async function getAdminData() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select(`
      *,
      empresas(id, nome),
      unidades(id, nome)
    `)
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .single()

  if (error || !usuario) {
    throw new Error('Usuário não encontrado ou inativo')
  }

  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!cache?.is_admin) {
    throw new Error('Admin não encontrado ou inativo')
  }

  return usuario
}
