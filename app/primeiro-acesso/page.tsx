'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { solicitarPrimeiroAcesso } from '@/app/actions/responsavel-auth'
import Link from 'next/link'

export default function PrimeiroAcessoPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const emailNorm = email.trim().toLowerCase()
    const cpfNorm = cpf.trim()

    if (!emailNorm) {
      setError('Por favor, informe o email')
      setLoading(false)
      return
    }

    if (!cpfNorm) {
      setError('Por favor, informe o CPF')
      setLoading(false)
      return
    }

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
      const resultado = await solicitarPrimeiroAcesso(emailNorm, cpfNorm, password)
      if (!resultado?.success) {
        setError(resultado?.message || 'Não foi possível concluir o primeiro acesso.')
        setLoading(false)
        return
      }

      setSuccess(
        resultado.message ||
          'Senha criada com sucesso. Redirecionando para o login...'
      )
      setEmail('')
      setCpf('')
      setPassword('')
      setConfirmPassword('')

      // Pequeno delay para o usuário ver a mensagem antes de ir para o login
      setTimeout(() => {
        router.push('/login?message=senha_criada')
      }, 1500)
    } catch (err) {
      console.error('Erro ao solicitar primeiro acesso:', err)
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Primeiro acesso</CardTitle>
          
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSolicitar} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                disabled={loading}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Informe o email cadastrado na escola
              </p>
            </div>

            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={cpf}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 11)
                  setCpf(onlyDigits)
                }}
                placeholder="Somente números"
                required
                disabled={loading}
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                disabled={loading}
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
                disabled={loading}
                className="w-full"
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 rounded-md text-sm">
                {success}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando acesso...' : 'Criar acesso'}
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
