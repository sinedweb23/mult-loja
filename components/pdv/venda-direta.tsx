'use client'

import { useState, useEffect, useRef } from 'react'
import type { Caixa } from '@/lib/types/database'
import { finalizarVendaDireta, obterProdutoCompletoPdv, type ItemVenda, type FormaPagamento } from '@/app/actions/pdv-vendas'
import { obterProdutosPdvComCache } from '@/app/pdv/produtos-cache'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ProdutoVariacoesModal } from '@/components/pdv/produto-variacoes-modal'
import { ModalGramasKg } from '@/components/pdv/modal-gramas-kg'
import { KitLancheModal } from '@/components/pdv/kit-lanche-modal'
import { ComprovanteModal, type ItemComprovante, type FormaPagamentoComprovante } from '@/components/pdv/comprovante-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Minus, Trash2, ShoppingCart, X, Search } from 'lucide-react'

interface VendaDiretaProps {
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
  preco_base_kit_mensal?: number | null
  favorito?: boolean
  sku?: string | null
}

interface ItemCarrinho extends ItemVenda {
  produto_nome: string
}

export function VendaDireta({ caixa, ativa = false }: VendaDiretaProps) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarModalPagamento, setMostrarModalPagamento] = useState(false)
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])
  const [valorRecebido, setValorRecebido] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null)
  const [mostrarModalVariacoes, setMostrarModalVariacoes] = useState(false)
  const [nomeLoja, setNomeLoja] = useState('')
  const [comprovanteOpen, setComprovanteOpen] = useState(false)
  const [comprovanteData, setComprovanteData] = useState<{
    dataHora: string
    itens: ItemComprovante[]
    total: number
    formasPagamento: FormaPagamentoComprovante[]
    pedidoId?: string
  } | null>(null)
  const [erroModal, setErroModal] = useState<string | null>(null)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [mostrarListaBusca, setMostrarListaBusca] = useState(false)
  const [produtoParaGramas, setProdutoParaGramas] = useState<Produto | null>(null)
  const [kitLancheProduto, setKitLancheProduto] = useState<Produto | null>(null)
  const [kitLancheTipo, setKitLancheTipo] = useState<'AVULSO' | 'MENSAL'>('AVULSO')
  const [mostrarModalKitLanche, setMostrarModalKitLanche] = useState(false)
  const [kitLancheVariacoesPendentes, setKitLancheVariacoesPendentes] = useState<{
    variacoes: Record<string, string>
    opcionais: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
    precoPorDia: number
  } | null>(null)
  const listaBuscaRef = useRef<HTMLDivElement>(null)
  const inputBuscaRef = useRef<HTMLInputElement | null>(null)
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
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!ativa || loading || comprovanteOpen) return

    if (inputBuscaRef.current) {
      inputBuscaRef.current.focus()
      inputBuscaRef.current.select()
    }
  }, [ativa, loading, comprovanteOpen])

  const produtosFavoritos = produtos.filter((p: Produto) => p.favorito === true)
  const produtosDemais = produtos.filter((p: Produto) => !p.favorito)

  function normalizarBusca(s: string) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }
  const buscaNormalizada = normalizarBusca(buscaProduto)
  const termosBusca = buscaNormalizada.length > 0 ? buscaNormalizada.split(/\s+/).filter(Boolean) : []
  const produtosBusca =
    termosBusca.length === 0
      ? []
      : produtos.filter((p) => {
          const nome = String((p as any).nome ?? '')
          const sku = p.sku != null ? String(p.sku) : ''
          const texto = normalizarBusca(nome + ' ' + sku)
          const todosTermosMatch = termosBusca.every((t) => texto.includes(t))
          return todosTermosMatch
        })

  async function carregarProdutos(forceRefresh = false) {
    try {
      setLoading(true)
      const lista = await obterProdutosPdvComCache(caixa.empresa_id, { forceRefresh })
      // Venda Direta: só Kit Lanche Avulso (mensal exige vínculo com aluno/colaborador)
      const filtrado = lista.filter((p: any) => !(p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL'))
      setProdutos(filtrado)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function adicionarProduto(produto: Produto) {
    // Verificar estoque
    if (produto.estoque !== null && produto.estoque <= 0) {
      setErroModal('Produto sem estoque')
      return
    }

    // Produto vendido por kg: abrir modal para informar gramas
    if (produto.unidade === 'KG') {
      setProdutoParaGramas(produto)
      return
    }

    // Kit Lanche Avulso na Venda Direta: modal de variações (se tiver) e depois calendário de dias
    if (produto.tipo === 'KIT_LANCHE' && produto.tipo_kit !== 'MENSAL') {
      setKitLancheProduto(produto)
      setKitLancheTipo('AVULSO')
      setKitLancheVariacoesPendentes(null)
      try {
        const produtoCompleto = await obterProdutoCompletoPdv(produto.id)
        if (produtoCompleto && (
          (produtoCompleto.variacoes && produtoCompleto.variacoes.length > 0) ||
          (produtoCompleto.grupos_opcionais && produtoCompleto.grupos_opcionais.length > 0)
        )) {
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

    // Verificar se produto tem variações ou opcionais
    try {
      const produtoCompleto = await obterProdutoCompletoPdv(produto.id)
      if (produtoCompleto && (
        (produtoCompleto.variacoes && produtoCompleto.variacoes.length > 0) ||
        (produtoCompleto.grupos_opcionais && produtoCompleto.grupos_opcionais.length > 0)
      )) {
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
    setKitLancheVariacoesPendentes(null)
  }

  function adicionarProdutoAoCarrinho(
    produto: Produto,
    precoUnitario: number,
    variacoes: Record<string, string>,
    opcionais: Record<string, number>,
    gramas?: number
  ) {
    // Produto por kg: sempre nova linha, nome com (Xg)
    if (gramas != null && gramas > 0) {
      const subtotal = (produto.preco * gramas) / 1000
      setCarrinho([
        ...carrinho,
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

    // Converter opcionais de Record<string, number> para Array<{ opcional_id, nome, preco, quantidade }>
    const opcionaisFormatados: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> = []
    if (produtoSelecionado && produtoSelecionado.grupos_opcionais) {
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
        JSON.stringify(item.opcionais_selecionados || {}) === JSON.stringify(opcionaisFormatados)
    )

    if (itemExistente) {
      if (produto.estoque !== null && itemExistente.quantidade >= produto.estoque) {
        alert('Quantidade máxima disponível no estoque')
        return
      }
      setCarrinho(
        carrinho.map((item) =>
          item.produto_id === produto.id &&
          item.gramas == null &&
          JSON.stringify(item.variacoes_selecionadas || {}) === JSON.stringify(variacoes) &&
          JSON.stringify(item.opcionais_selecionados || {}) === JSON.stringify(opcionaisFormatados)
            ? {
                ...item,
                quantidade: item.quantidade + 1,
                subtotal: (item.quantidade + 1) * item.preco_unitario,
              }
            : item
        )
      )
    } else {
      setCarrinho([
        ...carrinho,
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
    setCarrinho(carrinho.filter((item) => item.produto_id !== produtoId))
  }

  function removerItemPorIndex(index: number) {
    setCarrinho(carrinho.filter((_, i) => i !== index))
  }

  function alterarQuantidade(produtoId: string, novaQuantidade: number) {
    if (novaQuantidade <= 0) {
      removerProduto(produtoId)
      return
    }

    const produto = produtos.find((p) => p.id === produtoId)
    if (produto && produto.estoque !== null && novaQuantidade > produto.estoque) {
      alert('Quantidade máxima disponível no estoque')
      return
    }

    setCarrinho(
      carrinho.map((item) =>
        item.produto_id === produtoId
          ? {
              ...item,
              quantidade: novaQuantidade,
              subtotal: novaQuantidade * item.preco_unitario,
            }
          : item
      )
    )
  }

  const total = carrinho.reduce((sum, item) => sum + item.subtotal, 0)

  function formatPrice(valor: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  function formatarValorDigitadoComoMoeda(valorDigitado: string) {
    const apenasDigitos = valorDigitado.replace(/\D/g, '')
    if (!apenasDigitos) return '0,00'
    const valorComTresCasas = apenasDigitos.padStart(3, '0')
    const inteiro = valorComTresCasas.slice(0, -2).replace(/^0+(?=\d)/, '')
    const centavos = valorComTresCasas.slice(-2)
    const inteiroFormatado = (inteiro || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${inteiroFormatado},${centavos}`
  }

  function converterMoedaParaNumero(valorMoeda: string) {
    return Number(valorMoeda.replace(/\./g, '').replace(',', '.')) || 0
  }

  function abrirModalPagamento() {
    setFormasPagamento([])
    setValorRecebido('0,00')
    setMostrarModalPagamento(true)
  }

  function adicionarFormaPagamento(metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO') {
    if (metodo === 'DINHEIRO') {
      const valor = converterMoedaParaNumero(valorRecebido)
      if (valor < total - formasPagamento.reduce((s, fp) => s + fp.valor, 0)) {
        alert('Valor recebido deve ser maior ou igual ao valor restante')
        return
      }
      const valorRestante = total - formasPagamento.reduce((s, fp) => s + fp.valor, 0)
      setFormasPagamento([
        ...formasPagamento,
        {
          metodo: 'DINHEIRO',
          valor: valorRestante,
          troco: valor - valorRestante,
        },
      ])
      setValorRecebido('0,00')
    } else {
      const valorRestante = total - formasPagamento.reduce((s, fp) => s + fp.valor, 0)
      setFormasPagamento([
        ...formasPagamento,
        {
          metodo,
          valor: valorRestante,
        },
      ])
    }
  }

  function removerFormaPagamento(index: number) {
    setFormasPagamento(formasPagamento.filter((_, i) => i !== index))
  }

  const totalPago = formasPagamento.reduce((sum, fp) => sum + fp.valor, 0)
  const restante = total - totalPago

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!ativa) return

      if (e.key === 'F8') {
        e.preventDefault()
        if (carrinho.length === 0) return

        if (!mostrarModalPagamento) {
          abrirModalPagamento()
          return
        }

        if (!finalizando && restante <= 0.01) {
          void finalizarVenda()
        }
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
  }, [ativa, carrinho.length, mostrarModalPagamento, finalizando, restante, comprovanteData])

  async function finalizarVenda() {
    if (formasPagamento.length === 0) {
      setErroModal('Adicione pelo menos uma forma de pagamento')
      return
    }

    if (Math.abs(restante) > 0.01) {
      setErroModal('Valor total não confere com formas de pagamento')
      return
    }

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

      const resultado = await finalizarVendaDireta(caixa.id, itens, formasPagamento)

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
          formasPagamento,
          pedidoId: resultado.pedidoId,
        })
        setCarrinho([])
        setMostrarModalPagamento(false)
        setFormasPagamento([])
        setComprovanteOpen(true)
        await carregarProdutos(true)
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lista de Produtos */}
      <div className="lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4">Produtos Disponíveis</h3>

        {/* Lista suspensa com busca (produtos não favoritos) */}
        <div className="relative mb-4" ref={listaBuscaRef} data-testid="busca-produto-pdv">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              data-testid="input-busca-produto"
              type="text"
              autoComplete="off"
              placeholder="Buscar produto para adicionar..."
              value={buscaProduto}
              ref={inputBuscaRef}
              onChange={(e) => {
                setBuscaProduto(e.target.value)
                setMostrarListaBusca(true)
              }}
              onFocus={() => setMostrarListaBusca(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              className="pl-9 pr-4"
            />
          </div>
          {mostrarListaBusca && (
            <div data-testid="lista-busca-produtos" className="absolute z-[100] w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto border-border">
              {buscaProduto.trim() ? (
                produtosBusca.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    Nenhum produto encontrado{produtos.length > 0 ? ` (${produtos.length} produtos no PDV – tente parte do nome ou SKU)` : ''}
                  </div>
                ) : (
                  produtosBusca.map((produto) => {
                    const estoqueOk = produto.estoque === null || produto.estoque > 0
                    return (
                      <button
                        key={produto.id}
                        type="button"
                        disabled={!estoqueOk}
                        className="w-full text-left px-4 py-3 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex justify-between items-center gap-2 border-b last:border-b-0"
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
                <div className="px-4 py-2 text-xs text-muted-foreground">Digite para buscar um produto</div>
              )}
            </div>
          )}
        </div>

        {/* Cards: apenas favoritos */}
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
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {produto.descricao}
                    </p>
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
            Nenhum produto favorito. Use a busca acima para adicionar produtos. Favoritos são definidos em Admin → Produtos → aba Básico.
          </p>
        )}
      </div>

      {/* Carrinho */}
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
              <p className="text-sm text-muted-foreground text-center py-8">
                Carrinho vazio
              </p>
            ) : (
              <>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {carrinho.map((item, index) => {
                    const ehKitComData = !!item.data_retirada
                    const dataFormatada = item.data_retirada
                      ? new Date(item.data_retirada + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
                            onClick={() => (ehKitComData ? removerItemPorIndex(index) : removerProduto(item.produto_id))}
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

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total:</span>
                    <span className="text-2xl font-bold">{formatPrice(total)}</span>
                  </div>
                  <Button
                    onClick={abrirModalPagamento}
                    className="w-full font-semibold shadow-md py-6 text-base"
                    size="lg"
                    disabled={total === 0}
                  >
                    Finalizar Venda (F8)
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Pagamento */}
      <Dialog open={mostrarModalPagamento} onOpenChange={setMostrarModalPagamento}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Formas de Pagamento</DialogTitle>
            <DialogDescription>
              Total da venda: <strong>{formatPrice(total)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Formas de pagamento adicionadas */}
            {formasPagamento.length > 0 && (
              <div className="space-y-2">
                <Label>Formas de Pagamento Adicionadas</Label>
                {formasPagamento.map((fp, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {fp.metodo === 'DINHEIRO' && '💵 Dinheiro'}
                        {fp.metodo === 'CREDITO' && '💳 Crédito'}
                        {fp.metodo === 'DEBITO' && '💳 Débito'}
                      </p>
                      {fp.troco !== undefined && fp.troco > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Troco: {formatPrice(fp.troco)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatPrice(fp.valor)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removerFormaPagamento(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Valor restante */}
            {restante > 0.01 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Valor restante:</p>
                <p className="text-xl font-bold">{formatPrice(restante)}</p>
              </div>
            )}

            {/* Adicionar formas de pagamento */}
            {restante > 0.01 && (
              <div className="space-y-3 border-t pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => adicionarFormaPagamento('CREDITO')}
                    className="w-full"
                  >
                    💳 Crédito
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => adicionarFormaPagamento('DEBITO')}
                    className="w-full"
                  >
                    💳 Débito
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Dinheiro</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="0,00"
                      value={valorRecebido}
                      onChange={(e) => setValorRecebido(formatarValorDigitadoComoMoeda(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          adicionarFormaPagamento('DINHEIRO')
                        }
                      }}
                    />
                    <Button
                      onClick={() => adicionarFormaPagamento('DINHEIRO')}
                      disabled={converterMoedaParaNumero(valorRecebido) <= 0}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Troco a dar */}
            {restante < -0.01 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800">
                  Troco a dar: {formatPrice(Math.abs(restante))}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMostrarModalPagamento(false)}>
              Cancelar
            </Button>
            <Button
              onClick={finalizarVenda}
              disabled={finalizando || restante > 0.01}
              className="w-full sm:w-auto font-semibold shadow-sm"
            >
              {finalizando ? 'Finalizando...' : 'Confirmar Venda (F8)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comprovante para impressão (recibo térmico) */}
      {comprovanteData && (
        <ComprovanteModal
          open={comprovanteOpen}
          onClose={() => {
            if (fecharComprovanteTimeoutRef.current) {
              clearTimeout(fecharComprovanteTimeoutRef.current)
              fecharComprovanteTimeoutRef.current = null
            }
            setComprovanteOpen(false)
            // Limpa os dados após o Dialog terminar o fechamento (evita reabertura em PWA/instalado)
            fecharComprovanteTimeoutRef.current = setTimeout(() => {
              setComprovanteData(null)
              fecharComprovanteTimeoutRef.current = null
            }, 400)
          }}
          tipo="DIRETA"
          nomeLoja={nomeLoja}
          dataHora={comprovanteData.dataHora}
          itens={comprovanteData.itens}
          total={comprovanteData.total}
          formasPagamento={comprovanteData.formasPagamento}
          pedidoId={comprovanteData.pedidoId}
        />
      )}

      {/* Modal de erro */}
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

      {/* Modal de Variações/Opcionais */}
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
            if (produto) {
              adicionarProdutoAoCarrinho(produto, precoFinal, variacoes, opcionais)
            }
            setMostrarModalVariacoes(false)
            setProdutoSelecionado(null)
          }}
        />
      )}

      {/* Modal Gramas (produto vendido por kg) */}
      <ModalGramasKg
        open={!!produtoParaGramas}
        onOpenChange={(open) => !open && setProdutoParaGramas(null)}
        produtoNome={produtoParaGramas?.nome ?? ''}
        precoPorKg={produtoParaGramas?.preco ?? 0}
        onConfirm={(gramas) => {
          if (produtoParaGramas) {
            adicionarProdutoAoCarrinho(produtoParaGramas, (produtoParaGramas.preco * gramas) / 1000, {}, {}, gramas)
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
          }}
          onConfirmMensal={(datas, precoPorDia) => {
            adicionarKitLancheAoCarrinho(datas, precoPorDia, kitLancheVariacoesPendentes?.variacoes, kitLancheVariacoesPendentes?.opcionais)
          }}
        />
      )}
    </div>
  )
}
