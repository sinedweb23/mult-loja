'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { LojaHeader } from '@/components/loja/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'
import { limparCarrinho } from '@/lib/carrinho'

export default function CheckoutSucessoPage() {
  const searchParams = useSearchParams()
  const transacaoId = searchParams.get('transacaoId')
  const pedidoIdsParam = searchParams.get('pedidoIds') ?? ''
  const pedidoIds = pedidoIdsParam.split(',').filter(Boolean)

  useEffect(() => {
    if (pedidoIds.length > 0) limparCarrinho()
  }, [pedidoIdsParam])

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto p-6 max-w-lg text-center">
        <Card>
          <CardHeader>
            <div className="flex justify-center mb-2">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Pagamento confirmado</CardTitle>
            <CardDescription>
              Seu pagamento foi aprovado. {pedidoIds.length > 0 ? 'O(s) pedido(s) já está(ão) disponível(is) em Meus Pedidos.' : 'O saldo foi creditado na gestão de saldo.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transacaoId && (
              <p className="text-sm text-muted-foreground">Transação: {transacaoId.slice(0, 8)}…</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {pedidoIds.length > 0 ? (
                <Link href="/loja">
                  <Button>Voltar ao cardápio</Button>
                </Link>
              ) : (
                <Link href="/loja/gestao-saldo">
                  <Button>Ir para Gestão de Saldo</Button>
                </Link>
              )}
              <Link href="/loja">
                <Button variant="outline">Continuar comprando</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
