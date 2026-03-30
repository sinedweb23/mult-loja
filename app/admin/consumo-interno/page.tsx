'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { obterRelatorioConsumoInterno, type FiltroConsumoInterno, type RelatorioConsumoInternoPayload } from '@/app/actions/relatorios-consumo-interno'
import { listarDepartamentosComSegmentos, type DepartamentoComSegmentos } from '@/app/actions/departamentos'
import { getAdminData } from '@/app/actions/admin'
import { cancelarConsumoInterno, obterComprovanteConsumoInternoReimpressao } from '@/app/actions/consumo-interno'
import { ComprovanteConsumoInternoModal } from '@/components/pdv/comprovante-consumo-interno-modal'
import type { ComprovanteConsumoInternoData } from '@/app/actions/consumo-interno'
import { Printer, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function formatMoney(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function hojeISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export default function AdminConsumoInternoPage() {
  const [periodo, setPeriodo] = useState<{ dataInicio: string; dataFim: string }>({
    dataInicio: hojeISO(),
    dataFim: hojeISO(),
  })
  const [departamentos, setDepartamentos] = useState<DepartamentoComSegmentos[]>([])
  const [departamentoId, setDepartamentoId] = useState<'todos' | string>('todos')
  const [segmentoId, setSegmentoId] = useState<'todos' | string>('todos')
  const [solicitanteId, setSolicitanteId] = useState<'todos' | string>('todos')
  const [dados, setDados] = useState<RelatorioConsumoInternoPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [buscaSolicitante, setBuscaSolicitante] = useState('')
  const [solicitanteOpen, setSolicitanteOpen] = useState(false)
  const [comprovanteData, setComprovanteData] = useState<ComprovanteConsumoInternoData | null>(null)
  const [showComprovanteModal, setShowComprovanteModal] = useState(false)
  const [reimprimindoId, setReimprimindoId] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [confirmarCancelamentoId, setConfirmarCancelamentoId] = useState<string | null>(null)

  useEffect(() => {
    async function carregarDeps() {
      try {
        const admin = await getAdminData()
        const empresaId = (admin as any).empresa_id ?? admin.empresas?.id
        if (!empresaId) return
        const res = await listarDepartamentosComSegmentos(empresaId)
        setDepartamentos(res)
      } catch (e) {
        console.error(e)
      }
    }
    carregarDeps()
  }, [])

  const carregar = useCallback(async (f: FiltroConsumoInterno) => {
    setLoading(true)
    setErro(null)
    try {
      const payload = await obterRelatorioConsumoInterno(f)
      setDados(payload)
    } catch (e) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao carregar relatório de consumo interno.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar({
      dataInicio: periodo.dataInicio,
      dataFim: periodo.dataFim,
      departamentoId,
      segmentoId,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function aplicarFiltro() {
    carregar({
      dataInicio: periodo.dataInicio,
      dataFim: periodo.dataFim,
      departamentoId,
      segmentoId,
      solicitanteId,
    })
  }

  const segmentosDoDepartamento =
    departamentoId !== 'todos'
      ? departamentos.find((d) => d.id === departamentoId)?.segmentos ?? []
      : []

  const solicitantesFiltrados =
    !dados || !dados.solicitantes
      ? []
      : (buscaSolicitante || '').trim().length === 0
        ? dados.solicitantes
        : dados.solicitantes.filter((s) =>
            s.nome.toLowerCase().includes(buscaSolicitante.toLowerCase().trim())
          )

  async function reimprimirComprovante(lancamentoId: string) {
    setReimprimindoId(lancamentoId)
    try {
      const res = await obterComprovanteConsumoInternoReimpressao(lancamentoId)
      if (res.ok && res.comprovante) {
        setComprovanteData(res.comprovante)
        setShowComprovanteModal(true)
      } else {
        setErro(res.erro ?? 'Erro ao carregar comprovante')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar comprovante')
    } finally {
      setReimprimindoId(null)
    }
  }

  async function confirmarCancelamento() {
    if (!confirmarCancelamentoId) return

    const lancamentoId = confirmarCancelamentoId
    setCancelandoId(lancamentoId)
    setErro(null)
    try {
      const res = await cancelarConsumoInterno(lancamentoId)
      if (!res.ok) {
        setErro(res.erro ?? 'Erro ao cancelar lançamento de consumo interno.')
        return
      }
      aplicarFiltro()
    } catch (e) {
      console.error(e)
      setErro(
        e instanceof Error ? e.message : 'Erro ao cancelar lançamento de consumo interno.'
      )
    } finally {
      setCancelandoId(null)
      setConfirmarCancelamentoId(null)
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Relatório de Consumo Interno</h1>
        <p className="text-muted-foreground mt-1">
          Visualize todos os lançamentos de consumo interno por período, departamento e segmento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Data início</Label>
              <Input
                type="date"
                value={periodo.dataInicio}
                onChange={(e) => setPeriodo((p) => ({ ...p, dataInicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Data fim</Label>
              <Input
                type="date"
                value={periodo.dataFim}
                onChange={(e) => setPeriodo((p) => ({ ...p, dataFim: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Departamento</Label>
              <Select
                value={departamentoId}
                onValueChange={(v) => {
                  setDepartamentoId(v as any)
                  setSegmentoId('todos')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Segmento</Label>
              <Select
                value={segmentoId}
                onValueChange={(v) => setSegmentoId(v as any)}
                disabled={departamentoId === 'todos'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {segmentosDoDepartamento.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Solicitante</Label>
              <div className="relative">
                <Input
                  placeholder="Buscar solicitante..."
                  value={
                    buscaSolicitante ||
                    (dados?.solicitantes.find((s) => s.id === solicitanteId)?.nome ?? '')
                  }
                  onChange={(e) => {
                    setBuscaSolicitante(e.target.value)
                    if (!solicitanteOpen) setSolicitanteOpen(true)
                  }}
                  onFocus={() => setSolicitanteOpen(true)}
                  disabled={!dados || dados.solicitantes.length === 0}
                />
                {solicitanteOpen && dados && dados.solicitantes.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
                    {solicitantesFiltrados.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground">Nenhum solicitante encontrado.</p>
                    ) : (
                      <ul className="p-1 text-sm">
                        <li>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-1 rounded-sm hover:bg-accent hover:text-accent-foreground text-xs"
                            onClick={() => {
                              setSolicitanteId('todos')
                              setBuscaSolicitante('')
                              setSolicitanteOpen(false)
                            }}
                          >
                            Todos
                          </button>
                        </li>
                        {solicitantesFiltrados.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-1 rounded-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setSolicitanteId(s.id)
                                setBuscaSolicitante(s.nome)
                                setSolicitanteOpen(false)
                              }}
                            >
                              {s.nome}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={aplicarFiltro} disabled={loading}>
              {loading ? 'Carregando…' : 'Aplicar filtros'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && dados && (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total geral</p>
                  <p className="font-semibold">{formatMoney(dados.total_geral)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Por departamento</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    {dados.por_departamento.map((d) => (
                      <li key={d.departamento_id}>
                        <span className="font-medium">{d.departamento_nome}:</span> {formatMoney(d.total_custo)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground">Por segmento</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    {dados.por_segmento.map((s) => (
                      <li key={s.segmento_id}>
                        <span className="font-medium">{s.segmento_nome}:</span> {formatMoney(s.total_custo)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos detalhados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loading && dados && dados.lancamentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado no período.</p>
          )}
          {!loading && dados && dados.lancamentos.length > 0 && (
            <div className="space-y-3 text-xs md:text-sm">
              {dados.lancamentos.map((lanc) => (
                <div key={lanc.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {lanc.solicitante_nome}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(lanc.created_at).toLocaleString('pt-BR')} • {lanc.departamento_nome} • {lanc.segmento_nome}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Operador: <span className="font-medium text-foreground">{lanc.operador_nome}</span> • Retirado por:{' '}
                        <span className="font-medium text-foreground">{lanc.retirado_por_nome}</span>
                      </p>
                      {lanc.status === 'CANCELADO' && (
                        <p className="mt-1 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Lançamento cancelado
                        </p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={reimprimindoId === lanc.id}
                        onClick={() => reimprimirComprovante(lanc.id)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {reimprimindoId === lanc.id ? 'Carregando…' : 'Reimprimir comprovante'}
                      </Button>
                      {lanc.status !== 'CANCELADO' && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="mt-1 gap-1.5"
                          disabled={cancelandoId === lanc.id}
                          onClick={() => setConfirmarCancelamentoId(lanc.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {cancelandoId === lanc.id ? 'Cancelando…' : 'Cancelar lançamento'}
                        </Button>
                      )}
                      <div>
                        <p className="text-muted-foreground text-xs">Total (custo)</p>
                        <p className="font-semibold">{formatMoney(lanc.total_custo)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 border-t pt-2 space-y-1">
                    {lanc.itens.map((item, idx) => (
                      <div key={idx} className="flex justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{item.produto_nome}</span>
                          {item.quantidade_display ? (
                            <span className="text-muted-foreground text-xs ml-1">
                              ({item.quantidade_display})
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs ml-1">
                              ({item.quantidade} un.)
                            </span>
                          )}
                        </div>
                        <span className="whitespace-nowrap text-xs md:text-sm">
                          {formatMoney(item.total_custo)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ComprovanteConsumoInternoModal
        open={showComprovanteModal}
        onClose={() => {
          setShowComprovanteModal(false)
          setComprovanteData(null)
        }}
        dados={comprovanteData}
      />
      <Dialog open={!!confirmarCancelamentoId} onOpenChange={(open) => !open && setConfirmarCancelamentoId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar lançamento de consumo interno</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este lançamento? O estoque será estornado e o lançamento ficará marcado como cancelado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmarCancelamentoId(null)}
              disabled={cancelandoId === confirmarCancelamentoId}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmarCancelamento}
              disabled={cancelandoId === confirmarCancelamentoId}
            >
              {cancelandoId === confirmarCancelamentoId ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

