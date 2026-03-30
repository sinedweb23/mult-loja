import { redirect } from 'next/navigation'

/**
 * Rota para processar tokens de confirmação/recuperação do Supabase
 * GET /auth/confirm?token=...&type=recovery&redirect_to=...
 * 
 * Esta rota redireciona para a página de reset de senha
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const type = searchParams.get('type')
  const redirectTo = searchParams.get('redirect_to') || '/login'

  if (!token) {
    return redirect('/login?error=token_invalido')
  }

  // Para recovery, redirecionar para página de reset de senha
  if (type === 'recovery') {
    return redirect(`/auth/reset-password?token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(redirectTo)}`)
  }

  // Para outros tipos, redirecionar para login
  return redirect(redirectTo)
}
