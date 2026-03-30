'use client'

import { useState, useEffect, useRef } from 'react'
import type { Caixa } from '@/lib/types/database'
import { finalizarVendaAluno, obterProdutoCompletoPdv, recargaPresencialAluno, type ItemVenda, type FormaPagamento } from '@/app/actions/pdv-vendas'
import { obterProdutosPdvComCache } from '@/app/pdv/produtos-cache'
import { obterSaldoAluno, obterGastoAlunoHojeParaPdv } from '@/app/actions/saldo'
import { obterConfigAlunoParaPdv } from '@/app/actions/aluno-config'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ProdutoVariacoesModal } from '@/components/pdv/produto-variacoes-modal'
import { ModalGramasKg } from '@/components/pdv/modal-gramas-kg'
import { KitLancheModal } from '@/components/pdv/kit-lanche-modal'
import { ComprovanteModal, type ItemComprovante } from '@/components/pdv/comprovante-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Minus, Trash2, ShoppingCart, Search, User, CreditCard, Wallet, X } from 'lucide-react'
import { buscarAlunosPdvComCache } from '@/app/pdv/pessoas-cache'

interface VendaAlunoProps {
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
  /** Kit Mensal: preço base por dia (para o modal calcular total = base × dias × (1 - desconto)) */
  preco_base_kit_mensal?: number
  favorito?: boolean
  sku?: string | null
}

interface Aluno {
  id: string
  nome: string
  prontuario: string
  situacao: string
  turma_id: string | null
  turmas: { id: string; descricao: string; segmento: string } | null
}

interface ItemCarrinho extends ItemVenda {
  produto_nome: string
}

export function VendaAluno({ caixa, ativa = false }: VendaAlunoProps) {
  const [termoBusca, setTermoBusca] = useState('')
  const [alunosEncontrados, setAlunosEncontrados] = useState<Aluno[]>([])
  const [buscando, setBuscando] = useState(false)
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [saldoAluno, setSaldoAluno] = useState<number | null>(null)
  const [carregandoSaldo, setCarregandoSaldo] = useState(false)
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
  const [mostrarModalRecarga, setMostrarModalRecarga] = useState(false)
  const [valorRecarga, setValorRecarga] = useState('')
  const [mostrarModalPagamentoRecarga, setMostrarModalPagamentoRecarga] = useState(false)
  const [formasPagamentoRecarga, setFormasPagamentoRecarga] = useState<FormaPagamento[]>([])
  const [valorRecebidoRecarga, setValorRecebidoRecarga] = useState('')
  const [processandoRecarga, setProcessandoRecarga] = useState(false)
  const [nomeLoja, setNomeLoja] = useState('')
  const [comprovanteOpen, setComprovanteOpen] = useState(false)
  const [comprovanteData, setComprovanteData] = useState<{
    dataHora: string
    itens: ItemComprovante[]
    total: number
    alunoNome: string
    pedidoId?: string
    saldoAtual?: number
  } | null>(null)
  const [erroModal, setErroModal] = useState<string | null>(null)
  const [sucessoModal, setSucessoModal] = useState<string | null>(null)
  const [mostrarConfirmacaoVenda, setMostrarConfirmacaoVenda] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [mostrarListaBusca, setMostrarListaBusca] = useState(false)
  const [produtoParaGramas, setProdutoParaGramas] = useState<Produto | null>(null)
  const [configAluno, setConfigAluno] = useState<{ limite_gasto_diario: number | null; produtos_bloqueados_ids: string[] } | null>(null)
  const [gastoHoje, setGastoHoje] = useState<number | null>(null)
  const listaBuscaRef = useRef<HTMLDivElement>(null)
  const alunoBuscaRef = useRef<HTMLDivElement>(null)
  const inputBuscaAlunoRef = useRef<HTMLInputElement | null>(null)
  const inputBuscaProdutoRef = useRef<HTMLInputElement | null>(null)
  const fecharComprovanteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    obterConfiguracaoAparencia().then((c) => setNomeLoja(c.loja_nome || ''))
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
        removerAluno()
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
    // Dependemos do estado usado nas validações para evitar "snapshot" antigo no atalho F8
  }, [ativa, mostrarConfirmacaoVenda, finalizando, comprovanteData, alunoSelecionado, carrinho.length])

  useEffect(() => {
    if (!ativa || loading || comprovanteOpen) return

    if (!alunoSelecionado && inputBuscaAlunoRef.current) {
      inputBuscaAlunoRef.current.focus()
      inputBuscaAlunoRef.current.select()
    } else if (alunoSelecionado && inputBuscaProdutoRef.current) {
      inputBuscaProdutoRef.current.focus()
      inputBuscaProdutoRef.current.select()
    }
  }, [ativa, alunoSelecionado, loading, comprovanteOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target
      const listaBusca = listaBuscaRef.current
      const alunoBusca = alunoBuscaRef.current
      if (listaBusca && (!(target instanceof Node) || !listaBusca.contains(target))) {
        setMostrarListaBusca(false)
      }
      if (alunoBusca && (!(target instanceof Node) || !alunoBusca.contains(target))) {
        setAlunosEncontrados([])
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const bloqueadosIds = configAluno?.produtos_bloqueados_ids ?? []
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
          return termosBusca.every((t) => texto.includes(t))
        })
  const listaBuscaItens = buscaProduto.trim() ? produtosBusca : produtos

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

  async function buscarAlunos() {
    if (!termoBusca.trim() || termoBusca.trim().length < 2) {
      setAlunosEncontrados([])
      return
    }

    try {
      setBuscando(true)
      const resultados = await buscarAlunosPdvComCache(caixa.empresa_id, termoBusca)
      setAlunosEncontrados(resultados)
    } catch (err) {
      console.error('Erro ao buscar alunos:', err)
      setAlunosEncontrados([])
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (termoBusca.trim().length < 2) {
      setAlunosEncontrados([])
      return
    }
    const t = setTimeout(() => buscarAlunos(), 300)
    return () => clearTimeout(t)
  }, [termoBusca])

  async function selecionarAluno(aluno: Aluno) {
    setAlunoSelecionado(aluno)
    setAlunosEncontrados([])
    setTermoBusca('')
    setCarregandoSaldo(true)
    setConfigAluno(null)
    setGastoHoje(null)
    try {
      const [saldo, config, gasto] = await Promise.all([
        obterSaldoAluno(aluno.id),
        obterConfigAlunoParaPdv(aluno.id),
        obterGastoAlunoHojeParaPdv(aluno.id),
      ])
      setSaldoAluno(saldo)
      setConfigAluno(config)
      setGastoHoje(gasto)
    } catch (err) {
      console.error('Erro ao carregar dados do aluno:', err)
      setSaldoAluno(null)
      setConfigAluno(null)
      setGastoHoje(null)
    } finally {
      setCarregandoSaldo(false)
    }
  }

  function removerAluno() {
    setAlunoSelecionado(null)
    setSaldoAluno(null)
    setConfigAluno(null)
    setGastoHoje(null)
    setCarrinho([])
  }

  async function adicionarProduto(produto: Produto) {
    if (!alunoSelecionado) {
      setErroModal('Selecione um aluno primeiro')
      return
    }
    if (configAluno?.produtos_bloqueados_ids?.includes(produto.id)) {
      setErroModal('Este produto está bloqueado pelo responsável para este aluno.')
      return
    }

    if (produto.estoque !== null && produto.estoque <= 0) {
      setErroModal('Produto sem estoque')
      return
    }

    // Produto vendido por kg: abrir modal para informar gramas
    if (produto.unidade === 'KG') {
      setProdutoParaGramas(produto)
      return
    }

    // Kit Lanche: se tiver variações/opcionais, abrir modal de variações primeiro; depois calendário
    if (produto.tipo === 'KIT_LANCHE') {
      setKitLancheProduto(produto)
      setKitLancheTipo(produto.tipo_kit === 'MENSAL' ? 'MENSAL' : 'AVULSO')
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

  function adicionarKitLancheAoCarrinho(dias: string[], precoPorDia: number, variacoes?: Record<string, string>, opcionais?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>) {
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
    if (configAluno?.produtos_bloqueados_ids?.includes(produto.id)) {
      setErroModal('Este produto está bloqueado pelo responsável para este aluno.')
      return
    }
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
        setErroModal('Quantidade máxima disponível no estoque')
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
      setErroModal('Quantidade máxima disponível no estoque')
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
  const saldoAposCompra = saldoAluno !== null ? saldoAluno - total : null

  function formatPrice(valor: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  function solicitarConfirmacaoVenda() {
    if (!alunoSelecionado) {
      setErroModal('Selecione um aluno')
      return
    }
    if (carrinho.length === 0) {
      setErroModal('Adicione produtos ao carrinho')
      return
    }
    const limite = configAluno?.limite_gasto_diario
    if (limite != null && gastoHoje != null && gastoHoje + total > limite) {
      setErroModal(`Limite diário excedido. Limite: ${formatPrice(limite)}, já gasto hoje: ${formatPrice(gastoHoje)}, esta venda: ${formatPrice(total)}.`)
      return
    }
    setMostrarConfirmacaoVenda(true)
  }

  async function finalizarVenda() {
    if (!alunoSelecionado) return
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

      const resultado = await finalizarVendaAluno(caixa.id, alunoSelecionado.id, itens)

      if (resultado.ok) {
        if (fecharComprovanteTimeoutRef.current) {
          clearTimeout(fecharComprovanteTimeoutRef.current)
          fecharComprovanteTimeoutRef.current = null
        }
        const [novoSaldo, novoGasto] = await Promise.all([
          obterSaldoAluno(alunoSelecionado.id),
          obterGastoAlunoHojeParaPdv(alunoSelecionado.id),
        ])
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
          alunoNome: alunoSelecionado.nome,
          pedidoId: resultado.pedidoId,
          saldoAtual: novoSaldo,
        })
        setCarrinho([])
        setComprovanteOpen(true)
        setSaldoAluno(novoSaldo)
        setGastoHoje(novoGasto)
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
    <div className="space-y-6">
      {/* Busca de Aluno */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Aluno
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!alunoSelecionado ? (
            <>
              <div ref={alunoBuscaRef} className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o nome ou prontuário do aluno..."
                    value={termoBusca}
                    ref={inputBuscaAlunoRef}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        buscarAlunos()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={buscarAlunos}
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
                      <div className="p-4 text-center text-sm text-muted-foreground">Buscando alunos...</div>
                    ) : alunosEncontrados.length > 0 ? (
                      <div className="py-1">
                        {alunosEncontrados.map((aluno) => (
                          <div
                            key={aluno.id}
                            className="px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0"
                            onClick={() => selecionarAluno(aluno)}
                          >
                            <p className="font-medium">{aluno.nome}</p>
                            <p className="text-sm text-muted-foreground">
                              Prontuário: {aluno.prontuario}
                              {aluno.turmas && ` • ${aluno.turmas.descricao}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">Nenhum aluno encontrado</div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{alunoSelecionado.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      Prontuário: {alunoSelecionado.prontuario}
                      {alunoSelecionado.turmas && ` • ${alunoSelecionado.turmas.descricao}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {carregandoSaldo ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  ) : saldoAluno !== null ? (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className="text-lg font-bold flex items-center gap-1">
                        <CreditCard className="h-4 w-4" />
                        {formatPrice(saldoAluno)}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setMostrarModalRecarga(true)}
                      className="font-semibold shadow-sm"
                    >
                      <Wallet className="h-4 w-4 mr-1" />
                      Adicionar Saldo
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={removerAluno}
                      className="font-semibold border-2 border-primary/30 bg-primary/10 hover:bg-primary/20 text-foreground shadow-sm"
                    >
                      Trocar Aluno (F6)
                    </Button>
                  </div>
                </div>
              </div>
              {configAluno?.limite_gasto_diario != null && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground flex flex-wrap gap-4">
                  <span>Limite diário: <strong className="text-foreground">{formatPrice(configAluno.limite_gasto_diario)}</strong></span>
                  {gastoHoje !== null && (
                    <span>Gasto hoje: <strong className="text-foreground">{formatPrice(gastoHoje)}</strong></span>
                  )}
                  {carrinho.length > 0 && (
                    <span>Esta venda: <strong className="text-foreground">{formatPrice(total)}</strong></span>
                  )}
                  {gastoHoje != null && configAluno.limite_gasto_diario != null && gastoHoje + total > configAluno.limite_gasto_diario && (
                    <span className="text-destructive font-medium">Limite diário será excedido</span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {alunoSelecionado && (
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
                    ref={inputBuscaProdutoRef}
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
                  {listaBuscaItens.length === 0 ? (
                    buscaProduto.trim() ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Nenhum produto encontrado{produtos.length > 0 ? ` (${produtos.length} produtos no PDV – tente parte do nome ou SKU)` : ''}
                      </div>
                    ) : (
                      <div className="px-4 py-2 text-xs text-muted-foreground">Nenhum produto no PDV</div>
                    )
                  ) : (
                    listaBuscaItens.map((produto) => {
                      const estoqueOk = produto.estoque === null || produto.estoque > 0
                      const bloqueado = bloqueadosIds.includes(produto.id)
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
                          <span className="font-medium truncate flex items-center gap-2">
                            {produto.nome}
                            {bloqueado && (
                              <span className="text-xs font-normal text-destructive shrink-0">Bloqueado</span>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground shrink-0">
                            {produto.preco_a_partir_de != null
                              ? `A partir de ${formatPrice(Number(produto.preco_a_partir_de))}`
                              : formatPrice(produto.preco)}
                          </span>
                        </button>
                      )
                    })
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
                const bloqueado = bloqueadosIds.includes(produto.id)

                return (
                  <Card key={produto.id} className={`overflow-hidden ${bloqueado ? 'opacity-90' : ''}`}>
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                        {produto.nome}
                        {bloqueado && (
                          <span className="text-xs font-normal text-destructive">Bloqueado</span>
                        )}
                      </CardTitle>
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
                        disabled={bloqueado || estoqueDisponivel <= quantidadeNoCarrinho}
                        className="w-full"
                        size="sm"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {bloqueado ? 'Bloqueado' : 'Adicionar'}
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

                    <div className="border-t pt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total:</span>
                        <span className="text-2xl font-bold">{formatPrice(total)}</span>
                      </div>
                      {saldoAluno !== null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Saldo disponível:</span>
                          <span className="font-semibold">
                            {formatPrice(saldoAluno)}
                          </span>
                        </div>
                      )}
                      {saldoAposCompra !== null && total > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Saldo após compra:</span>
                          <span className={saldoAposCompra < 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                            {formatPrice(saldoAposCompra)}
                          </span>
                        </div>
                      )}
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

      {/* Modal de Adicionar Saldo */}
      <Dialog open={mostrarModalRecarga} onOpenChange={setMostrarModalRecarga}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar Saldo</DialogTitle>
            <DialogDescription>
              Informe o valor a ser creditado na conta de {alunoSelecionado?.nome}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="valor-recarga">Valor (R$)</Label>
              <Input
                id="valor-recarga"
                type="text"
                placeholder="0,00"
                value={valorRecarga}
                onChange={(e) => setValorRecarga(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && valorRecarga) {
                    const valor = parseFloat(valorRecarga.replace(',', '.'))
                    if (!isNaN(valor) && valor > 0) {
                      setMostrarModalRecarga(false)
                      setMostrarModalPagamentoRecarga(true)
                    }
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMostrarModalRecarga(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const valor = parseFloat(valorRecarga.replace(',', '.'))
                if (isNaN(valor) || valor <= 0) {
                  setErroModal('Informe um valor válido')
                  return
                }
                setMostrarModalRecarga(false)
                setMostrarModalPagamentoRecarga(true)
              }}
              disabled={!valorRecarga}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Pagamento para Recarga */}
      <Dialog open={mostrarModalPagamentoRecarga} onOpenChange={setMostrarModalPagamentoRecarga}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Forma de Pagamento - Recarga</DialogTitle>
            <DialogDescription>
              Valor: <strong>{formatPrice(parseFloat(valorRecarga.replace(',', '.')) || 0)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Forma de pagamento adicionada */}
            {formasPagamentoRecarga.length > 0 && (
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                {formasPagamentoRecarga.map((fp, index) => (
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
                        onClick={() => setFormasPagamentoRecarga([])}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Adicionar forma de pagamento */}
            {formasPagamentoRecarga.length === 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const valor = parseFloat(valorRecarga.replace(',', '.')) || 0
                      setFormasPagamentoRecarga([
                        {
                          metodo: 'CREDITO',
                          valor,
                        },
                      ])
                    }}
                    className="w-full"
                  >
                    💳 Crédito
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const valor = parseFloat(valorRecarga.replace(',', '.')) || 0
                      setFormasPagamentoRecarga([
                        {
                          metodo: 'DEBITO',
                          valor,
                        },
                      ])
                    }}
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
                      value={valorRecebidoRecarga}
                      onChange={(e) => setValorRecebidoRecarga(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const valor = parseFloat(valorRecebidoRecarga.replace(',', '.')) || 0
                          const valorRecargaNum = parseFloat(valorRecarga.replace(',', '.')) || 0
                          if (valor < valorRecargaNum) {
                            setErroModal('Valor recebido deve ser maior ou igual ao valor da recarga')
                            return
                          }
                          setFormasPagamentoRecarga([
                            {
                              metodo: 'DINHEIRO',
                              valor: valorRecargaNum,
                              troco: valor - valorRecargaNum,
                            },
                          ])
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        const valor = parseFloat(valorRecebidoRecarga.replace(',', '.')) || 0
                        const valorRecargaNum = parseFloat(valorRecarga.replace(',', '.')) || 0
                        if (valor < valorRecargaNum) {
                          setErroModal('Valor recebido deve ser maior ou igual ao valor da recarga')
                          return
                        }
                        setFormasPagamentoRecarga([
                          {
                            metodo: 'DINHEIRO',
                            valor: valorRecargaNum,
                            troco: valor - valorRecargaNum,
                          },
                        ])
                      }}
                      disabled={!valorRecebidoRecarga}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMostrarModalPagamentoRecarga(false)
                setFormasPagamentoRecarga([])
                setValorRecebidoRecarga('')
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (formasPagamentoRecarga.length === 0) {
                  setErroModal('Selecione uma forma de pagamento')
                  return
                }

                if (!alunoSelecionado) {
                  setErroModal('Selecione um aluno')
                  return
                }

                const valor = parseFloat(valorRecarga.replace(',', '.')) || 0
                if (isNaN(valor) || valor <= 0) {
                  setErroModal('Valor inválido')
                  return
                }

                setProcessandoRecarga(true)
                try {
                  const resultado = await recargaPresencialAluno(
                    caixa.id,
                    alunoSelecionado.id,
                    valor,
                    formasPagamentoRecarga[0]
                  )

                  if (resultado.ok) {
                    setSucessoModal('Saldo adicionado com sucesso!')
                    setMostrarModalPagamentoRecarga(false)
                    setMostrarModalRecarga(false)
                    setValorRecarga('')
                    setFormasPagamentoRecarga([])
                    setValorRecebidoRecarga('')
                    const novoSaldo = await obterSaldoAluno(alunoSelecionado.id)
                    setSaldoAluno(novoSaldo)
                  } else {
                    setErroModal(resultado.erro || 'Erro ao adicionar saldo')
                  }
                } catch (err) {
                  console.error('Erro ao processar recarga:', err)
                  setErroModal('Erro ao processar recarga')
                } finally {
                  setProcessandoRecarga(false)
                }
              }}
              disabled={processandoRecarga || formasPagamentoRecarga.length === 0}
              className="w-full sm:w-auto"
            >
              {processandoRecarga ? 'Processando...' : 'Confirmar Recarga'}
            </Button>
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
            setKitLancheVariacoesPendentes(null)
          }}
          onConfirmMensal={(datas, precoPorDia) => {
            adicionarKitLancheAoCarrinho(datas, precoPorDia, kitLancheVariacoesPendentes?.variacoes, kitLancheVariacoesPendentes?.opcionais)
            setKitLancheVariacoesPendentes(null)
          }}
        />
      )}

      {/* Confirmação da venda (substitui confirm()) */}
      <Dialog open={mostrarConfirmacaoVenda} onOpenChange={setMostrarConfirmacaoVenda}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar venda</DialogTitle>
            <DialogDescription>
              Confirmar venda de <strong>{formatPrice(total)}</strong> para <strong>{alunoSelecionado?.nome}</strong>?
              O valor será debitado do saldo do aluno.
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

      {/* Comprovante (via estabelecimento + via aluno) */}
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
          tipo="ALUNO"
          nomeLoja={nomeLoja}
          dataHora={comprovanteData.dataHora}
          itens={comprovanteData.itens}
          total={comprovanteData.total}
          alunoNome={comprovanteData.alunoNome}
          pedidoId={comprovanteData.pedidoId}
          saldoAtual={comprovanteData.saldoAtual}
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

      {/* Modal de sucesso (ex.: recarga) */}
      <Dialog open={!!sucessoModal} onOpenChange={(o) => !o && setSucessoModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sucesso</DialogTitle>
            <DialogDescription>{sucessoModal}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSucessoModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
