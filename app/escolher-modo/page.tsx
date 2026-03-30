'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obterPapeisDoUsuario, definirPapelAtivo } from '@/app/actions/papeis'
import { CANTINA_PAPEIS, primeiraRotaPermitida } from '@/lib/cantina-papeis'
import type { PapelUsuario } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function EscolherModoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [papeis, setPapeis] = useState<PapelUsuario[]>([])

  useEffect(() => {
    verificar()
  }, [])

  async function verificar() {
    try {
      let lista = await obterPapeisDoUsuario()
      if (lista.length === 0) {
        await new Promise((r) => setTimeout(r, 1200))
        lista = await obterPapeisDoUsuario()
      }
      setPapeis(lista)
      setLoading(false)
      if (lista.length === 0) {
        router.replace('/login?message=session_nao_encontrada')
        return
      }
      if (lista.length === 1) {
        const { url } = await definirPapelAtivo(lista[0])
        router.replace(url)
        return
      }
    } catch (err) {
      console.error('Erro ao verificar papéis:', err)
      router.replace('/login?message=session_nao_encontrada')
    }
  }

  async function escolherPapel(papel: PapelUsuario) {
    const { url } = await definirPapelAtivo(papel)
    router.push(url)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (papeis.length <= 1) return null

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Cantina Escolar</h1>
        <p className="text-muted-foreground mb-8 text-center">
          Escolha com qual perfil deseja acessar:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {papeis.map((papel) => {
            const config = CANTINA_PAPEIS[papel]
            if (!config) return null // Proteção contra papéis inválidos
            return (
              <Card
                key={papel}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => escolherPapel(papel)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{config.icon}</span>
                    {config.label}
                  </CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Acessar</Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
