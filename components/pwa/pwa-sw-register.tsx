'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Registra o service worker assim que o usuário entra na loja.
 * Fica no layout da loja para rodar cedo e o navegador considerar o PWA instalável (beforeinstallprompt).
 */
export function PwaSwRegister() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname?.startsWith('/loja') || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').then(() => {}).catch(() => {})
  }, [pathname])

  return null
}
