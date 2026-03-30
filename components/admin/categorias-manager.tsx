'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarCategoria, atualizarCategoria, deletarCategoria } from '@/app/actions/produtos-admin'
import type { Categoria } from '@/lib/types/database'

interface CategoriasManagerProps {
  empresaId: string
  categorias: Categoria[]
  onUpdate: () => void
}

type CategoriaCreatePayload = {
  ativo: boolean
  nome: string
  ordem: number
  descricao?: string
}

export function CategoriasManager({ empresaId, categorias, onUpdate }: CategoriasManagerProps) {
  const [novaCategoria, setNovaCategoria] = useState<CategoriaCreatePayload>({
    ativo: true,
    nome: '',
    descricao: '',
    ordem: 0,
  })
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCriar() {
    if (!novaCategoria.nome.trim()) return

    setLoading(true)
    try {
      const payload: CategoriaCreatePayload = {
        ativo: true,
        nome: novaCategoria.nome.trim(),
        ordem: Number.isFinite(novaCategoria.ordem) ? novaCategoria.ordem : 0,
        descricao: (novaCategoria.descricao || '').trim() ? (novaCategoria.descricao || '').trim() : undefined,
      }

      await criarCategoria(empresaId, payload)
      setNovaCategoria({ ativo: true, nome: '', descricao: '', ordem: 0 })
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar categoria')
    } finally {
      setLoading(false)
    }
  }

  async function handleAtualizar() {
    if (!editando) return

    setLoading(true)
    try {
      await atualizarCategoria(editando.id, {
        ativo: editando.ativo ?? true,
        nome: editando.nome,
        descricao: (editando.descricao || '').trim() ? (editando.descricao || '').trim() : undefined,
        ordem: editando.ordem,
      })
      setEditando(null)
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar categoria')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeletar(id: string) {
    if (!confirm('Tem certeza que deseja desativar esta categoria?')) return

    setLoading(true)
    try {
      await deletarCategoria(id)
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar categoria')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorias</CardTitle>
        <CardDescription>Gerencie as categorias de produtos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
          <div>
            <Label>Nome *</Label>
            <Input
              value={novaCategoria.nome}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })}
              placeholder="Nome da categoria"
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input
              value={novaCategoria.descricao || ''}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, descricao: e.target.value })}
              placeholder="Descrição"
            />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input
              type="number"
              value={novaCategoria.ordem}
              onChange={(e) => setNovaCategoria({ ...novaCategoria, ordem: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCriar} disabled={loading || !novaCategoria.nome.trim()}>
              Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {categorias.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg">
              {editando?.id === cat.id ? (
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <Input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                  <Input
                    value={editando.descricao || ''}
                    onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
                  />
                  <Input
                    type="number"
                    value={editando.ordem}
                    onChange={(e) => setEditando({ ...editando, ordem: parseInt(e.target.value) || 0 })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAtualizar} disabled={loading}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <div className="font-medium">{cat.nome}</div>
                    {cat.descricao && <div className="text-sm text-muted-foreground">{cat.descricao}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditando(cat)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeletar(cat.id)}>
                      Desativar
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
