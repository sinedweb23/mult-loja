'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getHorariosDisponiveisKitFestaAdmin } from '@/app/actions/kit-festa'
import { alterarDataKitFestaAdmin } from '@/app/actions/pedidos-kit-festa'

type Slot = { inicio: string; fim: string }

function normalizarHora(h: string) {
  return (h || '').replace(/^(\d):/, '0$1:')
}

export function AlterarDataKitFestaButton(props: {
  itemId: string
  produtoId: string | null
  googleEventId: string | null
  dataAtual: string | null
  inicioAtual: string | null
  fimAtual: string | null
}) {
  const [open, setOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [data, setData] = useState<string>('')
  const [horarios, setHorarios] = useState<Slot[]>([])
  const [horario, setHorario] = useState<Slot | null>(null)
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setData(props.dataAtual ?? '')
    setHorario(
      props.inicioAtual && props.fimAtual ? { inicio: props.inicioAtual, fim: props.fimAtual } : null
    )
  }, [open, props.dataAtual, props.inicioAtual, props.fimAtual])

  useEffect(() => {
    if (!open) return
    if (!props.produtoId || !data) {
      setHorarios([])
      return
    }
    setCarregandoHorarios(true)
    setErro(null)
    getHorariosDisponiveisKitFestaAdmin(props.produtoId, data, { ignoreEventId: props.googleEventId ?? undefined })
      .then((res) => {
        setHorarios(res.horarios || [])
        if (res.erro) setErro(res.erro)
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao consultar horários.'))
      .finally(() => setCarregandoHorarios(false))
  }, [open, props.produtoId, data, props.googleEventId])

  const horarioValue = useMemo(() => {
    if (!horario) return ''
    const key = horarios.find(
      (h) => normalizarHora(h.inicio) === normalizarHora(horario.inicio) && normalizarHora(h.fim) === normalizarHora(horario.fim)
    )
    return key ? `${key.inicio}-${key.fim}` : ''
  }, [horario, horarios])

  async function salvar() {
    if (!props.produtoId) {
      setErro('Produto do item não encontrado.')
      return
    }
    if (!data) {
      setErro('Selecione a data.')
      return
    }
    if (!horario) {
      setErro('Selecione o horário.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const res = await alterarDataKitFestaAdmin({
        itemId: props.itemId,
        novaData: data,
        novoHorarioInicio: horario.inicio,
        novoHorarioFim: horario.fim,
      })
      if (!res.ok) {
        setErro(res.erro ?? 'Erro ao salvar.')
        return
      }
      setOpen(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Alterar data
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar data da festa</DialogTitle>
            <DialogDescription>
              Ao salvar, o sistema atualiza o pedido e o evento na Google Agenda (respeitando disponibilidade).
            </DialogDescription>
          </DialogHeader>

          {erro && (
            <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
              {erro}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setHorario(null) }} />
            </div>

            <div className="space-y-2">
              <Label>Horário</Label>
              {carregandoHorarios ? (
                <p className="text-sm text-muted-foreground">Verificando disponibilidade na agenda...</p>
              ) : (
                <Select
                  value={horarioValue}
                  onValueChange={(v) => {
                    const [inicio, fim] = v.split('-')
                    setHorario(inicio && fim ? { inicio, fim } : null)
                  }}
                  disabled={!data || horarios.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!data ? 'Selecione a data primeiro' : (horarios.length ? 'Selecione o horário' : 'Sem horários disponíveis')} />
                  </SelectTrigger>
                  <SelectContent>
                    {horarios.map((h) => (
                      <SelectItem key={`${h.inicio}-${h.fim}`} value={`${h.inicio}-${h.fim}`}>
                        {h.inicio} às {h.fim}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {data && !carregandoHorarios && horarios.length === 0 && !erro && (
                <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data (ocupado na agenda).</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !data || !horario}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

