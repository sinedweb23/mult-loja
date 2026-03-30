import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { obterPapeisPorUsuarioId } from '@/app/actions/papeis'
import { verificarAcessoPermitido } from '@/app/actions/configuracoes'

/**
 * Rota de callback do Supabase Auth
 * Esta rota intercepta o redirecionamento do Supabase após verificar o token
 * GET /auth/callback?code=...&type=recovery
 * OU
 * GET /auth/callback?token=...&type=recovery (quando Supabase redireciona diretamente)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const token = searchParams.get('token')
  const type = searchParams.get('type')
  const next = searchParams.get('next')
  const flow = searchParams.get('flow')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  console.log('🔍 Callback recebido:', { code: code ? 'existe' : 'não existe', token: token ? 'existe' : 'não existe', type, flow, error })

  // Se houver erro, redirecionar para login com mensagem (e error_code=pkce se for PKCE)
  if (error) {
    console.error('❌ Erro no callback do Supabase:', error, errorDescription)
    const msg = errorDescription || error
    const isPkce = /PKCE|code verifier|code_verifier/i.test(msg)
    const params = new URLSearchParams({ error: msg })
    if (isPkce) params.set('error_code', 'pkce')
    return redirect(`/login?${params.toString()}`)
  }

  const supabase = await createClient()

  // Se houver código, trocar por sessão (fluxo padrão do Supabase)
  if (code) {
    console.log('🔄 Trocando código por sessão...')
    const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('❌ Erro ao trocar código por sessão:', exchangeError)
      const isPkce = /PKCE|code verifier|code_verifier/i.test(exchangeError.message ?? '')
      if (isPkce && type === 'recovery') {
        return redirect('/auth/reset-password?error=pkce')
      }
      const params = new URLSearchParams({ error: exchangeError.message ?? 'Erro ao completar login' })
      if (isPkce) params.set('error_code', 'pkce')
      return redirect(`/login?${params.toString()}`)
    }

    if (!session?.user) {
      console.error('❌ Sessão não criada após trocar código')
      return redirect('/login?error=erro_ao_criar_sessao')
    }

    console.log('✅ Sessão criada com sucesso via código')

    const provider = session.user.app_metadata?.provider ?? session.user.identities?.[0]?.provider
    const hasGoogleIdentity = Array.isArray(session.user.identities) && session.user.identities.some((i: { provider?: string }) => i?.provider === 'google')
    const isGoogleFlow = flow === 'google' || provider === 'google' || hasGoogleIdentity

    // 1) Login com Google: tratar primeiro (nunca mandar para tela de criar senha)
    if (isGoogleFlow) {
      const email = session.user.email?.trim().toLowerCase()
      if (!email) {
        await supabase.auth.signOut()
        return redirect('/login?error=' + encodeURIComponent('Email não disponível. Use login com email e senha.'))
      }
      const admin = createAdminClient()
      const { data: usuario, error: errUsuario } = await admin
        .from('usuarios')
        .select('id, ativo, auth_user_id')
        .eq('email', email)
        .maybeSingle()
      if (errUsuario || !usuario) {
        await supabase.auth.signOut()
        return redirect('/login?error=' + encodeURIComponent('Apenas usuários cadastrados podem entrar com Google. Use seu email e senha ou solicite primeiro acesso.'))
      }
      if (!usuario.ativo) {
        await supabase.auth.signOut()
        return redirect('/login?error=' + encodeURIComponent('Sua conta está inativa. Entre em contato com a administração.'))
      }
      if (!usuario.auth_user_id) {
        await admin
          .from('usuarios')
          .update({ auth_user_id: session.user.id, updated_at: new Date().toISOString() })
          .eq('id', usuario.id)
      }
      const papeis = await obterPapeisPorUsuarioId(usuario.id)
      const permitido = await verificarAcessoPermitido(papeis)
      if (!permitido) {
        await supabase.auth.signOut()
        return redirect('/login?motivo=manutencao')
      }
      return redirect('/escolher-modo')
    }

    // 2) Fluxo de recuperação/criar senha (link do email): só quando type=recovery
    if (type === 'recovery') {
      return redirect(next || '/auth/reset-password')
    }

    // 2b) type vazio (retorno do Google pode não trazer flow na URL): se email está em usuarios, tratar como login
    // Nunca mandar para reset-password quando viemos de OAuth (code) e type não é recovery
    if (type === null && !isGoogleFlow) {
      const email = session.user.email?.trim().toLowerCase()
      if (email) {
        const admin = createAdminClient()
        const { data: usuario } = await admin.from('usuarios').select('id, ativo, auth_user_id').eq('email', email).maybeSingle()
        if (usuario?.ativo) {
          if (!usuario.auth_user_id) {
            await admin.from('usuarios').update({ auth_user_id: session.user.id, updated_at: new Date().toISOString() }).eq('id', usuario.id)
          }
          const papeis = await obterPapeisPorUsuarioId(usuario.id)
          const permitido = await verificarAcessoPermitido(papeis)
          if (!permitido) {
            await supabase.auth.signOut()
            return redirect('/login?motivo=manutencao')
          }
          return redirect('/escolher-modo')
        }
      }
      await supabase.auth.signOut()
      return redirect('/login?error=' + encodeURIComponent('Conta não cadastrada ou inativa. Use email/senha ou solicite primeiro acesso.'))
    }

    const email = session.user.email?.trim().toLowerCase()
    if (email) {
      const admin = createAdminClient()
      const { data: usuario } = await admin.from('usuarios').select('id, ativo').eq('email', email).maybeSingle()
      if (usuario?.ativo) {
        const papeis = await obterPapeisPorUsuarioId(usuario.id)
        const permitido = await verificarAcessoPermitido(papeis)
        if (!permitido) {
          await supabase.auth.signOut()
          return redirect('/login?motivo=manutencao')
        }
      }
    }
    return redirect('/escolher-modo')
  }

  // Verificar se já há sessão ativa (token pode ter sido processado pelo Supabase antes do redirect)
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session) {
    console.log('✅ Sessão já existe, redirecionando para reset de senha')
    if (type === 'recovery') {
      return redirect(next || '/auth/reset-password')
    }
    return redirect('/login')
  }

  // Se não houver código mas houver token, processar token diretamente
  if (token && type === 'recovery') {
    console.log('🔄 Processando token diretamente...')
    
    try {
      // Tentar verificar o token diretamente
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery',
      })

      if (verifyError) {
        console.error('❌ Erro ao verificar token:', verifyError)
        return redirect('/login?error=token_invalido_ou_expirado')
      }

      if (verifyData?.session) {
        console.log('✅ Token verificado e sessão criada, redirecionando para reset de senha')
        return redirect('/auth/reset-password')
      }

      // Se não criou sessão, verificar novamente
      const { data: { session: newSession } } = await supabase.auth.getSession()
      if (newSession) {
        console.log('✅ Sessão criada após verificação, redirecionando para reset de senha')
        return redirect('/auth/reset-password')
      }

      console.error('❌ Token verificado mas sessão não foi criada')
      return redirect('/login?error=erro_ao_criar_sessao')
    } catch (err: any) {
      console.error('❌ Erro ao processar token:', err)
      return redirect(`/login?error=${encodeURIComponent(err.message || 'erro_ao_processar_token')}`)
    }
  }

  // Se não houver código nem token, o Supabase pode ter processado o token
  // e redirecionado sem passar código/token na URL
  // Neste caso, redirecionar para reset de senha que verifica a sessão e processa hash
  // A página de reset é client-side e pode processar o hash da URL
  console.log('🔄 Sem código/token no callback, redirecionando para reset de senha (processará hash se houver)')
  return redirect('/auth/reset-password')
}
