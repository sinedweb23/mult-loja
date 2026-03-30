'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { solicitarRecuperarSenha } from '@/app/actions/responsavel-auth'
import Link from 'next/link'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!email || !email.trim()) {
      setError('Por favor, informe o email')
      setLoading(false)
      return
    }

    try {
      const resultado = await solicitarRecuperarSenha(email)
      if (!resultado.success || !resultado.redirectTo) {
        setSuccess(resultado.message ?? 'Verifique seu email.')
        setEmail('')
        setLoading(false)
        return
      }

      const supabase = createClient()
      const redirectTo = `${resultado.redirectTo}?type=recovery&next=/auth/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      })

      if (resetError) {
        setError(resetError.message || 'Erro ao enviar email. Tente novamente.')
        setLoading(false)
        return
      }

      setSuccess((resultado.message ?? 'Verifique seu email e o spam.') + ' Abra o link no mesmo navegador (Chrome, Safari) ou copie e cole na barra de endereço — não abra pelo app de email.')
      setEmail('')
    } catch (err) {
      console.error('Erro ao solicitar recuperação:', err)
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Esqueci minha senha</CardTitle>
          <CardDescription>
            Informe o email da sua conta para receber o link e redefinir sua senha.
          </CardDescription>
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
                Use o email com o qual você já fez login anteriormente.
              </p>
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
              {loading ? 'Enviando...' : 'Enviar link para redefinir senha'}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                ← Voltar para o login
              </Link>
            </div>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-md">
            
            <p className="text-xs text-muted-foreground mt-2">
              Nunca logou? Use <Link href="/primeiro-acesso" className="underline">Primeiro acesso</Link> para criar sua senha.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
