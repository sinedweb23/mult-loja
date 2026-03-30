'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getProdutosDisponiveisParaResponsavel } from '@/app/actions/produtos'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Cake } from 'lucide-react'
import type { ProdutoComDisponibilidade } from '@/lib/types/database'

export default function KitFestaPage() {
  const router = useRouter()
  const [produtos, setProdutos] = useState<ProdutoComDisponibilidade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const kits = produtos.filter((p) => (p as { tipo?: string }).tipo === 'KIT_FESTA')

  useEffect(() => {
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    loadData().catch((err) => {
      setError(err instanceof Error ? err.message : 'Erro')
      if (String(err).includes('Não autenticado')) router.replace('/login?message=session_nao_encontrada')
    })
  }, [router])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const data = await getProdutosDisponiveisParaResponsavel()
      setProdutos(data)
      const kitsFesta = data.filter((p) => (p as { tipo?: string }).tipo === 'KIT_FESTA')
      if (kitsFesta.length === 1) {
        router.replace(`/loja/produto/${kitsFesta[0].id}`)
        return
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent mb-4" />
            <p className="text-[var(--cantina-text-muted)]">Carregando...</p>
          </div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <p className="text-[#DC2626] text-center">{error}</p>
          <Link href="/loja" className="block text-center mt-4 text-[#0B5ED7] font-medium">
            Voltar ao início
          </Link>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
      <LojaHeader />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Link
          href="/loja#cardapio"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#0B5ED7] hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao cardápio
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF8A00]/20 text-[#FF8A00]">
            <Cake className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--cantina-text)]">Kit Festa</h1>
            <p className="text-sm text-[var(--cantina-text-muted)]">
              Escolha o kit e defina data e horário da festa
            </p>
          </div>
        </div>

        {kits.length === 0 ? (
          <Card className="rounded-2xl border-[var(--cantina-border)] shadow-[var(--cantina-shadow)]">
            <CardContent className="py-12 text-center">
              <p className="text-[var(--cantina-text-muted)]">Nenhum kit festa disponível no momento.</p>
              <Link href="/loja#cardapio">
                <Button variant="outline" className="mt-4 rounded-xl border-[#0B5ED7]/40 text-[#0B5ED7]">
                  Ver cardápio
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {kits.map((produto) => (
              <Link key={produto.id} href={`/loja/produto/${produto.id}`}>
                <Card className="rounded-2xl border-[var(--cantina-border)] shadow-[var(--cantina-shadow)] overflow-hidden cantina-card-hover">
                  <div className="flex gap-4 p-4">
                    <div className="w-20 h-20 rounded-xl bg-[var(--cantina-background)] flex-shrink-0 overflow-hidden">
                      {produto.imagem_url ? (
                        <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">🎂</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-bold text-[var(--cantina-text)] line-clamp-2">
                        {produto.nome}
                      </CardTitle>
                      {produto.descricao && (
                        <CardDescription className="text-sm line-clamp-2 mt-0.5">
                          {produto.descricao}
                        </CardDescription>
                      )}
                      <p className="text-lg font-bold text-[#FF8A00] mt-2">
                        {produto.preco_a_partir_de != null
                          ? `A partir de ${formatPrice(produto.preco_a_partir_de)}`
                          : formatPrice(Number(produto.preco))}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0">
                      <Button size="sm" className="rounded-xl bg-[#FF8A00] hover:bg-[#e67d00] text-white">
                        Comprar kit festa
                      </Button>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
