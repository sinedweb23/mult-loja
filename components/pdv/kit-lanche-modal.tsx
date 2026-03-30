'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CalendarioDiasUteis } from '@/components/loja/calendario-dias-uteis'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { obterDiasUteis, obterDatasDiasUteisMes } from '@/app/actions/dias-uteis'

const MESES = [
  { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' }, { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' }, { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' }, { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' },
]

export type KitLancheTipo = 'AVULSO' | 'MENSAL'

interface KitLancheModalProps {
  open: boolean
  onClose: () => void
  tipo: KitLancheTipo
  produtoNome: string
  precoBase: number
  empresaId: string
  descontoMensalPct?: number | null
  onConfirmAvulso: (dias: string[], precoPorDia: number) => void
  onConfirmMensal: (datas: string[], precoPorDia: number) => void
}

export function KitLancheModal({
  open,
  onClose,
  tipo,
  produtoNome,
  precoBase,
  empresaId,
  descontoMensalPct = 0,
  onConfirmAvulso,
  onConfirmMensal,
}: KitLancheModalProps) {
  const [diasSelecionados, setDiasSelecionados] = useState<string[]>([])
  const [mesRef, setMesRef] = useState<number>(() => {
    const d = new Date()
    let m = d.getMonth() + 2
    let y = d.getFullYear()
    if (m > 12) { m = 1; y += 1 }
    return m
  })
  const [anoRef, setAnoRef] = useState<number>(() => {
    const d = new Date()
    let m = d.getMonth() + 2
    let y = d.getFullYear()
    if (m > 12) y += 1
    return y
  })
  const [diasUteisMes, setDiasUteisMes] = useState(0)
  const [carregandoDias, setCarregandoDias] = useState(false)

  useEffect(() => {
    if (!open) return
    setDiasSelecionados([])
  }, [open])

  useEffect(() => {
    if (!open || tipo !== 'MENSAL' || !empresaId) return
    setCarregandoDias(true)
    obterDiasUteis(empresaId, anoRef, mesRef)
      .then(setDiasUteisMes)
      .catch(() => setDiasUteisMes(0))
      .finally(() => setCarregandoDias(false))
  }, [open, tipo, empresaId, anoRef, mesRef])

  const desconto = Number(descontoMensalPct ?? 0) / 100
  const totalMensal = precoBase * diasUteisMes * (1 - desconto)
  const precoPorDiaMensal = diasUteisMes > 0 ? totalMensal / diasUteisMes : 0

  function handleConfirm() {
    if (tipo === 'AVULSO') {
      if (diasSelecionados.length === 0) {
        alert('Selecione pelo menos um dia no calendário.')
        return
      }
      const precoPorDia = precoBase
      onConfirmAvulso(diasSelecionados, precoPorDia)
    } else {
      if (diasUteisMes === 0) {
        alert('Não há dias úteis configurados para este mês. Configure no painel admin.')
        return
      }
      setCarregandoDias(true)
      obterDatasDiasUteisMes(empresaId, anoRef, mesRef)
        .then((datas) => {
          onConfirmMensal(datas, precoPorDiaMensal)
        })
        .catch(() => alert('Erro ao carregar datas do mês.'))
        .finally(() => setCarregandoDias(false))
    }
    onClose()
  }

  const anos = [anoRef - 1, anoRef, anoRef + 1]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kit Lanche {tipo === 'MENSAL' ? 'Mensal' : 'Avulso'}</DialogTitle>
          <DialogDescription>{produtoNome}</DialogDescription>
        </DialogHeader>

        {tipo === 'AVULSO' && (
          <div className="space-y-2">
            <Label>Selecione os dias de retirada (dias úteis cadastrados)</Label>
            <CalendarioDiasUteis
              empresaId={empresaId}
              diasSelecionados={diasSelecionados}
              onSelecaoChange={setDiasSelecionados}
              minDias={1}
            />
            <p className="text-sm text-muted-foreground">
              Total: {diasSelecionados.length} dia(s) × {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoBase)} ={' '}
              <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoBase * diasSelecionados.length)}</strong>
            </p>
          </div>
        )}

        {tipo === 'MENSAL' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês</Label>
                <Select value={String(mesRef)} onValueChange={(v) => setMesRef(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Select value={String(anoRef)} onValueChange={(v) => setAnoRef(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {carregandoDias ? (
              <p className="text-sm text-muted-foreground">Carregando dias úteis...</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <strong>{diasUteisMes}</strong> dia(s) úteis no mês.
                  {desconto > 0 && (
                    <span> Desconto mensal: {(desconto * 100).toFixed(0)}%</span>
                  )}
                </p>
                <p className="text-sm font-medium">
                  Total do mês: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMensal)}
                  {diasUteisMes > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {' '}({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoPorDiaMensal)}/dia)
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={
              (tipo === 'AVULSO' && diasSelecionados.length === 0) ||
              (tipo === 'MENSAL' && (diasUteisMes === 0 || carregandoDias))
            }
          >
            Adicionar ao carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
