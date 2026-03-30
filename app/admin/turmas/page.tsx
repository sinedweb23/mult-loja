'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarTurmas, criarTurma, atualizarTurma, deletarTurma } from '@/app/actions/turmas'
import { listarEmpresas, listarUnidades } from '@/app/actions/empresas'
import Link from 'next/link'

type Segmento = 'EDUCACAO_INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'OUTRO'
type Turno = 'MANHA' | 'TARDE'

type EmpresaRef = { id: string; nome: string }
type UnidadeRef = { id: string; nome: string }

interface Turma {
  id: string
  descricao: string
  segmento: Segmento | null
  tipo_curso: string | null
  turno: Turno | null
  situacao: string
  empresa_id: string
  unidade_id: string | null
  empresas?: EmpresaRef | null
  unidades?: UnidadeRef | null
  quantidade_alunos?: number
}

type EmpresaItem = { id: string; nome: string }
type UnidadeItem = { id: string; nome: string; empresa_id?: string }

type TurmaPayload = {
  descricao: string
  situacao: string
  empresa_id: string
  unidade_id?: string | null
  segmento?: Segmento | null
  tipo_curso?: string | null
  turno?: Turno | null
}

type SegmentoForm = 'none' | Segmento
type UnidadeForm = 'none' | string

export default function TurmasPage() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([])
  const [unidades, setUnidades] = useState<UnidadeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [turmaEditando, setTurmaEditando] = useState<Turma | null>(null)
  const [turmaForm, setTurmaForm] = useState<{
    descricao: string
    segmento: SegmentoForm
    tipo_curso: string
    turno: 'none' | Turno
    situacao: string
    empresa_id: string
    unidade_id: UnidadeForm
  }>({
    descricao: '',
    segmento: 'none',
    tipo_curso: '',
    turno: 'none',
    situacao: 'ATIVA',
    empresa_id: '',
    unidade_id: 'none',
  })

  const empresasTem = empresas.length > 0
  const empresasOptions = empresas
  const unidadesOptions = unidades

  useEffect(() => {
    carregarDados()
  }, [])

  useEffect(() => {
    if (turmaForm.empresa_id) {
      carregarUnidades(turmaForm.empresa_id)
    } else {
      setUnidades([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turmaForm.empresa_id])

  function normalizarTurma(raw: any): Turma {
    const empObj: EmpresaRef | null =
      Array.isArray(raw?.empresas) ? (raw.empresas[0] ?? null) : (raw?.empresas ?? null)

    const uniObj: UnidadeRef | null =
      Array.isArray(raw?.unidades) ? (raw.unidades[0] ?? null) : (raw?.unidades ?? null)

    const rawSegmento = raw?.segmento
    const segmento: Segmento | null =
      rawSegmento === 'EDUCACAO_INFANTIL' ||
      rawSegmento === 'FUNDAMENTAL' ||
      rawSegmento === 'MEDIO' ||
      rawSegmento === 'OUTRO'
        ? rawSegmento
        : null

    const rawTurno = raw?.turno
    const turno: Turno | null =
      rawTurno === 'MANHA' || rawTurno === 'TARDE' ? rawTurno : null

    return {
      id: String(raw.id),
      descricao: raw.descricao ?? '',
      segmento,
      tipo_curso: raw.tipo_curso ?? null,
      turno,
      situacao: raw.situacao ?? 'ATIVA',
      empresa_id: String(raw.empresa_id),
      unidade_id: raw.unidade_id ?? null,
      empresas: empObj,
      unidades: uniObj,
      quantidade_alunos: raw.quantidade_alunos ?? 0,
    }
  }

  async function carregarDados() {
    try {
      setLoading(true)
      setError(null)
      const [turmasData, empresasData] = await Promise.all([listarTurmas(), listarEmpresas()])
      setTurmas((turmasData || []).map(normalizarTurma))
      setEmpresas((empresasData || []) as EmpresaItem[])
      if (!turmaForm.empresa_id && (empresasData || []).length > 0) {
        const firstId = String((empresasData as any[])[0]?.id || '')
        setTurmaForm((prev) => ({ ...prev, empresa_id: firstId }))
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  async function carregarUnidades(empresaId: string) {
    try {
      const dados = await listarUnidades(empresaId)
      setUnidades((dados || []) as UnidadeItem[])
    } catch (err) {
      console.error('Erro ao carregar unidades:', err)
      setUnidades([])
    }
  }

  function handleNovaTurma() {
    const firstEmpresaId = empresas[0]?.id || ''
    setTurmaEditando(null)
    setTurmaForm({
      descricao: '',
      segmento: 'none',
      tipo_curso: '',
      turno: 'none',
      situacao: 'ATIVA',
      empresa_id: firstEmpresaId,
      unidade_id: 'none',
    })
    if (firstEmpresaId) carregarUnidades(firstEmpresaId)
    setShowModal(true)
  }

  function handleEditarTurma(turma: Turma) {
    setTurmaEditando(turma)
    setTurmaForm({
      descricao: turma.descricao,
      segmento: (turma.segmento ?? 'none') as SegmentoForm,
      tipo_curso: turma.tipo_curso || '',
      turno: (turma.turno ?? 'none') as 'none' | Turno,
      situacao: turma.situacao,
      empresa_id: turma.empresa_id,
      unidade_id: (turma.unidade_id ?? 'none') as UnidadeForm,
    })
    if (turma.empresa_id) carregarUnidades(turma.empresa_id)
    setShowModal(true)
  }

  async function handleSalvarTurma() {
    try {
      setError(null)

      const payload: TurmaPayload = {
        descricao: turmaForm.descricao,
        segmento: turmaForm.segmento === 'none' ? null : turmaForm.segmento,
        tipo_curso: turmaForm.tipo_curso ? turmaForm.tipo_curso : null,
        turno: turmaForm.turno === 'none' ? null : turmaForm.turno,
        situacao: turmaForm.situacao,
        empresa_id: turmaForm.empresa_id,
        unidade_id: turmaForm.unidade_id === 'none' ? null : turmaForm.unidade_id,
      }

      if (!payload.descricao.trim()) {
        setError('Descrição é obrigatória')
        return
      }
      if (!payload.empresa_id) {
        setError('Empresa é obrigatória')
        return
      }

      if (turmaEditando) {
        await atualizarTurma(turmaEditando.id, payload)
      } else {
        await criarTurma(payload)
      }

      setShowModal(false)
      await carregarDados()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar turma')
    }
  }

  async function handleDeletarTurma(id: string) {
    if (!confirm('Tem certeza que deseja deletar esta turma?')) return
    try {
      await deletarTurma(id)
      await carregarDados()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar turma')
    }
  }

  function formatarSegmento(segmento: Segmento | null) {
    if (!segmento) return 'Não informado'
    const map: Record<Segmento, string> = {
      EDUCACAO_INFANTIL: 'Educação Infantil',
      FUNDAMENTAL: 'Fundamental',
      MEDIO: 'Médio',
      OUTRO: 'Outro',
    }
    return map[segmento] || segmento
  }

  function formatarTurno(turno: Turno | null) {
    if (!turno) return 'Não informado'
    return turno === 'MANHA' ? 'Manhã' : 'Tarde'
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
          <h1 className="text-3xl font-bold mb-2">Turmas</h1>
          <p className="text-muted-foreground">Gerencie turmas e segmentos</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleNovaTurma} disabled={!empresasTem}>
            Nova Turma
          </Button>
          <Link href="/admin">
            <Button variant="outline">Voltar</Button>
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {turmas.map((turma) => (
          <Card key={turma.id}>
            <CardHeader>
              <CardTitle>{turma.descricao}</CardTitle>
              <CardDescription>
                {turma.empresas?.nome || ''}
                {turma.unidades?.nome ? ` - ${turma.unidades.nome}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Segmento: </span>
                <span className="text-sm font-medium">
                  {turma.tipo_curso || formatarSegmento(turma.segmento)}
                </span>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Turno: </span>
                <span className="text-sm font-medium">{formatarTurno(turma.turno)}</span>
              </div>

              <div>
                <span className="text-sm text-muted-foreground">Alunos: </span>
                <span className="text-sm font-medium">{turma.quantidade_alunos ?? 0}</span>
              </div>

              <div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    turma.situacao === 'ATIVA' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {turma.situacao}
                </span>
              </div>

              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => handleEditarTurma(turma)} className="flex-1">
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeletarTurma(turma.id)}>
                  Deletar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {turmas.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhuma turma cadastrada. Clique em &quot;Nova Turma&quot; para começar.
          </CardContent>
        </Card>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{turmaEditando ? 'Editar Turma' : 'Nova Turma'}</DialogTitle>
            <DialogDescription>Preencha os dados da turma</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="descricao">Descrição *</Label>
              <Input
                id="descricao"
                value={turmaForm.descricao}
                onChange={(e) => setTurmaForm({ ...turmaForm, descricao: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="empresa">Empresa *</Label>
              <Select
                value={turmaForm.empresa_id || ''}
                onValueChange={(value) => setTurmaForm({ ...turmaForm, empresa_id: String(value), unidade_id: 'none' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={empresasTem ? 'Selecione a empresa' : 'Cadastre uma empresa primeiro'} />
                </SelectTrigger>
                <SelectContent>
                  {empresasOptions.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {turmaForm.empresa_id && (
              <div>
                <Label htmlFor="unidade">Unidade</Label>
                <Select
                  value={turmaForm.unidade_id}
                  onValueChange={(value) => setTurmaForm({ ...turmaForm, unidade_id: String(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem unidade</SelectItem>
                    {unidadesOptions.map((unidade) => (
                      <SelectItem key={unidade.id} value={unidade.id}>
                        {unidade.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="segmento">Segmento</Label>
              <Select
                value={turmaForm.segmento}
                onValueChange={(value) => setTurmaForm({ ...turmaForm, segmento: String(value) as SegmentoForm })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  <SelectItem value="EDUCACAO_INFANTIL">Educação Infantil</SelectItem>
                  <SelectItem value="FUNDAMENTAL">Fundamental</SelectItem>
                  <SelectItem value="MEDIO">Médio</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="tipo_curso">Tipo de Curso</Label>
              <Input
                id="tipo_curso"
                value={turmaForm.tipo_curso}
                onChange={(e) => setTurmaForm({ ...turmaForm, tipo_curso: e.target.value })}
                placeholder="Ex: Kindergarten 5"
              />
            </div>

            <div>
              <Label htmlFor="turno">Turno</Label>
              <Select
                value={turmaForm.turno}
                onValueChange={(value) => setTurmaForm({ ...turmaForm, turno: value as 'none' | Turno })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  <SelectItem value="MANHA">Manhã</SelectItem>
                  <SelectItem value="TARDE">Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="situacao">Situação</Label>
              <Select value={turmaForm.situacao} onValueChange={(value) => setTurmaForm({ ...turmaForm, situacao: String(value) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVA">Ativa</SelectItem>
                  <SelectItem value="INATIVA">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarTurma} disabled={!turmaForm.descricao.trim() || !turmaForm.empresa_id}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
