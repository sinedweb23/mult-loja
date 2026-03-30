'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import type { ComprovanteConsumoInternoData } from '@/app/actions/consumo-interno'

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDataHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function gerarHtmlTermico(dados: ComprovanteConsumoInternoData): string {
  const linhas: string[] = []
  const L = (s: string) => linhas.push(s)
  const Lc = (s: string) => linhas.push(`<div class="center">${s}</div>`)
  const Lb = (s: string) => linhas.push(`<div class="bold">${s}</div>`)

  const pessoasDiferentes = dados.solicitante_nome !== dados.retirado_por_nome

  L('<div class="recibo">')
  Lc(dados.nome_loja.trim() || 'Consumo Interno')
  L('')
  Lb('*** CONSUMO INTERNO ***')
  L('')
  Lc(formatDataHora(dados.data_hora))
  L(`<div class="item">Operador: ${dados.operador_nome}</div>`)
  L(`<div class="item">Depto: ${dados.departamento_nome} / ${dados.segmento_nome}</div>`)
  L('')
  Lb(`Solicitante: ${dados.solicitante_nome}`)
  Lb(`Retirado por: ${dados.retirado_por_nome}`)
  L('')
  L('--------------------------------')
  dados.itens.forEach((item) => {
    const nome = item.produto_nome + (item.variacao_label ? ` (${item.variacao_label})` : '')
    L(`<div class="item">${nome}</div>`)
    const qtyLine = item.quantidade_display
      ? `${item.quantidade_display} (${formatMoney(item.custo_unitario)}/kg) = ${formatMoney(item.total_custo)}`
      : `${item.quantidade} x ${formatMoney(item.custo_unitario)} = ${formatMoney(item.total_custo)}`
    L(`<div class="item sub">${qtyLine}</div>`)
  })
  L('--------------------------------')
  Lb(`TOTAL (custo): ${formatMoney(dados.total_custo)}`)
  L('')
  if (pessoasDiferentes) {
    L('Assinatura do solicitante:')
    L('_________________________________')
    L('')
    L('Assinatura de quem retirou:')
    L('_________________________________')
  } else {
    L('Assinatura: _________________________')
  }
  L('')
  Lc('Obrigado!')
  L('</div>')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comprovante Consumo Interno</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 17px;
      font-weight: 600;
      color: #000;
      padding: 8px;
      width: 80mm;
      max-width: 80mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .recibo { width: 80mm; color: #000; font-size: 17px; }
    .center { text-align: center; }
    .bold { font-weight: 700; color: #000; }
    .item { margin: 4px 0; color: #000; font-weight: 600; font-size: 16px; }
    .item.sub { font-size: 15px; color: #000; font-weight: 600; }
  </style>
</head>
<body>
  ${linhas.join('\n')}
</body>
</html>`
  return html
}

export interface ComprovanteConsumoInternoModalProps {
  open: boolean
  onClose: () => void
  dados: ComprovanteConsumoInternoData | null
}

export function ComprovanteConsumoInternoModal({
  open,
  onClose,
  dados,
}: ComprovanteConsumoInternoModalProps) {
  const fecharJanelaAposImpressao = (w: Window | null) => {
    if (!w) return
    let executado = false
    let timeoutId: ReturnType<typeof setTimeout>
    const fechar = () => {
      if (executado) return
      executado = true
      clearTimeout(timeoutId)
      try {
        if (!w.closed) w.close()
      } catch (_) {
        /* ignorar */
      }
    }
    w.onafterprint = fechar
    timeoutId = setTimeout(fechar, 2500)
  }

  const handleImprimir = () => {
    if (!dados) return
    const html = gerarHtmlTermico(dados)
    const w = window.open('', '_blank', 'width=320,height=480')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      fecharJanelaAposImpressao(w)
    }
  }

  const pessoasDiferentes = dados ? dados.solicitante_nome !== dados.retirado_por_nome : false

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md shadow-xl rounded-xl border bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Comprovante de Consumo Interno</DialogTitle>
          <DialogDescription>
            Imprima o comprovante. Quando solicitante e quem retirou forem pessoas diferentes, ambas assinam.
          </DialogDescription>
        </DialogHeader>
        {dados && (
          <div className="py-4">
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-1 max-h-72 overflow-y-auto">
              <div className="text-center font-semibold">{dados.nome_loja}</div>
              <div className="text-center font-semibold text-primary">CONSUMO INTERNO</div>
              <div className="text-center text-muted-foreground text-xs">{formatDataHora(dados.data_hora)}</div>
              <div className="text-xs">Operador: {dados.operador_nome}</div>
              <div className="text-xs">Depto: {dados.departamento_nome} / {dados.segmento_nome}</div>
              <div className="font-medium mt-2">Solicitante: {dados.solicitante_nome}</div>
              <div className="font-medium">Retirado por: {dados.retirado_por_nome}</div>
              <div className="border-t my-2" />
              {dados.itens.map((item, i) => (
                <div key={i} className="flex justify-between gap-2 flex-wrap text-xs">
                  <span>
                    {item.produto_nome}
                    {item.variacao_label && <span className="text-muted-foreground"> ({item.variacao_label})</span>}
                    {item.quantidade_display ? (
                      <span className="text-muted-foreground"> — {item.quantidade_display}</span>
                    ) : (
                      <span className="text-muted-foreground"> — {item.quantidade} un.</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">{formatMoney(item.total_custo)}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 font-semibold flex justify-between text-sm">
                <span>Total (custo)</span>
                <span>{formatMoney(dados.total_custo)}</span>
              </div>
              <div className="border-t mt-3 pt-3 text-xs">
                {pessoasDiferentes ? (
                  <>
                    <p>Assinatura do solicitante: _________________________</p>
                    <p className="mt-2">Assinatura de quem retirou: _________________________</p>
                  </>
                ) : (
                  <p>Assinatura: _________________________</p>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button type="button" onClick={handleImprimir} className="gap-2" disabled={!dados}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
