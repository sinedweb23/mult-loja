'use client'

import { useState, useEffect } from 'react'
import { getAdminData } from '@/app/actions/admin'
import { listarEmpresas } from '@/app/actions/empresas'
import {
  listarFeriadosFixos,
  criarFeriadoFixo,
  excluirFeriadoFixo,
  listarEventos,
  criarEvento,
  criarEventosPeriodo,
  excluirEvento,
  obterConfigFimSemana,
  salvarConfigFimSemana,
  type FeriadoFixo,
  type CalendarioEvento,
} from '@/app/actions/calendario'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Trash2, Plus, CalendarDays } from 'lucide-react'

const MESES = [
  { v: 1, label: 'Janeiro' }, { v: 2, label: 'Fevereiro' }, { v: 3, label: 'Março' },
  { v: 4, label: 'Abril' }, { v: 5, label: 'Maio' }, { v: 6, label: 'Junho' },
  { v: 7, label: 'Julho' }, { v: 8, label: 'Agosto' }, { v: 9, label: 'Setembro' },
  { v: 10, label: 'Outubro' }, { v: 11, label: 'Novembro' }, { v: 12, label: 'Dezembro' },
]

function formatarData(s: string) {
  const d = new Date(s + 'T12:00:00Z')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CalendarioPage() {
  const [loading, setLoading] = useState(true)
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])
  const [empresaId, setEmpresaId] = useState<string | null>(null)

  const [feriados, setFeriados] = useState<FeriadoFixo[]>([])
  const [eventos, setEventos] = useState<CalendarioEvento[]>([])
  const [configFimSemana, setConfigFimSemana] = useState<{ sabado_util: boolean; domingo_util: boolean } | null>(null)

  const [novoFeriadoMes, setNovoFeriadoMes] = useState(1)
  const [novoFeriadoDia, setNovoFeriadoDia] = useState(1)
  const [novoFeriadoDesc, setNovoFeriadoDesc] = useState('')
  const [salvandoFeriado, setSalvandoFeriado] = useState(false)

  const [modoEvento, setModoEvento] = useState<'uma' | 'periodo'>('uma')
  const [novoEventoData, setNovoEventoData] = useState('')
  const [novoEventoDataFim, setNovoEventoDataFim] = useState('')
  const [novoEventoAno, setNovoEventoAno] = useState('')
  const [novoEventoDesc, setNovoEventoDesc] = useState('')
  const [novoEventoEmpresaId, setNovoEventoEmpresaId] = useState<string>('')
  const [salvandoEvento, setSalvandoEvento] = useState(false)

  const [sabadoUtil, setSabadoUtil] = useState(false)
  const [domingoUtil, setDomingoUtil] = useState(false)
  const [salvandoFimSemana, setSalvandoFimSemana] = useState(false)

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    if (empresaId) {
      obterConfigFimSemana(empresaId).then((c) => {
        if (c) setConfigFimSemana({ sabado_util: c.sabado_util, domingo_util: c.domingo_util })
        else setConfigFimSemana({ sabado_util: false, domingo_util: false })
      })
    } else {
      setConfigFimSemana(null)
    }
  }, [empresaId])

  useEffect(() => {
    if (configFimSemana) {
      setSabadoUtil(configFimSemana.sabado_util)
      setDomingoUtil(configFimSemana.domingo_util)
    }
  }, [configFimSemana])

  async function carregar() {
    setLoading(true)
    setMsg(null)
    try {
      const adminData = await getAdminData()
      let idEmpresa = adminData.empresa_id ?? null
      if (!idEmpresa) {
        const list = await listarEmpresas()
        const primeira = Array.isArray(list) && list.length > 0 ? list[0] : null
        idEmpresa = primeira ? (primeira as { id: string }).id : null
      }
      setEmpresaId(idEmpresa)
      setEmpresas((await listarEmpresas()) as { id: string; nome: string }[])

      const [feriadosList, eventosList] = await Promise.all([
        listarFeriadosFixos(),
        listarEventos(),
      ])
      setFeriados(feriadosList)
      setEventos(eventosList)
    } catch (e) {
      console.error(e)
      setMsg({ tipo: 'erro', texto: 'Erro ao carregar dados' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAdicionarFeriado(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoFeriado(true)
    setMsg(null)
    const res = await criarFeriadoFixo({ mes: novoFeriadoMes, dia: novoFeriadoDia, descricao: novoFeriadoDesc || null })
    setSalvandoFeriado(false)
    if (res.ok) {
      setNovoFeriadoDesc('')
      setFeriados(await listarFeriadosFixos())
      setMsg({ tipo: 'ok', texto: 'Feriado fixo adicionado' })
    } else {
      setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao salvar' })
    }
  }

  async function handleExcluirFeriado(id: string) {
    const res = await excluirFeriadoFixo(id)
    if (res.ok) setFeriados(await listarFeriadosFixos())
    else setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao excluir' })
  }

  async function handleAdicionarEvento(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const ano = novoEventoAno ? parseInt(novoEventoAno, 10) : null
    const empresaId = novoEventoEmpresaId || null

    if (modoEvento === 'periodo') {
      if (!novoEventoData || !novoEventoDataFim) {
        setMsg({ tipo: 'erro', texto: 'Informe a data inicial e a data final do período.' })
        return
      }
      if (novoEventoData > novoEventoDataFim) {
        setMsg({ tipo: 'erro', texto: 'A data final deve ser igual ou posterior à data inicial.' })
        return
      }
      setSalvandoEvento(true)
      const res = await criarEventosPeriodo({
        data_inicio: novoEventoData,
        data_fim: novoEventoDataFim,
        ano_especifico: ano,
        descricao: novoEventoDesc || null,
        empresa_id: empresaId,
      })
      setSalvandoEvento(false)
      if (res.ok) {
        setNovoEventoData('')
        setNovoEventoDataFim('')
        setNovoEventoAno('')
        setNovoEventoDesc('')
        setEventos(await listarEventos())
        setMsg({ tipo: 'ok', texto: `${res.quantidade ?? 0} data(s) adicionada(s) ao período.` })
      } else {
        setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao salvar' })
      }
      return
    }

    if (!novoEventoData) {
      setMsg({ tipo: 'erro', texto: 'Informe a data' })
      return
    }
    setSalvandoEvento(true)
    const res = await criarEvento({
      data: novoEventoData,
      ano_especifico: ano,
      descricao: novoEventoDesc || null,
      empresa_id: empresaId,
    })
    setSalvandoEvento(false)
    if (res.ok) {
      setNovoEventoData('')
      setNovoEventoAno('')
      setNovoEventoDesc('')
      setEventos(await listarEventos())
      setMsg({ tipo: 'ok', texto: 'Data específica adicionada' })
    } else {
      setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao salvar' })
    }
  }

  async function handleExcluirEvento(id: string) {
    const res = await excluirEvento(id)
    if (res.ok) setEventos(await listarEventos())
    else setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao excluir' })
  }

  async function handleSalvarFimSemana() {
    if (!empresaId) {
      setMsg({ tipo: 'erro', texto: 'Selecione uma empresa' })
      return
    }
    setSalvandoFimSemana(true)
    setMsg(null)
    const res = await salvarConfigFimSemana(empresaId, sabadoUtil, domingoUtil)
    setSalvandoFimSemana(false)
    if (res.ok) {
      setConfigFimSemana({ sabado_util: sabadoUtil, domingo_util: domingoUtil })
      setMsg({ tipo: 'ok', texto: 'Configuração de fim de semana salva' })
    } else {
      setMsg({ tipo: 'erro', texto: res.erro || 'Erro ao salvar' })
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Calendário</h1>
          <p className="text-sm text-muted-foreground">
            Defina feriados fixos, datas específicas e se sábado/domingo são dias úteis.
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            msg.tipo === 'ok' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {msg.texto}
        </div>
      )}

      <Tabs defaultValue="feriados" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="feriados">Feriados fixos</TabsTrigger>
          <TabsTrigger value="eventos">Datas específicas</TabsTrigger>
          <TabsTrigger value="fim-semana">Fim de semana</TabsTrigger>
        </TabsList>

        <TabsContent value="feriados" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feriados e datas fixas (todo ano)</CardTitle>
              <CardDescription>
                Datas que se repetem todo ano e são consideradas não úteis (ex.: 01/01, 25/12, 07/09).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAdicionarFeriado} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Mês</Label>
                  <Select value={String(novoFeriadoMes)} onValueChange={(v) => setNovoFeriadoMes(parseInt(v, 10))}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((m) => (
                        <SelectItem key={m.v} value={String(m.v)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Dia</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={novoFeriadoDia}
                    onChange={(e) => setNovoFeriadoDia(parseInt(e.target.value, 10) || 1)}
                    className="w-20"
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label>Descrição (opcional)</Label>
                  <Input
                    placeholder="Ex.: Ano Novo"
                    value={novoFeriadoDesc}
                    onChange={(e) => setNovoFeriadoDesc(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={salvandoFeriado}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </form>
              <ul className="border rounded-md divide-y">
                {feriados.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum feriado fixo cadastrado.</li>
                )}
                {feriados.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm">
                      {String(f.dia).padStart(2, '0')}/{String(f.mes).padStart(2, '0')}
                      {f.descricao ? ` – ${f.descricao}` : ''}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleExcluirFeriado(f.id)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eventos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Datas específicas (eventos pontuais)</CardTitle>
              <CardDescription>
                Reunião de pais, feriado municipal, treinamento etc. Podem ser só para um ano ou recorrentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAdicionarEvento} className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={modoEvento === 'uma' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setModoEvento('uma')}
                  >
                    Uma data
                  </Button>
                  <Button
                    type="button"
                    variant={modoEvento === 'periodo' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setModoEvento('periodo')}
                  >
                    Período (de ... até ...)
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <Label>{modoEvento === 'periodo' ? 'Data inicial' : 'Data'}</Label>
                    <Input
                      type="date"
                      value={novoEventoData}
                      onChange={(e) => setNovoEventoData(e.target.value)}
                      required={modoEvento === 'uma'}
                    />
                  </div>
                  {modoEvento === 'periodo' && (
                    <div className="space-y-1">
                      <Label>Data final</Label>
                      <Input
                        type="date"
                        value={novoEventoDataFim}
                        onChange={(e) => setNovoEventoDataFim(e.target.value)}
                        min={novoEventoData}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>Ano (vazio = todo ano)</Label>
                    <Input
                      type="number"
                      placeholder="Ex.: 2025"
                      min={2020}
                      max={2100}
                      value={novoEventoAno}
                      onChange={(e) => setNovoEventoAno(e.target.value)}
                      className="w-24"
                    />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[160px]">
                    <Label>Descrição</Label>
                    <Input
                      placeholder="Ex.: Reunião de pais"
                      value={novoEventoDesc}
                      onChange={(e) => setNovoEventoDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1 min-w-[200px]">
                    <Label>Aplicar a</Label>
                    <Select value={novoEventoEmpresaId || 'todas'} onValueChange={(v) => setNovoEventoEmpresaId(v === 'todas' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas as empresas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as empresas</SelectItem>
                        {empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={salvandoEvento}>
                    <Plus className="h-4 w-4 mr-2" />
                    {modoEvento === 'periodo' ? 'Adicionar período' : 'Adicionar'}
                  </Button>
                </div>
              </form>
              <ul className="border rounded-md divide-y max-h-[320px] overflow-y-auto">
                {eventos.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">Nenhuma data específica cadastrada.</li>
                )}
                {eventos.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm">
                      {formatarData(ev.data)}
                      {ev.ano_especifico == null && ' (todo ano)'}
                      {ev.descricao ? ` – ${ev.descricao}` : ''}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleExcluirEvento(ev.id)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fim-semana" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Finais de semana</CardTitle>
              <CardDescription>
                Defina se sábado e domingo são dias úteis para cada empresa (ex.: empresas que trabalham aos sábados).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={empresaId || ''}
                  onValueChange={(v) => setEmpresaId(v || null)}
                  disabled={empresas.length === 0}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!empresaId && empresas.length > 0 && (
                <p className="text-sm text-muted-foreground">Selecione uma empresa para configurar.</p>
              )}
              {empresaId && (
                <>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="sabado"
                      checked={sabadoUtil}
                      onChange={(e) => setSabadoUtil(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="sabado" className="cursor-pointer font-medium">Sábado é dia útil?</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="domingo"
                      checked={domingoUtil}
                      onChange={(e) => setDomingoUtil(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="domingo" className="cursor-pointer font-medium">Domingo é dia útil?</Label>
                  </div>
                  <Button onClick={handleSalvarFimSemana} disabled={salvandoFimSemana}>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Salvar configuração
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
