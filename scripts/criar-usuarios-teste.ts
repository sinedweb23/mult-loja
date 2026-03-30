import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Carregar variáveis de ambiente do .env.local
config({ path: resolve(process.cwd(), '.env.local') })

// Verificar se as variáveis estão carregadas
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL não encontrada no .env.local')
  process.exit(1)
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key') {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local')
  console.error('   Obtenha a chave em: https://supabase.com/dashboard/project/jznhaioobvjwjdmigxja/settings/api')
  process.exit(1)
}

// Criar cliente admin diretamente
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function criarUsuariosTeste() {

  console.log('🚀 Criando usuários de teste...\n')

  // 1. Criar usuário ADMIN
  console.log('1. Criando usuário ADMIN...')
  let adminUserId: string | null = null
  
  const { data: adminUser, error: adminUserError } = await supabase.auth.admin.createUser({
    email: 'admin@teste.com',
    password: 'admin123',
    email_confirm: true,
  })

  if (adminUserError) {
    // Se o usuário já existe, buscar ele
    if (adminUserError.message.includes('already registered')) {
      console.log('⚠️  Usuário admin já existe, buscando...')
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find(u => u.email === 'admin@teste.com')
      if (existingUser) {
        adminUserId = existingUser.id
        console.log('✅ Usuário admin encontrado:', existingUser.email)
      } else {
        console.error('❌ Erro ao criar/buscar usuário admin:', adminUserError.message)
        return
      }
    } else {
      console.error('❌ Erro ao criar usuário admin:', adminUserError.message)
      return
    }
  } else {
    adminUserId = adminUser.user.id
    console.log('✅ Usuário admin criado:', adminUser.user.email)
  }

  // 2. Obter empresa de teste
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .limit(1)
    .single()

  if (!empresa) {
    console.error('❌ Empresa não encontrada. Execute a migration primeiro.')
    return
  }

  // 3. Criar/atualizar registro na tabela admins
  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .upsert({
      auth_user_id: adminUserId!,
      nome: 'Admin Teste',
      empresa_id: empresa.id,
      ativo: true,
    }, {
      onConflict: 'auth_user_id'
    })
    .select()
    .single()

  if (adminError) {
    console.error('❌ Erro ao criar/atualizar registro admin:', adminError.message)
    return
  }

  console.log('✅ Registro admin criado/atualizado na tabela admins\n')

  // 4. Criar usuário RESPONSÁVEL
  console.log('2. Criando usuário RESPONSÁVEL...')
  let responsavelUserId: string | null = null
  
  const { data: responsavelUser, error: responsavelUserError } = await supabase.auth.admin.createUser({
    email: 'responsavel@teste.com',
    password: 'resp123',
    email_confirm: true,
  })

  if (responsavelUserError) {
    // Se o usuário já existe, buscar ele
    if (responsavelUserError.message.includes('already registered')) {
      console.log('⚠️  Usuário responsável já existe, buscando...')
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find(u => u.email === 'responsavel@teste.com')
      if (existingUser) {
        responsavelUserId = existingUser.id
        console.log('✅ Usuário responsável encontrado:', existingUser.email)
      } else {
        console.error('❌ Erro ao criar/buscar usuário responsável:', responsavelUserError.message)
        return
      }
    } else {
      console.error('❌ Erro ao criar usuário responsável:', responsavelUserError.message)
      return
    }
  } else {
    responsavelUserId = responsavelUser.user.id
    console.log('✅ Usuário responsável criado:', responsavelUser.user.email)
  }

  // 5. Criar/atualizar registro na tabela responsaveis
  const { data: responsavel, error: responsavelError } = await supabase
    .from('responsaveis')
    .upsert({
      auth_user_id: responsavelUserId!,
      tipo: 'AMBOS',
      nome_financeiro: 'Responsável Financeiro Teste',
      cpf_financeiro: '12345678900',
      email_financeiro: 'responsavel@teste.com',
      nome_pedagogico: 'Responsável Pedagógico Teste',
      cpf_pedagogico: '12345678900',
      email_pedagogico: 'responsavel@teste.com',
    }, {
      onConflict: 'auth_user_id'
    })
    .select()
    .single()

  if (responsavelError) {
    console.error('❌ Erro ao criar/atualizar registro responsável:', responsavelError.message)
    return
  }

  console.log('✅ Registro responsável criado/atualizado na tabela responsaveis\n')

  console.log('='.repeat(50))
  console.log('✅ USUÁRIOS CRIADOS COM SUCESSO!')
  console.log('='.repeat(50))
  console.log('\n📧 ADMIN:')
  console.log('   Email: admin@teste.com')
  console.log('   Senha: admin123')
  console.log('   URL: http://localhost:3000/admin')
  console.log('\n📧 RESPONSÁVEL:')
  console.log('   Email: responsavel@teste.com')
  console.log('   Senha: resp123')
  console.log('   URL: http://localhost:3000/loja')
  console.log('\n')
}

criarUsuariosTeste()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error)
    process.exit(1)
  })
