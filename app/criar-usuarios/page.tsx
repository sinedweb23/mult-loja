'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function CriarUsuariosPage() {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function criarUsuarios() {
    setLoading(true)
    setError(null)
    setResultado(null)

    try {
      const response = await fetch('/api/criar-usuarios-teste', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar usuários')
      }

      setResultado(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Criar Usuários de Teste</CardTitle>
          <CardDescription>
            Cria um usuário admin e um responsável para testes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={criarUsuarios} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Criando...' : 'Criar Usuários'}
          </Button>

          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-md">
              <strong>Erro:</strong> {error}
            </div>
          )}

          {resultado && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-md">
                <h3 className="font-bold mb-2">✅ Usuários criados com sucesso!</h3>
                
                <div className="mt-4 space-y-3">
                  <div className="border-l-4 border-blue-500 pl-3">
                    <p className="font-semibold">👤 ADMIN</p>
                    <p>Email: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{resultado.usuarios.admin.email}</code></p>
                    <p>Senha: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{resultado.usuarios.admin.senha}</code></p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <a href={resultado.usuarios.admin.url} className="text-blue-600 hover:underline">
                        {resultado.usuarios.admin.url}
                      </a>
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-3">
                    <p className="font-semibold">👤 RESPONSÁVEL</p>
                    <p>Email: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{resultado.usuarios.responsavel.email}</code></p>
                    <p>Senha: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{resultado.usuarios.responsavel.senha}</code></p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <a href={resultado.usuarios.responsavel.url} className="text-blue-600 hover:underline">
                        {resultado.usuarios.responsavel.url}
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
            <strong>⚠️ Importante:</strong> Certifique-se de que a <code>SUPABASE_SERVICE_ROLE_KEY</code> está configurada no arquivo <code>.env.local</code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
