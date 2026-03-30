/**
 * Cria o primeiro usuário super admin (admin@admin.com.br / admin123).
 * Execute: npx tsx scripts/criar-super-admin.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

const EMAIL = 'admin@admin.com.br'
const SENHA = 'De341401$'
const NOME = 'Super Admin'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key') {
  console.error('❌ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function criarSuperAdmin() {
  console.log('Criando super admin:', EMAIL)

  let authUserId: string | null = null

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
  })

  if (createError) {
    if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
      const { data: list } = await supabase.auth.admin.listUsers()
      const existing = list?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === EMAIL.toLowerCase())
      if (existing) {
        authUserId = existing.id
        console.log('Usuário auth já existe, atualizando senha...')
        const { error: updatePwErr } = await supabase.auth.admin.updateUserById(authUserId, { password: SENHA })
        if (updatePwErr) console.warn('Aviso ao atualizar senha:', updatePwErr.message)
        else console.log('Senha atualizada.')
      } else {
        console.error('Erro ao buscar usuário existente:', createError.message)
        process.exit(1)
      }
    } else {
      console.error('Erro ao criar usuário auth:', createError.message)
      process.exit(1)
    }
  } else if (created?.user?.id) {
    authUserId = created.user.id
    console.log('Usuário auth criado:', created.user.email)
  }

  if (!authUserId) {
    console.error('Nenhum auth_user_id disponível')
    process.exit(1)
  }

  // Verificar se já existe registro em usuarios para este auth_user_id
  const { data: usuarioExistente } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  let usuarioId: string

  if (usuarioExistente) {
    usuarioId = usuarioExistente.id
    await supabase
      .from('usuarios')
      .update({
        nome: NOME,
        email: EMAIL,
        super_admin: true,
        ativo: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usuarioId)
    console.log('Registro em usuarios atualizado:', usuarioId)
  } else {
    const { data: novoUsuario, error: insertErr } = await supabase
      .from('usuarios')
      .insert({
        auth_user_id: authUserId,
        nome: NOME,
        email: EMAIL,
        super_admin: true,
        ativo: true,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('Erro ao inserir em usuarios:', insertErr.message)
      process.exit(1)
    }
    usuarioId = novoUsuario!.id
    console.log('Registro em usuarios criado:', usuarioId)
  }

  // Perfil Admin para usuario_perfis (e cache de admin)
  const { data: perfilAdmin } = await supabase
    .from('perfis')
    .select('id')
    .eq('nome', 'Admin')
    .maybeSingle()

  if (perfilAdmin) {
    const { error: perfilErr } = await supabase
      .from('usuario_perfis')
      .upsert(
        { usuario_id: usuarioId, perfil_id: perfilAdmin.id },
        { onConflict: 'usuario_id,perfil_id' }
      )
    if (perfilErr) {
      console.warn('Aviso ao vincular perfil Admin (pode já existir):', perfilErr.message)
    } else {
      console.log('Perfil Admin vinculado (usuario_perfis)')
    }
  } else {
    // Fallback: perfil "Acesso total"
    const { data: acessoTotal } = await supabase
      .from('perfis')
      .select('id')
      .eq('nome', 'Acesso total')
      .maybeSingle()
    if (acessoTotal) {
      await supabase
        .from('usuario_perfis')
        .upsert(
          { usuario_id: usuarioId, perfil_id: acessoTotal.id },
          { onConflict: 'usuario_id,perfil_id' }
        )
      console.log('Perfil Acesso total vinculado')
    }
  }

  console.log('')
  console.log('Super admin criado com sucesso.')
  console.log('  Email:', EMAIL)
  console.log('  Senha:', SENHA)
  console.log('  Acesse o admin e faça login com essas credenciais.')
}

criarSuperAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
