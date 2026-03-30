'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listarPerfis, criarPerfil, atualizarPerfil, excluirPerfil, type PerfilComPermissoes } from '@/app/actions/perfis'
import { RECURSOS_ADMIN } from '@/lib/admin-recursos'
import Link from 'next/link'

export default function PerfisAdminPage() {
  const [perfis, setPerfis] = useState<PerfilComPermissoes[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<PerfilComPermissoes | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    ativo: true,
    recursos: [] as string[],
  })

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    try {
      setLoading(true)
      setError(null)
      const data = await listarPerfis()
      setPerfis(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfis')
    } finally {
      setLoading(false)
    }
  }

  function abrirNovo() {
    setEditando(null)
    setForm({
      nome: '',
      descricao: '',
      ativo: true,
      recursos: [],
    })
    setModalAberto(true)
  }

  function abrirEditar(perfil: PerfilComPermissoes) {
    setEditando(perfil)
    setForm({
      nome: perfil.nome,
      descricao: perfil.descricao || '',
      ativo: perfil.ativo,
      recursos: [...perfil.permissoes],
    })
    setModalAberto(true)
  }

  function toggleRecurso(recurso: string) {
    setForm((prev) => ({
      ...prev,
      recursos: prev.recursos.includes(recurso)
        ? prev.recursos.filter((r) => r !== recurso)
        : [...prev.recursos, recurso],
    }))
  }

  function marcarTodos() {
    const todos = RECURSOS_ADMIN.map((r) => r.recurso)
    setForm((prev) => ({
      ...prev,
      recursos: prev.recursos.length === todos.length ? [] : todos,
    }))
  }

  async function handleSalvar() {
    const nome = form.nome.trim()
    if (!nome) {
      setError('Nome do perfil é obrigatório')
      return
    }
    setError(null)
    setSalvando(true)
    try {
      const res = editando
        ? await atualizarPerfil(editando.id, {
            nome,
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
            recursos: form.recursos,
          })
        : await criarPerfil({
            nome,
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
            recursos: form.recursos,
          })
      if (!res.success) {
        setError(res.error)
        return
      }
      setModalAberto(false)
      carregar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(perfil: PerfilComPermissoes) {
    if (!confirm(`Excluir o perfil "${perfil.nome}"? Usuários com este perfil passarão a ter acesso total.`)) return
    setError(null)
    const res = await excluirPerfil(perfil.id)
    if (!res.success) {
      setError(res.error)
      return
    }
    carregar()
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Perfis de acesso</h1>
          <p className="text-muted-foreground">
            Crie perfis e defina quais páginas cada um pode acessar. Depois atribua um perfil aos usuários em Usuários.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline">Voltar</Button>
          </Link>
          <Button onClick={abrirNovo}>Novo perfil</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {perfis.map((perfil) => (
          <Card key={perfil.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{perfil.nome}</span>
                {!perfil.ativo && (
                  <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">Inativo</span>
                )}
              </CardTitle>
              <CardDescription>
                {perfil.descricao || 'Sem descrição'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {perfil.permissoes.length} página(s) permitida(s)
              </p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => abrirEditar(perfil)} className="flex-1">
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleExcluir(perfil)}
                  disabled={perfil.nome === 'Acesso total'}
                >
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {perfis.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhum perfil cadastrado. Crie um perfil para definir acessos por página.
          </CardContent>
        </Card>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar perfil' : 'Novo perfil'}</DialogTitle>
            <DialogDescription>
              Defina o nome e quais páginas do painel este perfil pode acessar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Operador de pedidos"
              />
            </div>
            <div>
              <Label htmlFor="descricao">Descrição (opcional)</Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex: Acesso apenas a pedidos"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="ativo"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="ativo" className="cursor-pointer">Perfil ativo</Label>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Páginas que este perfil pode acessar</Label>
                <Button type="button" variant="ghost" size="sm" onClick={marcarTodos}>
                  {form.recursos.length === RECURSOS_ADMIN.length ? 'Desmarcar todas' : 'Marcar todas'}
                </Button>
              </div>
              <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                {RECURSOS_ADMIN.map((item) => (
                  <label key={item.recurso} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.recursos.includes(item.recurso)}
                      onChange={() => toggleRecurso(item.recurso)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
