'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import type { PapelUsuario } from '@/lib/types/database'

const PAPEIS_PARA_FILTRO: PapelUsuario[] = ['RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'RH']

const adminSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  empresa_id: z.string().uuid().optional().nullable(),
  unidade_id: z.string().uuid().optional().nullable(),
  ativo: z.boolean().default(true),
})

const SELECT_USUARIOS = `
  id,
  nome,
  email,
  cpf,
  celular,
  ativo,
  empresa_id,
  unidade_id,
  auth_user_id,
  super_admin,
  responsabilidade,
  created_at,
  updated_at,
  empresas:empresa_id ( id, nome ),
  unidades:unidade_id ( id, nome )
`

/**
 * Listar todos os usuários. eh_admin vem de usuario_admin_cache, perfil de usuario_perfis.
 */
export async function listarTodosUsuarios() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: dataUsuarios, error: errUsuarios } = await supabase
    .from('usuarios')
    .select(SELECT_USUARIOS)
    .order('super_admin', { ascending: false })
    .order('nome')

  if (errUsuarios) {
    console.error('Erro ao listar usuários:', errUsuarios)
    throw new Error('Erro ao carregar usuários')
  }

  const usuarios = dataUsuarios || []
  const authIds = usuarios.map((u: any) => u.auth_user_id).filter(Boolean)
  const usuarioIds = usuarios.map((u: any) => u.id)

  const [cacheRows, perfilRows, papeisAdminRows, authUsers] = await Promise.all([
    authIds.length ? adminClient.from('usuario_admin_cache').select('auth_user_id, is_admin').in('auth_user_id', authIds) : { data: [] },
    usuarioIds.length ? adminClient.from('usuario_perfis').select('usuario_id, perfil_id, perfis:perfil_id(nome)').in('usuario_id', usuarioIds) : { data: [] },
    usuarioIds.length
      ? adminClient.from('usuario_papeis').select('usuario_id').eq('papel', 'ADMIN').in('usuario_id', usuarioIds)
      : { data: [] },
    adminClient.auth.admin.listUsers(),
  ])

  const cacheMap = new Map((cacheRows.data || []).map((c: any) => [c.auth_user_id, c.is_admin]))
  const perfilRowsNorm = (perfilRows.data || []).map((r: any) => ({
    usuario_id: r.usuario_id,
    perfil_id: r.perfil_id,
    perfis: Array.isArray(r.perfis) ? (r.perfis[0] ?? null) : (r.perfis ?? null),
  }))
  const perfilMap = perfilMapPreferAdmin(perfilRowsNorm as Parameters<typeof perfilMapPreferAdmin>[0])
  const adminPapelSet = new Set((papeisAdminRows.data || []).map((r: { usuario_id: string }) => r.usuario_id))
  const usersList = authUsers.data?.users || []

  return usuarios.map((usuario: any) => {
    const user = usuario.auth_user_id ? usersList.find((u: any) => u.id === usuario.auth_user_id) : null
    const email = user?.email ?? usuario.email ?? 'N/A'
    const nome = usuario.nome ?? 'Sem nome'
    const temPapelAdmin = adminPapelSet.has(usuario.id)
    const eh_admin = !!cacheMap.get(usuario.auth_user_id) || temPapelAdmin
    const perfilInfo = perfilMap.get(usuario.id)
    return {
      ...usuario,
      email,
      nome,
      eh_admin,
      perfil_id: perfilInfo?.perfil_id ?? null,
      perfis: perfilInfo?.perfis ?? (temPapelAdmin ? { nome: 'Administrador' } : null),
      ja_logou: !!usuario.auth_user_id,
    }
  })
}

const PAGE_SIZE_DEFAULT = 20

export interface ListarUsuariosPaginadoParams {
  page?: number
  pageSize?: number
  busca?: string
  /** Filtro por papel (usuario_papeis). Alinha com o que é configurado no modal "Configurar acesso". */
  papel?: PapelUsuario | null
}

export interface ListarUsuariosPaginadoResult {
  usuarios: Awaited<ReturnType<typeof listarTodosUsuarios>>
  total: number
  page: number
  pageSize: number
}

/** Escapa % e _ para uso em ilike (evita wildcard acidental). */
function escapeIlike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const MAX_IDS_IN_QUERY = 80

/**
 * Lista usuários com paginação, busca (nome/email) e filtro por papel (usuario_papeis).
 * O filtro por papel corresponde ao que é marcado no modal "Configurar acesso" (Responsável, Colaborador, etc.).
 * Quando há muitos usuários com o papel, faz buscas em chunks para não exceder limite do PostgREST.
 */
export async function listarUsuariosPaginado(
  params: ListarUsuariosPaginadoParams
): Promise<ListarUsuariosPaginadoResult> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? PAGE_SIZE_DEFAULT))
  const busca = (params.busca ?? '').trim()
  const papel = params.papel && PAPEIS_PARA_FILTRO.includes(params.papel) ? params.papel : null

  const supabase = await createClient()
  const adminClient = createAdminClient()

  let idsFiltro: string[] | null = null
  if (papel) {
    const { data: papeisRows, error: errPapel } = await adminClient
      .from('usuario_papeis')
      .select('usuario_id')
      .eq('papel', papel)
    if (errPapel) {
      console.error('Erro ao listar usuario_papeis por papel:', errPapel)
      throw new Error('Erro ao carregar usuários')
    }
    idsFiltro = (papeisRows || []).map((p: any) => p.usuario_id)
    if (idsFiltro.length === 0) {
      return { usuarios: [], total: 0, page, pageSize }
    }
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let dataUsuarios: any[] = []
  let total = 0

  if (idsFiltro && idsFiltro.length > MAX_IDS_IN_QUERY) {
    // Muitos IDs: buscar em chunks, ordenar em memória e fatiar a página
    const allRows: any[] = []
    for (let i = 0; i < idsFiltro.length; i += MAX_IDS_IN_QUERY) {
      const chunk = idsFiltro.slice(i, i + MAX_IDS_IN_QUERY)
      const { data, error } = await supabase
        .from('usuarios')
        .select(SELECT_USUARIOS)
        .in('id', chunk)
        .order('super_admin', { ascending: false })
        .order('nome')
      if (error) {
        console.error('Erro ao listar usuários paginados (chunk):', error)
        throw new Error('Erro ao carregar usuários')
      }
      allRows.push(...(data || []))
    }
    let filtered = allRows
    if (busca) {
      const lower = busca.toLowerCase()
      filtered = allRows.filter(
        (u: any) =>
          (u.nome ?? '').toLowerCase().includes(lower) ||
          (u.email ?? '').toLowerCase().includes(lower)
      )
    }
    filtered.sort((a: any, b: any) => {
      if (a.super_admin !== b.super_admin) return (b.super_admin ? 1 : 0) - (a.super_admin ? 1 : 0)
      return (a.nome ?? '').localeCompare(b.nome ?? '')
    })
    total = filtered.length
    dataUsuarios = filtered.slice(from, to)
  } else {
    let q = supabase
      .from('usuarios')
      .select(SELECT_USUARIOS, { count: 'exact' })
      .order('super_admin', { ascending: false })
      .order('nome')

    if (idsFiltro && idsFiltro.length > 0) {
      q = q.in('id', idsFiltro)
    }

    if (busca) {
      const escaped = escapeIlike(busca)
      const term = `%${escaped}%`
      q = q.or(`nome.ilike.${term},email.ilike.${term}`)
    }

    const { data, error: errUsuarios, count } = await q.range(from, to)

    if (errUsuarios) {
      console.error('Erro ao listar usuários paginados:', errUsuarios)
      throw new Error('Erro ao carregar usuários')
    }
    dataUsuarios = data || []
    total = count ?? 0
  }

  const usuarios = dataUsuarios
  const authIds = usuarios.map((u: any) => u.auth_user_id).filter(Boolean)
  const usuarioIds = usuarios.map((u: any) => u.id)

  const [cacheRows, perfilRows, papeisAdminRows] = await Promise.all([
    authIds.length ? adminClient.from('usuario_admin_cache').select('auth_user_id, is_admin').in('auth_user_id', authIds) : { data: [] },
    usuarioIds.length ? adminClient.from('usuario_perfis').select('usuario_id, perfil_id, perfis:perfil_id(nome)').in('usuario_id', usuarioIds) : { data: [] },
    usuarioIds.length
      ? adminClient.from('usuario_papeis').select('usuario_id').eq('papel', 'ADMIN').in('usuario_id', usuarioIds)
      : { data: [] },
  ])

  const cacheMap = new Map((cacheRows.data || []).map((c: any) => [c.auth_user_id, c.is_admin]))
  const perfilRowsNorm = (perfilRows.data || []).map((r: any) => ({
    usuario_id: r.usuario_id,
    perfil_id: r.perfil_id,
    perfis: Array.isArray(r.perfis) ? (r.perfis[0] ?? null) : (r.perfis ?? null),
  }))
  const perfilMap = perfilMapPreferAdmin(perfilRowsNorm as Parameters<typeof perfilMapPreferAdmin>[0])
  const adminPapelSet = new Set((papeisAdminRows.data || []).map((r: { usuario_id: string }) => r.usuario_id))

  const enriched = usuarios.map((usuario: any) => {
    const email = usuario.email ?? 'N/A'
    const nome = usuario.nome ?? 'Sem nome'
    const temPapelAdmin = adminPapelSet.has(usuario.id)
    const eh_admin = !!cacheMap.get(usuario.auth_user_id) || temPapelAdmin
    const perfilInfo = perfilMap.get(usuario.id)
    return {
      ...usuario,
      email,
      nome,
      eh_admin,
      perfil_id: perfilInfo?.perfil_id ?? null,
      perfis: perfilInfo?.perfis ?? (temPapelAdmin ? { nome: 'Administrador' } : null),
      ja_logou: !!usuario.auth_user_id,
    }
  })

  return { usuarios: enriched, total, page, pageSize }
}

/**
 * Listar todos os admins (auth_user_id em usuario_admin_cache com is_admin = true).
 */
export async function listarAdmins() {
  const adminClient = createAdminClient()
  const { data: cacheRows } = await adminClient
    .from('usuario_admin_cache')
    .select('auth_user_id')
    .eq('is_admin', true)
  const authIds = (cacheRows || []).map((c: any) => c.auth_user_id)
  if (authIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select(`
      id,
      nome,
      email,
      ativo,
      empresa_id,
      unidade_id,
      auth_user_id,
      super_admin,
      created_at,
      updated_at,
      empresas:empresa_id ( id, nome ),
      unidades:unidade_id ( id, nome )
    `)
    .in('auth_user_id', authIds)
    .order('super_admin', { ascending: false })
    .order('nome')

  if (error) {
    console.error('Erro ao listar admins:', error)
    throw new Error('Erro ao carregar admins')
  }

  const { data: users } = await adminClient.auth.admin.listUsers()
  return (data || []).map((admin: any) => {
    const user = users?.users?.find((u: any) => u.id === admin.auth_user_id)
    return { ...admin, email: user?.email ?? admin.email ?? 'N/A', eh_admin: true }
  })
}

/**
 * Obter um admin por ID
 */
export async function obterAdmin(id: string) {
  const supabase = await createClient()

  const { data: usuario, error: errUsuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single()
  if (errUsuario || !usuario) {
    throw new Error('Admin não encontrado')
  }
  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', usuario.auth_user_id)
    .maybeSingle()
  if (!cache?.is_admin) {
    throw new Error('Admin não encontrado')
  }

  const adminClient = createAdminClient()
  if (usuario.auth_user_id) {
    const { data: user } = await adminClient.auth.admin.getUserById(usuario.auth_user_id)
    return {
      ...usuario,
      email: user?.user?.email ?? usuario.email ?? '',
    }
  }
  return { ...usuario, email: usuario.email ?? '' }
}

/**
 * Tornar um usuário admin (apenas super admins podem fazer isso)
 */
export async function tornarAdmin(
  usuarioId: string, 
  dados: {
    superAdmin?: boolean
    empresa_id?: string | null
    unidade_id?: string | null
    perfil_id?: string | null
  } = {}
) {
  const supabase = await createClient()
  
  // Verificar se quem está fazendo é super admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  const { data: currentUser } = await supabase
    .from('usuarios')
    .select('super_admin')
    .eq('auth_user_id', user.id)
    .eq('super_admin', true)
    .single()

  if (!currentUser) {
    throw new Error('Apenas super administradores podem conceder permissões de admin')
  }

  const adminDb = createAdminClient()

  // Buscar usuário atual
  const { data: usuarioAtual } = await supabase
    .from('usuarios')
    .select('auth_user_id, email')
    .eq('id', usuarioId)
    .single()

  if (!usuarioAtual) {
    throw new Error('Usuário não encontrado')
  }

  // Se o usuário não tem auth_user_id, precisa criar no auth primeiro
  if (!usuarioAtual.auth_user_id) {
    const adminClient = adminDb
    const email = usuarioAtual.email
    
    if (!email) {
      throw new Error('Usuário não tem email cadastrado. É necessário ter email para criar conta de admin.')
    }

    // Criar usuário no auth sem senha (ele precisará fazer primeiro acesso)
    const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
      email: email,
      email_confirm: false,
    })

    if (userError) {
      console.error('Erro ao criar usuário auth:', userError)
      throw new Error('Erro ao criar conta de acesso para o usuário')
    }

    if (!newUser.user) {
      throw new Error('Usuário não foi criado no sistema de autenticação')
    }

    const { error } = await supabase
      .from('usuarios')
      .update({
        auth_user_id: newUser.user.id,
        super_admin: dados.superAdmin || false,
        empresa_id: dados.empresa_id !== undefined ? dados.empresa_id : null,
        unidade_id: dados.unidade_id !== undefined ? dados.unidade_id : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', usuarioId)
    if (error) {
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      throw new Error('Erro ao conceder permissões de admin')
    }
    const perfilId = dados.perfil_id ?? (await obterPerfilAdminId(adminDb))
    if (perfilId) {
      await adminDb.from('usuario_perfis').upsert({ usuario_id: usuarioId, perfil_id: perfilId }, { onConflict: 'usuario_id,perfil_id' })
    }
  } else {
    const { error } = await supabase
      .from('usuarios')
      .update({
        super_admin: dados.superAdmin !== undefined ? dados.superAdmin : false,
        empresa_id: dados.empresa_id !== undefined ? dados.empresa_id : null,
        unidade_id: dados.unidade_id !== undefined ? dados.unidade_id : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', usuarioId)
    if (error) throw new Error('Erro ao conceder permissões de admin')
    const perfilId = dados.perfil_id ?? (await obterPerfilAdminId(adminDb))
    if (perfilId) {
      await adminDb.from('usuario_perfis').upsert({ usuario_id: usuarioId, perfil_id: perfilId }, { onConflict: 'usuario_id,perfil_id' })
    }
  }

  return { success: true }
}

/**
 * Remover permissões de admin (apenas super admins podem fazer isso)
 */
export async function removerAdmin(usuarioId: string) {
  const supabase = await createClient()
  
  // Verificar se quem está fazendo é super admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  const { data: currentUser } = await supabase
    .from('usuarios')
    .select('super_admin')
    .eq('auth_user_id', user.id)
    .eq('super_admin', true)
    .single()

  if (!currentUser) {
    throw new Error('Apenas super administradores podem remover permissões de admin')
  }

  const adminDb = createAdminClient()

  // Verificar se o usuário tem alunos vinculados
  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuarioId)
    .limit(1)

  if (vinculos && vinculos.length > 0) {
    await removerPerfisAdminDoUsuario(adminDb, usuarioId)
    await supabase.from('usuarios').update({ super_admin: false, updated_at: new Date().toISOString() }).eq('id', usuarioId)
  } else {
    // Não é responsável, pode deletar o registro
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', usuarioId)

    if (error) {
      throw new Error('Erro ao remover admin')
    }
  }

  return { success: true }
}

const PAPEIS_VALIDOS: PapelUsuario[] = ['RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'RH']

type SupabaseDb = ReturnType<typeof createAdminClient>

async function obterPerfilAdminId(supabase: SupabaseDb): Promise<string | null> {
  const { data } = await supabase.from('perfis').select('id').eq('nome', 'Admin').maybeSingle()
  return data?.id ?? null
}

async function obterPerfilAcessoTotalId(supabase: SupabaseDb): Promise<string | null> {
  const { data } = await supabase.from('perfis').select('id').eq('nome', 'Acesso total').maybeSingle()
  return data?.id ?? null
}

async function removerPerfisAdminDoUsuario(supabase: SupabaseDb, usuarioId: string): Promise<void> {
  const { data: perfis } = await supabase.from('perfis').select('id').in('nome', ['Admin', 'Acesso total'])
  const ids = (perfis ?? []).map((p: { id: string }) => p.id)
  if (ids.length) await supabase.from('usuario_perfis').delete().eq('usuario_id', usuarioId).in('perfil_id', ids)
}

/** Ordem para exibir um perfil quando há vários em usuario_perfis (ex.: Responsável + Acesso total). */
const ORDEM_EXIBICAO_PERFIL = [
  'Acesso total',
  'Admin',
  'PDV-Adm',
  'Operador',
  'RH',
  'Colaborador',
  'Responsável',
]

function prioridadePerfilNome(nome: string | undefined): number {
  const i = ORDEM_EXIBICAO_PERFIL.indexOf(nome ?? '')
  return i === -1 ? 100 : i
}

function perfilMapPreferAdmin(
  rows: { usuario_id: string; perfil_id: string; perfis: { nome: string } | null }[]
): Map<string, { perfil_id: string; perfis: { nome: string } | null }> {
  const map = new Map<string, { perfil_id: string; perfis: { nome: string } | null }>()
  for (const p of rows) {
    const cur = map.get(p.usuario_id)
    const nome = p.perfis?.nome
    if (!cur || prioridadePerfilNome(nome) < prioridadePerfilNome(cur.perfis?.nome)) {
      map.set(p.usuario_id, { perfil_id: p.perfil_id, perfis: p.perfis })
    }
  }
  return map
}

/**
 * Listar papéis de um usuário (para admin editar na tela de usuários).
 */
export async function obterPapeisDoUsuarioAdmin(usuarioId: string): Promise<PapelUsuario[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('usuario_papeis')
    .select('papel')
    .eq('usuario_id', usuarioId)
  if (!data?.length) return []
  return data.map((r: { papel: PapelUsuario }) => r.papel).filter((p) => PAPEIS_VALIDOS.includes(p))
}

/**
 * Salvar papéis de um usuário. Substitui a lista atual.
 * Se incluir ADMIN, atualiza eh_admin e opcionalmente perfil/empresa/unidade/super_admin.
 * Se remover ADMIN, define eh_admin = false.
 * Apenas super_admin pode executar.
 */
export async function salvarPapeisDoUsuario(
  usuarioId: string,
  papeis: PapelUsuario[],
  dadosAdmin?: {
    super_admin?: boolean
    perfil_id?: string | null
    empresa_id?: string | null
    unidade_id?: string | null
  }
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: currentUser } = await supabase
    .from('usuarios')
    .select('super_admin')
    .eq('auth_user_id', user.id)
    .eq('super_admin', true)
    .single()
  if (!currentUser) return { ok: false, erro: 'Apenas super administradores podem alterar papéis' }

  const adminDb = createAdminClient()

  const validos = papeis.filter((p) => PAPEIS_VALIDOS.includes(p))

  const { error: delErr } = await supabase
    .from('usuario_papeis')
    .delete()
    .eq('usuario_id', usuarioId)
  if (delErr) return { ok: false, erro: delErr.message }

  if (validos.length > 0) {
    const rows = validos.map((papel) => ({ usuario_id: usuarioId, papel }))
    const { error: insErr } = await supabase.from('usuario_papeis').insert(rows)
    if (insErr) return { ok: false, erro: insErr.message }
  }

  const ehAdmin = validos.includes('ADMIN')
  const updateUsuarios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (ehAdmin && dadosAdmin) {
    if (dadosAdmin.super_admin !== undefined) updateUsuarios.super_admin = dadosAdmin.super_admin
    if (dadosAdmin.empresa_id !== undefined) updateUsuarios.empresa_id = dadosAdmin.empresa_id
    if (dadosAdmin.unidade_id !== undefined) updateUsuarios.unidade_id = dadosAdmin.unidade_id
  } else {
    if (!ehAdmin) updateUsuarios.super_admin = false
  }
  const { error: upErr } = await supabase.from('usuarios').update(updateUsuarios).eq('id', usuarioId)
  if (upErr) return { ok: false, erro: upErr.message }

  // Garantir que o cache de admin reflita o papel ADMIN.
  // O banco pode sincronizar `usuario_admin_cache` via triggers baseados em perfis (ex.: "Admin"/"Acesso total").
  // Como aqui podemos vincular perfis customizados (ex.: "PDV-Adm"), atualizamos o cache explicitamente.
  const { data: uRow, error: uErr } = await adminDb
    .from('usuarios')
    .select('auth_user_id')
    .eq('id', usuarioId)
    .maybeSingle()
  if (uErr) return { ok: false, erro: uErr.message }
  if (uRow?.auth_user_id) {
    const { error: cacheErr } = await adminDb
      .from('usuario_admin_cache')
      .upsert({ auth_user_id: uRow.auth_user_id, is_admin: ehAdmin }, { onConflict: 'auth_user_id' })
    if (cacheErr) return { ok: false, erro: cacheErr.message }
  }

  if (ehAdmin && dadosAdmin) {
    let perfilParaVincular: string | null
    if (dadosAdmin.perfil_id === null) {
      perfilParaVincular =
        (await obterPerfilAcessoTotalId(adminDb)) ?? (await obterPerfilAdminId(adminDb))
    } else if (dadosAdmin.perfil_id !== undefined) {
      perfilParaVincular = dadosAdmin.perfil_id
    } else {
      perfilParaVincular = (await obterPerfilAcessoTotalId(adminDb)) ?? (await obterPerfilAdminId(adminDb))
    }
    if (!perfilParaVincular) {
      return {
        ok: false,
        erro:
          'Não foi possível obter o ID do perfil no banco. Verifique se os perfis existem e se o service role está configurado.',
      }
    }
    await removerPerfisAdminDoUsuario(adminDb, usuarioId)
    const { error: upErrPerfil } = await adminDb.from('usuario_perfis').upsert(
      { usuario_id: usuarioId, perfil_id: perfilParaVincular },
      { onConflict: 'usuario_id,perfil_id' }
    )
    if (upErrPerfil) return { ok: false, erro: upErrPerfil.message }
  } else if (ehAdmin) {
    const perfilAdminId = await obterPerfilAdminId(adminDb)
    if (perfilAdminId) {
      const { error: upErrPerfil } = await adminDb.from('usuario_perfis').upsert(
        { usuario_id: usuarioId, perfil_id: perfilAdminId },
        { onConflict: 'usuario_id,perfil_id' }
      )
      if (upErrPerfil) return { ok: false, erro: upErrPerfil.message }
    }
  } else {
    await removerPerfisAdminDoUsuario(adminDb, usuarioId)
  }
  return { ok: true }
}

/**
 * Criar admin
 */
export async function criarAdmin(dados: z.infer<typeof adminSchema> & { senha?: string }) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const dadosValidados = adminSchema.parse(dados)

  // Criar usuário no auth
  let authUserId: string

  if (dados.senha) {
    const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
      email: dadosValidados.email,
      password: dados.senha,
      email_confirm: true,
    })

    if (userError) {
      console.error('Erro ao criar usuário auth:', userError)
      throw new Error('Erro ao criar usuário')
    }

    if (!newUser.user) {
      throw new Error('Usuário não foi criado')
    }

    authUserId = newUser.user.id
  } else {
    // Se não tem senha, buscar usuário existente
    const { data: users } = await adminClient.auth.admin.listUsers()
    const existingUser = users?.users.find(u => u.email === dadosValidados.email)

    if (!existingUser) {
      throw new Error('Usuário não encontrado. Informe uma senha para criar novo usuário.')
    }

    authUserId = existingUser.id
  }

  // Criar/atualizar registro na tabela usuarios
  const { data, error } = await supabase
    .from('usuarios')
    .upsert({
      auth_user_id: authUserId,
      nome: dadosValidados.nome,
      email: dadosValidados.email,
      empresa_id: dadosValidados.empresa_id || null,
      unidade_id: dadosValidados.unidade_id || null,
      ativo: dadosValidados.ativo,
    }, {
      onConflict: 'auth_user_id'
    })
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar admin:', error)
    if (dados.senha) await adminClient.auth.admin.deleteUser(authUserId)
    throw new Error('Erro ao criar admin')
  }
  const perfilAdminId = await obterPerfilAdminId(adminClient)
  if (data?.id && perfilAdminId) {
    await adminClient.from('usuario_perfis').upsert({ usuario_id: data.id, perfil_id: perfilAdminId }, { onConflict: 'usuario_id,perfil_id' })
  }
  return { ...data, email: dadosValidados.email }
}

/**
 * Atualizar admin
 */
export async function atualizarAdmin(id: string, dados: Partial<z.infer<typeof adminSchema>> & { senha?: string }) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: usuarioAtual } = await supabase
    .from('usuarios')
    .select('auth_user_id')
    .eq('id', id)
    .single()
  if (!usuarioAtual) throw new Error('Admin não encontrado')
  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', usuarioAtual.auth_user_id)
    .maybeSingle()
  if (!cache?.is_admin) throw new Error('Admin não encontrado')

  // Se tem senha, atualizar senha do usuário auth
  if (dados.senha && usuarioAtual.auth_user_id) {
    await adminClient.auth.admin.updateUserById(usuarioAtual.auth_user_id, {
      password: dados.senha,
    })
  }

  // Atualizar dados do usuario
  const dadosParaAtualizar: any = {}
  if (dados.nome) dadosParaAtualizar.nome = dados.nome
  if (dados.empresa_id !== undefined) dadosParaAtualizar.empresa_id = dados.empresa_id
  if (dados.unidade_id !== undefined) dadosParaAtualizar.unidade_id = dados.unidade_id
  if (dados.ativo !== undefined) dadosParaAtualizar.ativo = dados.ativo
  dadosParaAtualizar.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('usuarios')
    .update(dadosParaAtualizar)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar admin:', error)
    throw new Error('Erro ao atualizar admin')
  }

  return data
}

/**
 * Deletar admin
 */
export async function deletarAdmin(id: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('auth_user_id')
    .eq('id', id)
    .single()
  if (!usuario) throw new Error('Admin não encontrado')

  const { data: cache } = await supabase
    .from('usuario_admin_cache')
    .select('is_admin')
    .eq('auth_user_id', usuario.auth_user_id)
    .maybeSingle()
  const ehAdmin = !!cache?.is_admin

  if (ehAdmin) {
    const { data: vinculos } = await supabase
      .from('usuario_aluno')
      .select('id')
      .eq('usuario_id', id)
      .limit(1)
    if (vinculos && vinculos.length > 0) {
      await removerPerfisAdminDoUsuario(adminClient, id)
      await supabase.from('usuarios').update({ super_admin: false, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      // Não é responsável, pode deletar o registro
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Erro ao deletar admin:', error)
        throw new Error('Erro ao deletar admin')
      }

      // Deletar usuário auth (se existir)
      if (usuario.auth_user_id) {
        await adminClient.auth.admin.deleteUser(usuario.auth_user_id)
      }
    }
  }
}
