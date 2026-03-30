'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listarProdutosPaginado,
  buscarProdutosParaEntrada,
  registrarEntradaEstoque,
  listarEntradasEstoque,
  criarProduto,
  atualizarProduto,
  excluirOuInativarProduto,
  listarCategorias,
  listarGruposProdutos,
  obterProduto,
} from '@/app/actions/produtos-admin'
import type { EntradaEstoqueResumo } from '@/app/actions/produtos-admin'
import { getAdminData } from '@/app/actions/admin'
import { listarEmpresas } from '@/app/actions/empresas'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import type { ProdutoCompleto, Categoria, GrupoProduto } from '@/lib/types/database'
import { ProdutoFormModal } from '@/components/admin/produto-form-modal'
import { CategoriasManager } from '@/components/admin/categorias-manager'
import { GruposManager } from '@/components/admin/grupos-manager'
import { ImportarLoteTab } from '@/components/admin/importar-lote-tab'
import { AtualizarLoteTab } from '@/components/admin/atualizar-lote-tab'
import { Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react'

const PAGE_SIZE = 20
const DEBOUNCE_BUSCA_MS = 350

/** Nome da variação: mesma regra da loja/PDV — valor primeiro, depois label. */
function nomeVariacaoValor(v: { valor?: string | null; label?: string | null }): string {
  const val = (v?.valor ?? '').trim()
  if (val !== '') return val
  const lbl = (v?.label ?? '').trim()
  return lbl !== '' ? lbl : 'Opção'
}

type LinhaEntrada =
  | { produto: ProdutoCompleto; tipo: 'simples'; quantidade: number; valor_custo: number }
  | { produto: ProdutoCompleto; tipo: 'variacoes'; quantidades: Record<string, number>; custos: Record<string, number> }

export default function ProdutosPage() {
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<ProdutoCompleto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busca, setBusca] = useState('')
  const [buscaDigita, setBuscaDigita] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [grupos, setGrupos] = useState<GrupoProduto[]>([])
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [showProdutoModal, setShowProdutoModal] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<ProdutoCompleto | null>(null)
  const [showCategorias, setShowCategorias] = useState(false)
  const [showGrupos, setShowGrupos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Entrada de produtos
  const [buscaEntrada, setBuscaEntrada] = useState('')
  const [resultadosBusca, setResultadosBusca] = useState<ProdutoCompleto[]>([])
  const [buscandoEntrada, setBuscandoEntrada] = useState(false)
  const [linhasEntrada, setLinhasEntrada] = useState<LinhaEntrada[]>([])
  const [numeroNotaEntrada, setNumeroNotaEntrada] = useState('')
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)

  // Histórico de entradas
  const [entradas, setEntradas] = useState<EntradaEstoqueResumo[]>([])
  const [totalEntradas, setTotalEntradas] = useState(0)
  const [paginaEntradas, setPaginaEntradas] = useState(1)
  const [loadingHistorio, setLoadingHistorio] = useState(false)
  const [entradasExpandidas, setEntradasExpandidas] = useState<Set<string>>(new Set())

  function toggleEntradaExpandida(id: string) {
    setEntradasExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const carregarInicial = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const adminData = await getAdminData()
      let idEmpresa = adminData.empresa_id ?? null
      if (!idEmpresa) {
        const empresas = await listarEmpresas()
        const primeira = Array.isArray(empresas) && empresas.length > 0 ? empresas[0] : null
        idEmpresa = primeira ? (primeira as { id: string }).id : null
      }
      if (!idEmpresa) {
        setEmpresaId(null)
        setProdutos([])
        setCategorias([])
        setGrupos([])
        setError('Nenhuma empresa cadastrada. Cadastre em Admin > Empresas para gerenciar produtos.')
        return
      }
      setEmpresaId(idEmpresa)
      const [categoriasData, gruposData] = await Promise.all([
        listarCategorias(idEmpresa),
        listarGruposProdutos(idEmpresa),
      ])
      setCategorias(categoriasData)
      setGrupos(gruposData)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarLista = useCallback(async () => {
    if (!empresaId) return
    try {
      setLoading(true)
      setError(null)
      const res = await listarProdutosPaginado(empresaId, {
        page,
        pageSize: PAGE_SIZE,
        busca: buscaDigita || undefined,
      })
      setProdutos(res.produtos)
      setTotal(res.total)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [empresaId, page, buscaDigita])

  useEffect(() => {
    carregarInicial()
  }, [carregarInicial])

  useEffect(() => {
    if (empresaId) carregarLista()
  }, [carregarLista, empresaId])

  async function handleSalvarProduto(dados: any): Promise<ProdutoCompleto> {
    if (!empresaId) throw new Error('Empresa não encontrada')
    const dadosCompletos = { ...dados, empresa_id: empresaId }
    let produtoSalvo: ProdutoCompleto
    if (produtoEditando) {
      produtoSalvo = await atualizarProduto(produtoEditando.id, dadosCompletos)
    } else {
      produtoSalvo = await criarProduto(dadosCompletos)
    }
    setShowProdutoModal(false)
    setProdutoEditando(null)
    await carregarLista()
    return produtoSalvo
  }

  async function handleEditarProduto(produto: ProdutoCompleto) {
    try {
      const produtoCompleto = await obterProduto(produto.id)
      setProdutoEditando(produtoCompleto)
      setShowProdutoModal(true)
    } catch (err) {
      console.error('Erro ao carregar produto:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar produto')
    }
  }

  async function handleExcluirProduto(id: string) {
    if (!confirm('Excluir este produto? Se não houver vendas, ele será removido. Caso contrário, será apenas inativado.')) return
    try {
      setError(null)
      setSucesso(null)
      const res = await excluirOuInativarProduto(id)
      setSucesso(res.mensagem)
      await carregarLista()
    } catch (err) {
      console.error('Erro ao excluir produto:', err)
      setError(err instanceof Error ? err.message : 'Erro ao excluir produto')
    }
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  function estoqueExibido(produto: ProdutoCompleto): number {
    const variacoes = (produto as any).variacoes
    if (variacoes && Array.isArray(variacoes) && variacoes.length > 0) {
      let soma = 0
      for (const v of variacoes) {
        const valores = v.valores || []
        for (const val of valores) {
          soma += val.estoque != null ? Number(val.estoque) : 0
        }
      }
      return soma
    }
    return Number((produto as any).estoque ?? 0)
  }

  function temVariacoes(produto: ProdutoCompleto): boolean {
    const variacoes = (produto as any).variacoes
    if (!variacoes || !Array.isArray(variacoes)) return false
    return variacoes.some((v: any) => (v.valores?.length ?? 0) > 0)
  }

  function todosValoresVariacoes(produto: ProdutoCompleto): { id: string; valor: string; label: string | null; estoque: number }[] {
    const variacoes = (produto as any).variacoes
    if (!variacoes || !Array.isArray(variacoes)) return []
    const out: { id: string; valor: string; label: string | null; estoque: number }[] = []
    for (const v of variacoes) {
      for (const val of v.valores || []) {
        out.push({
          id: val.id,
          valor: val.valor,
          label: val.label ?? null,
          estoque: val.estoque != null ? Number(val.estoque) : 0,
        })
      }
    }
    return out
  }

  useEffect(() => {
    if (!buscaEntrada.trim() || !empresaId) {
      setResultadosBusca([])
      return
    }
    const t = setTimeout(() => {
      setBuscandoEntrada(true)
      buscarProdutosParaEntrada(empresaId, buscaEntrada.trim())
        .then(setResultadosBusca)
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro na busca'))
        .finally(() => setBuscandoEntrada(false))
    }, DEBOUNCE_BUSCA_MS)
    return () => clearTimeout(t)
  }, [buscaEntrada, empresaId])

  function adicionarLinhaEntrada(produto: ProdutoCompleto) {
    if (linhasEntrada.some((l) => l.produto.id === produto.id)) return
    if (temVariacoes(produto)) {
      const quantidades: Record<string, number> = {}
      const custos: Record<string, number> = {}
      for (const { id } of todosValoresVariacoes(produto)) {
        quantidades[id] = 0
        custos[id] = 0
      }
      setLinhasEntrada((prev) => [...prev, { produto, tipo: 'variacoes', quantidades, custos }])
    } else {
      setLinhasEntrada((prev) => [...prev, { produto, tipo: 'simples', quantidade: 0, valor_custo: 0 }])
    }
    setResultadosBusca([])
    setBuscaEntrada('')
  }

  function atualizarQtdLinha(index: number, valor: number) {
    setLinhasEntrada((prev) => {
      const next = [...prev]
      const l = next[index]
      if (l.tipo === 'simples') next[index] = { ...l, quantidade: Math.max(0, valor) }
      return next
    })
  }

  function atualizarCustoLinha(index: number, valor: number) {
    setLinhasEntrada((prev) => {
      const next = [...prev]
      const l = next[index]
      if (l.tipo === 'simples') next[index] = { ...l, valor_custo: Math.max(0, valor) }
      return next
    })
  }

  function atualizarQtdVariacao(index: number, variacaoValorId: string, valor: number) {
    setLinhasEntrada((prev) => {
      const next = [...prev]
      const l = next[index]
      if (l.tipo === 'variacoes') {
        next[index] = { ...l, quantidades: { ...l.quantidades, [variacaoValorId]: Math.max(0, valor) } }
      }
      return next
    })
  }

  function atualizarCustoVariacao(index: number, variacaoValorId: string, valor: number) {
    setLinhasEntrada((prev) => {
      const next = [...prev]
      const l = next[index]
      if (l.tipo === 'variacoes') {
        next[index] = { ...l, custos: { ...l.custos, [variacaoValorId]: Math.max(0, valor) } }
      }
      return next
    })
  }

  function removerLinhaEntrada(index: number) {
    setLinhasEntrada((prev) => prev.filter((_, i) => i !== index))
  }

  async function salvarEntrada() {
    if (!empresaId) return
    const itens: { produto_id: string; variacao_valor_id?: string | null; quantidade: number; valor_custo?: number }[] = []
    for (const linha of linhasEntrada) {
      if (linha.tipo === 'simples') {
        if (linha.quantidade > 0) {
          itens.push({
            produto_id: linha.produto.id,
            quantidade: linha.quantidade,
            valor_custo: linha.valor_custo || undefined,
          })
        }
      } else {
        for (const [variacaoValorId, qtd] of Object.entries(linha.quantidades)) {
          if (qtd > 0) {
            itens.push({
              produto_id: linha.produto.id,
              variacao_valor_id: variacaoValorId,
              quantidade: qtd,
              valor_custo: linha.custos[variacaoValorId] || undefined,
            })
          }
        }
      }
    }
    if (itens.length === 0) {
      setError('Adicione ao menos um item com quantidade maior que zero.')
      return
    }
    setSalvandoEntrada(true)
    setError(null)
    setSucesso(null)
    try {
      const res = await registrarEntradaEstoque(empresaId, {
        numero_nota: numeroNotaEntrada.trim() || undefined,
        itens,
      })
      if (res.ok) {
        setSucesso('Entrada de estoque registrada com sucesso.')
        setLinhasEntrada([])
        setNumeroNotaEntrada('')
        if (entradas.length >= 0) carregarHistorico()
      } else {
        setError(res.erro ?? 'Erro ao salvar')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar entrada')
    } finally {
      setSalvandoEntrada(false)
    }
  }

  const carregarHistorico = useCallback(async () => {
    if (!empresaId) return
    setLoadingHistorio(true)
    try {
      const res = await listarEntradasEstoque(empresaId, {
        page: paginaEntradas,
        pageSize: 15,
      })
      setEntradas(res.entradas)
      setTotalEntradas(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico')
    } finally {
      setLoadingHistorio(false)
    }
  }, [empresaId, paginaEntradas])

  useEffect(() => {
    if (empresaId) carregarHistorico()
  }, [carregarHistorico, empresaId])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  if (loading && !empresaId) {
    return (
      <div className="w-full px-4 py-4">
        <div className="text-center py-8">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-4">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/admin">
              <Button variant="ghost" size="sm">← Voltar</Button>
            </Link>
            <h1 className="text-3xl font-bold">Produtos</h1>
          </div>
          <p className="text-muted-foreground">
            Lista de produtos, entrada de estoque e cadastro
          </p>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
      {sucesso && (
        <Card className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <p className="text-green-700 dark:text-green-400">{sucesso}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex gap-2 flex-wrap">
        <Button onClick={() => { setProdutoEditando(null); setShowProdutoModal(true) }}>
          + Novo Produto
        </Button>
        <Button variant="outline" onClick={() => setShowCategorias(!showCategorias)}>
          {showCategorias ? 'Ocultar' : 'Gerenciar'} Categorias
        </Button>
        <Button variant="outline" onClick={() => setShowGrupos(!showGrupos)}>
          {showGrupos ? 'Ocultar' : 'Gerenciar'} Grupos
        </Button>
      </div>

      {showCategorias && empresaId && (
        <div className="mb-6">
          <CategoriasManager empresaId={empresaId} categorias={categorias} onUpdate={carregarLista} />
        </div>
      )}
      {showGrupos && empresaId && (
        <div className="mb-6">
          <GruposManager empresaId={empresaId} grupos={grupos} onUpdate={carregarLista} />
        </div>
      )}

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de produtos</TabsTrigger>
          <TabsTrigger value="entrada">Entrada de produtos</TabsTrigger>
          <TabsTrigger value="historico">Histórico de entradas</TabsTrigger>
          <TabsTrigger value="importar">Importar em Lote</TabsTrigger>
          <TabsTrigger value="atualizar">Atualizar em Lote</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex gap-2 flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Buscar por nome ou SKU..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (setBuscaDigita(busca), setPage(1))}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="secondary" onClick={() => { setBuscaDigita(busca); setPage(1) }}>
                    Buscar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Nome</th>
                    <th className="text-left p-3 font-medium">SKU</th>
                    <th className="text-left p-3 font-medium">Categoria</th>
                    <th className="text-left p-3 font-medium">Preço</th>
                    <th className="text-left p-3 font-medium">Estoque</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td>
                    </tr>
                  ) : (
                    produtos.map((produto) => (
                      <tr key={produto.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{produto.nome}</td>
                        <td className="p-3 text-muted-foreground">{produto.sku ?? '—'}</td>
                        <td className="p-3">{(produto as any).categoria?.nome ?? '—'}</td>
                        <td className="p-3">{formatPrice(Number(produto.preco))}</td>
                        <td className="p-3">{produto.tipo === 'SERVICO' ? '—' : estoqueExibido(produto)}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded ${produto.ativo ? 'bg-green-100 text-green-800 dark:bg-green-900/30' : 'bg-gray-100 text-gray-800 dark:bg-gray-800'}`}>
                            {produto.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => handleEditarProduto(produto)}>Editar</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleExcluirProduto(produto.id)}>Excluir</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {produtos.length === 0 && !loading && (
              <div className="p-6 text-center text-muted-foreground">Nenhum produto encontrado.</div>
            )}
            {total > 0 && (
              <div className="flex items-center justify-between gap-4 p-3 border-t flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {from}–{to} de {total}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Próxima <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="entrada" className="space-y-4">
          {!empresaId ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Selecione uma empresa.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Adicionar produtos à entrada</CardTitle>
                  <CardDescription>Digite o SKU ou nome do produto — conforme digita, os produtos aparecem. Selecione para adicionar à lista.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Digite SKU ou nome do produto..."
                      value={buscaEntrada}
                      onChange={(e) => setBuscaEntrada(e.target.value)}
                    />
                    {buscandoEntrada && <p className="text-sm text-muted-foreground mt-1">Buscando...</p>}
                  </div>
                  {resultadosBusca.length > 0 && (
                    <ul className="mt-3 border rounded-md divide-y max-h-48 overflow-y-auto">
                      {resultadosBusca.map((p) => (
                        <li key={p.id} className="flex items-center justify-between p-2 hover:bg-muted/50">
                          <span>{p.nome} {p.sku ? `(${p.sku})` : ''}</span>
                          <Button size="sm" variant="outline" onClick={() => adicionarLinhaEntrada(p)}>
                            <Plus className="h-4 w-4 mr-1" /> Adicionar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {linhasEntrada.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Itens da entrada</CardTitle>
                    <CardDescription>Número da nota (opcional), quantidade, custo unitário. O valor total da nota é calculado ao final.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Label className="whitespace-nowrap">Nº da nota (opcional):</Label>
                      <Input
                        placeholder="Ex: 12345"
                        value={numeroNotaEntrada}
                        onChange={(e) => setNumeroNotaEntrada(e.target.value)}
                        className="max-w-[200px]"
                      />
                    </div>
                    {linhasEntrada.map((linha, index) => (
                      <div key={index} className="border rounded-lg p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{linha.produto.nome}</p>
                            {linha.produto.sku && <p className="text-sm text-muted-foreground">SKU: {linha.produto.sku}</p>}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removerLinhaEntrada(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        {linha.tipo === 'simples' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div>
                              <Label>Estoque atual</Label>
                              <p className="text-sm font-medium">{linha.produto.tipo === 'SERVICO' ? '—' : estoqueExibido(linha.produto)}</p>
                            </div>
                            <div>
                              <Label>Quantidade</Label>
                              <Input
                                type="number"
                                min={0}
                                value={linha.quantidade}
                                onChange={(e) => atualizarQtdLinha(index, parseInt(e.target.value, 10) || 0)}
                                className="w-24"
                              />
                            </div>
                            <div>
                              <Label>Custo unit. (R$)</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={linha.valor_custo || ''}
                                onChange={(e) => atualizarCustoLinha(index, parseFloat(e.target.value) || 0)}
                                className="w-28"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[minmax(80px,1fr)_80px_90px_110px] gap-2 items-center text-sm text-muted-foreground font-medium pb-1 border-b">
                              <span>Variação</span>
                              <span>Estoque</span>
                              <span>Qtd</span>
                              <span>Custo un. (R$)</span>
                            </div>
                            {todosValoresVariacoes(linha.produto).map((v) => (
                              <div key={v.id} className="grid grid-cols-[minmax(80px,1fr)_80px_90px_110px] gap-2 items-center py-1.5 border-b border-dashed last:border-0">
                                <span className="font-medium">{nomeVariacaoValor(v)}</span>
                                <span className="text-muted-foreground">{v.estoque}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={linha.quantidades[v.id] ?? 0}
                                  onChange={(e) => atualizarQtdVariacao(index, v.id, parseInt(e.target.value, 10) || 0)}
                                  className="w-full"
                                  aria-label="Quantidade"
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={linha.custos[v.id] ?? ''}
                                  onChange={(e) => atualizarCustoVariacao(index, v.id, parseFloat(e.target.value) || 0)}
                                  className="w-full"
                                  aria-label="Custo unitário em reais"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="pt-2 border-t">
                      <p className="text-sm font-semibold">
                        Total da nota: {formatPrice(
                          linhasEntrada.reduce((acc, l) => {
                            if (l.tipo === 'simples') return acc + l.quantidade * (l.valor_custo || 0)
                            return acc + Object.entries(l.quantidades).reduce((s, [id, qtd]) => s + qtd * (l.custos[id] || 0), 0)
                          }, 0)
                        )}
                      </p>
                    </div>
                    <Button onClick={salvarEntrada} disabled={salvandoEntrada}>
                      {salvandoEntrada ? 'Salvando...' : 'Salvar entrada de estoque'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {linhasEntrada.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    Digite acima para buscar um produto e adicione à lista para registrar a entrada.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="importar" className="space-y-4">
          <ImportarLoteTab empresaId={empresaId} onSuccess={carregarLista} />
        </TabsContent>

        <TabsContent value="atualizar" className="space-y-4">
          <AtualizarLoteTab empresaId={empresaId} onSuccess={carregarLista} />
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          {!empresaId ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Selecione uma empresa.</CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Histórico de entradas</CardTitle>
                <CardDescription>Quem deu entrada, data e hora, número da entrada/nota e produtos.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingHistorio ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : entradas.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhuma entrada registrada.</p>
                ) : (
                  <div className="space-y-4">
                    {entradas.map((e) => {
                      const expandida = entradasExpandidas.has(e.id)
                      return (
                        <div key={e.id} className="border rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleEntradaExpandida(e.id)}
                            className="w-full flex flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {expandida ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-semibold">Entrada #{e.numero_entrada}</span>
                              {e.numero_nota && <span className="text-muted-foreground">Nota: {e.numero_nota}</span>}
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground">
                                {e.usuario_nome ?? '—'} • {new Date(e.created_at).toLocaleString('pt-BR')}
                              </span>
                              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                {formatPrice(e.valor_total)}
                              </span>
                            </div>
                          </button>
                          {expandida && (
                            <div className="border-t bg-muted/20 px-4 py-3">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Itens da nota</p>
                              <ul className="text-sm space-y-1">
                                {e.itens.map((item, i) => (
                                  <li key={i}>
                                    {item.produto_nome}
                                    {item.variacao_label && ` (${item.variacao_label})`}: {item.quantidade} un.
                                    {item.valor_custo != null && item.valor_custo > 0 && (
                                      <> • R$ {Number(item.valor_custo).toFixed(2)} un. = {formatPrice(item.total_linha)}</>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {totalEntradas > 15 && (
                      <div className="flex justify-center gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={paginaEntradas <= 1}
                          onClick={() => setPaginaEntradas((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" /> Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={paginaEntradas * 15 >= totalEntradas}
                          onClick={() => setPaginaEntradas((p) => p + 1)}
                        >
                          Próxima <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {showProdutoModal && empresaId && (
        <ProdutoFormModal
          produto={produtoEditando}
          empresaId={empresaId}
          categorias={categorias}
          grupos={grupos}
          onSave={handleSalvarProduto}
          onClose={() => { setShowProdutoModal(false); setProdutoEditando(null) }}
        />
      )}
    </div>
  )
}
