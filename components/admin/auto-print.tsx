'use client'

import { useEffect } from 'react'

export function AutoPrint() {
  useEffect(() => {
    // aguarda um tick para garantir layout carregado
    const id = window.setTimeout(() => {
      window.print()
    }, 50)
    return () => window.clearTimeout(id)
  }, [])

  return null
}

