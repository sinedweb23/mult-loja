'use client'

import { createContext, useContext } from 'react'
import type { Caixa } from '@/lib/types/database'

const CaixaContext = createContext<Caixa | null>(null)

export function useCaixaPdv() {
  return useContext(CaixaContext)
}

export { CaixaContext }
