'use client'

import { buscarAlunosPdv, buscarColaboradoresPdv } from '@/app/actions/pdv-vendas'

type AlunoPdv = any
type ColaboradorPdv = any

interface CacheEntry<T> {
  resultados: T[]
  timestamp: number
  promise?: Promise<T[]>
}

const CACHE_TTL_MS = 60_000

const cacheAlunos = new Map<string, CacheEntry<AlunoPdv>>()
const cacheColaboradores = new Map<string, CacheEntry<ColaboradorPdv>>()

function normalizarTermo(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export async function buscarAlunosPdvComCache(
  empresaId: string,
  termo: string
): Promise<AlunoPdv[]> {
  const termoNorm = normalizarTermo(termo)
  if (!empresaId || termoNorm.length < 2) return []

  const chave = `${empresaId}::${termoNorm}`
  const agora = Date.now()
  const existente = cacheAlunos.get(chave)
  const valido = existente && agora - existente.timestamp < CACHE_TTL_MS

  if (valido && existente?.resultados) {
    return existente.resultados
  }

  if (existente?.promise) {
    return existente.promise
  }

  const promise = buscarAlunosPdv(empresaId, termoNorm).then((lista) => {
    cacheAlunos.set(chave, {
      resultados: lista,
      timestamp: Date.now(),
    })
    return lista
  })

  cacheAlunos.set(chave, {
    resultados: existente?.resultados ?? [],
    timestamp: existente?.timestamp ?? 0,
    promise,
  })

  return promise
}

export async function buscarColaboradoresPdvComCache(
  empresaId: string,
  termo: string
): Promise<ColaboradorPdv[]> {
  const termoNorm = normalizarTermo(termo)
  if (!empresaId || termoNorm.length < 2) return []

  const chave = `${empresaId}::${termoNorm}`
  const agora = Date.now()
  const existente = cacheColaboradores.get(chave)
  const valido = existente && agora - existente.timestamp < CACHE_TTL_MS

  if (valido && existente?.resultados) {
    return existente.resultados
  }

  if (existente?.promise) {
    return existente.promise
  }

  const promise = buscarColaboradoresPdv(empresaId, termoNorm).then((lista) => {
    cacheColaboradores.set(chave, {
      resultados: lista,
      timestamp: Date.now(),
    })
    return lista
  })

  cacheColaboradores.set(chave, {
    resultados: existente?.resultados ?? [],
    timestamp: existente?.timestamp ?? 0,
    promise,
  })

  return promise
}

