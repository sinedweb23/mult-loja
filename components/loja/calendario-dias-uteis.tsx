'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listarDatasDiasUteisMes } from '@/app/actions/dias-uteis'
import { todayISO } from '@/lib/date'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatarDataKey(date: Date): string {
  return todayISO(date)
}

interface CalendarioDiasUteisProps {
  diasSelecionados: string[]
  onSelecaoChange: (dias: string[]) => void
  minDias?: number
  maxDias?: number
  /** Quando informado, só os dias cadastrados como úteis para esta empresa ficam ativos. */
  empresaId?: string
  /** Oculta a descrição abaixo do título do mês. */
  ocultarDescricao?: boolean
}

export function CalendarioDiasUteis({
  diasSelecionados,
  onSelecaoChange,
  minDias = 1,
  maxDias,
  empresaId,
  ocultarDescricao = false,
}: CalendarioDiasUteisProps) {
  const [mesAtual, setMesAtual] = useState(() => {
    const d = new Date()
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })
  const [datasCadastradas, setDatasCadastradas] = useState<string[]>([])
  const [carregandoDatas, setCarregandoDatas] = useState(false)

  useEffect(() => {
    if (!empresaId) {
      setDatasCadastradas([])
      return
    }
    setCarregandoDatas(true)
    const ano = mesAtual.ano
    const mes = mesAtual.mes + 1
    listarDatasDiasUteisMes(empresaId, ano, mes)
      .then(setDatasCadastradas)
      .catch(() => setDatasCadastradas([]))
      .finally(() => setCarregandoDatas(false))
  }, [empresaId, mesAtual.ano, mesAtual.mes])

  const diaEhSelecionavel = (dateKey: string, date: Date): boolean => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (date < hoje) return false
    if (empresaId) {
      return datasCadastradas.includes(dateKey)
    }
    const dia = date.getDay()
    return dia >= 1 && dia <= 5
  }

  const toggleDia = (dateKey: string, date: Date) => {
    if (!diaEhSelecionavel(dateKey, date)) return

    const set = new Set(diasSelecionados)
    if (set.has(dateKey)) {
      set.delete(dateKey)
    } else {
      if (maxDias && set.size >= maxDias) {
        if (maxDias === 1) onSelecaoChange([dateKey])
        return
      }
      set.add(dateKey)
    }
    onSelecaoChange(Array.from(set).sort())
  }

  const irProximoMes = () => {
    if (mesAtual.mes === 11) {
      setMesAtual({ ano: mesAtual.ano + 1, mes: 0 })
    } else {
      setMesAtual({ ano: mesAtual.ano, mes: mesAtual.mes + 1 })
    }
  }

  const irMesAnterior = () => {
    if (mesAtual.mes === 0) {
      setMesAtual({ ano: mesAtual.ano - 1, mes: 11 })
    } else {
      setMesAtual({ ano: mesAtual.ano, mes: mesAtual.mes - 1 })
    }
  }

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const primeiroDia = new Date(mesAtual.ano, mesAtual.mes, 1)
  const inicioGrid = new Date(primeiroDia)
  inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay())

  const dias: Date[] = []
  const d = new Date(inicioGrid)
  for (let i = 0; i < 42; i++) {
    dias.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={irMesAnterior}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base">
            {primeiroDia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={irProximoMes}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!ocultarDescricao && (
          <CardDescription>
            {empresaId
              ? 'Clique nos dias disponíveis (configurados pela escola) para selecionar. Dias não cadastrados ficam desativados.'
              : 'Clique nos dias úteis (segunda a sexta) para selecionar. Quantidade = dias selecionados.'}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {carregandoDatas && empresaId && (
          <p className="text-sm text-muted-foreground mb-2">Carregando dias disponíveis...</p>
        )}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DIAS_SEMANA.map(dia => (
            <div key={dia} className="text-center text-xs font-medium text-muted-foreground py-1">
              {dia}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((date, i) => {
            const key = formatarDataKey(date)
            const selecionado = diasSelecionados.includes(key)
            const passado = date < hoje
            const doMes = date.getMonth() === mesAtual.mes
            const clicavel = doMes && diaEhSelecionavel(key, date)

            return (
              <button
                key={i}
                type="button"
                disabled={!clicavel}
                onClick={() => clicavel && toggleDia(key, date)}
                className={cn(
                  'aspect-square rounded-md text-sm font-medium transition-colors',
                  !doMes && 'text-muted-foreground/50',
                  clicavel && 'hover:bg-primary/20 cursor-pointer',
                  doMes && !clicavel && 'bg-muted/50 text-muted-foreground/60 cursor-not-allowed',
                  selecionado && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          <strong>{diasSelecionados.length}</strong> dia(s) selecionado(s)
          {diasSelecionados.length > 0 && minDias > 0 && diasSelecionados.length < minDias && (
            <span className="text-amber-600"> — selecione pelo menos {minDias}</span>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
