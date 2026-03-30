'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Redireciona para a página de Extrato (gestão de saldo foi separada em Extrato, Controle e Recarga). */
export default function GestaoSaldoPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/loja/extrato')
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent mb-4" />
        <p className="text-[var(--cantina-text-muted)]">Redirecionando...</p>
      </div>
    </div>
  )
}
