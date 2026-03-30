'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function ResetPasswordClient() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [pkceError, setPkceError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'pkce') {
      setPkceError(true)
      window.history.replaceState({}, '', '/auth/reset-password')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const supabase = createClient()
        // 1) Verificar hash da URL primeiro (Supabase pode passar tokens via hash)
        const hash = window.location.hash

        if (hash) {
          console.log('🔍 Hash encontrado na URL, processando...')
          const hashParams = new URLSearchParams(hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          const typeFromHash = hashParams.get('type')
          const hashToken = hashParams.get('token')

          if (accessToken && refreshToken) {
            console.log('✅ Tokens encontrados no hash, criando sessão...')

            const { data: { session }, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })

            if (cancelled) return

            if (sessionError) {
              console.error('❌ Erro ao criar sessão a partir do hash:', sessionError)
              setError('Erro ao processar link de recuperação. Solicite um novo link.')
              return
            }

            if (session) {
              console.log('✅ Sessão criada a partir do hash')
              setToken('session_active')
              // Limpar hash da URL
              window.history.replaceState({}, '', window.location.pathname + window.location.search)
              return
            }
          }

          if (hashToken && typeFromHash === 'recovery') {
            console.log('🔑 Token encontrado no hash da URL')
            if (!cancelled) setToken(hashToken)
            window.history.replaceState({}, '', window.location.pathname + window.location.search)
            return
          }
        }

        // 2) Verificar se há sessão ativa
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (session) {
          console.log('✅ Sessão encontrada, token já foi processado')
          setToken('session_active')
          return
        }

        // 3) Sem sessão: pegar token da query string via window.location.search
        const params = new URLSearchParams(window.location.search)
        const tokenParam = params.get('token')

        if (tokenParam) {
          console.log('🔑 Token encontrado na query string')
          setToken(tokenParam)
        } else {
          console.log('⚠️ Nenhum token encontrado e nenhuma sessão ativa')
          setError('Token inválido ou expirado. Solicite um novo link em "Primeiro Acesso".')
        }
      } catch (e: any) {
        console.error('Erro ao inicializar reset-password:', e)
        if (!cancelled) setError('Erro ao verificar link. Tente novamente.')
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!password || password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      // Verificar se há sessão ativa primeiro
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        console.log('✅ Sessão encontrada, atualizando senha...')
        const { error: updateError } = await supabase.auth.updateUser({ password })

        if (updateError) {
          console.error('❌ Erro ao atualizar senha:', updateError)
          throw updateError
        }

        console.log('✅ Senha atualizada com sucesso!')
        setSuccess(true)
        setTimeout(() => router.push('/login?message=senha_criada'), 2000)
        return
      }

      // Sem sessão: validar token
      if (!token || token === 'session_active') {
        throw new Error('Token inválido ou expirado. Solicite um novo link em "Primeiro Acesso".')
      }

      console.log('🔍 Verificando token de recuperação...')
      console.log('🔑 Token:', token.substring(0, 20) + '...')

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery',
      })

      if (verifyError) {
        console.error('❌ Erro ao verificar token:', verifyError)

        const msg = (verifyError.message || '').toLowerCase()
        if (
          msg.includes('token') ||
          msg.includes('expired') ||
          msg.includes('invalid') ||
          msg.includes('already been used') ||
          msg.includes('has already been used')
        ) {
          throw new Error('Token inválido ou expirado. Solicite um novo link em "Primeiro Acesso".')
        }

        throw verifyError
      }

      console.log('✅ Token verificado com sucesso')

      // Após verificar, atualizar senha
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        console.error('❌ Erro ao atualizar senha:', updateError)
        throw updateError
      }

      console.log('✅ Senha atualizada com sucesso!')
      setSuccess(true)
      setTimeout(() => router.push('/login?message=senha_criada'), 2000)
    } catch (err: any) {
      console.error('Erro ao resetar senha:', err)
      setError(err.message || 'Erro ao definir senha. O token pode ter expirado.')
    } finally {
      setLoading(false)
    }
  }

  // Erro PKCE: link aberto em outro navegador/contexto — pedir para abrir no mesmo ou solicitar novo link
  if (pkceError) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Abra o link no mesmo navegador</CardTitle>
            <CardDescription className="space-y-2">
              <p>O link de criar senha foi aberto em outro navegador ou aba (por exemplo, dentro do app de email). Por isso não foi possível continuar.</p>
              <p><strong>O que fazer:</strong></p>
              <ul className="list-disc list-inside text-left space-y-1 mt-2">
                <li>Abra o link no <strong>mesmo navegador</strong> onde você pediu o email (Chrome, Safari, etc.), ou</li>
                <li>Copie o link do email e cole na barra de endereço do navegador, ou</li>
                <li>Solicite um novo link abaixo e abra no navegador (não dentro do app de email).</li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/primeiro-acesso">
              <Button className="w-full">Solicitar novo link (Primeiro acesso)</Button>
            </Link>
            <Link href="/esqueci-senha">
              <Button variant="outline" className="w-full">Solicitar novo link (Esqueci minha senha)</Button>
            </Link>
            <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">
              ← Voltar para o login
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading inicial
  if (!token && !error) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verificando...</CardTitle>
            <CardDescription>Aguarde enquanto verificamos seu link.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Erro sem token válido
  if (error && (!token || token === 'session_active')) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Token Inválido</CardTitle>
            <CardDescription>{error || 'O link de recuperação é inválido ou expirou.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/primeiro-acesso">
              <Button className="w-full">Solicitar Novo Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Senha Criada com Sucesso!</CardTitle>
            <CardDescription>Redirecionando para o login...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center text-green-600">✅ Sua senha foi criada com sucesso!</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Criar Senha</CardTitle>
          <CardDescription>Defina sua senha de acesso ao portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Label htmlFor="password">Nova Senha *</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                disabled={loading}
                minLength={6}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A senha deve ter pelo menos 6 caracteres
              </p>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite a senha novamente"
                required
                disabled={loading}
                minLength={6}
                className="w-full"
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando senha...' : 'Criar Senha'}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                ← Voltar para o login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
