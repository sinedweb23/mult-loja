'use client'

import { useState, useEffect, useRef } from 'react'
import type { Caixa } from '@/lib/types/database'
import { finalizarVendaColaborador, obterProdutoCompletoPdv, type ItemVenda } from '@/app/actions/pdv-vendas'
import { obterProdutosPdvComCache } from '@/app/pdv/produtos-cache'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ProdutoVariacoesModal } from '@/components/pdv/produto-variacoes-modal'
import { ModalGramasKg } from '@/components/pdv/modal-gramas-kg'
import { KitLancheModal } from '@/components/pdv/kit-lanche-modal'
import { ComprovanteModal, type ItemComprovante } from '@/components/pdv/comprovante-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Minus, Trash2, ShoppingCart, Search, User } from 'lucide-react'
import { buscarColaboradoresPdvComCache } from '@/app/pdv/pessoas-cache'
import { obterSaldoDevedorColaboradorParaPdv } from '@/app/actions/colaboradores-importacao'

interface VendaColaboradorProps {
  caixa: Caixa
  ativa?: boolean
}

interface Produto {
  id: string
  nome: string
  descricao: string | null
  preco: number
  estoque: number | null
  ativo: boolean
  tipo: string
  tipo_kit?: string | null
  unidade?: string | null
  empresa_id?: string
  desconto_kit_mensal_pct?: number | null
  imagem_url: string | null
  preco_a_partir_de?: number | null
  preco_base_kit_mensal?: number
  favorito?: boolean
  sku?: string | null
}

interface Colaborador {
  id: string
  nome: string | null
  email: string | null
  re_colaborador: string | null
}

interface ItemCarrinho extends ItemVenda {
  produto_nome: string
}

function normalizarBusca(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function VendaColaborador({ caixa, ativa = false }: VendaColaboradorProps) {
  const [termoBusca, setTermoBusca] = useState('')
  const [colaboradoresEncontrados, setColaboradoresEncontrados] = useState<Colaborador[]>([])
  const [buscando, setBuscando] = useState(false)
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<Colaborador | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loading, setLoading] = useState(true)
  const [finalizando, setFinalizando] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null)
  const [mostrarModalVariacoes, setMostrarModalVariacoes] = useState(false)
  const [mostrarModalKitLanche, setMostrarModalKitLanche] = useState(false)
  const [kitLancheProduto, setKitLancheProduto] = useState<Produto | null>(null)
  const [kitLancheTipo, setKitLancheTipo] = useState<'AVULSO' | 'MENSAL'>('AVULSO')
  const [kitLancheVariacoesPendentes, setKitLancheVariacoesPendentes] = useState<{
    variacoes: Record<string, string>
    opcionais: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
    precoPorDia: number
  } | null>(null)
  const [nomeLoja, setNomeLoja] = useState('')
  const [comprovanteOpen, setComprovanteOpen] = useState(false)
  const [comprovanteData, setComprovanteData] = useState<{
    dataHora: string
    itens: ItemComprovante[]
    total: number
    colaboradorNome: string
    pedidoId?: string
    saldoDevedor?: number
  } | null>(null)
  const [erroModal, setErroModal] = useState<string | null>(null)
  const [mostrarConfirmacaoVenda, setMostrarConfirmacaoVenda] = useState(false)
  const [saldoDevedor, setSaldoDevedor] = useState<number | null>(null)
  const [carregandoSaldo, setCarregandoSaldo] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [mostrarListaBusca, setMostrarListaBusca] = useState(false)
  const [produtoParaGramas, setProdutoParaGramas] = useState<Produto | null>(null)
  const listaBuscaRef = useRef<HTMLDivElement>(null)
  const colaboradorBuscaRef = useRef<HTMLDivElement>(null)
  const inputBuscaColaboradorRef = useRef<HTMLInputElement | null>(null)
  const inputBuscaProdutoRef = useRef<HTMLInputElement | null>(null)
  const fecharComprovanteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    obterConfiguracaoAparencia().then((c) => setNomeLoja(c.loja_nome || ''))
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (listaBuscaRef.current && !listaBuscaRef.current.contains(e.target as Node)) {
        setMostrarListaBusca(false)
      }
      if (colaboradorBuscaRef.current && !colaboradorBuscaRef.current.contains(e.target as Node)) {
        setColaboradoresEncontrados([])
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!ativa) return

      if (e.key === 'F8') {
        e.preventDefault()
        if (!mostrarConfirmacaoVenda) {
          solicitarConfirmacaoVenda()
        } else if (!finalizando) {
          void finalizarVenda()
        }
      } else if (e.key === 'F6') {
        e.preventDefault()
        removerColaborador()
      } else if (e.key === 'F10') {
        e.preventDefault()
        if (comprovanteData) {
          setComprovanteOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
    // Inclui dependências usadas nas validações para o F8 não usar estado antigo
  }, [ativa, mostrarConfirmacaoVenda, finalizando, comprovanteData, colaboradorSelecionado, carrinho.length])

  useEffect(() => {
    if (!ativa || loading || comprovanteOpen) return

    if (!colaboradorSelecionado && inputBuscaColaboradorRef.current) {
      inputBuscaColaboradorRef.current.focus()
      inputBuscaColaboradorRef.current.select()
    } else if (colaboradorSelecionado && inputBuscaProdutoRef.current) {
      inputBuscaProdutoRef.current.focus()
      inputBuscaProdutoRef.current.select()
    }
  }, [ativa, colaboradorSelecionado, loading, comprovanteOpen])

  const produtosFavoritos = produtos.filter((p: Produto) => p.favorito === true)
  const termosBusca = normalizarBusca(buscaProduto).split(/\s+/).filter(Boolean)
  const produtosBusca =
    termosBusca.length === 0
      ? []
      : produtos.filter((p) => {
          const texto = normalizarBusca(String((p as any).nome ?? '') + ' ' + (p.sku ?? ''))
          return termosBusca.every((t) => texto.includes(t))
        })

  async function carregarProdutos(forceRefresh = false) {
    try {
      setLoading(true)
      const lista = await obterProdutosPdvComCache(caixa.empresa_id, { forceRefresh })
      setProdutos(lista)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function buscarColaboradores() {
    if (!termoBusca.trim() || termoBusca.trim().length < 2) {
      setColaboradoresEncontrados([])
      return
    }
    try {
      setBuscando(true)
      const resultados = await buscarColaboradoresPdvComCache(caixa.empresa_id, termoBusca)
      setColaboradoresEncontrados(resultados)
    } catch (err) {
      console.error('Erro ao buscar colaboradores:', err)
      setColaboradoresEncontrados([])
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (termoBusca.trim().length < 2) {
      setColaboradoresEncontrados([])
      return
    }
    const t = setTimeout(() => buscarColaboradores(), 300)
    return () => clearTimeout(t)
  }, [termoBusca])

  async function carregarSaldo(colaboradorId: string) {
    try {
      setCarregandoSaldo(true)
      const saldo = await obterSaldoDevedorColaboradorParaPdv(colaboradorId)
      setSaldoDevedor(saldo)
    } catch (err) {
      console.error('Erro ao carregar saldo devedor do colaborador:', err)
      setSaldoDevedor(null)
    } finally {
      setCarregandoSaldo(false)
    }
  }

  function selecionarColaborador(colab: Colaborador) {
    setColaboradorSelecionado(colab)
    setColaboradoresEncontrados([])
    setTermoBusca('')
    setSaldoDevedor(null)
    void carregarSaldo(colab.id)
  }

  function removerColaborador() {
    setColaboradorSelecionado(null)
    setCarrinho([])
    setSaldoDevedor(null)
  }

  async function adicionarProduto(produto: Produto) {
    if (!colaboradorSelecionado) {
      setErroModal('Selecione um colaborador primeiro')
      return
    }
    if (produto.estoque !== null && produto.estoque <= 0) {
      setErroModal('Produto sem estoque')
      return
    }
    if (produto.unidade === 'KG') {
      setProdutoParaGramas(produto)
      return
    }
    if (produto.tipo === 'KIT_LANCHE') {
      setKitLancheProduto(produto)
      setKitLancheTipo(produto.tipo_kit === 'MENSAL' ? 'MENSAL' : 'AVULSO')
      setKitLancheVariacoesPendentes(null)
      try {
        const produtoCompleto = await obterProdutoCompletoPdv(produto.id)
        if (
          produtoCompleto &&
          ((produtoCompleto.variacoes?.length > 0) || (produtoCompleto.grupos_opcionais?.length > 0))
        ) {
          setProdutoSelecionado(produtoCompleto)
          setMostrarModalVariacoes(true)
          return
        }
      } catch (err) {
        console.error('Erro ao carregar produto completo:', err)
      }
      setMostrarModalKitLanche(true)
      return
    }
    try {
      const produtoCompleto = await obterProdutoCompletoPdv(produto.id)
      if (
        produtoCompleto &&
        ((produtoCompleto.variacoes?.length > 0) || (produtoCompleto.grupos_opcionais?.length > 0))
      ) {
        setProdutoSelecionado(produtoCompleto)
        setMostrarModalVariacoes(true)
        return
      }
    } catch (err) {
      console.error('Erro ao carregar produto completo:', err)
    }
    adicionarProdutoAoCarrinho(produto, produto.preco, {}, {})
  }

  function adicionarKitLancheAoCarrinho(
    dias: string[],
    precoPorDia: number,
    variacoes?: Record<string, string>,
    opcionais?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
  ) {
    if (!kitLancheProduto || dias.length === 0) return
    const novosItens: ItemCarrinho[] = dias.map((dia) => ({
      produto_id: kitLancheProduto.id,
      quantidade: 1,
      preco_unitario: precoPorDia,
      subtotal: precoPorDia,
      produto_nome: kitLancheProduto.nome,
      data_retirada: dia,
      variacoes_selecionadas: variacoes ?? undefined,
      opcionais_selecionados: opcionais ?? undefined,
    }))
    setCarrinho((c) => [...c, ...novosItens])
    setMostrarModalKitLanche(false)
    setKitLancheProduto(null)
  }

  function adicionarProdutoAoCarrinho(
    produto: Produto,
    precoUnitario: number,
    variacoes: Record<string, string>,
    opcionais: Record<string, number>,
    gramas?: number
  ) {
    if (gramas != null && gramas > 0) {
      const subtotal = (produto.preco * gramas) / 1000
      setCarrinho((c) => [
        ...c,
        {
          produto_id: produto.id,
          quantidade: 1,
          preco_unitario: subtotal,
          subtotal,
          produto_nome: `${produto.nome} (${gramas}g)`,
          gramas,
        },
      ])
      return
    }
    const opcionaisFormatados: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> = []
    if (produtoSelecionado?.grupos_opcionais) {
      for (const grupo of produtoSelecionado.grupos_opcionais) {
        for (const opcional of grupo.opcionais) {
          const qtd = opcionais[opcional.id] || 0
          if (qtd > 0) {
            opcionaisFormatados.push({
              opcional_id: opcional.id,
              nome: opcional.nome,
              preco: Number(opcional.preco),
              quantidade: qtd,
            })
          }
        }
      }
    }
    const itemExistente = carrinho.find(
      (item) =>
        item.produto_id === produto.id &&
        item.gramas == null &&
        JSON.stringify(item.variacoes_selecionadas || {}) === JSON.stringify(variacoes) &&
        JSON.stringify(item.opcionais_selecionados || []) === JSON.stringify(opcionaisFormatados)
    )
    if (itemExistente) {
      if (produto.estoque !== null && itemExistente.quantidade >= produto.estoque) {
        setErroModal('Quantidade máxima disponível no estoque')
        return
      }
      setCarrinho((c) =>
        c.map((item) =>
          item.produto_id === produto.id &&
          item.gramas == null &&
          JSON.stringify(item.variacoes_selecionadas || {}) === JSON.stringify(variacoes) &&
          JSON.stringify(item.opcionais_selecionados || []) === JSON.stringify(opcionaisFormatados)
            ? {
                ...item,
                quantidade: item.quantidade + 1,
                subtotal: (item.quantidade + 1) * item.preco_unitario,
              }
            : item
        )
      )
    } else {
      setCarrinho((c) => [
        ...c,
        {
          produto_id: produto.id,
          quantidade: 1,
          preco_unitario: precoUnitario,
          subtotal: precoUnitario,
          produto_nome: produto.nome,
          variacoes_selecionadas: Object.keys(variacoes).length > 0 ? variacoes : undefined,
          opcionais_selecionados: opcionaisFormatados.length > 0 ? opcionaisFormatados : undefined,
        },
      ])
    }
  }

  function removerProduto(produtoId: string) {
    setCarrinho((c) => c.filter((item) => item.produto_id !== produtoId))
  }

  function removerItemPorIndex(index: number) {
    setCarrinho((c) => c.filter((_, i) => i !== index))
  }

  function alterarQuantidade(produtoId: string, novaQuantidade: number) {
    if (novaQuantidade <= 0) {
      removerProduto(produtoId)
      return
    }
    const produto = produtos.find((p) => p.id === produtoId)
    if (produto && produto.estoque !== null && novaQuantidade > produto.estoque) {
      setErroModal('Quantidade máxima disponível no estoque')
      return
    }
    setCarrinho((c) =>
      c.map((item) =>
        item.produto_id === produtoId
          ? { ...item, quantidade: novaQuantidade, subtotal: novaQuantidade * item.preco_unitario }
          : item
      )
    )
  }

  const total = carrinho.reduce((sum, item) => sum + item.subtotal, 0)

  function formatPrice(valor: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  function solicitarConfirmacaoVenda() {
    if (!colaboradorSelecionado) {
      setErroModal('Selecione um colaborador')
      return
    }
    if (carrinho.length === 0) {
      setErroModal('Adicione produtos ao carrinho')
      return
    }
    setMostrarConfirmacaoVenda(true)
  }

  async function finalizarVenda() {
    if (!colaboradorSelecionado) return
    setMostrarConfirmacaoVenda(false)
    setFinalizando(true)
    try {
      const itens: ItemVenda[] = carrinho.map((item) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
        produto_nome: item.produto_nome,
        variacoes_selecionadas: item.variacoes_selecionadas ?? undefined,
        opcionais_selecionados: item.opcionais_selecionados ?? undefined,
        data_retirada: item.data_retirada ?? undefined,
        gramas: item.gramas ?? undefined,
      }))

      const resultado = await finalizarVendaColaborador(caixa.id, colaboradorSelecionado.id, itens)

      if (resultado.ok) {
        if (fecharComprovanteTimeoutRef.current) {
          clearTimeout(fecharComprovanteTimeoutRef.current)
          fecharComprovanteTimeoutRef.current = null
        }
        setComprovanteData({
          dataHora: new Date().toISOString(),
          itens: carrinho.map((item) => ({
            produto_nome: item.produto_nome ?? '',
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            subtotal: item.subtotal,
            variacoes_selecionadas: item.variacoes_selecionadas ?? null,
            data_retirada: item.data_retirada ?? null,
          })),
          total,
          colaboradorNome: colaboradorSelecionado.nome ?? 'Colaborador',
          pedidoId: resultado.pedidoId,
          saldoDevedor: resultado.saldoDevedor,
        })
        setCarrinho([])
        setComprovanteOpen(true)
        await Promise.all([
          carregarProdutos(true),
          carregarSaldo(colaboradorSelecionado.id),
        ])
      } else {
        setErroModal(resultado.erro || 'Erro ao finalizar venda')
      }
    } catch (err) {
      console.error('Erro ao finalizar venda:', err)
      setErroModal('Erro ao finalizar venda')
    } finally {
      setFinalizando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Colaborador
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Venda sem saldo: o consumo fica como saldo devedor para o RH lançar o desconto em folha.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!colaboradorSelecionado ? (
            <>
              <div ref={colaboradorBuscaRef} className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite nome, e-mail ou RE do colaborador..."
                    value={termoBusca}
                    ref={inputBuscaColaboradorRef}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        buscarColaboradores()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={buscarColaboradores}
                    disabled={buscando || !termoBusca.trim()}
                    type="button"
                    className="font-semibold shadow-sm min-w-[100px]"
                  >
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>
                {termoBusca.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {buscando ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">Buscando colaboradores...</div>
                    ) : colaboradoresEncontrados.length > 0 ? (
                      <div className="py-1">
                        {colaboradoresEncontrados.map((colab) => (
                          <div
                            key={colab.id}
                            className="px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0"
                            onClick={() => selecionarColaborador(colab)}
                          >
                            <p className="font-medium">{colab.nome ?? 'Sem nome'}</p>
                            <p className="text-sm text-muted-foreground">
                              {colab.re_colaborador && `RE: ${colab.re_colaborador}`}
                              {colab.re_colaborador && colab.email && ' • '}
                              {colab.email}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Nenhum colaborador encontrado. Cadastre pelo Admin → RH → Importar colaboradores.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold">{colaboradorSelecionado.nome ?? 'Colaborador'}</p>
                      <p className="text-sm text-muted-foreground">
                        {colaboradorSelecionado.re_colaborador && `RE: ${colaboradorSelecionado.re_colaborador}`}
                        {colaboradorSelecionado.email && ` • ${colaboradorSelecionado.email}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right min-w-[140px]">
                    {carregandoSaldo ? (
                      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <span>Carregando saldo…</span>
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                      </div>
                    ) : saldoDevedor !== null ? (
                      <>
                        <p className="text-xs text-muted-foreground">Saldo devedor</p>
                        <p className="text-lg font-bold text-destructive">
                          {formatPrice(saldoDevedor)}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Consumo será lançado para desconto em folha pelo RH.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={removerColaborador}
                    className="font-semibold border-2 border-primary/30 bg-primary/10 hover:bg-primary/20 text-foreground shadow-sm"
                  >
                    Trocar Colaborador (F6)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {colaboradorSelecionado && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Produtos Disponíveis</h3>
            <div className="relative mb-4" ref={listaBuscaRef}>
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Buscar produto..."
                  value={buscaProduto}
                  ref={inputBuscaProdutoRef}
                  onChange={(e) => {
                    setBuscaProduto(e.target.value)
                    setMostrarListaBusca(true)
                  }}
                  onFocus={() => setMostrarListaBusca(true)}
                  className="pl-9"
                />
              </div>
              {mostrarListaBusca && (
                <div className="absolute z-[100] w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {buscaProduto.trim() ? (
                    produtosBusca.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Nenhum produto encontrado
                      </div>
                    ) : (
                      produtosBusca.map((produto) => {
                        const estoqueOk = produto.estoque === null || produto.estoque > 0
                        return (
                          <button
                            key={produto.id}
                            type="button"
                            disabled={!estoqueOk}
                            className="w-full text-left px-4 py-3 hover:bg-accent disabled:opacity-50 flex justify-between items-center border-b last:border-b-0"
                            onClick={() => {
                              if (estoqueOk) adicionarProduto(produto)
                              setBuscaProduto('')
                              setMostrarListaBusca(false)
                            }}
                          >
                            <span className="font-medium truncate">{produto.nome}</span>
                            <span className="text-sm text-muted-foreground shrink-0">
                              {produto.preco_a_partir_de != null
                                ? `A partir de ${formatPrice(Number(produto.preco_a_partir_de))}`
                                : formatPrice(produto.preco)}
                            </span>
                          </button>
                        )
                      })
                    )
                  ) : (
                    <div className="px-4 py-2 text-xs text-muted-foreground">Digite para buscar</div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {produtosFavoritos.map((produto) => {
                const estoqueDisponivel = produto.estoque !== null ? produto.estoque : Infinity
                const itemCarrinho = carrinho.find((item) => item.produto_id === produto.id)
                const quantidadeNoCarrinho = itemCarrinho?.quantidade || 0
                return (
                  <Card key={produto.id} className="overflow-hidden">
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm">{produto.nome}</CardTitle>
                      {produto.descricao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{produto.descricao}</p>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-lg font-bold">
                          {produto.preco_a_partir_de != null
                            ? `A partir de ${formatPrice(Number(produto.preco_a_partir_de))}`
                            : formatPrice(produto.preco)}
                        </span>
                        {produto.estoque !== null && (
                          <span className="text-xs text-muted-foreground">Est: {produto.estoque}</span>
                        )}
                      </div>
                      <Button
                        onClick={() => adicionarProduto(produto)}
                        disabled={estoqueDisponivel <= quantidadeNoCarrinho}
                        className="w-full"
                        size="sm"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            {produtosFavoritos.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Use a busca acima para adicionar produtos.
              </p>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Carrinho
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {carrinho.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Carrinho vazio</p>
                ) : (
                  <>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {carrinho.map((item, index) => {
                        const ehKitComData = !!item.data_retirada
                        const dataFormatada = item.data_retirada
                          ? new Date(item.data_retirada + 'T12:00:00').toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : null
                        return (
                          <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium text-sm">
                                {item.produto_nome}
                                {item.variacoes_selecionadas && Object.keys(item.variacoes_selecionadas).length > 0 && (
                                  <span className="text-muted-foreground font-normal">
                                    {' '}({Object.values(item.variacoes_selecionadas).filter(Boolean).join(', ')})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatPrice(item.preco_unitario)} x {item.quantidade}
                                {dataFormatada && ` • Retirada: ${dataFormatada}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!ehKitComData && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => alterarQuantidade(item.produto_id, item.quantidade - 1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm">{item.quantidade}</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => alterarQuantidade(item.produto_id, item.quantidade + 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() =>
                                  ehKitComData ? removerItemPorIndex(index) : removerProduto(item.produto_id)
                                }
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-sm">{formatPrice(item.subtotal)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total:</span>
                        <span className="text-2xl font-bold">{formatPrice(total)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Valor lançado como consumo para desconto em folha pelo RH.
                      </p>
                      <Button
                        onClick={solicitarConfirmacaoVenda}
                        className="w-full font-semibold shadow-md py-6 text-base"
                        size="lg"
                        disabled={total === 0 || finalizando}
                      >
                        {finalizando ? 'Finalizando...' : 'Finalizar Venda (F8)'}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {produtoSelecionado && (
        <ProdutoVariacoesModal
          produto={produtoSelecionado}
          open={mostrarModalVariacoes}
          onClose={() => {
            setMostrarModalVariacoes(false)
            setProdutoSelecionado(null)
          }}
          onConfirm={(variacoes, opcionais, precoFinal) => {
            const produto = produtos.find((p) => p.id === produtoSelecionado?.id)
            if (kitLancheProduto && produtoSelecionado && produto?.id === kitLancheProduto.id) {
              const opcionaisArray: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> = []
              if (produtoSelecionado.grupos_opcionais) {
                for (const grupo of produtoSelecionado.grupos_opcionais) {
                  for (const opcional of grupo.opcionais) {
                    const qtd = opcionais[opcional.id] || 0
                    if (qtd > 0) {
                      opcionaisArray.push({
                        opcional_id: opcional.id,
                        nome: opcional.nome,
                        preco: Number(opcional.preco),
                        quantidade: qtd,
                      })
                    }
                  }
                }
              }
              setKitLancheVariacoesPendentes({ variacoes, opcionais: opcionaisArray, precoPorDia: precoFinal })
              setMostrarModalVariacoes(false)
              setProdutoSelecionado(null)
              setMostrarModalKitLanche(true)
              return
            }
            if (produto) adicionarProdutoAoCarrinho(produto, precoFinal, variacoes, opcionais)
            setMostrarModalVariacoes(false)
            setProdutoSelecionado(null)
          }}
        />
      )}

      <ModalGramasKg
        open={!!produtoParaGramas}
        onOpenChange={(open) => !open && setProdutoParaGramas(null)}
        produtoNome={produtoParaGramas?.nome ?? ''}
        precoPorKg={produtoParaGramas?.preco ?? 0}
        onConfirm={(gramas) => {
          if (produtoParaGramas) {
            adicionarProdutoAoCarrinho(
              produtoParaGramas,
              (produtoParaGramas.preco * gramas) / 1000,
              {},
              {},
              gramas
            )
            setProdutoParaGramas(null)
          }
        }}
      />

      {kitLancheProduto && (
        <KitLancheModal
          open={mostrarModalKitLanche}
          onClose={() => {
            setMostrarModalKitLanche(false)
            setKitLancheProduto(null)
            setKitLancheVariacoesPendentes(null)
          }}
          tipo={kitLancheTipo}
          produtoNome={kitLancheProduto.nome}
          precoBase={
            kitLancheVariacoesPendentes
              ? kitLancheVariacoesPendentes.precoPorDia
              : Number(
                  kitLancheProduto.preco_base_kit_mensal ??
                    kitLancheProduto.preco_a_partir_de ??
                    kitLancheProduto.preco
                )
          }
          empresaId={caixa.empresa_id}
          descontoMensalPct={kitLancheProduto.desconto_kit_mensal_pct}
          onConfirmAvulso={(dias, precoPorDia) => {
            adicionarKitLancheAoCarrinho(dias, precoPorDia, kitLancheVariacoesPendentes?.variacoes, kitLancheVariacoesPendentes?.opcionais)
            setKitLancheVariacoesPendentes(null)
          }}
          onConfirmMensal={(datas, precoPorDia) => {
            adicionarKitLancheAoCarrinho(datas, precoPorDia, kitLancheVariacoesPendentes?.variacoes, kitLancheVariacoesPendentes?.opcionais)
            setKitLancheVariacoesPendentes(null)
          }}
        />
      )}

      <Dialog open={mostrarConfirmacaoVenda} onOpenChange={setMostrarConfirmacaoVenda}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar venda colaborador</DialogTitle>
            <DialogDescription>
              Confirmar venda de <strong>{formatPrice(total)}</strong> para{' '}
              <strong>{colaboradorSelecionado?.nome ?? 'Colaborador'}</strong>? O valor será lançado como
              consumo (saldo devedor) para o RH realizar o desconto em folha depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMostrarConfirmacaoVenda(false)}>
              Cancelar
            </Button>
            <Button onClick={finalizarVenda} disabled={finalizando} className="font-semibold shadow-sm">
              {finalizando ? 'Finalizando...' : 'Confirmar (F8)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {comprovanteData && (
        <ComprovanteModal
          open={comprovanteOpen}
          onClose={() => {
            if (fecharComprovanteTimeoutRef.current) {
              clearTimeout(fecharComprovanteTimeoutRef.current)
              fecharComprovanteTimeoutRef.current = null
            }
            setComprovanteOpen(false)
            fecharComprovanteTimeoutRef.current = setTimeout(() => {
              setComprovanteData(null)
              fecharComprovanteTimeoutRef.current = null
            }, 400)
          }}
          tipo="COLABORADOR"
          nomeLoja={nomeLoja}
          dataHora={comprovanteData.dataHora}
          itens={comprovanteData.itens}
          total={comprovanteData.total}
          alunoNome={comprovanteData.colaboradorNome}
          pedidoId={comprovanteData.pedidoId}
          saldoDevedor={comprovanteData.saldoDevedor}
        />
      )}

      <Dialog open={!!erroModal} onOpenChange={(o) => !o && setErroModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Erro</DialogTitle>
            <DialogDescription>{erroModal}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErroModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
