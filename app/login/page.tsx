'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { obterPapeisDoUsuario, definirPapelAtivo } from '@/app/actions/papeis'
import { obterConfiguracaoAparencia, verificarAcessoPermitido } from '@/app/actions/configuracoes'
import { primeiraRotaPermitida } from '@/lib/cantina-papeis'
import { getAuthCallbackUrl } from '@/lib/auth-origin'
import Link from 'next/link'

const SITE_INSTITUCIONAL_URL = 'https://info.eatsimple.com.br'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [config, setConfig] = useState<{ loja_nome: string; loja_logo_url: string }>({ loja_nome: '', loja_logo_url: '' })
  const [logoErro, setLogoErro] = useState(false)
  const [acessoIndisponivel, setAcessoIndisponivel] = useState(false)
  const router = useRouter()

  useEffect(() => {
    obterConfiguracaoAparencia()
      .then((c) => {
        setConfig({
          loja_nome: (c?.loja_nome || '').trim() || 'Cantina Escolar',
          loja_logo_url: (c?.loja_logo_url || '').trim(),
        })
        setLogoErro(false)
      })
      .catch(() => {
        setConfig((prev) => ({ ...prev, loja_nome: 'Cantina Escolar' }))
      })
  }, [])

  // Verificar mensagem ou erro na URL (incl. erro PKCE para fallback UX)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlMessage = urlParams.get('message')
    const urlError = urlParams.get('error')
    const errorCode = urlParams.get('error_code')
    const motivo = urlParams.get('motivo')
    if (motivo === 'manutencao') {
      setAcessoIndisponivel(true)
    }
    if (urlMessage === 'senha_criada' || urlMessage === 'senha_atualizada') {
      setMessage('Senha criada/atualizada com sucesso! Faça login com sua nova senha.')
    }
    if (urlMessage === 'session_nao_encontrada') {
      setMessage('Não foi possível manter a sessão. Tente fazer login novamente. Se o problema continuar no celular, use o modo anônimo do navegador ou limpe os dados do site.')
    }
    if (urlError) {
      const decoded = decodeURIComponent(urlError)
      const isPkce = errorCode === 'pkce' || /PKCE|code verifier|code_verifier/i.test(decoded)
      setError(isPkce ? 'pkce_fallback' : decoded)
    }
    if (errorCode === 'pkce' && !urlError) {
      setError('pkce_fallback')
    }
    window.history.replaceState({}, '', '/login')
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validação básica
    if (!email || !email.trim()) {
      setError('Por favor, informe o email')
      setLoading(false)
      return
    }

    if (!password || !password.trim()) {
      setError('Por favor, informe a senha')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      console.log('Tentando fazer login com email:', email)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (authError) {
        console.error('Erro de autenticação:', authError)
        throw new Error(authError.message || 'Credenciais inválidas')
      }

      if (!authData.user) {
        throw new Error('Falha ao fazer login')
      }

      console.log('Login bem-sucedido, usuário:', authData.user.id)
      
      // Aguardar um pouco para garantir que os cookies sejam salvos
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Verificar a sessão
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('Sessão final após login:', session ? 'existe' : 'não existe', sessionError)
      
      if (!session) {
        throw new Error('Sessão não estabelecida após login')
      }

      // Verificar se é admin ou responsável
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Usuário não encontrado na sessão')
      }

      // Buscar usuário na tabela usuarios (colunas unificadas; admin vem de usuario_admin_cache)
      console.log('[Login] Buscando usuário com auth_user_id:', user.id)
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('id, ativo, super_admin, nome, email')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      console.log('[Login] Resultado da busca:', { usuario, usuarioError })

      if (usuarioError) {
        console.error('[Login] Erro completo ao buscar usuário:', {
          message: usuarioError.message,
          details: usuarioError.details,
          hint: usuarioError.hint,
          code: usuarioError.code
        })
        throw new Error(`Erro ao verificar permissões: ${usuarioError.message || 'Erro desconhecido'}`)
      }

      if (!usuario) {
        console.error('[Login] Usuário não encontrado na tabela usuarios para auth_user_id:', user.id)
        throw new Error('Usuário não encontrado no sistema. Entre em contato com o suporte.')
      }

      // Admin: vem do cache (usuario_perfis → sync)
      const { data: cache } = await supabase
        .from('usuario_admin_cache')
        .select('is_admin')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      const eh_admin = !!cache?.is_admin

      console.log('[Login] Usuário encontrado:', {
        id: usuario.id,
        nome: usuario.nome,
        eh_admin,
        super_admin: usuario.super_admin,
        ativo: usuario.ativo
      })

      if (!usuario.ativo) {
        throw new Error('Sua conta está inativa. Entre em contato com a administração.')
      }

      const papeis = await obterPapeisDoUsuario()
      if (papeis.length === 0) {
        throw new Error('Usuário sem permissões. Entre em contato com a administração.')
      }

      const permitido = await verificarAcessoPermitido(papeis)
      if (!permitido) {
        await supabase.auth.signOut()
        setAcessoIndisponivel(true)
        setLoading(false)
        return
      }

      if (papeis.length === 1) {
        const { url } = await definirPapelAtivo(papeis[0])
        await new Promise((r) => setTimeout(r, 300))
        window.location.href = url
      } else {
        await new Promise((r) => setTimeout(r, 300))
        window.location.href = '/escolher-modo'
      }
    } catch (err) {
      console.error('Erro completo:', err)
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao fazer login'
      setError(errorMessage)
      setLoading(false)
    }
  }

  async function handleLoginGoogle() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const redirectTo = `${getAuthCallbackUrl()}?flow=google`
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      })
      if (oauthError) throw oauthError
      // Redirecionamento na mesma aba (nunca popup) — evita PKCE code verifier em outro contexto
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar com Google')
      setLoading(false)
    }
  }

  const nomeLoja = config.loja_nome || 'Cantina Escolar'
  const logoUrl = config.loja_logo_url

  if (acessoIndisponivel) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-50 to-slate-100">
        <Card className="w-full max-w-md shadow-xl border-0 overflow-hidden bg-white/95">
          <CardContent className="pt-10 pb-10 px-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-800 mb-2">
              Plataforma em manutenção
            </h1>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Estamos trabalhando para melhor atender você. O acesso ao seu perfil está temporariamente indisponível.
              <br /><br />
              Em caso de dúvidas, entre em contato com a administração da instituição.
            </p>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setAcessoIndisponivel(false)}
            >
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F5F7FB]">
      <div className="w-full max-w-md mx-auto">
        {/* Card de Login */}
        <Card className="w-full shadow-lg border-0 overflow-hidden bg-white flex flex-col">
        <CardHeader className="text-center pb-1 pt-8">
          {/* Logo: eat. */}
          <div className="mb-5">
            {logoUrl && !logoErro ? (
              <img
                src={logoUrl}
                alt="eat."
                className="h-20 w-auto object-contain mx-auto"
                onError={() => setLogoErro(true)}
              />
            ) : (
              <span className="text-4xl font-semibold tracking-tight text-slate-800">eat.</span>
            )}
          </div>
         
          {/* Texto menor: chamada para login */}
          <CardDescription className="mt-1 text-slate-500">
            Faça login para acessar
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 pb-6 px-8">
          {message && (
            <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm mb-4">
              {message}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 border-2 border-gray-200 hover:bg-gray-50 hover:border-gray-300 font-medium text-gray-700 rounded-xl flex items-center justify-center gap-3"
            disabled={loading}
            onClick={handleLoginGoogle}
          >
            <GoogleIcon className="w-6 h-6 shrink-0" />
            {loading ? 'Redirecionando...' : 'Entrar com Google'}
          </Button>

          <div className="relative my-5">
            <span className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </span>
            <span className="relative flex justify-center text-xs font-medium  tracking-wide text-gray-500 bg-white px-2">
             É obrigatório utilizar o mesmo e-mail cadastrado na escola.
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1 text-gray-700">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B5ED7]/20 focus:border-[#0B5ED7] outline-none"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1 text-gray-700">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0B5ED7]/20 focus:border-[#0B5ED7] outline-none"
                disabled={loading}
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm space-y-2">
                {error === 'pkce_fallback' ? (
                  <>
                    <p className="font-medium">Link aberto em outro navegador ou aba</p>
                    <p className="text-red-600">
                      Para evitar esse erro, abra o link de login ou de redefinição de senha no navegador padrão do celular (Chrome, Safari etc.), e não dentro do app de e-mail.
                    </p>
                    <p className="text-red-600">
                      Clique em &quot;Tentar novamente&quot; e faça o login ou use o link de redefinição no navegador padrão.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => { setError(null); setLoading(false) }}
                    >
                      Tentar novamente
                    </Button>
                  </>
                ) : (
                  error
                )}
              </div>
            )}
            <div className="flex justify-between items-center">
              <Link
                href="/primeiro-acesso"
                className="text-sm text-gray-600 hover:text-[#0B5ED7] hover:underline"
              >
                Esqueci minha senha
              </Link>
              <Link
                href="/primeiro-acesso"
                className="text-sm text-gray-600 hover:text-[#0B5ED7] hover:underline"
              >
                Primeiro acesso
              </Link>
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl bg-[#0B5ED7] hover:bg-[#0a58c9]" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar com email e senha'}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
            <p className="text-sm font-medium text-slate-700 flex items-center justify-center gap-2">
              <span aria-hidden>🔎</span>
              Saiba mais sobre a Eat Simple
            </p>
            <a
              href={SITE_INSTITUCIONAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl border-2 border-gray-200 hover:bg-gray-50 hover:border-[#0B5ED7] text-[#0B5ED7] font-medium"
              >
                Acessar o site institucional
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
