'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook para instalação PWA exclusivamente via beforeinstallprompt.
 * Não há download de APK — apenas o prompt nativo do navegador (Adicionar à tela inicial).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

function getStoredPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  return window.__pwaInstallPrompt || null
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const apply = (e: BeforeInstallPromptEvent | null) => {
      if (e) {
        setDeferredPrompt(e)
        setIsInstallable(true)
      }
    }

    apply(getStoredPrompt())

    const handler = (e: Event) => {
      e.preventDefault()
      const ev = e as BeforeInstallPromptEvent
      window.__pwaInstallPrompt = ev
      apply(ev)
    }

    window.addEventListener('beforeinstallprompt', handler)

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true)
      setIsInstallable(false)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  /** Chama apenas o prompt nativo do navegador (PWA). Nunca inicia download de APK. */
  const promptInstall = useCallback(async () => {
    const promptEv = deferredPrompt || getStoredPrompt()
    if (!promptEv) return false
    await promptEv.prompt()
    const { outcome } = await promptEv.userChoice
    if (outcome === 'accepted') {
      window.__pwaInstallPrompt = null
      setIsInstallable(false)
      setDeferredPrompt(null)
      return true
    }
    return false
  }, [deferredPrompt])

  return { isInstallable, isInstalled, promptInstall, hasPrompt: !!(deferredPrompt || getStoredPrompt()) }
}
