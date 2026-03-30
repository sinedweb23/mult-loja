'use client'

import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, X } from 'lucide-react'

const LABEL_PAGAMENTO: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  CREDITO: 'Cartão Crédito',
  DEBITO: 'Cartão Débito',
}

export interface ItemComprovante {
  produto_nome: string
  quantidade: number
  preco_unitario: number
  subtotal: number
  variacoes_selecionadas?: Record<string, string> | null
  data_retirada?: string | null
}

export interface FormaPagamentoComprovante {
  metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO'
  valor: number
  troco?: number
}

export interface ComprovanteModalProps {
  open: boolean
  onClose: () => void
  tipo: 'DIRETA' | 'ALUNO' | 'COLABORADOR'
  nomeLoja: string
  dataHora: string
  itens: ItemComprovante[]
  total: number
  formasPagamento?: FormaPagamentoComprovante[]
  /** Nome do aluno (tipo ALUNO) ou do colaborador (tipo COLABORADOR) */
  alunoNome?: string
  pedidoId?: string
  /** Saldo devedor atualizado (apenas tipo COLABORADOR) */
  saldoDevedor?: number
  /** Saldo atual após a compra (apenas tipo ALUNO) */
  saldoAtual?: number
  /** Ex.: "PEDIDO ONLINE" — exibido no recibo quando informado */
  rotuloTipo?: string
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

function textoVariacoes(variacoes?: Record<string, string> | null): string {
  if (!variacoes || Object.keys(variacoes).length === 0) return ''
  return Object.entries(variacoes)
    .map(([nome, valor]) => `${nome}: ${valor}`)
    .join(' | ')
}

function gerarHtmlTermico(props: ComprovanteModalProps, via?: 'ESTABELECIMENTO' | 'ALUNO') {
  const { tipo, nomeLoja, dataHora, itens, total, formasPagamento, alunoNome, rotuloTipo } = props
  const tituloVia =
    tipo === 'ALUNO'
      ? via === 'ESTABELECIMENTO'
        ? '*** VIA ESTABELECIMENTO ***'
        : '*** VIA DO ALUNO ***'
      : null

  const linhas: string[] = []
  const L = (s: string) => linhas.push(s)
  const Lc = (s: string) => linhas.push(`<div class="center">${s}</div>`)
  const Lb = (s: string) => linhas.push(`<div class="bold">${s}</div>`)

  L('<div class="recibo">')
  Lc(nomeLoja.trim() || 'Cantina')
  L('')
  Lc(formatDataHora(dataHora))
  if (props.pedidoId) Lc(`Pedido #${props.pedidoId}`)
  if (rotuloTipo) {
    L('')
    Lb(rotuloTipo)
  }
  L('')
  if (tituloVia) {
    Lb(tituloVia)
    L('')
  }
  if (tipo === 'ALUNO' && alunoNome) {
    Lb(`Aluno: ${alunoNome}`)
    L('')
  }
  if (tipo === 'COLABORADOR' && alunoNome) {
    Lb(`Colaborador: ${alunoNome}`)
    L('')
    Lc('(Consumo para desconto em folha)')
    L('')
  }
  if (tipo === 'COLABORADOR' && props.saldoDevedor != null) {
    Lb(`Saldo devedor: ${formatMoney(props.saldoDevedor)}`)
    L('')
  }
  L('--------------------------------')
  itens.forEach((item) => {
    const nome = item.produto_nome
    const varText = textoVariacoes(item.variacoes_selecionadas)
    const linha1 = `${nome}${varText ? ` (${varText})` : ''}`
    L(`<div class="item">${linha1}</div>`)
    if (item.data_retirada) {
      L(`<div class="item sub">Retirada: ${new Date(item.data_retirada + 'T12:00:00').toLocaleDateString('pt-BR')}</div>`)
    }
    L(`<div class="item sub">${item.quantidade} x ${formatMoney(item.preco_unitario)} = ${formatMoney(item.subtotal)}</div>`)
  })
  L('--------------------------------')
  Lb(`TOTAL: ${formatMoney(total)}`)
  if (tipo === 'ALUNO' && props.saldoAtual != null) {
    L('')
    Lb(`Saldo após compra: ${formatMoney(props.saldoAtual)}`)
  }
  if (tipo === 'DIRETA' && formasPagamento && formasPagamento.length > 0) {
    L('')
    L('Pagamento:')
    formasPagamento.forEach((fp) => {
      const label = LABEL_PAGAMENTO[fp.metodo] || fp.metodo
      let linha = `${label}: ${formatMoney(fp.valor)}`
      if (fp.troco != null && fp.troco > 0) linha += ` (Troco: ${formatMoney(fp.troco)})`
      L(`<div class="item">${linha}</div>`)
    })
  }
  if (tipo === 'COLABORADOR') {
    L('')
    L('Assinatura: _________________________')
    L('')
  }
  L('')
  Lc('Obrigado!')
  L('</div>')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comprovante</title>
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

export function ComprovanteModal({
  open,
  onClose,
  tipo,
  nomeLoja,
  dataHora,
  itens,
  total,
  formasPagamento = [],
  alunoNome,
  pedidoId,
  saldoDevedor,
  saldoAtual,
  rotuloTipo,
}: ComprovanteModalProps) {
  const fechandoRef = useRef(false)

  const handleClose = () => {
    if (fechandoRef.current) return
    fechandoRef.current = true
    onClose()
    // Permite novo fechamento após animação (evita reabertura em PWA ao focar de volta)
    setTimeout(() => {
      fechandoRef.current = false
    }, 500)
  }

  /** Fecha a janela de impressão quando o diálogo de print termina (ou após timeout em navegadores que não disparam afterprint). */
  const fecharJanelaAposImpressao = (w: Window | null, aoFechar?: () => void) => {
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
      aoFechar?.()
    }
    w.onafterprint = fechar
    timeoutId = setTimeout(fechar, 2500)
  }

  const handleImprimir = () => {
    const propsCompletos = { open, onClose, tipo, nomeLoja, dataHora, itens, total, formasPagamento, alunoNome, pedidoId, saldoDevedor, saldoAtual, rotuloTipo }
    if (tipo === 'ALUNO' && !rotuloTipo) {
      const propsAluno = { ...propsCompletos }
      const html1 = gerarHtmlTermico(propsAluno, 'ESTABELECIMENTO')
      const html2 = gerarHtmlTermico(propsAluno, 'ALUNO')
      const w1 = window.open('', '_blank', 'width=320,height=480')
      if (w1) {
        w1.document.write(html1)
        w1.document.close()
        w1.focus()
        w1.print()
        fecharJanelaAposImpressao(w1, () => {
          const w2 = window.open('', '_blank', 'width=320,height=480')
          if (w2) {
            w2.document.write(html2)
            w2.document.close()
            w2.focus()
            w2.print()
            fecharJanelaAposImpressao(w2)
          }
        })
      }
    } else {
      const html = gerarHtmlTermico(propsCompletos)
      const w = window.open('', '_blank', 'width=320,height=480')
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        w.print()
        fecharJanelaAposImpressao(w)
      }
    }
  }

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F9') {
        e.preventDefault()
        handleImprimir()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, tipo, nomeLoja, dataHora, itens, total, formasPagamento, alunoNome, pedidoId, saldoDevedor, saldoAtual, rotuloTipo])

  return (
    <Dialog open={open} onOpenChange={(o) => o === false && handleClose()}>
      <DialogContent className="max-w-md shadow-xl rounded-xl border bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Comprovante da venda</DialogTitle>
          <DialogDescription>
            Imprima o comprovante para o cliente. O aluno usa este comprovante para retirar o pedido no balcão.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-1 max-h-64 overflow-y-auto">
            <div className="text-center font-semibold">{nomeLoja.trim() || 'Cantina'}</div>
            <div className="text-center text-muted-foreground text-xs">{formatDataHora(dataHora)}</div>
            {pedidoId && <div className="text-center text-xs">Pedido #{pedidoId}</div>}
            {rotuloTipo && <div className="text-center font-semibold mt-1">{rotuloTipo}</div>}
            {tipo === 'ALUNO' && alunoNome && (
              <div className="font-medium mt-2">Aluno: {alunoNome}</div>
            )}
            {tipo === 'COLABORADOR' && alunoNome && (
              <div className="font-medium mt-2">Colaborador: {alunoNome}</div>
            )}
            {tipo === 'COLABORADOR' && saldoDevedor != null && (
              <div className="font-medium mt-1">Saldo devedor: {formatMoney(saldoDevedor)}</div>
            )}
            <div className="border-t my-2" />
            {itens.map((item, i) => (
              <div key={i} className="flex justify-between gap-2 flex-wrap">
                <span>
                  {item.produto_nome}
                  {textoVariacoes(item.variacoes_selecionadas) && (
                    <span className="text-muted-foreground"> ({textoVariacoes(item.variacoes_selecionadas)})</span>
                  )}
                  {item.data_retirada && (
                    <span className="block text-xs text-muted-foreground">
                      Retirada: {new Date(item.data_retirada + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 font-semibold flex justify-between">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
            {tipo === 'ALUNO' && saldoAtual != null && (
              <div className="font-medium mt-2">Saldo após compra: {formatMoney(saldoAtual)}</div>
            )}
            {tipo === 'DIRETA' && formasPagamento.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                {formasPagamento.map((fp, i) => (
                  <div key={i}>
                    {LABEL_PAGAMENTO[fp.metodo] || fp.metodo}: {formatMoney(fp.valor)}
                    {fp.troco != null && fp.troco > 0 && ` (Troco: ${formatMoney(fp.troco)})`}
                  </div>
                ))}
              </div>
            )}
            {tipo === 'ALUNO' && (
              <p className="text-xs text-muted-foreground mt-2">
                Serão impressas 2 vias: Via Estabelecimento e Via do Aluno.
              </p>
            )}
            {tipo === 'COLABORADOR' && (
              <div className="mt-3 pt-2 border-t text-sm">
                <p>Assinatura: _________________________</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button type="button" onClick={handleImprimir} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir (F9)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
