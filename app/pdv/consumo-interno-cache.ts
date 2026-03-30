'use client'

import {
  listarProdutosConsumoInterno,
  listarColaboradoresParaConsumoInterno,
  type ProdutoConsumoInterno,
} from '@/app/actions/consumo-interno'

interface ProdutosCacheEntry {
  produtos: ProdutoConsumoInterno[]
  timestamp: number
  promise?: Promise<ProdutoConsumoInterno[]>
}

interface ColaboradoresCacheEntry {
  colaboradores: Array<{ id: string; nome: string }>
  timestamp: number
  promise?: Promise<Array<{ id: string; nome: string }>>
}

const CACHE_TTL_MS = 60_000

const produtosCache = new Map<string, ProdutosCacheEntry>()
const colaboradoresCache = new Map<string, ColaboradoresCacheEntry>()

interface CacheOptions {
  forceRefresh?: boolean
}

export async function obterProdutosConsumoInternoComCache(
  empresaId: string,
  { forceRefresh = false }: CacheOptions = {}
): Promise<ProdutoConsumoInterno[]> {
  if (!empresaId) return []

  const agora = Date.now()
  const existente = produtosCache.get(empresaId)
  const valido = existente && agora - existente.timestamp < CACHE_TTL_MS

  if (!forceRefresh && valido && existente?.produtos?.length) {
    return existente.produtos
  }

  if (!forceRefresh && existente?.promise) {
    return existente.promise
  }

  const promise = listarProdutosConsumoInterno(empresaId).then((lista) => {
    produtosCache.set(empresaId, {
      produtos: lista,
      timestamp: Date.now(),
    })
    return lista
  })

  produtosCache.set(empresaId, {
    produtos: existente?.produtos ?? [],
    timestamp: existente?.timestamp ?? 0,
    promise,
  })

  return promise
}

export async function obterColaboradoresConsumoInternoComCache(
  empresaId: string,
  { forceRefresh = false }: CacheOptions = {}
): Promise<Array<{ id: string; nome: string }>> {
  if (!empresaId) return []

  const agora = Date.now()
  const existente = colaboradoresCache.get(empresaId)
  const valido = existente && agora - existente.timestamp < CACHE_TTL_MS

  if (!forceRefresh && valido && existente?.colaboradores?.length) {
    return existente.colaboradores
  }

  if (!forceRefresh && existente?.promise) {
    return existente.promise
  }

  const promise = listarColaboradoresParaConsumoInterno(empresaId).then((lista) => {
    const cols = lista ?? []
    colaboradoresCache.set(empresaId, {
      colaboradores: cols,
      timestamp: Date.now(),
    })
    return cols
  })

  colaboradoresCache.set(empresaId, {
    colaboradores: existente?.colaboradores ?? [],
    timestamp: existente?.timestamp ?? 0,
    promise,
  })

  return promise
}

