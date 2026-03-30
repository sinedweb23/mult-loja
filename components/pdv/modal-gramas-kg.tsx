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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ModalGramasKgProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  produtoNome: string
  precoPorKg: number
  onConfirm: (gramas: number) => void
  /** Ex.: "custo" para consumo interno (exibe "custo por kg") */
  labelValor?: string
}

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function ModalGramasKg({
  open,
  onOpenChange,
  produtoNome,
  precoPorKg,
  onConfirm,
  labelValor = 'preço',
}: ModalGramasKgProps) {
  const [gramas, setGramas] = useState('')

  useEffect(() => {
    if (open) setGramas('')
  }, [open])

  const gramasNum = parseInt(gramas, 10)
  const valido = Number.isFinite(gramasNum) && gramasNum > 0
  const subtotal = valido ? (precoPorKg * gramasNum) / 1000 : 0

  function handleConfirm() {
    if (!valido) return
    onConfirm(gramasNum)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Informe o peso</DialogTitle>
          <DialogDescription>
            {produtoNome} — {labelValor} por kg: {formatPrice(precoPorKg)}. Digite as gramas (ex.: 400 para 400g).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="gramas-kg">Gramas</Label>
            <Input
              id="gramas-kg"
              type="number"
              min={1}
              step={10}
              placeholder="Ex: 400"
              value={gramas}
              onChange={(e) => setGramas(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              autoFocus
            />
          </div>
          {valido && (
            <p className="text-sm text-muted-foreground">
              Total: {formatPrice(subtotal)} ({gramasNum}g)
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!valido}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
