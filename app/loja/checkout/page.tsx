'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LojaHeader } from '@/components/loja/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { CHECKOUT_PAYLOAD_KEY, limparCarrinho } from '@/lib/carrinho'
import { obterRegraParcelamentoParaValor } from '@/app/actions/configuracoes'
import type { RegraParcelamento } from '@/app/actions/configuracoes'
import type { PayloadPedidoLoja } from '@/app/actions/transacoes'

type CheckoutTipo = 'PEDIDO_LOJA' | 'RECARGA_SALDO'

export default function CheckoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [authOk, setAuthOk] = useState(false)
  const [tipo, setTipo] = useState<CheckoutTipo | null>(null)
  const [payload, setPayload] = useState<PayloadPedidoLoja | null>(null)
  const [recargaAlunoId, setRecargaAlunoId] = useState<string | null>(null)
  const [recargaAlunoNome, setRecargaAlunoNome] = useState<string>('')
  const [recargaValor, setRecargaValor] = useState<number>(0)
  const [metodo, setMetodo] = useState<'PIX' | 'CARTAO' | 'SALDO' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [pixData, setPixData] = useState<{ qrCode?: string; qrCodeBase64?: string; copyPaste?: string } | null>(null)
  const [transacaoId, setTransacaoId] = useState<string | null>(null)
  const [cardForm, setCardForm] = useState({ number: '', validity: '', cvv: '', nomePortador: '', parcelas: 1 })
  const [regraParcelamento, setRegraParcelamento] = useState<RegraParcelamento | null>(null)

  const valorTotal = tipo === 'RECARGA_SALDO'
    ? recargaValor
    : payload?.pedidos?.reduce((s, p) => s + p.itens.reduce((s2, i) => s2 + i.subtotal, 0), 0) ?? 0

  const formatPrice = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  /** Formata número do cartão: só dígitos, espaços a cada 4 (visual); envio continua só números via .replace(/\D/g, '') */
  function formatCardNumberInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  /** Formata validade MM/AA: "/" automático após 2 dígitos; envio continua MMAA via .replace(/\D/g, '') */
  function formatValidityInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  // Buscar regra de parcelamento aplicável ao valor total (para cartão)
  useEffect(() => {
    if (valorTotal <= 0) return
    obterRegraParcelamentoParaValor(valorTotal).then(setRegraParcelamento)
  }, [valorTotal])

  // Ajustar parcelas ao máximo permitido quando a regra mudar
  useEffect(() => {
    if (regraParcelamento && cardForm.parcelas > regraParcelamento.max_parcelas) {
      setCardForm((c) => ({ ...c, parcelas: regraParcelamento.max_parcelas }))
    }
  }, [regraParcelamento?.max_parcelas])

  const maxParcelas = regraParcelamento?.max_parcelas ?? 1
  const parcelasOpcoes = Array.from({ length: maxParcelas }, (_, i) => i + 1)
  const nParcelas = Math.min(Math.max(1, cardForm.parcelas), maxParcelas)
  const valorParcela =
    regraParcelamento?.tipo === 'COM_JUROS' && regraParcelamento.taxa_juros_pct != null && nParcelas > 1
      ? (valorTotal * (1 + (regraParcelamento.taxa_juros_pct / 100) * nParcelas)) / nParcelas
      : valorTotal / nParcelas
  const totalComJuros =
    regraParcelamento?.tipo === 'COM_JUROS' && regraParcelamento.taxa_juros_pct != null && nParcelas > 1
      ? valorTotal * (1 + (regraParcelamento.taxa_juros_pct / 100) * nParcelas)
      : valorTotal

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    setAuthOk(true)

    const tipoParam = searchParams.get('tipo')
    const alunoIdParam = searchParams.get('alunoId')
    const valorParam = searchParams.get('valor')
    const alunoNomeParam = searchParams.get('alunoNome') ?? ''

    if (tipoParam === 'recarga' && alunoIdParam && valorParam) {
      const v = parseFloat(valorParam.replace(',', '.'))
      if (!(v > 0)) {
        setErro('Valor inválido para recarga')
        setLoading(false)
        return
      }
      setTipo('RECARGA_SALDO')
      setRecargaAlunoId(alunoIdParam)
      setRecargaAlunoNome(alunoNomeParam || 'Aluno')
      setRecargaValor(v)
      setLoading(false)
      return
    }

    const stored = typeof window !== 'undefined' ? sessionStorage.getItem(CHECKOUT_PAYLOAD_KEY) : null
    if (!stored) {
      router.replace('/loja/carrinho')
      return
    }
    try {
      const parsed = JSON.parse(stored) as { tipo?: string; payload?: PayloadPedidoLoja }
      if (parsed.tipo !== 'PEDIDO_LOJA' || !parsed.payload?.pedidos?.length) {
        router.replace('/loja/carrinho')
        return
      }
      setTipo('PEDIDO_LOJA')
      setPayload(parsed.payload)
    } catch {
      router.replace('/loja/carrinho')
    } finally {
      setLoading(false)
    }
  }, [router, searchParams])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function pagarComPix() {
    setMetodo('PIX')
    setErro(null)
    setProcessando(true)
    setPixData(null)
    try {
      const body: Record<string, unknown> = {
        tipo: tipo!,
        metodo: 'PIX',
      }
      if (tipo === 'RECARGA_SALDO') {
        body.alunoId = recargaAlunoId
        body.valor = recargaValor
      } else {
        body.payload = payload
      }
      const res = await fetch('/api/checkout/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data.erro ?? 'Falha ao gerar Pix')
        setProcessando(false)
        return
      }
      setTransacaoId(data.transacaoId)
      setPixData(data.pix ?? {})
      setProcessando(false)
      if (data.transacaoId) setTransacaoId(data.transacaoId)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar')
      setProcessando(false)
    }
  }

  useEffect(() => {
    if (!transacaoId || !pixData) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/status?transacaoId=${transacaoId}`)
        const data = await res.json()
        if (data.status === 'APROVADO') {
          sessionStorage.removeItem(CHECKOUT_PAYLOAD_KEY)
          if (tipo === 'PEDIDO_LOJA') limparCarrinho()
          router.push(`/loja/checkout/sucesso?transacaoId=${transacaoId}${data.pedidoId ? `&pedidoIds=${data.pedidoId}` : ''}`)
        }
      } catch {
        // ignore
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [transacaoId, pixData, tipo, router])

  async function pagarComSaldoAlunos() {
    if (tipo !== 'PEDIDO_LOJA' || !payload) return
    setMetodo('SALDO')
    setErro(null)
    setProcessando(true)
    try {
      const res = await fetch('/api/checkout/saldo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      const data = await res.json().catch(() => ({}))
      setProcessando(false)
      if (!res.ok || data.ok === false) {
        setErro(data.erro ?? 'Não foi possível concluir com saldo dos alunos')
        return
      }
      const ids: string[] | undefined = data.pedidoIds
      sessionStorage.removeItem(CHECKOUT_PAYLOAD_KEY)
      if (tipo === 'PEDIDO_LOJA') limparCarrinho()
      if (ids?.length) {
        router.push(`/loja/checkout/sucesso?pedidoIds=${ids.join(',')}`)
      } else {
        router.push('/loja/checkout/sucesso')
      }
    } catch (e) {
      setProcessando(false)
      setErro(e instanceof Error ? e.message : 'Erro ao processar pagamento com saldo')
    }
  }

  async function pagarComCartao(e: React.FormEvent) {
    e.preventDefault()
    setMetodo('CARTAO')
    setErro(null)
    setProcessando(true)
    try {
      const body: Record<string, unknown> = {
        tipo: tipo!,
        metodo: 'CARTAO',
        card: {
          number: cardForm.number.replace(/\D/g, ''),
          validity: cardForm.validity.replace(/\D/g, ''),
          cvv: cardForm.cvv,
          nomePortador: cardForm.nomePortador.trim(),
          parcelas: cardForm.parcelas || 1,
        },
      }
      if (tipo === 'RECARGA_SALDO') {
        body.alunoId = recargaAlunoId
        body.valor = recargaValor
      } else {
        body.payload = payload
      }
      const res = await fetch('/api/checkout/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      setProcessando(false)
      if (!res.ok) {
        const msg = data.erro ?? data.error ?? (res.status === 503 ? 'Gateway não configurado. Verifique as variáveis da Rede no servidor.' : 'Pagamento recusado')
        setErro(msg)
        return
      }
      if (data.ok === false) {
        setErro(data.returnMessage ?? data.erro ?? 'Pagamento recusado')
        return
      }
      sessionStorage.removeItem(CHECKOUT_PAYLOAD_KEY)
      const ids = data.pedidoIds
      if (ids?.length) {
        if (tipo === 'PEDIDO_LOJA') limparCarrinho()
        router.push(`/loja/checkout/sucesso?pedidoIds=${ids.join(',')}`)
      } else {
        router.push(`/loja/checkout/sucesso?transacaoId=${data.transacaoId}`)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar')
      setProcessando(false)
    }
  }

  if (loading || !authOk) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto p-6 max-w-2xl text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto my-8" />
          <p className="text-muted-foreground">Carregando checkout...</p>
        </div>
      </>
    )
  }

  if (!tipo) {
    return null
  }

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Checkout</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Resumo do pedido</CardTitle>
            <CardDescription>
              {tipo === 'RECARGA_SALDO'
                ? `Recarga de saldo para ${recargaAlunoNome}`
                : 'Itens do pedido e data de retirada'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tipo === 'PEDIDO_LOJA' && payload?.pedidos && (
              <div className="space-y-4 mb-4">
                {payload.pedidos.map((p, idx) => {
                  const subtotalPedido = p.itens.reduce((s, i) => s + i.subtotal, 0)
                  const dataRetiradaFmt = p.dataRetirada
                    ? new Date(p.dataRetirada + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : null
                  return (
                    <div key={`${p.alunoId}-${p.dataRetirada ?? ''}-${idx}`} className="border rounded-lg p-3 space-y-2">
                      <p className="font-medium">
                        {p.alunoNome ?? `${p.alunoId.slice(0, 8)}…`}
                        {dataRetiradaFmt && (
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            — Retirada: {dataRetiradaFmt}
                          </span>
                        )}
                      </p>
                      <ul className="space-y-1.5 text-sm">
                        {p.itens.map((item, idx) => {
                          const nome = item.produto_nome ?? 'Produto'
                          const itemDataRetirada = item.data_retirada
                            ? new Date(item.data_retirada + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                            : null
                          return (
                            <li key={`${p.alunoId}-${idx}`} className="flex justify-between gap-2">
                              <span>
                                {item.quantidade}× {nome}
                                {itemDataRetirada && (
                                  <span className="text-muted-foreground"> (retirada: {itemDataRetirada})</span>
                                )}
                              </span>
                              <span className="shrink-0">{formatPrice(item.subtotal)}</span>
                            </li>
                          )
                        })}
                      </ul>
                      <p className="text-sm font-medium flex justify-between border-t pt-2 mt-2">
                        <span>Subtotal</span>
                        <span>{formatPrice(subtotalPedido)}</span>
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold border-t pt-4">
              <span>Total</span>
              <span>{formatPrice(valorTotal)}</span>
            </div>
          </CardContent>
        </Card>

        {erro && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive font-medium">{erro}</p>
            {(metodo === 'PIX' || metodo === 'CARTAO' || metodo === 'SALDO') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => { setErro(null); setMetodo(null) }}
              >
                Escolher outra forma de pagamento
              </Button>
            )}
          </div>
        )}

        {!pixData && !metodo && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <Button onClick={pagarComPix} disabled={processando} className="flex-1">
              {processando ? 'Gerando...' : 'Pagar com Pix'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setMetodo('CARTAO')}
              disabled={processando}
            >
              Pagar com Cartão
            </Button>
            {tipo === 'PEDIDO_LOJA' && (
              <Button
                variant="outline"
                onClick={pagarComSaldoAlunos}
                disabled={processando || !payload}
              >
                Pagar com Saldo dos Alunos
              </Button>
            )}
          </div>
        )}

        {pixData && (pixData.copyPaste || pixData.qrCode) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Pix</CardTitle>
              <CardDescription>Escaneie o QR Code ou copie o código para pagar no app do seu banco.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pixData.qrCodeBase64 && (
                <div className="flex justify-center">
                  <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48" />
                </div>
              )}
              {pixData.copyPaste && (
                <div>
                  <Label>Código Pix (copiar e colar)</Label>
                  <textarea
                    readOnly
                    className="w-full mt-1 p-3 rounded border bg-muted text-sm font-mono"
                    rows={4}
                    value={pixData.copyPaste}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      navigator.clipboard.writeText(pixData!.copyPaste ?? '')
                    }}
                  >
                    Copiar código
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Aguardando confirmação do pagamento...</p>
            </CardContent>
          </Card>
        )}

        {metodo === 'CARTAO' && !pixData && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cartão de crédito</CardTitle>
              <CardDescription>Preencha os dados do cartão.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={pagarComCartao} className="space-y-4">
                <div>
                  <Label htmlFor="card-number">Número do cartão</Label>
                  <Input
                    id="card-number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardForm.number}
                    onChange={(e) => setCardForm((c) => ({ ...c, number: formatCardNumberInput(e.target.value) }))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    className="mt-1 font-mono tracking-wider"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="card-validity">Validade (MM/AA)</Label>
                    <Input
                      id="card-validity"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      value={cardForm.validity}
                      onChange={(e) => setCardForm((c) => ({ ...c, validity: formatValidityInput(e.target.value) }))}
                      placeholder="MM/AA"
                      maxLength={5}
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="card-cvv">CVV</Label>
                    <Input
                      id="card-cvv"
                      type="password"
                      value={cardForm.cvv}
                      onChange={(e) => setCardForm((c) => ({ ...c, cvv: e.target.value }))}
                      placeholder="123"
                      maxLength={4}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="card-name">Nome no cartão</Label>
                  <Input
                    id="card-name"
                    value={cardForm.nomePortador}
                    onChange={(e) => setCardForm((c) => ({ ...c, nomePortador: e.target.value }))}
                    placeholder="Como está no cartão"
                    className="mt-1"
                  />
                </div>
                {regraParcelamento && regraParcelamento.max_parcelas > 1 && (
                  <div className="space-y-1">
                    <Label>Parcelas</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={cardForm.parcelas}
                      onChange={(e) =>
                        setCardForm((c) => ({
                          ...c,
                          parcelas: Math.min(maxParcelas, Math.max(1, parseInt(e.target.value, 10) || 1)),
                        }))
                      }
                    >
                      {parcelasOpcoes.map((n) => {
                        const parcela =
                          regraParcelamento.tipo === 'COM_JUROS' && regraParcelamento.taxa_juros_pct != null && n > 1
                            ? (valorTotal * (1 + (regraParcelamento.taxa_juros_pct / 100) * n)) / n
                            : valorTotal / n
                        return (
                          <option key={n} value={n}>
                            {n}x de {formatPrice(parcela)}
                            {n > 1 && regraParcelamento.tipo === 'SEM_JUROS' && ' sem juros'}
                          </option>
                        )
                      })}
                    </select>
                    {nParcelas > 1 && (
                      <p className="text-sm text-muted-foreground">
                        {regraParcelamento.tipo === 'COM_JUROS' && regraParcelamento.taxa_juros_pct != null ? (
                          <>
                            {nParcelas}x de {formatPrice(valorParcela)} — Com taxa de parcelamento de{' '}
                            {Number(regraParcelamento.taxa_juros_pct).toFixed(1).replace('.', ',')}% (total:{' '}
                            {formatPrice(totalComJuros)})
                          </>
                        ) : (
                          <>Total: {formatPrice(valorTotal)}</>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {erro && <p className="text-sm text-destructive">{erro}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={processando}>
                    {processando ? 'Processando...' : 'Pagar'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setMetodo(null)}>
                    Voltar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Button variant="ghost" onClick={() => router.push(tipo === 'RECARGA_SALDO' ? '/loja/gestao-saldo' : '/loja/carrinho')}>
          ← Voltar
        </Button>
      </div>
    </>
  )
}
