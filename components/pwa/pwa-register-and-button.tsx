'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** PWA só para a loja. Apenas registra o service worker quando o usuário está em /loja. */
const isLojaRoute = (pathname: string | null) => pathname?.startsWith('/loja') ?? false

/**
 * Registra o service worker na área da loja. Não renderiza nada.
 * O botão "Instalar" fica no header da loja (LojaHeader).
 */
export function PwaRegisterAndButton() {
  const pathname = usePathname()
  const naLoja = isLojaRoute(pathname)

  useEffect(() => {
    if (!naLoja || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [naLoja])

  return null
}
