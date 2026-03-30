'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarAlunos, obterAlunoDetalhes, buscarAlunos, atualizarSituacaoAluno } from '@/app/actions/alunos'
import Link from 'next/link'

interface Turma {
  id: string
  descricao: string
  segmento: string | null
  tipo_curso: string | null
  situacao: string
}

interface Empresa {
  id: string
  nome: string
}

interface Unidade {
  id: string
  nome: string
}

interface Aluno {
  id: string
  prontuario: string
  nome: string
  situacao: string
  turma_id: string | null
  /** Supabase retorna FK como objeto (não array); a UI aceita os dois */
  turmas?: Turma | Turma[] | null
  empresas?: Empresa[] | null
  unidades?: Unidade[] | null
}

function turmaDoAluno(aluno: Aluno): Turma | null {
  const t = aluno.turmas
  if (!t) return null
  return Array.isArray(t) ? t[0] ?? null : t
}

/** responsabilidade: 1 = financeiro, 2 = pedagógico, 3 = ambos */
interface Responsavel {
  id: string
  usuario_id: string
  usuarios: {
    id: string
    nome: string | null
    cpf: string | null
    email: string | null
    celular: string | null
    responsabilidade: number | null
    ativo: boolean
  }
}

export default function AlunosPage() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filtroNome, setFiltroNome] = useState('')
  const [filtroProntuario, setFiltroProntuario] = useState('')
   const [filtroSituacao, setFiltroSituacao] = useState<'TODOS' | 'ATIVO' | 'INATIVO'>('TODOS')
  const [buscando, setBuscando] = useState(false)

  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [detalhes, setDetalhes] = useState<{
    aluno: any
    responsaveis: Responsavel[]
  } | null>(null)
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [alterandoSituacaoId, setAlterandoSituacaoId] = useState<string | null>(null)

  useEffect(() => {
    carregarAlunos()
  }, [])

  async function carregarAlunos() {
    try {
      setLoading(true)
      setError(null)
      const dados = await listarAlunos()
      setAlunos(dados as Aluno[])
    } catch (err) {
      console.error('Erro ao carregar alunos:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar alunos')
    } finally {
      setLoading(false)
    }
  }

  async function handleBuscar() {
    try {
      setBuscando(true)
      setError(null)

      const filtros: any = {}
      if (filtroNome.trim()) filtros.nome = filtroNome.trim()
      if (filtroProntuario.trim()) filtros.prontuario = filtroProntuario.trim()
      if (filtroSituacao !== 'TODOS') filtros.situacao = filtroSituacao

      const dados =
        Object.keys(filtros).length > 0
          ? await buscarAlunos(filtros)
          : await listarAlunos()

      setAlunos(dados as Aluno[])
    } catch (err) {
      console.error('Erro ao buscar alunos:', err)
      setError(err instanceof Error ? err.message : 'Erro ao buscar alunos')
    } finally {
      setBuscando(false)
    }
  }

  async function handleToggleSituacao(aluno: Aluno) {
    const novoStatus: 'ATIVO' | 'INATIVO' = aluno.situacao === 'ATIVO' ? 'INATIVO' : 'ATIVO'
    try {
      setAlterandoSituacaoId(aluno.id)
      setError(null)
      await atualizarSituacaoAluno(aluno.id, novoStatus)
      setAlunos((prev) =>
        prev.map((a) => (a.id === aluno.id ? { ...a, situacao: novoStatus } : a))
      )
      if (alunoSelecionado && alunoSelecionado.id === aluno.id) {
        setAlunoSelecionado({ ...alunoSelecionado, situacao: novoStatus })
      }
    } catch (err) {
      console.error('Erro ao atualizar situação do aluno:', err)
      setError(err instanceof Error ? err.message : 'Erro ao atualizar situação do aluno')
    } finally {
      setAlterandoSituacaoId(null)
    }
  }

  async function handleAbrirDetalhes(aluno: Aluno) {
    try {
      setAlunoSelecionado(aluno)
      setModalAberto(true)
      setCarregandoDetalhes(true)
      setDetalhes(null)

      const dados = await obterAlunoDetalhes(aluno.id)
      setDetalhes(dados as any)
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes')
    } finally {
      setCarregandoDetalhes(false)
    }
  }

  function formatarSegmento(segmento: string | null) {
    if (!segmento) return 'Não informado'
    const map: Record<string, string> = {
      EDUCACAO_INFANTIL: 'Educação Infantil',
      FUNDAMENTAL: 'Fundamental',
      MEDIO: 'Médio',
      OUTRO: 'Outro',
    }
    return map[segmento] || segmento
  }

  /** responsabilidade: 1 = financeiro, 2 = pedagógico, 3 = ambos */
  function formatarTipoResponsavel(responsabilidade: number | null) {
    if (responsabilidade == null) return 'Responsável'
    const map: Record<number, string> = {
      1: 'Financeiro',
      2: 'Pedagógico',
      3: 'Financeiro e Pedagógico',
    }
    return map[responsabilidade] || 'Responsável'
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando alunos...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Alunos</h1>
          <p className="text-muted-foreground">Lista de todos os alunos cadastrados</p>
        </div>
        <Link href="/admin">
          <Button variant="outline">Voltar</Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Buscar Alunos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="filtro-nome">Nome</Label>
              <Input
                id="filtro-nome"
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                placeholder="Digite o nome..."
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              />
            </div>
            <div>
              <Label htmlFor="filtro-prontuario">Prontuário</Label>
              <Input
                id="filtro-prontuario"
                value={filtroProntuario}
                onChange={(e) => setFiltroProntuario(e.target.value)}
                placeholder="Digite o prontuário..."
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              />
            </div>
            <div>
              <Label htmlFor="filtro-situacao">Situação</Label>
              <Select
                value={filtroSituacao}
                onValueChange={(v) => setFiltroSituacao(v as 'TODOS' | 'ATIVO' | 'INATIVO')}
              >
                <SelectTrigger id="filtro-situacao">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="ATIVO">Ativos</SelectItem>
                  <SelectItem value="INATIVO">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleBuscar} disabled={buscando} className="flex-1">
                {buscando ? 'Buscando...' : 'Buscar'}
              </Button>
              <Button variant="outline" onClick={carregarAlunos}>
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Alunos ({alunos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {alunos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Prontuário</th>
                    <th className="text-left p-2">Nome</th>
                    <th className="text-left p-2">Turma</th>
                    <th className="text-left p-2">Série/Segmento</th>
                    <th className="text-left p-2">Situação</th>
                    <th className="text-left p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {alunos.map((aluno) => (
                    <tr key={aluno.id} className="border-b hover:bg-muted/50">
                      <td className="p-2">{aluno.prontuario}</td>
                      <td className="p-2 font-medium">{aluno.nome}</td>
                      <td className="p-2">{turmaDoAluno(aluno)?.descricao ?? 'Sem turma'}</td>
                      <td className="p-2">{formatarSegmento(turmaDoAluno(aluno)?.segmento ?? null)}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            aluno.situacao === 'ATIVO'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {aluno.situacao}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleAbrirDetalhes(aluno)}>
                            Ver Detalhes
                          </Button>
                          <Button
                            size="sm"
                            variant={aluno.situacao === 'ATIVO' ? 'destructive' : 'default'}
                            disabled={alterandoSituacaoId === aluno.id}
                            onClick={() => handleToggleSituacao(aluno)}
                          >
                            {alterandoSituacaoId === aluno.id
                              ? 'Salvando...'
                              : aluno.situacao === 'ATIVO'
                              ? 'Desativar'
                              : 'Ativar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Aluno: {alunoSelecionado?.nome}</DialogTitle>
            <DialogDescription>Prontuário: {alunoSelecionado?.prontuario}</DialogDescription>
          </DialogHeader>

          {carregandoDetalhes ? (
            <div className="py-8 text-center">
              <p>Carregando detalhes...</p>
            </div>
          ) : detalhes ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Aluno</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nome</Label>
                      <p className="font-medium">{detalhes.aluno.nome}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Prontuário</Label>
                      <p className="font-medium">{detalhes.aluno.prontuario}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Situação</Label>
                      <p className="font-medium">{detalhes.aluno.situacao}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Empresa</Label>
                      <p className="font-medium">{detalhes.aluno.empresas?.[0]?.nome || 'Não informado'}</p>
                    </div>
                    {detalhes.aluno.unidades?.[0] && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Unidade</Label>
                        <p className="font-medium">{detalhes.aluno.unidades[0].nome}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {(() => {
                const t = Array.isArray(detalhes.aluno.turmas) ? detalhes.aluno.turmas[0] : detalhes.aluno.turmas
                return t ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Turma e Série</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Turma</Label>
                          <p className="font-medium">{t.descricao}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Segmento/Série</Label>
                          <p className="font-medium">{formatarSegmento(t.segmento)}</p>
                        </div>
                        {t.tipo_curso && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Tipo de Curso</Label>
                            <p className="font-medium">{t.tipo_curso}</p>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs text-muted-foreground">Situação da Turma</Label>
                          <p className="font-medium">{t.situacao}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null
              })()}

              <Card>
                <CardHeader>
                  <CardTitle>Responsáveis ({detalhes.responsaveis.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {detalhes.responsaveis.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Nenhum responsável vinculado</p>
                  ) : (
                    <div className="space-y-4">
                      {detalhes.responsaveis.map((relacao) => {
                        const resp = relacao.usuarios
                        if (!resp) return null
                        return (
                          <div key={relacao.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold">{formatarTipoResponsavel(resp.responsabilidade)}</h4>
                                {!resp.ativo && (
                                  <span className="text-xs text-destructive">(Inativo)</span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {resp.nome && (
                                <div>
                                  <span className="text-muted-foreground">Nome: </span>
                                  <span>{resp.nome}</span>
                                </div>
                              )}
                              {resp.cpf && (
                                <div>
                                  <span className="text-muted-foreground">CPF: </span>
                                  <span>{resp.cpf}</span>
                                </div>
                              )}
                              {resp.email && (
                                <div>
                                  <span className="text-muted-foreground">Email: </span>
                                  <span>{resp.email}</span>
                                </div>
                              )}
                              {resp.celular && (
                                <div>
                                  <span className="text-muted-foreground">Celular: </span>
                                  <span>{resp.celular}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Erro ao carregar detalhes</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
