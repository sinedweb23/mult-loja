'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  listarEmpresas,
  criarEmpresa,
  atualizarEmpresa,
  deletarEmpresa,
  listarUnidades,
  criarUnidade,
  atualizarUnidade,
  deletarUnidade,
} from '@/app/actions/empresas'
import Link from 'next/link'

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  tenant_id: string | null
  created_at: string
  updated_at: string
}

interface Unidade {
  id: string
  nome: string
  empresa_id: string
  created_at: string
  updated_at: string
}

type UnidadesPorEmpresa = Record<string, Unidade[]>

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal empresa
  const [showEmpresaModal, setShowEmpresaModal] = useState(false)
  const [empresaEditando, setEmpresaEditando] = useState<Empresa | null>(null)
  const [empresaForm, setEmpresaForm] = useState({ nome: '', cnpj: '' })

  // Modal unidade
  const [showUnidadeModal, setShowUnidadeModal] = useState(false)
  const [unidadeEditando, setUnidadeEditando] = useState<Unidade | null>(null)
  const [unidadeForm, setUnidadeForm] = useState({ nome: '', empresa_id: '' })
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null)

  const [unidades, setUnidades] = useState<UnidadesPorEmpresa>({})

  useEffect(() => {
    carregarEmpresas()
  }, [])

  async function carregarEmpresas() {
    try {
      setLoading(true)
      setError(null)
      const dados = await listarEmpresas()
      setEmpresas(dados)
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar empresas')
    } finally {
      setLoading(false)
    }
  }

  async function carregarUnidades(empresaId: string) {
    try {
      const dados = await listarUnidades(empresaId)
      setUnidades((prev) => ({ ...prev, [empresaId]: dados }))
    } catch (err) {
      console.error('Erro ao carregar unidades:', err)
    }
  }

  useEffect(() => {
    if (empresas.length > 0) {
      empresas.forEach((empresa) => {
        carregarUnidades(empresa.id)
      })
    }
  }, [empresas])

  function handleNovaEmpresa() {
    setEmpresaEditando(null)
    setEmpresaForm({ nome: '', cnpj: '' })
    setShowEmpresaModal(true)
  }

  function handleEditarEmpresa(empresa: Empresa) {
    setEmpresaEditando(empresa)
    setEmpresaForm({ nome: empresa.nome, cnpj: empresa.cnpj || '' })
    setShowEmpresaModal(true)
  }

  async function handleSalvarEmpresa() {
    try {
      setError(null)
      if (empresaEditando) {
        await atualizarEmpresa(empresaEditando.id, empresaForm)
      } else {
        await criarEmpresa(empresaForm)
      }
      setShowEmpresaModal(false)
      carregarEmpresas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar empresa')
    }
  }

  async function handleDeletarEmpresa(id: string) {
    if (!confirm('Tem certeza que deseja deletar esta empresa?')) return
    try {
      await deletarEmpresa(id)
      carregarEmpresas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar empresa')
    }
  }

  function handleNovaUnidade(empresa: Empresa) {
    setEmpresaSelecionada(empresa)
    setUnidadeEditando(null)
    setUnidadeForm({ nome: '', empresa_id: empresa.id })
    setShowUnidadeModal(true)
    carregarUnidades(empresa.id)
  }

  function handleEditarUnidade(unidade: Unidade, empresa: Empresa) {
    setEmpresaSelecionada(empresa)
    setUnidadeEditando(unidade)
    setUnidadeForm({ nome: unidade.nome, empresa_id: unidade.empresa_id })
    setShowUnidadeModal(true)
    carregarUnidades(empresa.id)
  }

  async function handleSalvarUnidade() {
    try {
      setError(null)
      if (unidadeEditando) {
        await atualizarUnidade(unidadeEditando.id, unidadeForm)
      } else {
        await criarUnidade(unidadeForm)
      }
      setShowUnidadeModal(false)
      if (empresaSelecionada) {
        carregarUnidades(empresaSelecionada.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar unidade')
    }
  }

  async function handleDeletarUnidade(id: string) {
    if (!confirm('Tem certeza que deseja deletar esta unidade?')) return
    try {
      await deletarUnidade(id)
      if (empresaSelecionada) {
        carregarUnidades(empresaSelecionada.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar unidade')
    }
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
          <h1 className="text-3xl font-bold mb-2">Empresas e Unidades</h1>
          <p className="text-muted-foreground">Gerencie empresas e suas unidades</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleNovaEmpresa}>Nova Empresa</Button>
          <Link href="/admin">
            <Button variant="outline">Voltar</Button>
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">{error}</div>}

      <div className="space-y-4">
        {empresas.map((empresa) => (
          <Card key={empresa.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{empresa.nome}</CardTitle>
                  {empresa.cnpj && <CardDescription>CNPJ: {empresa.cnpj}</CardDescription>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleNovaUnidade(empresa)}>
                    Nova Unidade
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditarEmpresa(empresa)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeletarEmpresa(empresa.id)}>
                    Deletar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h4 className="font-semibold">Unidades:</h4>
                {(!unidades[empresa.id] || unidades[empresa.id].length === 0) ? (
                  <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada</p>
                ) : (
                  <div className="space-y-2">
                    {unidades[empresa.id].map((unidade) => (
                      <div key={unidade.id} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span>{unidade.nome}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditarUnidade(unidade, empresa)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeletarUnidade(unidade.id)}>
                            Deletar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {empresas.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.
          </CardContent>
        </Card>
      )}

      <Dialog open={showEmpresaModal} onOpenChange={setShowEmpresaModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{empresaEditando ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            <DialogDescription>Preencha os dados da empresa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={empresaForm.nome} onChange={(e) => setEmpresaForm({ ...empresaForm, nome: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={empresaForm.cnpj}
                onChange={(e) => setEmpresaForm({ ...empresaForm, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmpresaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarEmpresa}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUnidadeModal} onOpenChange={setShowUnidadeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unidadeEditando ? 'Editar Unidade' : 'Nova Unidade'}</DialogTitle>
            <DialogDescription>{empresaSelecionada && `Empresa: ${empresaSelecionada.nome}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="unidade-nome">Nome *</Label>
              <Input
                id="unidade-nome"
                value={unidadeForm.nome}
                onChange={(e) => setUnidadeForm({ ...unidadeForm, nome: e.target.value })}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnidadeModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarUnidade}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
