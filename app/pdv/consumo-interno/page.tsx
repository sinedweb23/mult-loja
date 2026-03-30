'use client'

import { useState, useEffect } from 'react'
import { useCaixaPdv } from '@/app/pdv/caixa-context'
import { registrarConsumoInterno, type ItemConsumoInterno, type ComprovanteConsumoInternoData } from '@/app/actions/consumo-interno'
import { type ProdutoConsumoInterno } from '@/app/actions/consumo-interno'
import { listarDepartamentosComSegmentosParaPdv, type DepartamentoComSegmentos } from '@/app/actions/departamentos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Minus, Trash2, Loader2, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ComprovanteConsumoInternoModal } from '@/components/pdv/comprovante-consumo-interno-modal'
import { ModalGramasKg } from '@/components/pdv/modal-gramas-kg'
import {
  obterColaboradoresConsumoInternoComCache,
  obterProdutosConsumoInternoComCache,
} from '@/app/pdv/consumo-interno-cache'

/** Nome da variação: mesma regra da loja/PDV — valor primeiro, depois label. */
function nomeVariacaoValor(v: { valor?: string | null; label?: string | null }): string {
  const val = (v?.valor ?? '').trim()
  if (val !== '') return val
  const lbl = (v?.label ?? '').trim()
  return lbl !== '' ? lbl : 'Opção'
}

function formatCusto(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface ItemCarrinho extends ItemConsumoInterno {
  produto_nome: string
  variacao_label?: string | null
  /** Custo unitário (por un ou por kg) para exibição */
  valor_custo: number
  /** Gramas quando produto é por kg */
  gramas?: number
}

export default function ConsumoInternoPage() {
  const caixa = useCaixaPdv()
  const [departamentos, setDepartamentos] = useState<DepartamentoComSegmentos[]>([])
  const [produtos, setProdutos] = useState<ProdutoConsumoInterno[]>([])
  const [colaboradores, setColaboradores] = useState<Array<{ id: string; nome: string }>>([])
  const [departmentId, setDepartmentId] = useState<string>('')
  const [segmentId, setSegmentId] = useState<string>('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [solicitanteId, setSolicitanteId] = useState('')
  const [retiradoPorId, setRetiradoPorId] = useState('')
  const [mesmoSolicitanteRetirou, setMesmoSolicitanteRetirou] = useState(false)
  const [loading, setLoading] = useState(true)
  const [finalizando, setFinalizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [produtoVariacaoModal, setProdutoVariacaoModal] = useState<ProdutoConsumoInterno | null>(null)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtoSelectOpen, setProdutoSelectOpen] = useState(false)
  const [buscaSolicitante, setBuscaSolicitante] = useState('')
  const [buscaRetirado, setBuscaRetirado] = useState('')
  const [solicitanteSelectOpen, setSolicitanteSelectOpen] = useState(false)
  const [retiradoSelectOpen, setRetiradoSelectOpen] = useState(false)
  const [comprovanteData, setComprovanteData] = useState<ComprovanteConsumoInternoData | null>(null)
  const [showComprovanteModal, setShowComprovanteModal] = useState(false)
  const [produtoParaGramas, setProdutoParaGramas] = useState<ProdutoConsumoInterno | null>(null)

  const segmentosDoDepartamento = departmentId
    ? (departamentos.find((d) => d.id === departmentId)?.segmentos ?? [])
    : []

  const buscaNorm = buscaProduto.trim().toLowerCase()
  const produtosFiltrados =
    buscaNorm === ''
      ? produtos
      : produtos.filter((p) => p.nome.toLowerCase().includes(buscaNorm))

  const buscaSolicitanteNorm = buscaSolicitante.trim().toLowerCase()
  const colaboradoresSolicitanteFiltrados =
    buscaSolicitanteNorm === ''
      ? colaboradores
      : colaboradores.filter((c) => c.nome.toLowerCase().includes(buscaSolicitanteNorm))

  const buscaRetiradoNorm = buscaRetirado.trim().toLowerCase()
  const colaboradoresRetiradoFiltrados =
    buscaRetiradoNorm === ''
      ? colaboradores
      : colaboradores.filter((c) => c.nome.toLowerCase().includes(buscaRetiradoNorm))

  useEffect(() => {
    if (mesmoSolicitanteRetirou) {
      setRetiradoPorId(solicitanteId)
    }
  }, [mesmoSolicitanteRetirou, solicitanteId])

  useEffect(() => {
    if (!caixa?.empresa_id) return

    Promise.all([
      listarDepartamentosComSegmentosParaPdv(caixa.empresa_id),
      obterProdutosConsumoInternoComCache(caixa.empresa_id),
      obterColaboradoresConsumoInternoComCache(caixa.empresa_id),
    ])
      .then(([deps, prods, cols]) => {
        setDepartamentos(deps)
        setProdutos(prods)
        setColaboradores(cols ?? [])
      })
      .catch((e) => {
        console.error(e)
        setErro('Erro ao carregar dados')
      })
      .finally(() => setLoading(false))
  }, [caixa?.empresa_id])

  useEffect(() => {
    if (!departmentId) setSegmentId('')
  }, [departmentId])

  function adicionarAoCarrinho(
    produto: ProdutoConsumoInterno,
    variacaoValorId?: string | null,
    variacaoLabel?: string | null,
    gramas?: number
  ) {
    const temVariacoes = produto.variacoes?.length
    if (temVariacoes && !variacaoValorId) {
      setProdutoVariacaoModal(produto)
      return
    }
    if (produto.unidade === 'KG' && gramas == null) {
      setProdutoParaGramas(produto)
      return
    }

    const valorCusto = produto.valor_custo ?? 0
    if (produto.unidade === 'KG' && gramas != null && gramas > 0) {
      setCarrinho((prev) => [
        ...prev,
        {
          produto_id: produto.id,
          variacao_valor_id: undefined,
          quantidade: gramas,
          produto_nome: produto.nome,
          variacao_label: null,
          valor_custo: valorCusto,
          gramas,
        },
      ])
      setProdutoParaGramas(null)
      return
    }

    const existente = carrinho.find(
      (i) =>
        i.produto_id === produto.id &&
        (i.variacao_valor_id ?? null) === (variacaoValorId ?? null) &&
        i.gramas == null
    )
    if (existente) {
      setCarrinho((prev) =>
        prev.map((i) =>
          i.produto_id === produto.id &&
          (i.variacao_valor_id ?? null) === (variacaoValorId ?? null) &&
          i.gramas == null
            ? { ...i, quantidade: i.quantidade + 1 }
            : i
        )
      )
    } else {
      setCarrinho((prev) => [
        ...prev,
        {
          produto_id: produto.id,
          variacao_valor_id: variacaoValorId ?? undefined,
          quantidade: 1,
          produto_nome: produto.nome,
          variacao_label: variacaoLabel ?? null,
          valor_custo: valorCusto,
        },
      ])
    }
    setProdutoVariacaoModal(null)
  }

  function alterarQuantidade(index: number, delta: number) {
    setCarrinho((prev) => {
      const item = prev[index]
      const novaQtd = Math.max(0, item.quantidade + delta)
      if (novaQtd === 0) return prev.filter((_, i) => i !== index)
      return prev.map((i, idx) => (idx === index ? { ...i, quantidade: novaQtd } : i))
    })
  }

  function setQuantidadePorValor(index: number, valor: number) {
    const qtd = Math.max(0, Math.floor(Number(valor)))
    if (qtd === 0) {
      setCarrinho((prev) => prev.filter((_, i) => i !== index))
    } else {
      setCarrinho((prev) =>
        prev.map((i, idx) => (idx === index ? { ...i, quantidade: qtd } : i))
      )
    }
  }

  function removerDoCarrinho(index: number) {
    setCarrinho((prev) => prev.filter((_, i) => i !== index))
  }

  async function finalizar() {
    if (!caixa?.empresa_id) return
    if (!solicitanteId.trim()) {
      setErro('Selecione quem solicitou')
      return
    }
    if (!retiradoPorId.trim()) {
      setErro('Selecione quem retirou')
      return
    }
    if (!departmentId || !segmentId) {
      setErro('Selecione departamento e segmento')
      return
    }
    if (carrinho.length === 0) {
      setErro('Adicione ao menos um item')
      return
    }

    setErro(null)
    setFinalizando(true)
    const itens: ItemConsumoInterno[] = carrinho.map((i) => ({
      produto_id: i.produto_id,
      variacao_valor_id: i.variacao_valor_id ?? null,
      quantidade: i.quantidade,
    }))
    const res = await registrarConsumoInterno(caixa.empresa_id, {
      solicitante_id: solicitanteId,
      retirado_por_id: retiradoPorId,
      department_id: departmentId,
      segment_id: segmentId,
      itens,
    })
    setFinalizando(false)
    if (res.ok && res.comprovante) {
      setCarrinho([])
      setSolicitanteId('')
      setRetiradoPorId('')
      setErro(null)
      setComprovanteData(res.comprovante)
      setShowComprovanteModal(true)
    } else if (res.ok) {
      setCarrinho([])
      setSolicitanteId('')
      setRetiradoPorId('')
      setErro(null)
    } else {
      setErro(res.erro ?? 'Erro ao registrar')
    }
  }

  if (!caixa) {
    return (
      <div className="w-full space-y-6">
        <h1 className="text-3xl font-bold">Consumo Interno</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Abra o caixa no diálogo acima para acessar o Consumo Interno.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Consumo Interno</h1>
        <p className="text-muted-foreground mt-1">
          Selecione departamento e segmento, quem solicitou, quem retirou e adicione os produtos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Departamento e Segmento</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="space-y-2 min-w-[200px]">
                <Label>Departamento</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-[200px]">
                <Label>Segmento</Label>
                <Select value={segmentId} onValueChange={setSegmentId} disabled={!departmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o segmento" />
                  </SelectTrigger>
                  <SelectContent>
                    {segmentosDoDepartamento.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div
                  className={cn(
                    'flex items-center rounded-md border bg-background overflow-hidden',
                    produtoSelectOpen && 'ring-2 ring-ring ring-offset-2'
                  )}
                >
                  <Search className="h-4 w-4 ml-3 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Buscar produto..."
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    onFocus={() => setProdutoSelectOpen(true)}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setProdutoSelectOpen((o) => !o)}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', produtoSelectOpen && 'rotate-180')} />
                  </Button>
                </div>
                {produtoSelectOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden
                      onClick={() => setProdutoSelectOpen(false)}
                    />
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[280px] overflow-auto">
                      {produtosFiltrados.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                      ) : (
                        <ul className="p-1">
                          {produtosFiltrados.map((p) => {
                            const temVariacoes = p.variacoes?.length
                            const porKg = p.unidade === 'KG'
                            const custo = p.valor_custo ?? 0
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className={cn(
                                    'w-full text-left px-3 py-2 rounded-sm text-sm flex items-center justify-between gap-2',
                                    'hover:bg-accent hover:text-accent-foreground'
                                  )}
                                  onClick={() => {
                                    adicionarAoCarrinho(p)
                                    setProdutoSelectOpen(false)
                                    setBuscaProduto('')
                                  }}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <Plus className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{p.nome}</span>
                                    {temVariacoes && <span className="text-muted-foreground text-xs shrink-0">(escolher variação)</span>}
                                    {porKg && !temVariacoes && <span className="text-muted-foreground text-xs shrink-0">(por kg)</span>}
                                  </span>
                                  <span className="text-muted-foreground text-xs shrink-0">
                                    {porKg ? `${formatCusto(custo)}/kg` : formatCusto(custo)}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
              {produtos.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">Nenhum produto disponível para consumo interno.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Itens do lançamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {carrinho.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item. Clique nos produtos para adicionar.</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {carrinho.map((item, idx) => {
                      const totalItem =
                        item.gramas != null
                          ? (item.valor_custo * item.gramas) / 1000
                          : item.valor_custo * item.quantidade
                      const isKg = item.gramas != null
                      return (
                        <li
                          key={`${item.produto_id}-${item.variacao_valor_id ?? 's'}-${item.gramas ?? 'u'}-${idx}`}
                          className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{item.produto_nome}</span>
                            {item.variacao_label && (
                              <span className="text-muted-foreground text-sm ml-1">({item.variacao_label})</span>
                            )}
                            {isKg && (
                              <span className="text-muted-foreground text-sm ml-1">({item.gramas}g)</span>
                            )}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatCusto(totalItem)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!isKg && (
                              <>
                                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => alterarQuantidade(idx, -1)}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="h-8 w-12 text-center text-sm px-1 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={item.quantidade}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === '') return
                                    const n = parseInt(v, 10)
                                    if (!Number.isNaN(n) && n >= 0) setQuantidadePorValor(idx, n)
                                  }}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim()
                                    if (v === '') {
                                      setQuantidadePorValor(idx, 0)
                                      return
                                    }
                                    const n = parseInt(v, 10)
                                    if (!Number.isNaN(n) && n >= 0) setQuantidadePorValor(idx, n)
                                  }}
                                />
                                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => alterarQuantidade(idx, 1)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removerDoCarrinho(idx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="border-t pt-3 mt-2 font-semibold flex justify-between text-sm">
                    <span>Total (custo)</span>
                    <span>
                      {formatCusto(
                        carrinho.reduce((acc, i) => {
                          if (i.gramas != null) return acc + (i.valor_custo * i.gramas) / 1000
                          return acc + i.valor_custo * i.quantidade
                        }, 0)
                      )}
                    </span>
                  </div>
                </>
              )}

              <div className="space-y-2 pt-4">
                <Label>Quem solicitou *</Label>
                <div className="relative">
                  <div
                    className={cn(
                      'flex items-center rounded-md border bg-background overflow-hidden',
                      solicitanteSelectOpen && 'ring-2 ring-ring ring-offset-2'
                    )}
                  >
                    <Search className="h-4 w-4 ml-3 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Buscar colaborador..."
                      value={
                        buscaSolicitante ||
                        colaboradores.find((c) => c.id === solicitanteId)?.nome ||
                        ''
                      }
                      onChange={(e) => {
                        setBuscaSolicitante(e.target.value)
                        if (!solicitanteSelectOpen) setSolicitanteSelectOpen(true)
                      }}
                      onFocus={() => setSolicitanteSelectOpen(true)}
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setSolicitanteSelectOpen((o) => !o)}
                    >
                      <ChevronDown
                        className={cn('h-4 w-4 transition-transform', solicitanteSelectOpen && 'rotate-180')}
                      />
                    </Button>
                  </div>
                  {solicitanteSelectOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden
                        onClick={() => setSolicitanteSelectOpen(false)}
                      />
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[260px] overflow-auto">
                        {colaboradoresSolicitanteFiltrados.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
                        ) : (
                          <ul className="p-1">
                            {colaboradoresSolicitanteFiltrados.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  className={cn(
                                    'w-full text-left px-3 py-2 rounded-sm text-sm flex items-center gap-2',
                                    'hover:bg-accent hover:text-accent-foreground'
                                  )}
                                  onClick={() => {
                                    setSolicitanteId(c.id)
                                    setBuscaSolicitante(c.nome)
                                    setSolicitanteSelectOpen(false)
                                  }}
                                >
                                  <span className="truncate">{c.nome}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Quem retirou *</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={mesmoSolicitanteRetirou}
                      onCheckedChange={(checked) => setMesmoSolicitanteRetirou(!!checked)}
                    />
                    Mesma pessoa do solicitante
                  </label>
                </div>
                <div className="relative">
                  <div
                    className={cn(
                      'flex items-center rounded-md border bg-background overflow-hidden',
                      retiradoSelectOpen && !mesmoSolicitanteRetirou && 'ring-2 ring-ring ring-offset-2',
                      mesmoSolicitanteRetirou && 'bg-muted/60'
                    )}
                  >
                    <Search className="h-4 w-4 ml-3 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Buscar colaborador..."
                      value={
                        mesmoSolicitanteRetirou
                          ? colaboradores.find((c) => c.id === solicitanteId)?.nome || ''
                          : buscaRetirado ||
                            colaboradores.find((c) => c.id === retiradoPorId)?.nome ||
                            ''
                      }
                      disabled={mesmoSolicitanteRetirou}
                      onChange={(e) => {
                        setBuscaRetirado(e.target.value)
                        if (!retiradoSelectOpen) setRetiradoSelectOpen(true)
                      }}
                      onFocus={() => !mesmoSolicitanteRetirou && setRetiradoSelectOpen(true)}
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-muted/60"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={mesmoSolicitanteRetirou}
                      onClick={() => setRetiradoSelectOpen((o) => !o)}
                    >
                      <ChevronDown
                        className={cn('h-4 w-4 transition-transform', retiradoSelectOpen && 'rotate-180')}
                      />
                    </Button>
                  </div>
                  {retiradoSelectOpen && !mesmoSolicitanteRetirou && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden
                        onClick={() => setRetiradoSelectOpen(false)}
                      />
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[260px] overflow-auto">
                        {colaboradoresRetiradoFiltrados.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
                        ) : (
                          <ul className="p-1">
                            {colaboradoresRetiradoFiltrados.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  className={cn(
                                    'w-full text-left px-3 py-2 rounded-sm text-sm flex items-center gap-2',
                                    'hover:bg-accent hover:text-accent-foreground'
                                  )}
                                  onClick={() => {
                                    setRetiradoPorId(c.id)
                                    setBuscaRetirado(c.nome)
                                    setRetiradoSelectOpen(false)
                                  }}
                                >
                                  <span className="truncate">{c.nome}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {erro && <p className="text-sm text-destructive">{erro}</p>}

              <Button
                className="w-full"
                onClick={finalizar}
                disabled={
                  finalizando ||
                  carrinho.length === 0 ||
                  !solicitanteId ||
                  !retiradoPorId ||
                  !departmentId ||
                  !segmentId
                }
              >
                {finalizando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finalizando…
                  </>
                ) : (
                  'Finalizar lançamento'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ComprovanteConsumoInternoModal
        open={showComprovanteModal}
        onClose={() => {
          setShowComprovanteModal(false)
          setComprovanteData(null)
        }}
        dados={comprovanteData}
      />

      <ModalGramasKg
        open={!!produtoParaGramas}
        onOpenChange={(open) => !open && setProdutoParaGramas(null)}
        produtoNome={produtoParaGramas?.nome ?? ''}
        precoPorKg={produtoParaGramas?.valor_custo ?? 0}
        labelValor="custo"
        onConfirm={(gramas) => {
          if (produtoParaGramas) {
            adicionarAoCarrinho(produtoParaGramas, undefined, undefined, gramas)
            setProdutoSelectOpen(false)
            setBuscaProduto('')
          }
          setProdutoParaGramas(null)
        }}
      />

      {/* Modal escolher variação */}
      <Dialog open={!!produtoVariacaoModal} onOpenChange={(open) => !open && setProdutoVariacaoModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolha a variação</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {produtoVariacaoModal?.variacoes?.map((variacao) => (
              <div key={variacao.id} className="mb-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">{variacao.nome ?? 'Variação'}</p>
                <div className="flex flex-wrap gap-2">
                  {(variacao.valores ?? []).map((v) => {
                    const ativo = v.ativo !== false
                    const temEstoque = v.estoque != null && v.estoque > 0
                    const label = nomeVariacaoValor(v)
                    return (
                      <Button
                        key={v.id}
                        variant="outline"
                        size="sm"
                        disabled={!ativo || !temEstoque}
                        onClick={() => adicionarAoCarrinho(produtoVariacaoModal!, v.id, label)}
                      >
                        {label}
                        {v.estoque != null && <span className="ml-1 text-muted-foreground">({v.estoque})</span>}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdutoVariacaoModal(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
