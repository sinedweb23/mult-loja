'use client'

import { Suspense, useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAlunosDoResponsavel } from '@/app/actions/responsavel'
import { getProdutosDisponiveisParaResponsavel } from '@/app/actions/produtos'
import { obterSaldoAluno } from '@/app/actions/saldo'
import { obterLancheDoDiaProdutoId, usuarioTemAlgumAlunoComAcessoCreditoCantina } from '@/app/actions/configuracoes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LojaHeader } from '@/components/loja/header'
import {
  GreetingCard,
  BalanceCard,
  ActionGrid,
  SnackOfTheDayCard,
} from '@/components/loja/cantina'
import { salvarCarrinho, carregarCarrinho, contarItensCarrinho, type ItemCarrinho } from '@/lib/carrinho'
import Link from 'next/link'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { UtensilsCrossed, Receipt, ChevronRight, Search } from 'lucide-react'
import type { Aluno } from '@/lib/types/database'
import type { ProdutoComDisponibilidade } from '@/lib/types/database'

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function iconePlaceholder(tipo: string) {
  if (tipo === 'KIT_FESTA') return '🎂'
  if (tipo === 'SERVICO') return '🔧'
  return '🍔'
}

const CardProduto = memo(function CardProduto({ produto }: { produto: ProdutoComDisponibilidade }) {
  return (
    <Card className="group overflow-hidden flex flex-col border border-[var(--cantina-border)] bg-white h-full w-full min-w-0 rounded-xl shadow-[var(--cantina-shadow-sm)]">
      <div className="relative aspect-[4/3] bg-[var(--cantina-background)] overflow-hidden">
        {produto.imagem_url ? (
          <>
            <img
              src={produto.imagem_url}
              alt={produto.nome}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.currentTarget
                target.style.display = 'none'
                const placeholder = target.parentElement?.querySelector('.placeholder-imagem') as HTMLElement
                if (placeholder) placeholder.style.display = 'flex'
              }}
            />
            <div className="placeholder-imagem absolute inset-0 flex items-center justify-center hidden bg-[var(--cantina-background)]">
              <div className="text-center">
                <span className="text-2xl">{iconePlaceholder(produto.tipo)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--cantina-background)]">
            <span className="text-2xl">{iconePlaceholder(produto.tipo)}</span>
          </div>
        )}
      </div>
      <CardHeader className="p-2 sm:p-3 pb-0">
        <CardTitle className="line-clamp-2 text-sm font-semibold text-[var(--cantina-text)] leading-tight">{produto.nome}</CardTitle>
        <CardDescription className="line-clamp-1 text-xs text-[var(--cantina-text-muted)] hidden sm:block">
          {produto.descricao || 'Lanchinho da cantina'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2 sm:p-3 pt-0 space-y-2">
        <div className="flex items-baseline justify-between gap-1 flex-wrap">
          <span className="text-base font-bold text-[#0B5ED7]">
            {produto.preco_a_partir_de != null
              ? `A partir de ${formatPrice(produto.preco_a_partir_de)}`
              : formatPrice(Number(produto.preco))}
          </span>
          {(produto.tem_estoque ?? produto.estoque > 0) ? (
            <span className="text-[10px] font-medium text-[#16A34A] bg-[#16A34A]/15 px-1.5 py-0.5 rounded-full">
              Disponível
            </span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              Esgotado
            </span>
          )}
        </div>
        {produto.compra_unica && (
          <div className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
            Compra única (máx. {produto.limite_max_compra_unica})
          </div>
        )}
        {(produto.tem_estoque ?? produto.estoque > 0) ? (
          <Link href={`/loja/produto/${produto.id}`} className="w-full block">
            <Button size="sm" className="w-full rounded-lg bg-[#0B5ED7] hover:bg-[#0a58c9] text-white text-xs h-8">
              Ver detalhes
            </Button>
          </Link>
        ) : (
          <Button size="sm" className="w-full rounded-lg text-xs h-8" variant="secondary" disabled>
            Esgotado
          </Button>
        )}
      </CardContent>
    </Card>
  )
})

function LojaPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [saldoPorAluno, setSaldoPorAluno] = useState<Record<string, number>>({})
  const [produtos, setProdutos] = useState<ProdutoComDisponibilidade[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModalAdicionado, setShowModalAdicionado] = useState(false)
  const [produtoAdicionado, setProdutoAdicionado] = useState<{ nome: string; alunoNome: string } | null>(null)
  const [lancheDoDiaProdutoId, setLancheDoDiaProdutoId] = useState<string | null>(null)
  const [mostrarCreditoCantina, setMostrarCreditoCantina] = useState(false)
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)

  const alunoIdFromUrl = searchParams.get('aluno')
  const acessoCreditoNegado = searchParams.get('acesso_credito_cantina') === 'negado'
  const selectedAluno = useMemo(() => {
    if (!alunos.length) return null
    const found = alunos.find((a) => a.id === alunoIdFromUrl)
    return found ?? alunos[0]
  }, [alunos, alunoIdFromUrl])
  const selectedAlunoId = selectedAluno?.id ?? null

  useEffect(() => {
    const carrinhoCarregado = carregarCarrinho()
    setCarrinho(carrinhoCarregado)

    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      let alunosData: Aluno[] = []
      try {
        alunosData = await getAlunosDoResponsavel()
        setAlunos(alunosData)
        const saldos = await Promise.all(
          alunosData.map(async (a) => ({ id: a.id, saldo: await obterSaldoAluno(a.id) }))
        )
        setSaldoPorAluno(Object.fromEntries(saldos.map((s) => [s.id, s.saldo])))
      } catch (err) {
        console.error('Erro ao carregar alunos:', err)
        const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar alunos'
        if (errorMessage.includes('Não autenticado') || errorMessage.includes('Responsável não encontrado')) {
          router.replace('/login?message=session_nao_encontrada')
          return
        }
        setError(errorMessage)
      }

      try {
        const [produtosData, configLancheId, acessoCredito] = await Promise.all([
          getProdutosDisponiveisParaResponsavel(),
          obterLancheDoDiaProdutoId(),
          usuarioTemAlgumAlunoComAcessoCreditoCantina(),
        ])
        setProdutos(produtosData)
        setLancheDoDiaProdutoId(configLancheId)
        setMostrarCreditoCantina(acessoCredito)
      } catch (err) {
        console.error('[Loja] Erro ao carregar produtos:', err)
        const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar produtos'
        setError(errorMessage)
        
        if (errorMessage.includes('Responsável não encontrado') || errorMessage.includes('não vinculado')) {
          setTimeout(() => {
            router.push('/primeiro-acesso')
          }, 2000)
        }
      }
    } catch (err) {
      console.error('Erro geral ao carregar dados:', err)
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  function adicionarAoCarrinho(produto: ProdutoComDisponibilidade, alunoId: string) {
    const aluno = alunos.find(a => a.id === alunoId)
    if (!aluno) return

    const itemExistente = carrinho.find(
      item => item.produto.id === produto.id && item.alunoId === alunoId
    )

    let novoCarrinho: ItemCarrinho[]
    if (itemExistente) {
      novoCarrinho = carrinho.map(item =>
        item.produto.id === produto.id && item.alunoId === alunoId
          ? { ...item, quantidade: item.quantidade + 1 }
          : item
      )
    } else {
      novoCarrinho = [...carrinho, {
        produto: {
          id: produto.id,
          nome: produto.nome,
          preco: Number(produto.preco),
          tipo: produto.tipo,
          descricao: produto.descricao,
          imagem_url: produto.imagem_url || null,
        },
        alunoId,
        alunoNome: aluno.nome,
        quantidade: 1
      }]
    }

    setCarrinho(novoCarrinho)
    salvarCarrinho(novoCarrinho)
    
    // Mostrar modal de confirmação
    setProdutoAdicionado({
      nome: produto.nome,
      alunoNome: aluno.nome
    })
    setShowModalAdicionado(true)
  }

  /** Produtos tipo Kit Festa (página exclusiva) */
  const produtosKitFesta = useMemo(
    () => (Array.isArray(produtos) ? produtos.filter((p) => (p as { tipo?: string }).tipo === 'KIT_FESTA') : []),
    [produtos]
  )
  /** Agrupa produtos por categoria (exclui KIT_FESTA — tem página própria) — sempre chamado (Rules of Hooks) */
  const categoriasComProdutos = useMemo(() => {
    const list = Array.isArray(produtos) ? produtos.filter((p) => (p as { tipo?: string }).tipo !== 'KIT_FESTA') : []
    const map = new Map<string, { key: string; nome: string; ordem: number; produtos: ProdutoComDisponibilidade[] }>()
    for (const p of list) {
      const raw = p as { categoria_id?: string | null; categoria?: unknown }
      const cat = raw.categoria
      const key = raw.categoria_id ?? '__sem_categoria__'
      const nome = (cat && typeof cat === 'object' && cat !== null && 'nome' in cat) ? String((cat as { nome: string }).nome) : 'Outros'
      const ordem = (cat && typeof cat === 'object' && cat !== null && 'ordem' in cat && typeof (cat as { ordem: number }).ordem === 'number') ? (cat as { ordem: number }).ordem : 999
      if (!map.has(key)) map.set(key, { key, nome, ordem, produtos: [] })
      map.get(key)!.produtos.push(p)
    }
    return Array.from(map.values()).sort((a, b) => a.ordem - b.ordem)
  }, [produtos])

  /** Categorias filtradas por busca e seleção de categoria (apenas categorias que têm produto) */
  const categoriasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return categoriasComProdutos
      .filter((cat) => !categoriaFiltro || cat.key === categoriaFiltro)
      .map((cat) => {
        if (!q) return cat
        const filtrados = cat.produtos.filter(
          (p) =>
            p.nome.toLowerCase().includes(q) ||
            (p.descricao && p.descricao.toLowerCase().includes(q))
        )
        return { ...cat, produtos: filtrados }
      })
      .filter((cat) => cat.produtos.length > 0)
  }, [categoriasComProdutos, busca, categoriaFiltro])

  const lancheDoDiaProduct = useMemo(() => {
    if (!Array.isArray(produtos)) return null
    if (lancheDoDiaProdutoId) {
      const p = produtos.find((x) => x.id === lancheDoDiaProdutoId)
      if (p) return p
    }
    return produtos[0] ?? null
  }, [produtos, lancheDoDiaProdutoId])
  const alunoNome = selectedAluno?.nome ?? 'seus filhos'

  const handleAlunoChange = useCallback((alunoId: string) => {
    router.push('/loja?aluno=' + encodeURIComponent(alunoId))
  }, [router])

  if (loading && alunos.length === 0 && !error) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="text-center py-8">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
      <LojaHeader />

      <main className="container mx-auto px-4 py-5 sm:py-6 max-w-2xl md:max-w-4xl">
        <section className="space-y-4 mb-6">
          <GreetingCard alunoNome={alunoNome} />
          {selectedAluno && (
            <BalanceCard
              alunoNome={selectedAluno.nome}
              saldo={saldoPorAluno[selectedAluno.id]}
              href={selectedAlunoId ? `/loja/extrato?aluno=${encodeURIComponent(selectedAlunoId)}` : '/loja/extrato'}
              alunos={alunos.length > 1 ? alunos.map((a) => ({ id: a.id, nome: a.nome })) : undefined}
              alunoAtualId={selectedAlunoId ?? undefined}
              onAlunoChange={alunos.length > 1 ? handleAlunoChange : undefined}
            />
          )}
          <ActionGrid alunoId={selectedAlunoId} mostrarCreditoCantina={mostrarCreditoCantina} />
          {produtosKitFesta.length > 0 && (
            <Link
              href="/loja/kit-festa"
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] cantina-card-hover"
            >
              <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF8A00]/20 text-[#FF8A00] text-2xl">
                🎂
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-[var(--cantina-text)]">Monte kit festa</h3>
                <p className="text-sm text-[var(--cantina-text-muted)]">Produtos exclusivos para festa: escolha o kit, data e horário</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--cantina-text-muted)] shrink-0" />
            </Link>
          )}
        </section>

        {/* Destaque */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[var(--cantina-text)]">Destaque</h2>
            <Link href="#cardapio" className="text-sm font-medium text-[#0B5ED7] flex items-center gap-0.5">
              Ver mais <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {!loading && lancheDoDiaProduct ? (
            <SnackOfTheDayCard
              nome={lancheDoDiaProduct.nome}
              preco={Number(lancheDoDiaProduct.preco)}
              precoAPartirDe={
                lancheDoDiaProduct.preco_a_partir_de != null
                  ? Number(lancheDoDiaProduct.preco_a_partir_de)
                  : null
              }
              imagemUrl={lancheDoDiaProduct.imagem_url}
              href={`/loja/produto/${lancheDoDiaProduct.id}`}
              formatPrice={formatPrice}
            />
          ) : !loading && produtos.length === 0 ? (
            <Link href="/loja">
              <div className="rounded-2xl bg-white p-6 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] text-center cantina-card-hover">
                <p className="text-[var(--cantina-text-muted)] text-sm">Nenhum item no cardápio</p>
                <p className="text-[#0B5ED7] font-medium text-sm mt-1">Ver cardápio</p>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-white p-6 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] animate-pulse">
              <div className="h-24 bg-[var(--cantina-background)] rounded-xl" />
            </div>
          )}
        </section>

        {/* Cardápio completo - sem content-visibility para evitar scroll travado */}
        {!loading && produtos.length > 0 && (
          <section id="cardapio" className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="h-5 w-5 text-[#0B5ED7]" />
              <h2 className="text-lg font-bold text-[var(--cantina-text)]">Cardápio</h2>
            </div>

            {/* Filtros discretos: busca + categoria */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cantina-text-muted)]" />
                <Input
                  type="search"
                  placeholder="Buscar produto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9 h-9 rounded-lg border-[var(--cantina-border)] bg-white/80 text-sm placeholder:text-[var(--cantina-text-muted)]"
                />
              </div>
              {categoriasComProdutos.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setCategoriaFiltro(null)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      categoriaFiltro === null
                        ? 'bg-[#0B5ED7] text-white'
                        : 'bg-white/80 border border-[var(--cantina-border)] text-[var(--cantina-text-muted)] hover:bg-[var(--cantina-background)]'
                    }`}
                  >
                    Todos
                  </button>
                  {categoriasComProdutos.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategoriaFiltro(cat.key)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        categoriaFiltro === cat.key
                          ? 'bg-[#0B5ED7] text-white'
                          : 'bg-white/80 border border-[var(--cantina-border)] text-[var(--cantina-text-muted)] hover:bg-[var(--cantina-background)]'
                      }`}
                    >
                      {cat.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile: grid vertical (sem carrossel) para scroll vertical fluido com dedo */}
            <div className="sm:hidden space-y-6">
              {categoriasFiltradas.length > 0 ? (
                categoriasFiltradas.map((cat) => (
                  <div key={cat.key}>
                    <h3 className="text-base font-semibold text-[var(--cantina-text)] mb-3">{cat.nome}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {cat.produtos.map((produto) => (
                        <CardProduto key={produto.id} produto={produto} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--cantina-text-muted)] py-4">Nenhum produto encontrado.</p>
              )}
            </div>

            <div className="hidden sm:block space-y-6">
              {categoriasFiltradas.length > 0 ? (
                categoriasFiltradas.map((cat) => (
                  <div key={cat.key}>
                    <h3 className="text-base font-semibold text-[var(--cantina-text)] mb-3">{cat.nome}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {cat.produtos.map((produto) => (
                        <CardProduto key={produto.id} produto={produto} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--cantina-text-muted)] py-4">Nenhum produto encontrado.</p>
              )}
            </div>
          </section>
        )}

        {acessoCreditoNegado && (
          <div className="mb-6 p-4 rounded-2xl border bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30">
            Você não tem permissão para acessar a funcionalidade Crédito Cantina com os segmentos dos seus alunos.
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 rounded-2xl border bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-[#0B5ED7] border-t-transparent mb-4" />
            <p className="text-[var(--cantina-text-muted)]">Carregando...</p>
          </div>
        )}

        {!loading && produtos.length === 0 && !error && (
          <Card className="text-center py-12 rounded-2xl border-[var(--cantina-border)] bg-white shadow-[var(--cantina-shadow)]">
            <CardContent>
              <div className="text-5xl mb-3">🥪</div>
              <h2 className="text-xl font-semibold text-[var(--cantina-text)] mb-1">Nenhum item no cardápio</h2>
              <p className="text-sm text-[var(--cantina-text-muted)]">Em breve teremos lanches disponíveis.</p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Modal de confirmação ao adicionar ao carrinho */}
      <Dialog open={showModalAdicionado} onOpenChange={setShowModalAdicionado}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ Produto Adicionado!</DialogTitle>
            <DialogDescription>
              {produtoAdicionado && (
                <>
                  <strong>{produtoAdicionado.nome}</strong> foi adicionado ao carrinho para <strong>{produtoAdicionado.alunoNome}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowModalAdicionado(false)}
            >
              Continuar Comprando
            </Button>
            <Link href="/loja/carrinho" className="w-full sm:w-auto">
              <Button className="w-full" onClick={() => setShowModalAdicionado(false)}>
                Ir para o Carrinho
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LojaPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent" />
    </div>
  )
}

export default function LojaPage() {
  return (
    <Suspense fallback={<LojaPageFallback />}>
      <LojaPageContent />
    </Suspense>
  )
}
