'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PapelUsuario } from '@/lib/types/database'
import { cookies } from 'next/headers'
import { CANTINA_PAPEIS, PAPEL_COOKIE } from '@/lib/cantina-papeis'

/**
 * Retorna os papéis de um usuário pelo id (uso em callback OAuth / server).
 */
export async function obterPapeisPorUsuarioId(usuarioId: string): Promise<PapelUsuario[]> {
  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, auth_user_id')
    .eq('id', usuarioId)
    .maybeSingle()
  if (!usuario) return []

  const { data: cache } = await admin
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', usuario.auth_user_id)
    .maybeSingle()
  const eh_admin = !!cache?.is_admin

  const { data: papeis } = await admin
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuarioId)

  if (papeis && papeis.length > 0) {
    return papeis.map((p: { papel: PapelUsuario }) => p.papel)
  }

  const result: PapelUsuario[] = []
  if (eh_admin) result.push('ADMIN')
  const { data: vinculos } = await admin
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', usuarioId)
    .limit(1)
  if (vinculos && vinculos.length > 0) result.push('RESPONSAVEL')
  if (result.length === 0) result.push('RESPONSAVEL')
  return result
}

/**
 * Retorna os papéis do usuário logado (usuario_papeis).
 * Se não houver nenhum, deriva de eh_admin e vínculo com alunos.
 */
export async function obterPapeisDoUsuario(): Promise<PapelUsuario[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (!usuario) return []

  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const eh_admin = !!cache?.is_admin

  const { data: papeis } = await supabase
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuario.id)

  if (papeis && papeis.length > 0) {
    return papeis.map((p: { papel: PapelUsuario }) => p.papel)
  }

  // Fallback: sem tabela usuario_papeis preenchida — derivar de admin (cache) e alunos
  const result: PapelUsuario[] = []
  if (eh_admin) result.push('ADMIN')
  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', usuario.id)
    .limit(1)
  if (vinculos && vinculos.length > 0) result.push('RESPONSAVEL')
  if (result.length === 0) result.push('RESPONSAVEL') // mínimo
  return result
}

/**
 * Define o papel ativo na sessão (cookie) e retorna a URL para redirecionar.
 */
export async function definirPapelAtivo(papel: PapelUsuario): Promise<{ url: string }> {
  const cookieStore = await cookies()
  cookieStore.set(PAPEL_COOKIE, papel, { path: '/', maxAge: 60 * 60 * 24 * 7 }) // 7 dias
  return { url: CANTINA_PAPEIS[papel].href }
}

/**
 * Retorna o papel atualmente escolhido (cookie) ou null.
 */
export async function obterPapelAtivo(): Promise<PapelUsuario | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(PAPEL_COOKIE)?.value
  if (!value) return null
  // Converter 'FINANCEIRO' antigo para 'RH' (compatibilidade) — só leitura; não modificar cookie no render
  if (value === 'FINANCEIRO') return 'RH'
  const valid: PapelUsuario[] = ['RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'RH']
  return valid.includes(value as PapelUsuario) ? (value as PapelUsuario) : null
}
