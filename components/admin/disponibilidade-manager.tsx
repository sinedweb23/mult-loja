'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { listarTurmas, listarAlunos, criarDisponibilidade, deletarDisponibilidade } from '@/app/actions/produtos-admin'
import type { ProdutoDisponibilidade, Turma, Aluno } from '@/lib/types/database'

interface DisponibilidadeManagerProps {
  produtoId?: string
  empresaId: string
  disponibilidades: ProdutoDisponibilidade[]
}

export function DisponibilidadeManager({ produtoId, empresaId, disponibilidades: disponibilidadesIniciais }: DisponibilidadeManagerProps) {
  const [disponibilidades, setDisponibilidades] = useState<ProdutoDisponibilidade[]>(disponibilidadesIniciais)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(false)
  const [novaDisponibilidade, setNovaDisponibilidade] = useState({
    tipo: 'TODOS' as 'TODOS' | 'SEGMENTO' | 'TURMA' | 'ALUNO',
    segmentosSelecionados: [] as string[],
    turmaIdsSelecionados: [] as string[],
    alunoIdsSelecionados: [] as string[],
    disponivel_de: '',
    disponivel_ate: '',
  })

  /** Segmentos = valores distintos de tipo_curso na tabela turmas (aba Segmentos) */
  const segmentos = useMemo(() => {
    const set = new Set<string>()
    turmas.forEach((t) => {
      const v = t.tipo_curso?.trim()
      if (v) set.add(v)
    })
    return Array.from(set).sort()
  }, [turmas])

  useEffect(() => {
    if (empresaId) {
      carregarDados()
    }
  }, [empresaId])

  async function carregarDados() {
    try {
      const [turmasData, alunosData] = await Promise.all([
        listarTurmas(empresaId),
        listarAlunos(empresaId),
      ])
      setTurmas(turmasData as Turma[])
      setAlunos(alunosData as Aluno[])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    }
  }

  async function handleAdicionar() {
    if (!produtoId) {
      alert('Salve o produto primeiro antes de adicionar disponibilidade')
      return
    }

    const { tipo, segmentosSelecionados, turmaIdsSelecionados, alunoIdsSelecionados, disponivel_de, disponivel_ate } = novaDisponibilidade
    const idsSegmento = tipo === 'SEGMENTO' ? segmentosSelecionados : []
    const idsTurma = tipo === 'TURMA' ? turmaIdsSelecionados : []
    const idsAluno = tipo === 'ALUNO' ? alunoIdsSelecionados : []

    if (tipo === 'SEGMENTO' && idsSegmento.length === 0) {
      alert('Selecione ao menos um segmento')
      return
    }
    if (tipo === 'TURMA' && idsTurma.length === 0) {
      alert('Selecione ao menos uma turma')
      return
    }
    if (tipo === 'ALUNO' && idsAluno.length === 0) {
      alert('Selecione ao menos um aluno')
      return
    }

    setLoading(true)
    try {
      const base = { disponivel_de: disponivel_de || undefined, disponivel_ate: disponivel_ate || undefined }
      const criadas: ProdutoDisponibilidade[] = []

      if (tipo === 'TODOS') {
        const nova = await criarDisponibilidade(produtoId, { tipo: 'TODOS', ...base })
        criadas.push(nova as ProdutoDisponibilidade)
      } else if (tipo === 'SEGMENTO') {
        for (const seg of idsSegmento) {
          const nova = await criarDisponibilidade(produtoId, { tipo: 'SEGMENTO', segmento: seg, ...base })
          criadas.push(nova as ProdutoDisponibilidade)
        }
      } else if (tipo === 'TURMA') {
        for (const tid of idsTurma) {
          const nova = await criarDisponibilidade(produtoId, { tipo: 'TURMA', turma_id: tid, ...base })
          criadas.push(nova as ProdutoDisponibilidade)
        }
      } else if (tipo === 'ALUNO') {
        for (const aid of idsAluno) {
          const nova = await criarDisponibilidade(produtoId, { tipo: 'ALUNO', aluno_id: aid, ...base })
          criadas.push(nova as ProdutoDisponibilidade)
        }
      }

      setDisponibilidades([...disponibilidades, ...criadas])
      setNovaDisponibilidade({
        tipo: 'TODOS',
        segmentosSelecionados: [],
        turmaIdsSelecionados: [],
        alunoIdsSelecionados: [],
        disponivel_de: '',
        disponivel_ate: '',
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar disponibilidade')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemover(id: string) {
    if (!confirm('Tem certeza que deseja remover esta disponibilidade?')) return

    setLoading(true)
    try {
      await deletarDisponibilidade(id)
      setDisponibilidades(disponibilidades.filter(d => d.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover disponibilidade')
    } finally {
      setLoading(false)
    }
  }

  function formatarTipo(tipo: string) {
    const tipos: Record<string, string> = {
      TODOS: 'Todos',
      SEGMENTO: 'Segmento',
      TURMA: 'Turma',
      ALUNO: 'Aluno',
    }
    return tipos[tipo] || tipo
  }

  function formatarSegmento(segmento: string | null) {
    if (!segmento) return ''
    const legacy: Record<string, string> = {
      EDUCACAO_INFANTIL: 'Educação Infantil',
      FUNDAMENTAL: 'Fundamental',
      MEDIO: 'Médio',
      EFAF: 'EFAF',
      EFAI: 'EFAI',
      OUTRO: 'Outro',
    }
    return legacy[segmento] || segmento
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nova Disponibilidade</CardTitle>
          <CardDescription>
            Configure para quem este produto estará disponível
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de Disponibilidade *</Label>
            <Select 
              value={novaDisponibilidade.tipo || 'TODOS'} 
              onValueChange={(v: any) => setNovaDisponibilidade({ ...novaDisponibilidade, tipo: v, segmentosSelecionados: [], turmaIdsSelecionados: [], alunoIdsSelecionados: [] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="SEGMENTO">Segmento</SelectItem>
                <SelectItem value="TURMA">Turma</SelectItem>
                <SelectItem value="ALUNO">Aluno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {novaDisponibilidade.tipo === 'SEGMENTO' && (
            <div>
              <Label>Segmentos * (selecione um ou mais)</Label>
              <div className="flex gap-2 mt-1 mb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, segmentosSelecionados: [...segmentos] })}
                  disabled={segmentos.length === 0}
                >
                  Selecionar todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, segmentosSelecionados: [] })}
                >
                  Desmarcar todos
                </Button>
              </div>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 mt-1">
                {segmentos.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={novaDisponibilidade.segmentosSelecionados.includes(s)}
                      onCheckedChange={(checked) => {
                        const set = new Set(novaDisponibilidade.segmentosSelecionados)
                        if (checked) set.add(s)
                        else set.delete(s)
                        setNovaDisponibilidade({ ...novaDisponibilidade, segmentosSelecionados: Array.from(set) })
                      }}
                    />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
                {segmentos.length === 0 && (
                  <p className="text-sm text-muted-foreground">Cadastre tipo_curso nas turmas (Admin → Turmas).</p>
                )}
              </div>
            </div>
          )}

          {novaDisponibilidade.tipo === 'TURMA' && (
            <div>
              <Label>Turmas * (selecione uma ou mais)</Label>
              <div className="flex gap-2 mt-1 mb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, turmaIdsSelecionados: turmas.map((t) => t.id) })}
                  disabled={turmas.length === 0}
                >
                  Selecionar todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, turmaIdsSelecionados: [] })}
                >
                  Desmarcar todos
                </Button>
              </div>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 mt-1">
                {turmas.map((turma) => (
                  <label key={turma.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={novaDisponibilidade.turmaIdsSelecionados.includes(turma.id)}
                      onCheckedChange={(checked) => {
                        const set = new Set(novaDisponibilidade.turmaIdsSelecionados)
                        if (checked) set.add(turma.id)
                        else set.delete(turma.id)
                        setNovaDisponibilidade({ ...novaDisponibilidade, turmaIdsSelecionados: Array.from(set) })
                      }}
                    />
                    <span className="text-sm">{turma.descricao}</span>
                  </label>
                ))}
                {turmas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma turma cadastrada.</p>
                )}
              </div>
            </div>
          )}

          {novaDisponibilidade.tipo === 'ALUNO' && (
            <div>
              <Label>Alunos * (selecione um ou mais)</Label>
              <div className="flex gap-2 mt-1 mb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, alunoIdsSelecionados: alunos.map((a) => a.id) })}
                  disabled={alunos.length === 0}
                >
                  Selecionar todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovaDisponibilidade({ ...novaDisponibilidade, alunoIdsSelecionados: [] })}
                >
                  Desmarcar todos
                </Button>
              </div>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 mt-1">
                {alunos.map((aluno) => (
                  <label key={aluno.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={novaDisponibilidade.alunoIdsSelecionados.includes(aluno.id)}
                      onCheckedChange={(checked) => {
                        const set = new Set(novaDisponibilidade.alunoIdsSelecionados)
                        if (checked) set.add(aluno.id)
                        else set.delete(aluno.id)
                        setNovaDisponibilidade({ ...novaDisponibilidade, alunoIdsSelecionados: Array.from(set) })
                      }}
                    />
                    <span className="text-sm">{aluno.nome}</span>
                  </label>
                ))}
                {alunos.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Disponível de</Label>
              <Input
                type="datetime-local"
                value={novaDisponibilidade.disponivel_de}
                onChange={(e) => setNovaDisponibilidade({ ...novaDisponibilidade, disponivel_de: e.target.value })}
              />
            </div>
            <div>
              <Label>Disponível até</Label>
              <Input
                type="datetime-local"
                value={novaDisponibilidade.disponivel_ate}
                onChange={(e) => setNovaDisponibilidade({ ...novaDisponibilidade, disponivel_ate: e.target.value })}
              />
            </div>
          </div>

          <Button 
            type="button" 
            onClick={handleAdicionar} 
            disabled={
            loading ||
            !produtoId ||
            (novaDisponibilidade.tipo === 'SEGMENTO' && novaDisponibilidade.segmentosSelecionados.length === 0) ||
            (novaDisponibilidade.tipo === 'TURMA' && novaDisponibilidade.turmaIdsSelecionados.length === 0) ||
            (novaDisponibilidade.tipo === 'ALUNO' && novaDisponibilidade.alunoIdsSelecionados.length === 0)
          }
          >
            Adicionar Disponibilidade
          </Button>
        </CardContent>
      </Card>

      {/* Lista de disponibilidades */}
      <div className="space-y-2">
        {disponibilidades.map((disp) => (
          <Card key={disp.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{formatarTipo(disp.tipo)}</div>
                  {disp.tipo === 'SEGMENTO' && disp.segmento && (
                    <div className="text-sm text-muted-foreground">{formatarSegmento(disp.segmento)}</div>
                  )}
                  {disp.tipo === 'TURMA' && (
                    <div className="text-sm text-muted-foreground">
                      {turmas.find(t => t.id === disp.turma_id)?.descricao || 'Turma não encontrada'}
                    </div>
                  )}
                  {disp.tipo === 'ALUNO' && (
                    <div className="text-sm text-muted-foreground">
                      {alunos.find(a => a.id === disp.aluno_id)?.nome || 'Aluno não encontrado'}
                    </div>
                  )}
                  {(disp.disponivel_de || disp.disponivel_ate) && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {disp.disponivel_de && `De: ${new Date(disp.disponivel_de).toLocaleDateString('pt-BR')}`}
                      {disp.disponivel_de && disp.disponivel_ate && ' • '}
                      {disp.disponivel_ate && `Até: ${new Date(disp.disponivel_ate).toLocaleDateString('pt-BR')}`}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemover(disp.id)}
                  disabled={loading}
                >
                  Remover
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {disponibilidades.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhuma disponibilidade configurada. O produto estará disponível para todos por padrão.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
