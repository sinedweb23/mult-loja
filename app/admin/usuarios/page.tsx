'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarUsuariosPaginado, obterPapeisDoUsuarioAdmin, salvarPapeisDoUsuario } from '@/app/actions/usuarios-admin'
import { listarEmpresas } from '@/app/actions/empresas'
import { listarUnidades } from '@/app/actions/empresas'
import { listarPerfis } from '@/app/actions/perfis'
import { CANTINA_PAPEIS } from '@/lib/cantina-papeis'
import type { PapelUsuario } from '@/lib/types/database'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

interface Usuario {
  id: string
  nome: string
  email: string
  email_financeiro: string | null
  email_pedagogico: string | null
  ativo: boolean
  empresa_id: string | null
  unidade_id: string | null
  perfil_id: string | null
  auth_user_id: string | null
  eh_admin: boolean
  super_admin?: boolean
  ja_logou: boolean
  empresas?: { id: string; nome: string }
  unidades?: { id: string; nome: string }
  perfis?: { id: string; nome: string } | null
}

const PAGE_SIZE = 20

export default function UsuariosAdminPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [empresas, setEmpresas] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [perfis, setPerfis] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaDigita, setBuscaDigita] = useState('')
  const [filtroPapel, setFiltroPapel] = useState<string>('todos')

  // Modal para configurar acesso (papéis + admin)
  const [showModal, setShowModal] = useState(false)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null)
  const [papeisSelecionados, setPapeisSelecionados] = useState<PapelUsuario[]>([])
  const [carregandoPapeis, setCarregandoPapeis] = useState(false)
  const [adminForm, setAdminForm] = useState({
    super_admin: false,
    empresa_id: 'none' as string,
    unidade_id: 'none' as string,
    perfil_id: 'none' as string,
  })

  const carregarUsuarios = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await listarUsuariosPaginado({
        page,
        pageSize: PAGE_SIZE,
        busca: buscaDigita || undefined,
        papel: filtroPapel === 'todos' ? undefined : (filtroPapel as PapelUsuario),
      })
      setUsuarios(res.usuarios)
      setTotal(res.total)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [page, buscaDigita, filtroPapel])

  useEffect(() => {
    carregarUsuarios()
  }, [carregarUsuarios])

  // Carregar perfis e empresas uma vez (para filtros e modal)
  useEffect(() => {
    Promise.all([listarPerfis(), listarEmpresas()]).then(([perfisData, empresasData]) => {
      setPerfis(perfisData.map((p) => ({ id: p.id, nome: p.nome })))
      setEmpresas(empresasData)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (adminForm.empresa_id && adminForm.empresa_id !== 'none') {
      listarUnidades(adminForm.empresa_id).then(setUnidades).catch(console.error)
    } else {
      setUnidades([])
      setAdminForm((prev) => ({ ...prev, unidade_id: 'none' }))
    }
  }, [adminForm.empresa_id])

  async function handleConfigurarAcesso(usuario: Usuario) {
    setUsuarioSelecionado(usuario)
    const perfilEhAcessoTotal = usuario.perfis?.nome === 'Acesso total'
    setAdminForm({
      super_admin: usuario.super_admin || false,
      empresa_id: usuario.empresa_id || 'none',
      unidade_id: usuario.unidade_id || 'none',
      perfil_id: !usuario.perfil_id || perfilEhAcessoTotal ? 'none' : usuario.perfil_id,
    })
    if (usuario.empresa_id) {
      listarUnidades(usuario.empresa_id).then(setUnidades).catch(console.error)
    }
    setShowModal(true)
    setCarregandoPapeis(true)
    try {
      const papeis = await obterPapeisDoUsuarioAdmin(usuario.id)
      setPapeisSelecionados(papeis)
      if (papeis.length === 0 && usuario.eh_admin) {
        setPapeisSelecionados(['ADMIN'])
      }
      if (papeis.length === 0 && !usuario.eh_admin) {
        setPapeisSelecionados([])
      }
    } catch {
      setPapeisSelecionados([])
    } finally {
      setCarregandoPapeis(false)
    }
  }

  function togglePapel(papel: PapelUsuario) {
    setPapeisSelecionados((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel]
    )
  }

  async function handleSalvarAcesso() {
    if (!usuarioSelecionado) return

    try {
      setError(null)
      const res = await salvarPapeisDoUsuario(usuarioSelecionado.id, papeisSelecionados, {
        super_admin: adminForm.super_admin,
        perfil_id: adminForm.perfil_id === 'none' ? null : adminForm.perfil_id,
        empresa_id: adminForm.empresa_id === 'none' ? null : adminForm.empresa_id,
        unidade_id: adminForm.unidade_id === 'none' ? null : adminForm.unidade_id,
      })
      if (!res.ok) {
        setError(res.erro ?? 'Erro ao salvar')
        return
      }
      setShowModal(false)
      carregarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  async function handleRemoverAdmin(usuarioId: string) {
    if (!confirm('Tem certeza que deseja remover o papel Admin deste usuário?')) return
    try {
      const papeis = await obterPapeisDoUsuarioAdmin(usuarioId)
      const semAdmin = papeis.filter((p) => p !== 'ADMIN')
      await salvarPapeisDoUsuario(usuarioId, semAdmin)
      carregarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  if (loading && usuarios.length === 0) {
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
          <h1 className="text-3xl font-bold mb-2">Usuários</h1>
          <p className="text-muted-foreground">
            Gerencie todos os usuários do sistema e configure permissões de admin
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline">Voltar</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
          {error}
        </div>
      )}

      {/* Busca + Filtros */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (setBuscaDigita(busca), setPage(1))}
                  className="pl-9"
                />
              </div>
              <Button variant="secondary" onClick={() => { setBuscaDigita(busca); setPage(1) }}>
                Buscar
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground whitespace-nowrap">Papel:</Label>
              <Select value={filtroPapel} onValueChange={(v) => { setFiltroPapel(v); setPage(1) }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(Object.keys(CANTINA_PAPEIS) as PapelUsuario[]).map((p) => (
                    <SelectItem key={p} value={p}>{CANTINA_PAPEIS[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista em tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Perfil</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Admin</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && usuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{usuario.nome}</span>
                        {!usuario.ja_logou && (
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                            Nunca logou
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{usuario.email}</td>
                    <td className="p-3">{usuario.perfis?.nome ?? '—'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        usuario.ativo ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-3">
                      {usuario.eh_admin && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                          {usuario.super_admin ? 'Super Admin' : 'Admin'}
                        </span>
                      )}
                      {!usuario.eh_admin && '—'}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleConfigurarAcesso(usuario)}>
                          Configurar acesso
                        </Button>
                        {usuario.eh_admin && (
                          <Button size="sm" variant="destructive" onClick={() => handleRemoverAdmin(usuario.id)}>
                            Remover Admin
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {usuarios.length === 0 && !loading && (
          <div className="p-6 text-center text-muted-foreground">
            Nenhum usuário encontrado. Ajuste os filtros ou a busca.
          </div>
        )}

        {/* Paginação */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-4 p-3 border-t flex-wrap">
            <p className="text-sm text-muted-foreground">
              {from}–{to} de {total} usuários
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal: Papéis de acesso + opções de Admin */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar acesso</DialogTitle>
            <DialogDescription>
              {usuarioSelecionado && (
                <>
                  <strong>{usuarioSelecionado.nome}</strong> ({usuarioSelecionado.email}). Ao fazer login, o usuário escolhe com qual papel acessar (se tiver mais de um). Se tiver só um, vai direto.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <Label className="text-base font-semibold">Papéis de acesso</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Marque todos os papéis que este usuário pode usar. No login ele escolhe com qual entrar (ou vai direto se tiver só um).
              </p>
              {carregandoPapeis ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(CANTINA_PAPEIS) as PapelUsuario[]).map((papel) => {
                    const config = CANTINA_PAPEIS[papel]
                    if (!config) return null // Proteção contra papéis inválidos
                    return (
                      <label
                        key={papel}
                        className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={papeisSelecionados.includes(papel)}
                          onChange={() => togglePapel(papel)}
                          className="mt-1 w-4 h-4"
                        />
                        <div>
                          <span className="font-medium">{config.label}</span>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {papeisSelecionados.includes('ADMIN') && (
              <>
                <hr />
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Opções do painel Admin</Label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="super_admin"
                      checked={adminForm.super_admin}
                      onChange={(e) => setAdminForm({ ...adminForm, super_admin: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="super_admin" className="cursor-pointer">
                      Super Administrador (acesso total)
                    </Label>
                  </div>
                  <div>
                    <Label>Perfil (quais páginas do admin)</Label>
                    <Select
                      value={adminForm.perfil_id}
                      onValueChange={(value) => setAdminForm({ ...adminForm, perfil_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Acesso total (todas as páginas)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Acesso total</SelectItem>
                        {perfis
                          .filter((p) => p.nome !== 'Acesso total')
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Empresa (opcional)</Label>
                    <Select
                      value={adminForm.empresa_id}
                      onValueChange={(value) => setAdminForm({ ...adminForm, empresa_id: value, unidade_id: 'none' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Todas</SelectItem>
                        {empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {adminForm.empresa_id && adminForm.empresa_id !== 'none' && (
                    <div>
                      <Label>Unidade (opcional)</Label>
                      <Select
                        value={adminForm.unidade_id}
                        onValueChange={(value) => setAdminForm({ ...adminForm, unidade_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Todas</SelectItem>
                          {unidades.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            {usuarioSelecionado && !usuarioSelecionado.ja_logou && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 rounded-md text-sm">
                ⚠️ Este usuário nunca fez login. Ele precisará fazer o primeiro acesso para criar a senha.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSalvarAcesso}>Salvar acesso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
