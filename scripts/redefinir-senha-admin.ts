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
  process.exit(1)
}

async function redefinirSenhaAdmin() {
  const email = 'denis.souza@morumbisul.com.br'
  const novaSenha = 'admin123'

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

  console.log(`🔄 Redefinindo senha para ${email}...`)

  // Buscar usuário pelo email
  const { data: users } = await supabase.auth.admin.listUsers()
  const user = users?.users.find(u => u.email === email)

  if (!user) {
    console.error('❌ Usuário não encontrado')
    process.exit(1)
  }

  console.log(`✅ Usuário encontrado: ${user.id}`)

  // Atualizar senha
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      password: novaSenha,
    }
  )

  if (updateError) {
    console.error('❌ Erro ao atualizar senha:', updateError)
    process.exit(1)
  }

  console.log('✅ Senha atualizada com sucesso!')
  console.log(`\n📧 Email: ${email}`)
  console.log(`🔑 Senha: ${novaSenha}`)
  console.log(`\n🌐 Acesse: http://localhost:3000/login`)
}

redefinirSenhaAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error)
    process.exit(1)
  })
