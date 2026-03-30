'use client'

import { listarProdutosPdv } from '@/app/actions/pdv-vendas'

type ProdutoPdv = any

interface CacheEntry {
  produtos: ProdutoPdv[]
  timestamp: number
  promise?: Promise<ProdutoPdv[]>
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

interface OpcaoCache {
  forceRefresh?: boolean
}

export async function obterProdutosPdvComCache(
  empresaId: string,
  { forceRefresh = false }: OpcaoCache = {}
): Promise<ProdutoPdv[]> {
  if (!empresaId) return []

  const agora = Date.now()
  const existente = cache.get(empresaId)
  const valido = existente && agora - existente.timestamp < CACHE_TTL_MS

  if (!forceRefresh && valido && existente?.produtos?.length) {
    return existente.produtos
  }

  if (!forceRefresh && existente?.promise) {
    return existente.promise
  }

  const promise = listarProdutosPdv(empresaId).then((lista) => {
    cache.set(empresaId, {
      produtos: lista,
      timestamp: Date.now(),
    })
    return lista
  })

  cache.set(empresaId, {
    produtos: existente?.produtos ?? [],
    timestamp: existente?.timestamp ?? 0,
    promise,
  })

  return promise
}

