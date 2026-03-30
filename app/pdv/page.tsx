'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obterCaixaAberto } from '@/app/actions/caixa'

/**
 * Não existe tela exclusiva de caixa: redireciona para Vendas.
 * Se o caixa não estiver aberto, o layout exibe o modal de abertura.
 */
export default function PdvPage() {
  const router = useRouter()

  useEffect(() => {
    obterCaixaAberto().then((caixa) => {
      if (caixa) {
        router.replace('/pdv/vendas')
      } else {
        router.replace('/pdv/vendas')
      }
    })
  }, [router])

  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}
