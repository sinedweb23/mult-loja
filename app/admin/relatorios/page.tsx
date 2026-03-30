'use client'

import React, { useState, useEffect, useCallback, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Printer, ChevronDown, ChevronRight } from 'lucide-react'
import {
  obterRelatorios,
  obterRelatorioPorProduto,
  type RelatoriosFiltro,
  type RelatoriosPayload,
  type RelatorioPorProdutoPayload,
  type RelatorioPorProdutoItem,
  type PagamentoOnlineItem,
  type PagamentoOnlineTransacaoItem,
  type TotaisPagamentosOnline,
  type ComprasMensaisDetalheMap,
  type VendasDetalheMap,
} from '@/app/actions/relatorios'
import { obterExtratoAlunoParaAdmin, type ExtratoItem } from '@/app/actions/saldo'
import { cancelarVendaPdv } from '@/app/actions/cancelar-venda-pdv'
import { cancelarItemVendaPdv } from '@/app/actions/cancelar-item-venda-pdv'
import { atualizarDataRetiradaPedidoPdv } from '@/app/actions/atualizar-data-retirada-pdv'
import { todayISO, firstDayOfMonthISO } from '@/lib/date'

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatRetiradaDateLabel(v: string) {
  const base = v.length > 10 ? v.slice(0, 10) : v
  return new Date(base + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function defaultPeriod(): { dataInicio: string; dataFim: string } {
  const now = new Date()
  const fim = todayISO(now)
  const inicio = firstDayOfMonthISO(now)
  return { dataInicio: inicio, dataFim: fim }
}

export default function AdminRelatoriosPage() {
  const [periodo, setPeriodo] = useState(defaultPeriod())
  // Período efetivamente usado no relatório "Por produto".
  // Mantemos separado porque você altera as datas no input e só "aplica" quando clicar no botão.
  const [periodoAplicadoPorProduto, setPeriodoAplicadoPorProduto] = useState(defaultPeriod())
  const [periodoPorProdutoCarregado, setPeriodoPorProdutoCarregado] = useState(defaultPeriod())
  const [dados, setDados] = useState<RelatoriosPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [relatorioPorProduto, setRelatorioPorProduto] = useState<RelatorioPorProdutoPayload | null>(null)
  const [loadingPorProduto, setLoadingPorProduto] = useState(false)
  const [filtroProdutoId, setFiltroProdutoId] = useState<string | null>(null)
  const [filtroCategoriaId, setFiltroCategoriaId] = useState<string | null>(null)
  const [jaBuscouPorProduto, setJaBuscouPorProduto] = useState(false)
  const [tabRelatorios, setTabRelatorios] = useState('compras-modalidade')
  const [cancelandoPedidoId, setCancelandoPedidoId] = useState<string | null>(null)
  const [cancelandoItemId, setCancelandoItemId] = useState<string | null>(null)
  const [alterandoDataRetiradaPedidoId, setAlterandoDataRetiradaPedidoId] = useState<string | null>(null)
  const [dialogDataRetirada, setDialogDataRetirada] = useState<{
    open: boolean
    pedidoId: string | null
    valor: string
    erro: string | null
  }>({
    open: false,
    pedidoId: null,
    valor: '',
    erro: null,
  })
  const [filtroOperadorPdv, setFiltroOperadorPdv] = useState<string>('todos')
  /** Filtro na aba "Pagamentos online por forma de pagamento": todos | PIX | cartao_avista | cartao_parcelado */
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState<string>('todos')

  const carregar = useCallback(async (filtro: RelatoriosFiltro) => {
    setLoading(true)
    setErro(null)
    try {
      const payload = await obterRelatorios(filtro)
      if (payload) setDados(payload)
      else setErro('Sem permissão para ver relatórios.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar relatórios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar(periodo)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só na montagem com período inicial

  async function aplicarFiltro() {
    await carregar(periodo)

    // Atualiza "Por produto" automaticamente quando o período for aplicado,
    // para não exigir que o usuário clique em "Buscar".
    const novoPeriodo = periodo
    setPeriodoAplicadoPorProduto(novoPeriodo)
    if (tabRelatorios === 'por-produto') {
      await buscarRelatorioPorProduto(novoPeriodo)
    }
  }

  async function handleCancelarVenda(pedidoId: string) {
    if (!pedidoId || cancelandoPedidoId) return
    setCancelandoPedidoId(pedidoId)
    try {
      const res = await cancelarVendaPdv(pedidoId)
      if (!res.ok) {
        alert(res.erro || 'Erro ao cancelar venda.')
        return
      }

      // Recarregar relatórios para refletir o cancelamento
      await carregar(periodo)

      // Imprimir comprovante de cancelamento (similar ao comprovante de venda)
      if (res.comprovante) {
        const c = res.comprovante
        const win = window.open('', '_blank')
        if (win) {
          const tituloBenef =
            c.tipo === 'COLABORADOR' ? 'Colaborador' : c.tipo === 'ALUNO' ? 'Aluno' : 'Cliente'
          const nomeBenef = c.beneficiarioNome ?? '-'
          const prontuario =
            c.tipo === 'ALUNO' && c.alunoProntuario ? ` (${c.alunoProntuario})` : ''
          const itensHtml = c.itens
            .map((i) => {
              const variacoes = i.variacoes_selecionadas && Object.keys(i.variacoes_selecionadas).length
                ? ' — ' +
                  Object.entries(i.variacoes_selecionadas)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')
                : ''
              return `<tr>
  <td>${i.quantidade}x ${i.produto_nome}${variacoes}</td>
  <td style="text-align:right;">${formatPrice(i.subtotal)}</td>
</tr>`
            })
            .join('\n')
          const formasHtml = c.formasPagamento
            .map((f) => `<tr>
  <td>${f.metodo}</td>
  <td style="text-align:right;">${formatPrice(f.valor)}</td>
</tr>`)
            .join('\n')

          const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Cancelamento de venda</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; padding: 16px; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .linha { margin-bottom: 4px; }
      .valor { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { padding: 2px 0; font-size: 11px; }
      th { text-align: left; border-bottom: 1px solid #ddd; }
      .totais { margin-top: 8px; }
    </style>
  </head>
  <body>
    <h1>Cancelamento de venda</h1>
    <p class="linha"><strong>Pedido:</strong> #${c.pedidoId.slice(0, 8)}</p>
    <p class="linha"><strong>Operador:</strong> ${c.operadorNome ?? '-'}</p>
    <p class="linha"><strong>${tituloBenef}:</strong> ${nomeBenef}${prontuario}</p>
    <p class="linha"><strong>Data/hora:</strong> ${new Date(c.canceladoEm).toLocaleString('pt-BR')}</p>

    <table>
      <thead>
        <tr>
          <th>Itens</th>
          <th style="text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${itensHtml}
      </tbody>
    </table>

    ${
      c.formasPagamento.length > 0
        ? `<div class="totais">
      <strong>Formas de pagamento (originais)</strong>
      <table>
        <thead>
          <tr>
            <th>Forma</th>
            <th style="text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${formasHtml}
        </tbody>
      </table>
    </div>`
        : ''
    }

    <p class="linha valor"><strong>Valor total cancelado:</strong> ${formatPrice(c.total)}</p>
  </body>
</html>`
          win.document.write(html)
          win.document.close()
          win.focus()
          win.print()
          win.onafterprint = () => win.close()
        }
      }
    } catch (e) {
      console.error(e)
      alert('Erro inesperado ao cancelar venda.')
    } finally {
      setCancelandoPedidoId(null)
    }
  }

  async function handleCancelarItemVenda(pedidoId: string, itemId: string) {
    if (!pedidoId || !itemId || cancelandoItemId || cancelandoPedidoId) return
    setCancelandoItemId(itemId)
    try {
      const res = await cancelarItemVendaPdv({ pedidoId, itemId })
      if (!res.ok) {
        alert(res.erro || 'Erro ao cancelar item da venda.')
        return
      }
      await carregar(periodo)
    } catch (e) {
      console.error(e)
      alert('Erro inesperado ao cancelar item da venda.')
    } finally {
      setCancelandoItemId(null)
    }
  }

  function abrirDialogAlterarDataRetirada(pedidoId: string, dataAtual: string | null) {
    if (!pedidoId || alterandoDataRetiradaPedidoId) return
    const raw = dataAtual && dataAtual.length >= 10 ? dataAtual.slice(0, 10) : null
    const padrao = raw ?? todayISO(new Date())
    setDialogDataRetirada({
      open: true,
      pedidoId,
      valor: padrao,
      erro: null,
    })
  }

  async function confirmarAlterarDataRetirada() {
    if (!dialogDataRetirada.pedidoId || !dialogDataRetirada.valor) return
    const novaData = dialogDataRetirada.valor.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
      setDialogDataRetirada((prev) => ({
        ...prev,
        erro: 'Data inválida. Use o formato AAAA-MM-DD.',
      }))
      return
    }

    const pedidoId = dialogDataRetirada.pedidoId
    setAlterandoDataRetiradaPedidoId(pedidoId)
    setDialogDataRetirada((prev) => ({ ...prev, erro: null }))
    try {
      const res = await atualizarDataRetiradaPedidoPdv({ pedidoId, novaDataRetirada: novaData })
      if (!res.ok) {
        setDialogDataRetirada((prev) => ({
          ...prev,
          erro: res.erro || 'Erro ao atualizar data de retirada.',
        }))
        return
      }
      await carregar(periodo)
      setDialogDataRetirada({
        open: false,
        pedidoId: null,
        valor: '',
        erro: null,
      })
    } catch (e) {
      console.error(e)
      setDialogDataRetirada((prev) => ({
        ...prev,
        erro: 'Erro inesperado ao atualizar data de retirada.',
      }))
    } finally {
      setAlterandoDataRetiradaPedidoId(null)
    }
  }

  async function buscarRelatorioPorProduto(periodoOverride?: { dataInicio: string; dataFim: string }) {
    setLoadingPorProduto(true)
    const periodoUso = periodoOverride ?? periodoAplicadoPorProduto
    try {
      const payload = await obterRelatorioPorProduto({
        dataInicio: periodoUso.dataInicio,
        dataFim: periodoUso.dataFim,
        produtoId: filtroProdutoId ?? undefined,
        categoriaId: filtroCategoriaId ?? undefined,
      })
      setRelatorioPorProduto(payload ?? null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPorProduto(false)
      setPeriodoPorProdutoCarregado(periodoUso)
      setJaBuscouPorProduto(true)
    }
  }

  function imprimirRelatorioPorProduto() {
    if (!relatorioPorProduto?.itens.length) return
    const dataIni = new Date(periodoAplicadoPorProduto.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')
    const dataFim = new Date(periodoAplicadoPorProduto.dataFim + 'T12:00:00').toLocaleDateString('pt-BR')
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório por produto</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: system-ui, sans-serif; font-size: 12px; padding: 12px; max-width: 210mm; margin: 0 auto; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .periodo { color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .num { text-align: right; }
  </style>
</head>
<body>
  <h1>Relatório por produto</h1>
  <p class="periodo">Período: ${dataIni} a ${dataFim}</p>
  <table>
    <thead>
      <tr>
        <th>Produto</th>
        <th>Categoria</th>
        <th class="num">Quantidade</th>
        <th class="num">Valor total</th>
      </tr>
    </thead>
    <tbody>
      ${relatorioPorProduto.itens.map((r) => `
        <tr>
          <td>${r.produto_nome}</td>
          <td>${r.categoria_nome ?? '-'}</td>
          <td class="num">${r.quantidade}</td>
          <td class="num">${formatPrice(r.valor_total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      w.onafterprint = () => w.close()
    }
  }

  // Carrega "Por produto" ao entrar no tab (sem precisar clicar em Buscar).
  useEffect(() => {
    if (tabRelatorios !== 'por-produto') return
    const chaveAplicado = `${periodoAplicadoPorProduto.dataInicio}|${periodoAplicadoPorProduto.dataFim}`
    const chaveCarregado = `${periodoPorProdutoCarregado.dataInicio}|${periodoPorProdutoCarregado.dataFim}`
    if (jaBuscouPorProduto && chaveAplicado === chaveCarregado) return
    buscarRelatorioPorProduto()
  }, [tabRelatorios, periodoAplicadoPorProduto, periodoPorProdutoCarregado, jaBuscouPorProduto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza automaticamente ao mudar Categoria/Produto.
  useEffect(() => {
    if (tabRelatorios !== 'por-produto') return
    if (!jaBuscouPorProduto) return
    buscarRelatorioPorProduto()
  }, [filtroCategoriaId, filtroProdutoId, tabRelatorios]) // eslint-disable-line react-hooks/exhaustive-deps

  function imprimirRelatorioPagamentosOnlineForma(
    itens: PagamentoOnlineTransacaoItem[],
    totais: TotaisPagamentosOnline
  ) {
    const dataIni = new Date(periodo.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')
    const dataFim = new Date(periodo.dataFim + 'T12:00:00').toLocaleDateString('pt-BR')
    const dataEmissao = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    const totalCartao = totais.cartaoAVista_valor + totais.cartaoParcelado_valor
    const qtdCartao = totais.cartaoAVista_quantidade + totais.cartaoParcelado_quantidade
    const totalGeral = totais.pix_valor + totais.cartaoAVista_valor + totais.cartaoParcelado_valor
    const qtdGeral = totais.pix_quantidade + totais.cartaoAVista_quantidade + totais.cartaoParcelado_quantidade
    const rows = itens
      .map(
        (r, idx) =>
          `<tr>
            <td>${idx + 1}</td>
            <td>${new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td>${r.responsavel_nome}${r.responsavel_email ? ` (${r.responsavel_email})` : ''}</td>
            <td class="num">${formatPrice(r.valor)}</td>
            <td>${r.forma === 'PIX' ? 'PIX' : 'Cartão'}</td>
            <td>${r.parcelas != null ? `${r.parcelas}x` : '-'}</td>
            <td>${r.nsu ?? '-'}</td>
          </tr>`
      )
      .join('')
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório - Pagamentos online por forma de pagamento</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, 'Segoe UI', sans-serif; font-size: 10px; padding: 0; max-width: 210mm; margin: 0 auto; color: #111; }
    .report-header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 12px; }
    .report-header h1 { font-size: 16px; margin: 0 0 4px 0; font-weight: 700; }
    .report-header .periodo { font-size: 11px; color: #444; margin: 0; }
    .report-header .emissao { font-size: 9px; color: #666; margin-top: 4px; }
    .resumo { display: table; width: 100%; margin-bottom: 14px; border: 1px solid #ddd; }
    .resumo-row { display: table-row; }
    .resumo-cell { display: table-cell; padding: 8px 12px; border: 1px solid #eee; vertical-align: middle; }
    .resumo-cell.modalidade { font-weight: 600; width: 28%; }
    .resumo-cell.valor { text-align: right; font-weight: 600; }
    .resumo-cell.qtd { text-align: center; color: #555; }
    .resumo-total { background: #f0f0f0; font-weight: 700; }
    .resumo-total .resumo-cell { border-top: 2px solid #333; }
    .table-wrap { overflow: visible; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; }
    th { background: #e8e8e8; font-weight: 600; font-size: 9px; }
    .num { text-align: right; }
    .n { width: 28px; text-align: center; }
    tfoot td { font-weight: 700; background: #f5f5f5; border-top: 2px solid #333; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>Relatório de pagamentos online por forma de pagamento</h1>
    <p class="periodo">Período: ${dataIni} a ${dataFim}</p>
    <p class="emissao">Emitido em: ${dataEmissao}</p>
  </div>
  <div class="resumo">
    <div class="resumo-row">
      <div class="resumo-cell modalidade">PIX</div>
      <div class="resumo-cell valor">${formatPrice(totais.pix_valor)}</div>
      <div class="resumo-cell qtd">${totais.pix_quantidade} transação(ões)</div>
    </div>
    <div class="resumo-row">
      <div class="resumo-cell modalidade">Cartão (à vista + parcelado)</div>
      <div class="resumo-cell valor">${formatPrice(totalCartao)}</div>
      <div class="resumo-cell qtd">${qtdCartao} transação(ões)</div>
    </div>
    <div class="resumo-row resumo-total">
      <div class="resumo-cell modalidade">Total PIX + Cartão</div>
      <div class="resumo-cell valor">${formatPrice(totalGeral)}</div>
      <div class="resumo-cell qtd">${qtdGeral} transação(ões)</div>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="n">#</th>
          <th>Data/Hora</th>
          <th>Responsável</th>
          <th class="num">Valor</th>
          <th>Forma</th>
          <th>Parcelas</th>
          <th>NSU</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="num"><strong>Total</strong></td>
          <td class="num"><strong>${formatPrice(totalGeral)}</strong></td>
          <td colspan="3"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      w.onafterprint = () => w.close()
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">
          Compras por aluno, saldos, vendas por operador, online vs PDV e produtos mais vendidos
        </p>
      </div>

      <Dialog
        open={dialogDataRetirada.open}
        onOpenChange={(open) => {
          if (!open) {
            setDialogDataRetirada({
              open: false,
              pedidoId: null,
              valor: '',
              erro: null,
            })
          } else {
            setDialogDataRetirada((prev) => ({ ...prev, open: true }))
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar data de retirada</DialogTitle>
            <DialogDescription>
              Escolha a nova data de retirada para este pedido. Apenas pedidos que já possuem data de retirada podem ser alterados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="novaDataRetirada">Nova data</Label>
            <Input
              id="novaDataRetirada"
              type="date"
              value={dialogDataRetirada.valor}
              onChange={(e) =>
                setDialogDataRetirada((prev) => ({
                  ...prev,
                  valor: e.target.value,
                  erro: null,
                }))
              }
            />
            {dialogDataRetirada.erro && (
              <p className="text-xs text-destructive mt-1">{dialogDataRetirada.erro}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDialogDataRetirada({
                  open: false,
                  pedidoId: null,
                  valor: '',
                  erro: null,
                })
              }
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmarAlterarDataRetirada}
              disabled={!!alterandoDataRetiradaPedidoId}
            >
              {alterandoDataRetiradaPedidoId ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Período</CardTitle>
          <CardDescription>Filtre todos os relatórios por data de criação do pedido (pagos ou entregues).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="dataInicio">Data início</Label>
            <Input
              id="dataInicio"
              type="date"
              value={periodo.dataInicio}
              onChange={(e) => setPeriodo((p) => ({ ...p, dataInicio: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataFim">Data fim</Label>
            <Input
              id="dataFim"
              type="date"
              value={periodo.dataFim}
              onChange={(e) => setPeriodo((p) => ({ ...p, dataFim: e.target.value }))}
            />
          </div>
          <Button onClick={aplicarFiltro} disabled={loading}>
            {loading ? 'Carregando…' : 'Aplicar'}
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          {erro}
        </div>
      )}

      {loading && !dados ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Vendas online</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatPrice(dados.resumoOnlineVsPdv.online_total)}</p>
                <p className="text-xs text-muted-foreground">
                  Compra de lanche: {formatPrice(dados.resumoOnlineVsPdv.online_compra_lanche)} ({dados.resumoOnlineVsPdv.online_pedidos} pedidos)
                </p>
                <p className="text-xs text-muted-foreground">
                  Adição de saldo: {formatPrice(dados.resumoOnlineVsPdv.online_adicao_saldo)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Vendas PDV</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatPrice(dados.resumoOnlineVsPdv.pdv_total)}</p>
                <p className="text-xs text-muted-foreground">{dados.resumoOnlineVsPdv.pdv_pedidos} pedidos</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total período</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatPrice(dados.resumoOnlineVsPdv.online_total + dados.resumoOnlineVsPdv.pdv_total)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {dados.resumoOnlineVsPdv.online_pedidos + dados.resumoOnlineVsPdv.pdv_pedidos}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={tabRelatorios} onValueChange={setTabRelatorios} className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="compras-modalidade">Compras por modalidade</TabsTrigger>
              <TabsTrigger value="saldos-aluno">Saldos por aluno</TabsTrigger>
              <TabsTrigger value="vendas-operador">Vendas por operador</TabsTrigger>
              <TabsTrigger value="compras-mensais">Compras mensais por aluno</TabsTrigger>
              <TabsTrigger value="vendas-periodo">Vendas por período (online/PDV)</TabsTrigger>
              <TabsTrigger value="forma-pagamento">Pagamentos online (forma de pagamento)</TabsTrigger>
              <TabsTrigger value="produtos">Produtos mais vendidos</TabsTrigger>
              <TabsTrigger value="por-produto">Por produto</TabsTrigger>
            </TabsList>

            <TabsContent value="compras-modalidade" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Compras por modalidade</CardTitle>
                  <CardDescription>Vendas por colaborador, venda direta e venda aluno.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="aluno" className="w-full">
                    <TabsList>
                      <TabsTrigger value="colaborador">Vendas colaborador ({dados.vendasColaborador.length})</TabsTrigger>
                      <TabsTrigger value="direta">Venda Direta ({dados.vendasDiretas.length})</TabsTrigger>
                      <TabsTrigger value="aluno">Venda Aluno ({dados.comprasPorAluno.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="colaborador" className="mt-4">
                      <TabelaVendasColaborador
                        itens={dados.vendasColaborador}
                        pedidosPorColaborador={dados.vendasColaboradorPedidos}
                        vendasDetalhe={dados.vendasDetalhe}
                      />
                    </TabsContent>
                    <TabsContent value="direta" className="mt-4">
                      <TabelaVendasDiretas itens={dados.vendasDiretas} vendasDetalhe={dados.vendasDetalhe} />
                    </TabsContent>
                    <TabsContent value="aluno" className="mt-4">
                      <TabelaComprasPorAluno
                        itens={dados.comprasPorAluno}
                        pedidosPorAluno={dados.comprasPorAlunoPedidos}
                        vendasDetalhe={dados.vendasDetalhe}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="saldos-aluno" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Saldos por aluno</CardTitle>
                  <CardDescription>Saldo atual dos alunos na cantina (crédito disponível). Não inclui colaborador nem venda direta.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TabelaSaldosPorAluno itens={dados.saldosPorAluno} periodo={periodo} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vendas-operador" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vendas por operador</CardTitle>
                  <CardDescription>Total vendido por operador (nome de quem operou o PDV no caixa) no período.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TabelaVendasPorOperador
                    itens={dados.vendasPorOperador}
                    vendasPdv={dados.vendasPdv}
                    detalhe={dados.vendasDetalhe}
                    onCancelar={handleCancelarVenda}
                    cancelandoId={cancelandoPedidoId}
                    onCancelarItem={handleCancelarItemVenda}
                    cancelandoItemId={cancelandoItemId}
                    onAlterarDataRetirada={abrirDialogAlterarDataRetirada}
                    alterandoDataRetiradaPedidoId={alterandoDataRetiradaPedidoId}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compras-mensais" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Compras mensais por aluno</CardTitle>
                  <CardDescription>Total por mês/ano por aluno no período. Apenas alunos, não colaborador nem venda direta.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TabelaComprasMensais
                    itens={dados.comprasMensaisPorAluno}
                    detalhe={dados.comprasMensaisDetalhe}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vendas-periodo" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vendas por período (online/PDV)</CardTitle>
                  <CardDescription>Totais por tipo de venda. Abaixo, listagem detalhada por canal.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-muted-foreground">Venda direta</p>
                      <p className="text-xl font-bold">{formatPrice(dados.totaisVendasPorTipo.vendaDireta)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-muted-foreground">Venda aluno</p>
                      <p className="text-xl font-bold">{formatPrice(dados.totaisVendasPorTipo.vendaAluno)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-muted-foreground">Venda colaborador</p>
                      <p className="text-xl font-bold">{formatPrice(dados.totaisVendasPorTipo.vendaColaborador)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-muted-foreground">Online — Compra de lanche</p>
                      <p className="text-xl font-bold">{formatPrice(dados.totaisVendasPorTipo.onlineCompraLanche)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium text-muted-foreground">Online — Adição de saldo</p>
                      <p className="text-xl font-bold">{formatPrice(dados.totaisVendasPorTipo.onlineAdicaoSaldo)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-medium">Detalhamento</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Filtrar PDV por operador:</span>
                        <Select
                          value={filtroOperadorPdv}
                          onValueChange={(v) => setFiltroOperadorPdv(v)}
                        >
                          <SelectTrigger className="w-[220px] h-8">
                            <SelectValue placeholder="Todos os operadores" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os operadores</SelectItem>
                            {dados.vendasPorOperador.map((op) => (
                              <SelectItem key={op.operador_id} value={op.operador_id}>
                                {op.operador_nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Tabs defaultValue="online" className="w-full">
                      <TabsList>
                        <TabsTrigger value="online">Pagamentos Online ({dados.pagamentosOnline.length})</TabsTrigger>
                        <TabsTrigger value="pdv">PDV ({dados.vendasPdv.length})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="online" className="mt-4">
                        <TabelaPagamentosOnline itens={dados.pagamentosOnline} detalhe={dados.vendasDetalhe} />
                      </TabsContent>
                      <TabsContent value="pdv" className="mt-4">
                        <TabelaVendasDetalhe
                          itens={
                            filtroOperadorPdv === 'todos'
                              ? dados.vendasPdv
                              : dados.vendasPdv.filter((v) => v.operador_id === filtroOperadorPdv)
                          }
                          tipo="pdv"
                          detalhe={dados.vendasDetalhe}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="forma-pagamento" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pagamentos online por forma de pagamento</CardTitle>
                  <CardDescription>
                    Transações aprovadas no período (horário Brasil). Ordenação: mais recente no topo. Use o período acima e o filtro por forma de pagamento; clique em Imprimir para gerar o relatório em A4.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {(() => {
                    const totalCartao =
                      dados.totaisPagamentosOnline.cartaoAVista_valor +
                      dados.totaisPagamentosOnline.cartaoParcelado_valor
                    const qtdCartao =
                      dados.totaisPagamentosOnline.cartaoAVista_quantidade +
                      dados.totaisPagamentosOnline.cartaoParcelado_quantidade
                    const totalPixCartao = dados.totaisPagamentosOnline.pix_valor + totalCartao
                    const qtdPixCartao = dados.totaisPagamentosOnline.pix_quantidade + qtdCartao

                    return (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Total PIX</p>
                        <p className="text-xl font-bold">{formatPrice(dados.totaisPagamentosOnline.pix_valor)}</p>
                        <p className="text-xs text-muted-foreground">{dados.totaisPagamentosOnline.pix_quantidade} transação(ões)</p>
                      </div>
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Total Cartão (à vista + parcelado)</p>
                        <p className="text-xl font-bold">{formatPrice(totalCartao)}</p>
                        <p className="text-xs text-muted-foreground">{qtdCartao} transação(ões)</p>
                      </div>
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Total PIX + Cartão</p>
                        <p className="text-xl font-bold">{formatPrice(totalPixCartao)}</p>
                        <p className="text-xs text-muted-foreground">{qtdPixCartao} transação(ões)</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
                        <Select value={filtroFormaPagamento} onValueChange={setFiltroFormaPagamento}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas</SelectItem>
                            <SelectItem value="PIX">PIX</SelectItem>
                            <SelectItem value="cartao_avista">Cartão à vista</SelectItem>
                            <SelectItem value="cartao_parcelado">Cartão parcelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="default"
                        onClick={() => {
                          const lista = filtroFormaPagamento === 'todos'
                            ? dados.pagamentosOnlineTransacoes
                            : dados.pagamentosOnlineTransacoes.filter((t) => {
                                if (filtroFormaPagamento === 'PIX') return t.forma === 'PIX'
                                if (filtroFormaPagamento === 'cartao_avista') return t.forma === 'CARTAO' && (t.parcelas ?? 1) <= 1
                                if (filtroFormaPagamento === 'cartao_parcelado') return t.forma === 'CARTAO' && (t.parcelas ?? 1) > 1
                                return true
                              })
                          const totais = filtroFormaPagamento === 'todos' ? dados.totaisPagamentosOnline : {
                            pix_valor: lista.filter((t) => t.forma === 'PIX').reduce((s, t) => s + t.valor, 0),
                            pix_quantidade: lista.filter((t) => t.forma === 'PIX').length,
                            cartaoAVista_valor: lista.filter((t) => t.forma === 'CARTAO' && (t.parcelas ?? 1) <= 1).reduce((s, t) => s + t.valor, 0),
                            cartaoAVista_quantidade: lista.filter((t) => t.forma === 'CARTAO' && (t.parcelas ?? 1) <= 1).length,
                            cartaoParcelado_valor: lista.filter((t) => t.forma === 'CARTAO' && (t.parcelas ?? 1) > 1).reduce((s, t) => s + t.valor, 0),
                            cartaoParcelado_quantidade: lista.filter((t) => t.forma === 'CARTAO' && (t.parcelas ?? 1) > 1).length,
                          }
                          imprimirRelatorioPagamentosOnlineForma(lista, totais)
                        }}
                        disabled={!dados.pagamentosOnlineTransacoes.length}
                        className="gap-2 shrink-0"
                      >
                        <Printer className="h-4 w-4" />
                        Imprimir relatório A4
                      </Button>
                    </div>
                  </div>
                    )
                  })()}
                  <div>
                    <TabelaPagamentosOnlineForma
                      itens={
                        filtroFormaPagamento === 'todos'
                          ? dados.pagamentosOnlineTransacoes
                          : dados.pagamentosOnlineTransacoes.filter((t) => {
                              if (filtroFormaPagamento === 'PIX') return t.forma === 'PIX'
                              if (filtroFormaPagamento === 'cartao_avista') return t.forma === 'CARTAO' && (t.parcelas ?? 1) <= 1
                              if (filtroFormaPagamento === 'cartao_parcelado') return t.forma === 'CARTAO' && (t.parcelas ?? 1) > 1
                              return true
                            })
                      }
                      detalhe={dados.vendasDetalhe}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="produtos" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Produtos mais vendidos</CardTitle>
                  <CardDescription>Top 50 por quantidade no período.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TabelaProdutosMaisVendidos itens={dados.produtosMaisVendidos} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="por-produto" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Relatório por produto</CardTitle>
                  <CardDescription>
                    Vendas agregadas por produto no período. Use o período acima; filtre por categoria ou produto e clique em Buscar. Imprima em A4 se desejar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select
                        value={filtroCategoriaId ?? 'todas'}
                        onValueChange={(v) => setFiltroCategoriaId(v === 'todas' ? null : v)}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas</SelectItem>
                          {(relatorioPorProduto?.opcoesCategorias ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Produto</Label>
                      <Select
                        value={filtroProdutoId ?? 'todos'}
                        onValueChange={(v) => setFiltroProdutoId(v === 'todos' ? null : v)}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          {(relatorioPorProduto?.opcoesProdutos ?? [])
                            .filter((p) => !filtroCategoriaId || p.categoria_id === filtroCategoriaId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => buscarRelatorioPorProduto()}
                      disabled={loadingPorProduto}
                      title="Opcional: o relatório atualiza sozinho ao aplicar o período e ao alterar filtros."
                    >
                      {loadingPorProduto ? 'Carregando…' : 'Recarregar'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={imprimirRelatorioPorProduto}
                      disabled={!relatorioPorProduto?.itens.length}
                      className="gap-2"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </Button>
                  </div>
                  {relatorioPorProduto && (
                    <>
                      <TabelaRelatorioPorProduto itens={relatorioPorProduto.itens} />
                      {relatorioPorProduto.itens.length === 0 && (
                        <p className="text-muted-foreground text-sm">Nenhum item no período com os filtros selecionados. Clique em Buscar sem filtros para carregar as opções.</p>
                      )}
                    </>
                  )}
                  {!relatorioPorProduto && !loadingPorProduto && (
                    <p className="text-muted-foreground text-sm">Clique em Buscar para carregar o relatório (use o período definido acima).</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}

function TabelaVendasColaborador({
  itens,
  pedidosPorColaborador,
  vendasDetalhe,
}: {
  itens: RelatoriosPayload['vendasColaborador']
  pedidosPorColaborador: RelatoriosPayload['vendasColaboradorPedidos']
  vendasDetalhe: VendasDetalheMap
}) {
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma venda por colaborador no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Colaborador</th>
            <th className="text-right py-2">Pedidos</th>
            <th className="text-right py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => {
            const isOpen = linhaAberta === r.colaborador_id
            const pedidos = pedidosPorColaborador[r.colaborador_id] ?? []
            return (
              <Fragment key={r.colaborador_id}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setLinhaAberta((prev) => (prev === r.colaborador_id ? null : r.colaborador_id))
                    setPedidoAbertoId(null)
                  }}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">{isOpen ? '▾' : '▸'}</span>
                      <span>{r.colaborador_nome}</span>
                    </span>
                  </td>
                  <td className="text-right py-2">{r.quantidade_pedidos}</td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && pedidos.length > 0 && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={3} className="py-2 pl-8 pr-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Pedidos ({pedidos.length})</p>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Pedido</th>
                                <th className="text-left py-1 px-2">Data</th>
                                <th className="text-right py-1 px-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pedidos.map((ped) => {
                                const pedOpen = pedidoAbertoId === ped.id
                                const info = vendasDetalhe[ped.id]
                                return (
                                  <Fragment key={ped.id}>
                                    <tr
                                      className="border-b cursor-pointer hover:bg-muted/60"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPedidoAbertoId((prev) => (prev === ped.id ? null : ped.id))
                                      }}
                                    >
                                      <td className="py-1 px-2">
                                        <span className="inline-flex items-center gap-1">
                                          <span className="inline-block w-3 text-[10px]">{pedOpen ? '▾' : '▸'}</span>
                                          #{ped.id.slice(0, 8)}
                                        </span>
                                      </td>
                                      <td className="py-1 px-2">
                                        {new Date(ped.created_at).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="text-right py-1 px-2 font-medium">{formatPrice(ped.total)}</td>
                                    </tr>
                                    {pedOpen && info?.itens && info.itens.length > 0 && (
                                      <tr className="bg-background/80">
                                        <td colSpan={3} className="py-1 px-2">
                                          <div className="pl-6">
                                            <table className="w-full text-[11px]">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-1">Produto</th>
                                                  <th className="text-right py-1">Qtd</th>
                                                  <th className="text-right py-1">Subtotal</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {info.itens.map((i) => (
                                                  <tr key={i.produto_id} className="border-b last:border-0">
                                                    <td className="py-1">{i.produto_nome ?? 'Produto'}</td>
                                                    <td className="text-right py-1">{i.quantidade}</td>
                                                    <td className="text-right py-1">{formatPrice(Number(i.subtotal ?? 0))}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaVendasDiretas({
  itens,
  vendasDetalhe,
}: {
  itens: RelatoriosPayload['vendasDiretas']
  vendasDetalhe: VendasDetalheMap
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null)

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma venda direta no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Data/Hora</th>
            <th className="text-left py-2">Pedido</th>
            <th className="text-left py-2">Operador</th>
            <th className="text-right py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => {
            const isOpen = abertoId === r.id
            const info = vendasDetalhe[r.id]
            return (
              <Fragment key={r.id}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => setAbertoId((prev) => (prev === r.id ? null : r.id))}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">{info?.itens?.length ? (isOpen ? '▾' : '▸') : ''}</span>
                      <span>
                        {new Date(r.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </td>
                  <td className="py-2">#{r.id.slice(0, 8)}</td>
                  <td className="py-2">{r.operador_nome ?? '-'}</td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && info?.itens && info.itens.length > 0 && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={4} className="py-2 pl-8 pr-2">
                      <div className="overflow-x-auto rounded-md border bg-background">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/60">
                              <th className="text-left py-1 px-2">Produto</th>
                              <th className="text-right py-1 px-2">Qtd</th>
                              <th className="text-right py-1 px-2">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {info.itens.map((i) => (
                              <tr key={i.produto_id} className="border-b last:border-0">
                                <td className="py-1 px-2">{i.produto_nome ?? 'Produto'}</td>
                                <td className="text-right py-1 px-2">{i.quantidade}</td>
                                <td className="text-right py-1 px-2">{formatPrice(Number(i.subtotal ?? 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaComprasPorAluno({
  itens,
  pedidosPorAluno,
  vendasDetalhe,
}: {
  itens: RelatoriosPayload['comprasPorAluno']
  pedidosPorAluno: RelatoriosPayload['comprasPorAlunoPedidos']
  vendasDetalhe: VendasDetalheMap
}) {
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma compra por aluno no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Aluno</th>
            <th className="text-right py-2">Pedidos</th>
            <th className="text-right py-2">Online</th>
            <th className="text-right py-2">PDV</th>
            <th className="text-right py-2">Adição saldo</th>
            <th className="text-right py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => {
            const isOpen = linhaAberta === r.aluno_id
            const pedidos = pedidosPorAluno[r.aluno_id] ?? []
            return (
              <Fragment key={r.aluno_id}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setLinhaAberta((prev) => (prev === r.aluno_id ? null : r.aluno_id))
                    setPedidoAbertoId(null)
                  }}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">{isOpen ? '▾' : '▸'}</span>
                      <span>{r.aluno_nome}</span>
                    </span>
                  </td>
                  <td className="text-right py-2">{r.quantidade_pedidos}</td>
                  <td className="text-right py-2">
                    {r.online === 0 ? (
                      <span className="text-emerald-600">----</span>
                    ) : (
                      formatPrice(r.online)
                    )}
                  </td>
                  <td className="text-right py-2">
                    {r.pdv === 0 ? (
                      <span className="text-emerald-600">----</span>
                    ) : (
                      formatPrice(r.pdv)
                    )}
                  </td>
                  <td className="text-right py-2">
                    {r.recarga_saldo === 0 ? (
                      <span className="text-emerald-600">----</span>
                    ) : (
                      formatPrice(r.recarga_saldo)
                    )}
                  </td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && pedidos.length > 0 && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={6} className="py-2 pl-8 pr-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Pedidos ({pedidos.length})</p>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Pedido</th>
                                <th className="text-left py-1 px-2">Data</th>
                                <th className="text-right py-1 px-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pedidos.map((ped) => {
                                const pedOpen = pedidoAbertoId === ped.id
                                const info = vendasDetalhe[ped.id]
                                return (
                                  <Fragment key={ped.id}>
                                    <tr
                                      className="border-b cursor-pointer hover:bg-muted/60"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPedidoAbertoId((prev) => (prev === ped.id ? null : ped.id))
                                      }}
                                    >
                                      <td className="py-1 px-2">
                                        <span className="inline-flex items-center gap-1">
                                          <span className="inline-block w-3 text-[10px]">{pedOpen ? '▾' : '▸'}</span>
                                          #{ped.id.slice(0, 8)}
                                        </span>
                                      </td>
                                      <td className="py-1 px-2">
                                        {new Date(ped.created_at).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="text-right py-1 px-2 font-medium">{formatPrice(ped.total)}</td>
                                    </tr>
                                    {pedOpen && info?.itens && info.itens.length > 0 && (
                                      <tr className="bg-background/80">
                                        <td colSpan={3} className="py-1 px-2">
                                          <div className="pl-6">
                                            <table className="w-full text-[11px]">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-1">Produto</th>
                                                  <th className="text-right py-1">Qtd</th>
                                                  <th className="text-right py-1">Subtotal</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {info.itens.map((i) => (
                                                  <tr key={i.produto_id} className="border-b last:border-0">
                                                    <td className="py-1">{i.produto_nome ?? 'Produto'}</td>
                                                    <td className="text-right py-1">{i.quantidade}</td>
                                                    <td className="text-right py-1">{formatPrice(Number(i.subtotal ?? 0))}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaSaldosPorAluno({
  itens,
  periodo,
}: {
  itens: RelatoriosPayload['saldosPorAluno']
  periodo: { dataInicio: string; dataFim: string }
}) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [pageSize] = useState(20)
  const [extratoAlunoId, setExtratoAlunoId] = useState<string | null>(null)
  const [extratoItens, setExtratoItens] = useState<ExtratoItem[] | null>(null)
  const [loadingExtrato, setLoadingExtrato] = useState(false)
  const [erroExtrato, setErroExtrato] = useState<string | null>(null)
  const [extratoExpandidos, setExtratoExpandidos] = useState<Set<string>>(new Set())
  const extratoRef = React.useRef<HTMLDivElement | null>(null)

  function toggleExtratoItem(id: string) {
    setExtratoExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function imprimirExtrato() {
    if (!alunoSelecionado || !extratoItens || extratoItens.length === 0) return
    const periodoStr = `${new Date(periodo.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} até ${new Date(periodo.dataFim + 'T12:00:00').toLocaleDateString('pt-BR')}`
    let html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Extrato - ${alunoSelecionado.aluno_nome}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px 0; }
  .periodo { color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; }
  .valor { text-align: right; }
  .itens { margin: 4px 0 0 12px; font-size: 11px; }
  .itens table { margin-top: 2px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Extrato de ${alunoSelecionado.aluno_nome}</h1>
  <p class="periodo">Prontuário: ${alunoSelecionado.aluno_prontuario} &nbsp;|&nbsp; Período: ${periodoStr} &nbsp;|&nbsp; Saldo atual: ${formatPrice(alunoSelecionado.saldo)}</p>
  <table>
    <thead><tr><th>Data/Hora</th><th>Descrição</th><th class="valor">Valor</th></tr></thead>
    <tbody>
`
    for (const e of extratoItens) {
      const isEntrada =
        e.tipo === 'RECARGA' ||
        e.tipo === 'RECARGA_PRESENCIAL' ||
        e.tipo === 'ESTORNO' ||
        e.tipo === 'MIGRACAO_SALDO'
      const valor = e.valor * (isEntrada ? 1 : -1)
      const dataHora = new Date(e.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      html += `<tr><td>${dataHora}</td><td>${e.descricao}</td><td class="valor">${formatPrice(valor)}</td></tr>`
      if (e.itens && e.itens.length > 0) {
        html += `<tr><td colspan="3" style="padding-top:0; border-top:0;"><div class="itens"><strong>Produtos:</strong><table><thead><tr><th>Produto</th><th>Qtd</th><th>Preço un.</th><th class="valor">Subtotal</th></tr></thead><tbody>`
        for (const item of e.itens) {
          html += `<tr><td>${item.produto_nome}</td><td>${item.quantidade}</td><td>${formatPrice(item.preco_unitario)}</td><td class="valor">${formatPrice(item.subtotal)}</td></tr>`
        }
        html += `</tbody></table></div></td></tr>`
      }
    }
    html += `</tbody></table></body></html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      setTimeout(() => { w.print(); w.close() }, 250)
    }
  }

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhum aluno com saldo.</p>

  const termo = busca.trim().toLowerCase()
  const filtrados = termo
    ? itens.filter(
        (r) =>
          r.aluno_nome.toLowerCase().includes(termo) ||
          r.aluno_prontuario.toLowerCase().includes(termo)
      )
    : itens

  const total = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const paginaCorrigida = Math.min(pagina, totalPaginas)
  const inicio = (paginaCorrigida - 1) * pageSize
  const fim = inicio + pageSize
  const paginaItens = filtrados.slice(inicio, fim)

  async function abrirExtrato(alunoId: string) {
    try {
      setExtratoAlunoId(alunoId)
      setLoadingExtrato(true)
      setErroExtrato(null)
      const ext = await obterExtratoAlunoParaAdmin(alunoId)
      const start = new Date(periodo.dataInicio + 'T00:00:00')
      const end = new Date(periodo.dataFim + 'T23:59:59.999')
      const filtrado = ext.filter((e) => {
        const d = new Date(e.created_at)
        return d >= start && d <= end
      })
      setExtratoItens(filtrado)
    } catch (e) {
      console.error(e)
      setErroExtrato('Erro ao carregar extrato do aluno.')
      setExtratoItens(null)
    } finally {
      setLoadingExtrato(false)
    }
  }

  const alunoSelecionado = extratoAlunoId
    ? itens.find((a) => a.aluno_id === extratoAlunoId)
    : null

  React.useEffect(() => {
    if (extratoAlunoId && !loadingExtrato && extratoRef.current) {
      extratoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [extratoAlunoId, loadingExtrato])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar por nome ou prontuário..."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
          className="max-w-xs"
        />
        <div className="text-xs text-muted-foreground">
          Mostrando {Math.min(total, inicio + 1)}–{Math.min(total, fim)} de {total} alunos
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Aluno</th>
              <th className="text-left py-2">Prontuário</th>
              <th className="text-right py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {paginaItens.map((r) => (
              <tr key={r.aluno_id} className="border-b">
                <td className="py-2">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => abrirExtrato(r.aluno_id)}
                  >
                    {r.aluno_nome}
                  </button>
                </td>
                <td className="py-2">{r.aluno_prontuario}</td>
                <td className="text-right py-2 font-medium">{formatPrice(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Página {paginaCorrigida} de {totalPaginas}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={paginaCorrigida <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={paginaCorrigida >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>

      {extratoAlunoId && (
        <div ref={extratoRef} className="mt-4 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">
                Extrato de {alunoSelecionado?.aluno_nome ?? 'Aluno'}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                Período: {new Date(periodo.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} até{' '}
                {new Date(periodo.dataFim + 'T12:00:00').toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={imprimirExtrato}
                disabled={!extratoItens || extratoItens.length === 0}
              >
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setExtratoAlunoId(null)
                  setExtratoItens(null)
                  setErroExtrato(null)
                  setExtratoExpandidos(new Set())
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
          {loadingExtrato ? (
            <p className="text-xs text-muted-foreground">Carregando extrato...</p>
          ) : erroExtrato ? (
            <p className="text-xs text-destructive">{erroExtrato}</p>
          ) : !extratoItens || extratoItens.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma movimentação para este aluno no período selecionado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th className="text-left py-1 px-2 w-8" aria-label="Expandir" />
                    <th className="text-left py-1 px-2">Data/Hora</th>
                    <th className="text-left py-1 px-2">Retirada</th>
                    <th className="text-left py-1 px-2">Entrega</th>
                    <th className="text-left py-1 px-2">Descrição</th>
                    <th className="text-right py-1 px-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {extratoItens.map((e) => {
                    const temItens = e.itens && e.itens.length > 0
                    const expandido = extratoExpandidos.has(e.id)
                    return (
                      <Fragment key={e.id}>
                        <tr className="border-b last:border-0">
                          <td className="py-1 px-2 align-top">
                            {temItens ? (
                              <button
                                type="button"
                                onClick={() => toggleExtratoItem(e.id)}
                                className="p-0.5 rounded hover:bg-muted"
                                aria-label={expandido ? 'Recolher itens' : 'Ver itens'}
                              >
                                {expandido ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="py-1 px-2">
                            {new Date(e.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        <td className="py-1 px-2">
                          {e.data_retirada
                            ? (() => {
                                const d = e.data_retirada.slice(0, 10)
                                const [y, m, day] = d.split('-')
                                return `${day}/${m}/${y}`
                              })()
                            : '-'}
                        </td>
                        <td className="py-1 px-2">
                          {e.data_entrega
                            ? new Date(e.data_entrega).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                          <td className="py-1 px-2">
                            {e.descricao}
                            {temItens && !expandido && (
                              <span className="text-muted-foreground ml-1">
                                ({e.itens!.length} {e.itens!.length === 1 ? 'item' : 'itens'})
                              </span>
                            )}
                          </td>
                          <td className="text-right py-1 px-2">
                            {formatPrice(
                              e.valor *
                                (e.tipo === 'RECARGA' ||
                                e.tipo === 'RECARGA_PRESENCIAL' ||
                                e.tipo === 'ESTORNO' ||
                                e.tipo === 'MIGRACAO_SALDO'
                                  ? 1
                                  : -1)
                            )}
                          </td>
                        </tr>
                        {temItens && expandido && (
                          <tr className="border-b last:border-0 bg-muted/20">
                            <td colSpan={4} className="py-2 px-2">
                              <div className="pl-4 text-[11px]">
                                <p className="font-medium mb-1">Produtos:</p>
                                <table className="w-full max-w-md border border-border rounded">
                                  <thead>
                                    <tr className="bg-muted/60">
                                      <th className="text-left py-1 px-2">Produto</th>
                                      <th className="text-right py-1 px-2">Qtd</th>
                                      <th className="text-right py-1 px-2">Preço un.</th>
                                      <th className="text-right py-1 px-2">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {e.itens!.map((item, idx) => (
                                      <tr key={idx} className="border-t border-border">
                                        <td className="py-1 px-2">{item.produto_nome}</td>
                                        <td className="text-right py-1 px-2">{item.quantidade}</td>
                                        <td className="text-right py-1 px-2">{formatPrice(item.preco_unitario)}</td>
                                        <td className="text-right py-1 px-2">{formatPrice(item.subtotal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabelaVendasPorOperador({
  itens,
  vendasPdv,
  detalhe,
  onCancelar,
  cancelandoId,
  onCancelarItem,
  cancelandoItemId,
  onAlterarDataRetirada,
  alterandoDataRetiradaPedidoId,
}: {
  itens: RelatoriosPayload['vendasPorOperador']
  vendasPdv: RelatoriosPayload['vendasPdv']
  detalhe: VendasDetalheMap
  onCancelar: (pedidoId: string) => void
  cancelandoId: string | null
  onCancelarItem: (pedidoId: string, itemId: string) => void
  cancelandoItemId: string | null
  onAlterarDataRetirada: (pedidoId: string, dataAtual: string | null) => void
  alterandoDataRetiradaPedidoId: string | null
}) {
  const [operadorAbertoId, setOperadorAbertoId] = useState<string | null>(null)
  const [vendaAbertaId, setVendaAbertaId] = useState<string | null>(null)

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma venda por operador no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Operador</th>
            <th className="text-right py-2">Pedidos</th>
            <th className="text-right py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => {
            const isOpen = operadorAbertoId === r.operador_id
            const vendasOperador = vendasPdv.filter(
              (v) => v.operador_id === r.operador_id || v.operador_nome === r.operador_nome
            )

            return (
              <Fragment key={r.operador_id}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setOperadorAbertoId((prev) => (prev === r.operador_id ? null : r.operador_id))
                    setVendaAbertaId(null)
                  }}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span>{r.operador_nome}</span>
                    </span>
                  </td>
                  <td className="text-right py-2">{r.quantidade_pedidos}</td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && vendasOperador.length > 0 && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={3} className="py-3 pl-8 pr-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Vendas do operador ({vendasOperador.length})
                        </p>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Data/Hora</th>
                                <th className="text-left py-1 px-2">Pedido</th>
                                <th className="text-left py-1 px-2">Beneficiário</th>
                                <th className="text-right py-1 px-2">Total</th>
                                <th className="text-right py-1 px-2">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vendasOperador.map((v) => {
                                const status = (v as any).status as string | undefined
                                const info = detalhe[v.id]
                                const dataRetirada =
                                  info?.data_retirada ??
                                  (info?.itens.find((i) => i.data_retirada)?.data_retirada ?? null)
                                const vendaOpen = vendaAbertaId === v.id

                                return (
                                  <Fragment key={v.id}>
                                    <tr
                                      className="border-b last:border-0 align-middle cursor-pointer hover:bg-muted/60"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (info?.itens?.length) setVendaAbertaId((prev) => (prev === v.id ? null : v.id))
                                      }}
                                    >
                                      <td className="py-1 px-2">
                                        <span className="inline-flex items-center gap-1">
                                          {info?.itens?.length ? (
                                            <span className="inline-block w-3 text-[10px]">{vendaOpen ? '▾' : '▸'}</span>
                                          ) : null}
                                          <span>
                                            {new Date(v.created_at).toLocaleString('pt-BR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              year: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </span>
                                        {dataRetirada && (
                                          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                                            <span className="font-semibold text-sky-500">
                                              Retirada: {formatRetiradaDateLabel(dataRetirada)}
                                            </span>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 px-2 text-[11px] border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                                              disabled={alterandoDataRetiradaPedidoId === v.id}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                onAlterarDataRetirada(v.id, info?.data_retirada ?? dataRetirada)
                                              }}
                                            >
                                              {alterandoDataRetiradaPedidoId === v.id ? 'Salvando…' : 'Alterar'}
                                            </Button>
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1 px-2">#{v.id.slice(0, 8)}</td>
                                      <td className="py-1 px-2">
                                        {v.beneficio_tipo === 'venda_direta'
                                          ? 'Venda direta'
                                          : v.beneficio_tipo === 'colaborador' || v.colaborador_nome
                                            ? `${v.colaborador_nome ?? 'Colaborador'} (colaborador)`
                                            : v.aluno_nome
                                              ? `${v.aluno_nome} (aluno)`
                                              : '-'}
                                        {status === 'CANCELADO' && (
                                          <span className="ml-2 text-[9px] uppercase text-destructive font-semibold">
                                            Cancelado
                                          </span>
                                        )}
                                      </td>
                                      <td className="text-right py-1 px-2 font-medium">
                                        {formatPrice(v.total)}
                                      </td>
                                      <td className="text-right py-1 px-2" onClick={(e) => e.stopPropagation()}>
                                        {status === 'CANCELADO' ? (
                                          <span className="text-[10px] text-muted-foreground">
                                            Já cancelado
                                          </span>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={!!cancelandoId}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              onCancelar(v.id)
                                            }}
                                          >
                                            {cancelandoId === v.id ? 'Cancelando…' : 'Cancelar venda'}
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                    {vendaOpen && info?.itens && info.itens.length > 0 && (
                                      <tr className="bg-background/80">
                                        <td colSpan={5} className="py-1 px-2">
                                          <div className="pl-6">
                                            <table className="w-full text-[11px]">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-1">Produto</th>
                                                  <th className="text-right py-1">Qtd</th>
                                                  <th className="text-right py-1">Subtotal</th>
                                                  <th className="text-right py-1">Ações</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {info.itens.map((i) => (
                                                  <tr key={i.id ?? i.produto_id} className="border-b last:border-0">
                                                    <td className="py-1">{i.produto_nome ?? 'Produto'}</td>
                                                    <td className="text-right py-1">{i.quantidade}</td>
                                                    <td className="text-right py-1">
                                                      {formatPrice(Number(i.subtotal ?? 0))}
                                                    </td>
                                                    <td className="text-right py-1">
                                                      {status === 'CANCELADO' ? (
                                                        <span className="text-[9px] text-muted-foreground">
                                                          Pedido cancelado
                                                        </span>
                                                      ) : (
                                                        <Button
                                                          size="sm"
                                                          variant="outline"
                                                          disabled={
                                                            !!cancelandoId ||
                                                            !!cancelandoItemId ||
                                                            !i.id
                                                          }
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            if (i.id) {
                                                              onCancelarItem(v.id, i.id)
                                                            }
                                                          }}
                                                        >
                                                          {cancelandoItemId === i.id
                                                            ? 'Cancelando…'
                                                            : 'Cancelar item'}
                                                        </Button>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaComprasMensais({
  itens,
  detalhe,
}: {
  itens: RelatoriosPayload['comprasMensaisPorAluno']
  detalhe: ComprasMensaisDetalheMap
}) {
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)
  const [busca, setBusca] = useState<string>('')
  const [pagina, setPagina] = useState<number>(1)
  const pageSize = 50

  const termosBusca = busca.trim().toLowerCase()
  const itensFiltrados = itens.filter((r) => {
    if (!termosBusca) return true
    const nome = r.aluno_nome?.toLowerCase() ?? ''
    const mesAno = `${String(r.mes).padStart(2, '0')}/${r.ano}`.toLowerCase()
    return nome.includes(termosBusca) || mesAno.includes(termosBusca)
  })

  const total = itensFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const paginaAjustada = Math.min(pagina, totalPaginas)
  const inicio = (paginaAjustada - 1) * pageSize
  const fim = inicio + pageSize
  const itensPagina = itensFiltrados.slice(inicio, fim)

  if (itens.length === 0)
    return <p className="text-muted-foreground text-sm">Nenhum dado no período.</p>
  if (itens.length > 0 && total === 0)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Buscar aluno / mês/ano</Label>
            <Input
              placeholder="Digite parte do nome do aluno ou mês/ano (ex: 03/2025)…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              className="h-8 w-64"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Nenhum resultado encontrado para a busca.</p>
      </div>
    )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Buscar aluno / mês/ano</Label>
          <Input
            placeholder="Digite parte do nome do aluno ou mês/ano (ex: 03/2025)…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            className="h-8 w-64"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Aluno</th>
              <th className="text-left py-2">Mês/Ano</th>
              <th className="text-right py-2">Pedidos</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
          {itensPagina.map((r) => {
            const key = `${r.aluno_id}-${r.ano}-${r.mes}`
            const isOpen = linhaAberta === key
            const pedidos = detalhe[key]?.pedidos ?? []
            return (
              <Fragment key={key}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    if (linhaAberta === key) {
                      setLinhaAberta(null)
                      setPedidoAbertoId(null)
                    } else {
                      setLinhaAberta(key)
                      setPedidoAbertoId(null)
                    }
                  }}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span>{r.aluno_nome}</span>
                    </span>
                  </td>
                  <td className="py-2">{String(r.mes).padStart(2, '0')}/{r.ano}</td>
                  <td className="text-right py-2">{r.quantidade_pedidos}</td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && pedidos.length > 0 && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={4} className="py-3">
                      <div className="pl-6 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Pedidos do período para este aluno ({pedidos.length})
                        </p>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Pedido</th>
                                <th className="text-left py-1 px-2">Data/Hora</th>
                                <th className="text-left py-1 px-2">Retirada</th>
                                <th className="text-left py-1 px-2">Entrega</th>
                                <th className="text-left py-1 px-2">Origem</th>
                                <th className="text-right py-1 px-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pedidos.map((p) => {
                                const pedidoOpen = pedidoAbertoId === p.id
                                return (
                                  <Fragment key={p.id}>
                                    <tr
                                      className="border-b cursor-pointer hover:bg-muted/60"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPedidoAbertoId((prev) => (prev === p.id ? null : p.id))
                                      }}
                                    >
                                      <td className="py-1 px-2">
                                        <span className="inline-flex items-center gap-1">
                                          <span className="inline-block w-3 text-[10px]">
                                            {pedidoOpen ? '▾' : '▸'}
                                          </span>
                                          <span>#{p.id.slice(0, 8)}</span>
                                        </span>
                                      </td>
                                      <td className="py-1 px-2">
                                        {new Date(p.created_at).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="py-1 px-2">
                                        {p.data_retirada
                                          ? (() => {
                                              // data_retirada vem como string de data (YYYY-MM-DD); formatar sem fuso para evitar voltar 1 dia
                                              const d = p.data_retirada.slice(0, 10)
                                              const [y, m, day] = d.split('-')
                                              return `${day}/${m}/${y}`
                                            })()
                                          : '-'}
                                      </td>
                                      <td className="py-1 px-2">
                                        {p.data_entrega
                                          ? new Date(p.data_entrega).toLocaleString('pt-BR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              year: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })
                                          : '-'}
                                      </td>
                                      <td className="py-1 px-2">
                                        {p.origem === 'ONLINE' ? 'Online' : 'PDV'}
                                      </td>
                                      <td className="text-right py-1 px-2 font-medium">
                                        {formatPrice(p.total)}
                                      </td>
                                    </tr>
                                    {pedidoOpen && p.itens.length > 0 && (
                                      <tr className="bg-background/80">
                                        <td colSpan={4} className="py-1 px-2">
                                          <div className="pl-6">
                                            <table className="w-full text-[11px]">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-1">Produto</th>
                                                  <th className="text-right py-1">Qtd</th>
                                                  <th className="text-right py-1">Subtotal</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {p.itens.map((i) => (
                                                  <tr key={i.produto_id} className="border-b last:border-0">
                                                    <td className="py-1">{i.produto_nome ?? 'Produto'}</td>
                                                    <td className="text-right py-1">{i.quantidade}</td>
                                                    <td className="text-right py-1">
                                                      {formatPrice(Number(i.subtotal ?? 0))}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Mostrando{' '}
          <span className="font-medium">
            {total === 0 ? 0 : inicio + 1}–{Math.min(fim, total)}
          </span>{' '}
          de <span className="font-medium">{total}</span> registros
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página <span className="font-medium">{paginaAjustada}</span> de{' '}
            <span className="font-medium">{totalPaginas}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabelaPagamentosOnline({
  itens,
  detalhe,
}: {
  itens: PagamentoOnlineItem[]
  detalhe: VendasDetalheMap
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [pagina, setPagina] = useState<number>(1)
  const pageSize = 50

  const total = itens.length
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const paginaAjustada = Math.min(pagina, totalPaginas)
  const inicio = (paginaAjustada - 1) * pageSize
  const fim = inicio + pageSize
  const itensPagina = itens.slice(inicio, fim)

  if (itens.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum pagamento online no período (compra de lanche ou adição de saldo).
      </p>
    )
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Data/Hora</th>
              <th className="text-left py-2">Tipo</th>
              <th className="text-left py-2">Pedido / Ref.</th>
              <th className="text-left py-2">Beneficiário</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
          {itensPagina.map((r) => {
            const isCompra = r.tipo === 'COMPRA_LANCHE'
            const isOpen = abertoId === r.id
            const info = isCompra ? detalhe[r.id] : undefined
            const dataRetirada =
              info?.data_retirada ??
              (info?.itens.find((i) => i.data_retirada)?.data_retirada ?? null)

            return (
              <Fragment key={r.id}>
                <tr
                  className={isCompra ? 'border-b cursor-pointer hover:bg-muted/40' : 'border-b'}
                  onClick={() => {
                    if (!isCompra || !info) return
                    setAbertoId((prev) => (prev === r.id ? null : r.id))
                  }}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      {isCompra && info && (
                        <span className="inline-block w-3 text-xs">
                          {isOpen ? '▾' : '▸'}
                        </span>
                      )}
                      <span>
                        {new Date(r.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </td>
                  <td className="py-2">
                    {r.tipo === 'COMPRA_LANCHE' ? 'Compra de lanche' : 'Adição de crédito'}
                  </td>
                  <td className="py-2">{r.referencia}</td>
                  <td className="py-2">{r.aluno_nome ?? '-'}</td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && info && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={5} className="py-2 pl-8 pr-2 align-top">
                      <div className="space-y-2">
                        {dataRetirada && (
                          <p className="text-xs text-muted-foreground">
                            Data de retirada:{' '}
                            {new Date(dataRetirada).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Produto</th>
                                <th className="text-right py-1 px-2">Qtd</th>
                                <th className="text-right py-1 px-2">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {info.itens.map((i) => (
                                <tr key={i.produto_id} className="border-b last:border-0">
                                  <td className="py-1 px-2">{i.produto_nome ?? 'Produto'}</td>
                                  <td className="text-right py-1 px-2">{i.quantidade}</td>
                                  <td className="text-right py-1 px-2">
                                    {formatPrice(Number(i.subtotal ?? 0))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Mostrando{' '}
          <span className="font-medium">
            {total === 0 ? 0 : inicio + 1}–{Math.min(fim, total)}
          </span>{' '}
          de <span className="font-medium">{total}</span> registros
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página <span className="font-medium">{paginaAjustada}</span> de{' '}
            <span className="font-medium">{totalPaginas}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabelaPagamentosOnlineForma({
  itens,
  detalhe = {},
}: {
  itens: PagamentoOnlineTransacaoItem[]
  detalhe?: VendasDetalheMap
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busca, setBusca] = useState<string>('')
  const [pagina, setPagina] = useState<number>(1)
  const pageSize = 50

  const termosBusca = busca.trim().toLowerCase()
  const itensFiltrados = itens.filter((r) => {
    if (!termosBusca) return true
    const responsavel = r.responsavel_nome?.toLowerCase() ?? ''
    const email = r.responsavel_email?.toLowerCase() ?? ''
    const beneficiario = r.beneficiario?.toLowerCase() ?? ''
    return responsavel.includes(termosBusca) || email.includes(termosBusca) || beneficiario.includes(termosBusca)
  })

  const total = itensFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const paginaAjustada = Math.min(pagina, totalPaginas)
  const inicio = (paginaAjustada - 1) * pageSize
  const fim = inicio + pageSize
  const itensPagina = itensFiltrados.slice(inicio, fim)

  if (itens.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Nenhuma transação aprovada no período.
      </p>
    )
  if (itens.length > 0 && total === 0)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Buscar por responsável ou aluno</Label>
            <Input
              placeholder="Digite parte do nome do responsável, e‑mail ou aluno…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              className="h-8 w-72"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Nenhuma transação encontrada para a busca.</p>
      </div>
    )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Buscar por responsável ou aluno</Label>
          <Input
            placeholder="Digite parte do nome do responsável, e‑mail ou aluno…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            className="h-8 w-72"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="w-8" />
              <th className="text-left py-2">Data/Hora</th>
              <th className="text-left py-2">Responsável</th>
              <th className="text-right py-2">Valor</th>
              <th className="text-left py-2">Forma</th>
              <th className="text-left py-2">Parcelas</th>
              <th className="text-left py-2">NSU</th>
            </tr>
          </thead>
          <tbody>
          {itensPagina.map((r) => {
            const isOpen = expandedId === r.id
            const pedidoDetalhe = r.pedido_id ? detalhe[r.pedido_id] : null
            return (
              <Fragment key={r.id}>
                <tr
                  className="border-b cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                >
                  <td className="py-2 w-8">
                    <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  </td>
                  <td className="py-2">
                    {new Date(r.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2">
                    <span className="block">{r.responsavel_nome}</span>
                    {r.responsavel_email && (
                      <span className="text-muted-foreground text-xs">{r.responsavel_email}</span>
                    )}
                  </td>
                  <td className="text-right py-2 font-medium">{formatPrice(r.valor)}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {r.forma === 'PIX' ? 'PIX' : 'Cartão'}
                    </span>
                  </td>
                  <td className="py-2">
                    {r.parcelas != null ? (
                      <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {r.parcelas}x
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-2">
                    {r.nsu ? (
                      <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        {r.nsu}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={7} className="py-3 px-4">
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium text-muted-foreground">Aluno beneficiado:</span>{' '}
                          {r.beneficiario}
                        </p>
                        <p className="font-medium text-muted-foreground">O que foi comprado:</p>
                        {r.tipo === 'RECARGA_SALDO' ? (
                          <p className="pl-2">Recarga de saldo</p>
                        ) : pedidoDetalhe?.itens && pedidoDetalhe.itens.length > 0 ? (
                          <table className="w-full max-w-md text-sm border rounded overflow-hidden">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left py-1.5 px-2">Produto</th>
                                <th className="text-right py-1.5 px-2">Qtd</th>
                                <th className="text-right py-1.5 px-2">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pedidoDetalhe.itens.map((item, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-1.5 px-2">{item.produto_nome ?? '-'}</td>
                                  <td className="text-right py-1.5 px-2">{item.quantidade}</td>
                                  <td className="text-right py-1.5 px-2">{formatPrice(item.subtotal ?? 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="pl-2 text-muted-foreground">Sem detalhe de itens.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Mostrando{' '}
          <span className="font-medium">
            {total === 0 ? 0 : inicio + 1}–{Math.min(fim, total)}
          </span>{' '}
          de <span className="font-medium">{total}</span> transações
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página <span className="font-medium">{paginaAjustada}</span> de{' '}
            <span className="font-medium">{totalPaginas}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabelaVendasDetalhe({
  itens,
  tipo,
  detalhe,
}: {
  itens: RelatoriosPayload['vendasOnline'] | RelatoriosPayload['vendasPdv']
  tipo: 'online' | 'pdv'
  detalhe: VendasDetalheMap
}) {
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)
  const [pagina, setPagina] = useState<number>(1)
  const pageSize = 50

  const total = itens.length
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const paginaAjustada = Math.min(pagina, totalPaginas)
  const inicio = (paginaAjustada - 1) * pageSize
  const fim = inicio + pageSize
  const itensPagina = itens.slice(inicio, fim)

  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhuma venda {tipo} no período.</p>
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Data/Hora</th>
              <th className="text-left py-2">Pedido</th>
              <th className="text-left py-2">Beneficiário</th>
              {tipo === 'pdv' && <th className="text-left py-2">Operador</th>}
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
          {itensPagina.map((r) => {
            const isOpen = pedidoAbertoId === r.id
            const info = detalhe[r.id]
            const dataRetirada =
              info?.data_retirada ??
              (info?.itens.find((i) => i.data_retirada)?.data_retirada ?? null)

            return (
              <>
                <tr
                  key={r.id}
                  className="border-b cursor-pointer hover:bg-muted/40"
                  onClick={() => setPedidoAbertoId((prev) => (prev === r.id ? null : r.id))}
                >
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-3 text-xs">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span>
                        {new Date(r.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </td>
                  <td className="py-2">#{r.id.slice(0, 8)}</td>
                  <td className="py-2">
                    {r.aluno_nome ?? '-'}
                    {(r as any).status === 'CANCELADO' && (
                      <span className="ml-2 text-[10px] uppercase text-destructive font-semibold">
                        Cancelado
                      </span>
                    )}
                  </td>
                  {tipo === 'pdv' && (
                    <td className="py-2">
                      {(r as RelatoriosPayload['vendasPdv'][number]).operador_nome ?? '-'}
                    </td>
                  )}
                  <td className="text-right py-2 font-medium">{formatPrice(r.total)}</td>
                </tr>
                {isOpen && info && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={tipo === 'pdv' ? 4 : 3} className="py-2 pl-8 pr-2 align-top">
                      <div className="space-y-2">
                        {dataRetirada && (
                          <p className="text-xs text-muted-foreground">
                            Data de retirada:{' '}
                            {new Date(dataRetirada).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/60">
                                <th className="text-left py-1 px-2">Produto</th>
                                <th className="text-right py-1 px-2">Qtd</th>
                                <th className="text-right py-1 px-2">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {info.itens.map((i) => (
                                <tr key={i.produto_id} className="border-b last:border-0">
                                  <td className="py-1 px-2">{i.produto_nome ?? 'Produto'}</td>
                                  <td className="text-right py-1 px-2">{i.quantidade}</td>
                                  <td className="text-right py-1 px-2">
                                    {formatPrice(Number(i.subtotal ?? 0))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Mostrando{' '}
          <span className="font-medium">
            {total === 0 ? 0 : inicio + 1}–{Math.min(fim, total)}
          </span>{' '}
          de <span className="font-medium">{total}</span> registros
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página <span className="font-medium">{paginaAjustada}</span> de{' '}
            <span className="font-medium">{totalPaginas}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaAjustada >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabelaProdutosMaisVendidos({
  itens,
}: {
  itens: RelatoriosPayload['produtosMaisVendidos']
}) {
  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhum item no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Produto</th>
            <th className="text-right py-2">Quantidade</th>
            <th className="text-right py-2">Valor total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => (
            <tr key={r.produto_id} className="border-b">
              <td className="py-2">{r.produto_nome}</td>
              <td className="text-right py-2">{r.quantidade}</td>
              <td className="text-right py-2 font-medium">{formatPrice(r.valor_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaRelatorioPorProduto({ itens }: { itens: RelatorioPorProdutoItem[] }) {
  const [expandedProdutoId, setExpandedProdutoId] = useState<string | null>(null)
  if (itens.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-8" />
            <th className="text-left py-2">Produto</th>
            <th className="text-left py-2">Categoria</th>
            <th className="text-right py-2">Quantidade</th>
            <th className="text-right py-2">Valor total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => (
            <Fragment key={r.produto_id}>
              <tr
                className="border-b cursor-pointer hover:bg-muted/50"
                onClick={() => setExpandedProdutoId((id) => (id === r.produto_id ? null : r.produto_id))}
              >
                <td className="py-2 w-8">
                  <span className={`inline-block transition-transform ${expandedProdutoId === r.produto_id ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                </td>
                <td className="py-2 font-medium">{r.produto_nome}</td>
                <td className="py-2">{r.categoria_nome ?? '-'}</td>
                <td className="text-right py-2">{r.quantidade}</td>
                <td className="text-right py-2 font-medium">{formatPrice(r.valor_total)}</td>
              </tr>
              {expandedProdutoId === r.produto_id && (
                <tr className="border-b bg-muted/30">
                  <td colSpan={5} className="py-3 px-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Compradores (alunos e colaboradores)</div>
                    {r.compradores && r.compradores.length > 0 ? (
                      <table className="w-full text-sm border rounded overflow-hidden">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left py-1.5 px-2">Nome</th>
                            <th className="text-left py-1.5 px-2">Turma</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.compradores.map((c, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="py-1.5 px-2">{c.venda_direta ? 'Venda direta' : (c.colaborador_nome ?? c.aluno_nome ?? '-')}</td>
                              <td className="py-1.5 px-2">{c.turma}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-muted-foreground text-sm">Nenhum comprador (venda direta).</p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
