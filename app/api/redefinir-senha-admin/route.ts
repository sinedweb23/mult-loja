import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API para redefinir senha de admin (apenas para desenvolvimento/testes)
 * POST /api/redefinir-senha-admin
 * Body: { email: string, novaSenha: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, novaSenha } = body

    if (!email || !novaSenha) {
      return NextResponse.json(
        { error: 'Email e novaSenha são obrigatórios' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Buscar usuário pelo email
    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users?.users.find(u => u.email === email)

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    // Atualizar senha
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        password: novaSenha,
      }
    )

    if (updateError) {
      console.error('Erro ao atualizar senha:', updateError)
      return NextResponse.json(
        { error: `Erro ao atualizar senha: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Senha atualizada com sucesso para ${email}`,
      email: email,
    })
  } catch (error: any) {
    console.error('Erro ao redefinir senha:', error)
    return NextResponse.json(
      { error: error.message || 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
