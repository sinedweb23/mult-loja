'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatarDataKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface CalendarioDiasUteisAdminProps {
  ano: number
  mes: number
  diasSelecionados: string[]
  onSelecaoChange: (dias: string[]) => void
  onMesAnterior: () => void
  onProximoMes: () => void
}

export function CalendarioDiasUteisAdmin({
  ano,
  mes,
  diasSelecionados,
  onSelecaoChange,
  onMesAnterior,
  onProximoMes,
}: CalendarioDiasUteisAdminProps) {
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0)
  const inicioGrid = new Date(primeiroDia)
  inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay())

  const dias: Date[] = []
  const d = new Date(inicioGrid)
  for (let i = 0; i < 42; i++) {
    dias.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }

  const toggleDia = (dateKey: string) => {
    const set = new Set(diasSelecionados)
    if (set.has(dateKey)) {
      set.delete(dateKey)
    } else {
      set.add(dateKey)
    }
    onSelecaoChange(Array.from(set).sort())
  }

  const mesExibicao = primeiroDia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" onClick={onMesAnterior}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base capitalize">{mesExibicao}</CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onProximoMes}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Clique nos dias que são dias úteis neste mês. Depois vá ao próximo mês e repita. Salve ao final.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="text-center text-xs font-medium text-muted-foreground py-1">
              {dia}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((date, i) => {
            const key = formatarDataKey(date)
            const selecionado = diasSelecionados.includes(key)
            const doMes = date.getMonth() === mes - 1

            return (
              <button
                key={i}
                type="button"
                onClick={() => doMes && toggleDia(key)}
                className={cn(
                  'aspect-square rounded-md text-sm font-medium transition-colors',
                  !doMes && 'text-muted-foreground/30',
                  doMes && 'hover:bg-primary/20 cursor-pointer',
                  selecionado && doMes && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          <strong>{diasSelecionados.length}</strong> dia(s) selecionado(s) neste mês
        </p>
      </CardContent>
    </Card>
  )
}
