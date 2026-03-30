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
import type { DadosComprovanteFechamento } from '@/app/actions/caixa'

export interface ComprovanteFechamentoModalProps {
  open: boolean
  onClose: () => void
  nomeLoja: string
  dataHoraFechamento: string
  dados: DadosComprovanteFechamento
}

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

function gerarHtmlTermico(props: ComprovanteFechamentoModalProps) {
  const { nomeLoja, dataHoraFechamento, dados } = props
  const linhas: string[] = []
  const L = (s: string) => linhas.push(s)
  const Lc = (s: string) => linhas.push(`<div class="center">${s}</div>`)
  const Lb = (s: string) => linhas.push(`<div class="bold">${s}</div>`)

  L('<div class="recibo">')
  Lc(nomeLoja.trim() || 'Cantina')
  L('')
  Lb('*** FECHAMENTO DE CAIXA ***')
  L('')
  Lc(formatDataHora(dataHoraFechamento))
  L('')
  Lb(`Operador: ${dados.operador_nome}`)
  L(`<div class="item">Abertura: ${formatDataHora(dados.aberto_em)}</div>`)
  L(`<div class="item">Fundo troco: ${formatMoney(dados.fundo_troco)}</div>`)
  L('--------------------------------')
  Lb('TOTAIS')
  L(`<div class="item">Dinheiro (esperado): ${formatMoney(dados.dinheiro_esperado)}</div>`)
  L(`<div class="item">Débito: ${formatMoney(dados.debito)}</div>`)
  L(`<div class="item">Crédito: ${formatMoney(dados.credito)}</div>`)
  L(`<div class="item">Saldo aluno: ${formatMoney(dados.saldo_aluno)}</div>`)
  L(`<div class="item">Colaboradores: ${formatMoney(dados.colaboradores)}</div>`)
  if ((dados.valor_cancelado ?? 0) > 0 || (dados.comprovantes_cancelados ?? 0) > 0) {
    L(`<div class="item">Valor cancelado: ${formatMoney(dados.valor_cancelado ?? 0)}</div>`)
    L(`<div class="item">Comprovantes cancelados: ${dados.comprovantes_cancelados ?? 0}</div>`)
  }
  L('--------------------------------')
  Lb(`TOTAL GERAL: ${formatMoney(dados.total_geral)}`)
  L('')
  Lc('Caixa fechado.')
  L('</div>')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fechamento de Caixa</title>
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
  </style>
</head>
<body>
  ${linhas.join('\n')}
</body>
</html>`
  return html
}

export function ComprovanteFechamentoModal({
  open,
  onClose,
  nomeLoja,
  dataHoraFechamento,
  dados,
}: ComprovanteFechamentoModalProps) {
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
    const html = gerarHtmlTermico({
      open,
      onClose,
      nomeLoja,
      dataHoraFechamento,
      dados,
    })
    const w = window.open('', '_blank', 'width=320,height=560')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      fecharJanelaAposImpressao(w)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md shadow-xl rounded-xl border bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Comprovante de fechamento</DialogTitle>
          <DialogDescription>
            Imprima o comprovante de fechamento de caixa com todas as movimentações e o nome do operador.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-1 max-h-80 overflow-y-auto">
            <div className="text-center font-semibold">{nomeLoja.trim() || 'Cantina'}</div>
            <div className="text-center text-xs text-muted-foreground">FECHAMENTO DE CAIXA</div>
            <div className="text-center text-xs">{formatDataHora(dataHoraFechamento)}</div>
            <div className="font-medium mt-2">Operador: {dados.operador_nome}</div>
            <div className="text-xs text-muted-foreground">
              Abertura: {formatDataHora(dados.aberto_em)} • Fundo: {formatMoney(dados.fundo_troco)}
            </div>
            <div className="border-t my-2 pt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Dinheiro (esperado)</span>
                <span>{formatMoney(dados.dinheiro_esperado)}</span>
              </div>
              <div className="flex justify-between">
                <span>Débito</span>
                <span>{formatMoney(dados.debito)}</span>
              </div>
              <div className="flex justify-between">
                <span>Crédito</span>
                <span>{formatMoney(dados.credito)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saldo aluno</span>
                <span>{formatMoney(dados.saldo_aluno)}</span>
              </div>
              <div className="flex justify-between">
                <span>Colaboradores</span>
                <span>{formatMoney(dados.colaboradores)}</span>
              </div>
              {(dados.valor_cancelado ?? 0) > 0 || (dados.comprovantes_cancelados ?? 0) > 0 ? (
                <>
                  <div className="flex justify-between text-amber-600 dark:text-amber-500">
                    <span>Valor cancelado</span>
                    <span>{formatMoney(dados.valor_cancelado ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-amber-600 dark:text-amber-500">
                    <span>Comprovantes cancelados</span>
                    <span>{dados.comprovantes_cancelados ?? 0}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Total geral</span>
                <span>{formatMoney(dados.total_geral)}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button type="button" onClick={handleImprimir} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
