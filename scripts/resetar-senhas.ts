import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_service_role_key') {
  console.error('❌ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

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

async function resetarSenhas() {
  console.log('🔐 Resetando senhas dos usuários...\n')

  // 1. Resetar senha do ADMIN
  console.log('1. Resetando senha do ADMIN...')
  const { data: adminUsers } = await supabase.auth.admin.listUsers()
  const adminUser = adminUsers?.users.find(u => u.email === 'admin@teste.com')

  if (adminUser) {
    const { error: adminError } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      { password: 'admin123' }
    )

    if (adminError) {
      console.error('❌ Erro ao resetar senha admin:', adminError.message)
    } else {
      console.log('✅ Senha do admin resetada: admin123')
    }
  } else {
    console.log('⚠️  Usuário admin não encontrado')
  }

  // 2. Resetar senha do RESPONSÁVEL
  console.log('\n2. Resetando senha do RESPONSÁVEL...')
  const responsavelUser = adminUsers?.users.find(u => u.email === 'responsavel@teste.com')

  if (responsavelUser) {
    const { error: respError } = await supabase.auth.admin.updateUserById(
      responsavelUser.id,
      { password: 'resp123' }
    )

    if (respError) {
      console.error('❌ Erro ao resetar senha responsável:', respError.message)
    } else {
      console.log('✅ Senha do responsável resetada: resp123')
    }
  } else {
    console.log('⚠️  Usuário responsável não encontrado')
  }

  console.log('\n' + '='.repeat(50))
  console.log('✅ SENHAS RESETADAS!')
  console.log('='.repeat(50))
  console.log('\n📧 ADMIN:')
  console.log('   Email: admin@teste.com')
  console.log('   Senha: admin123')
  console.log('\n📧 RESPONSÁVEL:')
  console.log('   Email: responsavel@teste.com')
  console.log('   Senha: resp123')
  console.log('\n')
}

resetarSenhas()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error)
    process.exit(1)
  })
