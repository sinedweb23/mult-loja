'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { carregarCarrinho, salvarCarrinho, limparCarrinho, type ItemCarrinho } from '@/lib/carrinho'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { CHECKOUT_PAYLOAD_KEY } from '@/lib/carrinho'
import { obterDatasDiasUteisMes, obterDatasRetiradaDisponiveis } from '@/app/actions/dias-uteis'
import { CalendarioDiasUteis } from '@/components/loja/calendario-dias-uteis'
import { verificarSlotKitFestaDisponivel } from '@/app/actions/kit-festa'
import Link from 'next/link'

export default function CarrinhoPage() {
  const router = useRouter()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loading, setLoading] = useState(true)
  const [dataRetirada, setDataRetirada] = useState('')
  const [datasDisponiveis, setDatasDisponiveis] = useState<string[]>([])
  const [empresaIdCalendario, setEmpresaIdCalendario] = useState<string | null>(null)
  const [carregandoDatasRetirada, setCarregandoDatasRetirada] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [erroCheckout, setErroCheckout] = useState<string | null>(null)

  useEffect(() => {
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    const carrinhoCarregado = carregarCarrinho()
    setCarrinho(carrinhoCarregado)
    setLoading(false)
  }, [router])

  const temApenasKitLanche = carrinho.length > 0 && carrinho.every((i) => i.produto.tipo === 'KIT_LANCHE')
  const temApenasKitFesta = carrinho.length > 0 && carrinho.every((i) => i.produto.tipo === 'KIT_FESTA')
  const precisaDataRetirada = carrinho.length > 0 && !temApenasKitLanche && !temApenasKitFesta

  useEffect(() => {
    if (!precisaDataRetirada) {
      setDatasDisponiveis([])
      return
    }
    setCarregandoDatasRetirada(true)
    obterDatasRetiradaDisponiveis()
      .then(({ datas, empresaId, erro }) => {
        setDatasDisponiveis(datas)
        setEmpresaIdCalendario(empresaId ?? null)
        if (erro) setErroCheckout(erro)
      })
      .catch(() => setDatasDisponiveis([]))
      .finally(() => setCarregandoDatasRetirada(false))
  }, [precisaDataRetirada])

  useEffect(() => {
    if (datasDisponiveis.length > 0 && dataRetirada && !datasDisponiveis.includes(dataRetirada)) {
      setDataRetirada(datasDisponiveis[0])
    }
    if (datasDisponiveis.length > 0 && !dataRetirada) {
      setDataRetirada(datasDisponiveis[0])
    }
  }, [datasDisponiveis, dataRetirada])

  function atualizarQuantidade(produtoId: string, alunoId: string, quantidade: number) {
    if (quantidade <= 0) {
      removerItem(produtoId, alunoId)
      return
    }

    const novoCarrinho = carrinho.map(item =>
      item.produto.id === produtoId && item.alunoId === alunoId
        ? { ...item, quantidade }
        : item
    )
    setCarrinho(novoCarrinho)
    salvarCarrinho(novoCarrinho)
  }

  function removerItem(produtoId: string, alunoId: string) {
    const novoCarrinho = carrinho.filter(
      item => !(item.produto.id === produtoId && item.alunoId === alunoId)
    )
    setCarrinho(novoCarrinho)
    salvarCarrinho(novoCarrinho)
  }

  function calcularTotal() {
    return carrinho.reduce((total, item) => {
      return total + (Number(item.produto.preco) * item.quantidade)
    }, 0)
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  /** Retorna a primeira data do mês (para dataPadrao quando só tem MENSAL). */
  function getPrimeiraDataDoMes(ano: number, mes: number): string {
    return `${ano}-${String(mes).padStart(2, '0')}-01`
  }

  function agruparPorAluno() {
    const agrupado: Record<string, ItemCarrinho[]> = {}
    carrinho.forEach(item => {
      if (!agrupado[item.alunoId]) {
        agrupado[item.alunoId] = []
      }
      agrupado[item.alunoId].push(item)
    })
    return agrupado
  }

  async function finalizarCompra() {
    const agrupado = agruparPorAluno()
    const temItensNormais = Object.values(agrupado).some((itens) =>
      itens.some((i) => i.produto.tipo !== 'KIT_LANCHE' && i.produto.tipo !== 'KIT_FESTA')
    )
    const temItensKitLancheSemData = Object.values(agrupado).some((itens) =>
      itens.some((i) =>
        i.produto.tipo === 'KIT_LANCHE' &&
        (i.mesReferencia == null && (!i.diasSelecionados || i.diasSelecionados.length === 0))
      )
    )
    if (temItensNormais && !dataRetirada.trim()) {
      setErroCheckout('Escolha a data de retirada para os itens comuns')
      return
    }
    if (temItensKitLancheSemData) {
      setErroCheckout('Há itens Kit Lanche sem datas. Remova-os ou adicione novamente com as datas selecionadas.')
      return
    }
    const primeiroAluno = agrupado[Object.keys(agrupado)[0]]
    const primeiroItem = primeiroAluno?.[0]
    const dataPadrao =
      dataRetirada.trim() ||
      primeiroItem?.diasSelecionados?.[0] ||
      (primeiroItem?.mesReferencia != null && primeiroItem?.anoReferencia != null
        ? getPrimeiraDataDoMes(primeiroItem.anoReferencia, primeiroItem.mesReferencia)
        : '') ||
      (primeiroItem?.kitFestaData ?? '')
    if (temItensNormais && !dataPadrao) {
      setErroCheckout('Escolha a data de retirada')
      return
    }
    if (!dataPadrao) {
      setErroCheckout('Não foi possível definir a data de retirada. Verifique os itens do carrinho.')
      return
    }
    const itensKitFesta = carrinho.filter((i) => i.produto.tipo === 'KIT_FESTA' && i.kitFestaData && i.kitFestaHorario)
    for (const item of itensKitFesta) {
      const { disponivel, erro } = await verificarSlotKitFestaDisponivel(
        item.produto.id,
        item.kitFestaData!,
        item.kitFestaHorario!.inicio,
        item.kitFestaHorario!.fim
      )
      if (!disponivel) {
        setErroCheckout(erro || 'O horário selecionado não está mais disponível na agenda. Remova o item do carrinho e escolha outro horário na página do produto.')
        return
      }
    }
    setFinalizando(true)
    setErroCheckout(null)
    try {
      const pedidos: Array<{ alunoId: string; alunoNome?: string; dataRetirada: string; itens: Array<{
        produto_id: string; kit_produto_id: string | null; quantidade: number; preco_unitario: number; subtotal: number;
        data_retirada?: string | null; produto_nome?: string; variacoes_selecionadas?: Record<string, string>;
        tema_festa?: string; idade_festa?: number; kit_festa_data?: string; kit_festa_horario_inicio?: string; kit_festa_horario_fim?: string
        opcionais_selecionados?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
      }> }> = []
      for (const alunoId of Object.keys(agrupado)) {
        const itens: Array<{
          produto_id: string; kit_produto_id: string | null; quantidade: number; preco_unitario: number; subtotal: number;
          data_retirada?: string | null; produto_nome?: string; variacoes_selecionadas?: Record<string, string>;
          tema_festa?: string; idade_festa?: number; kit_festa_data?: string; kit_festa_horario_inicio?: string; kit_festa_horario_fim?: string
          opcionais_selecionados?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
        }> = []
        for (const item of agrupado[alunoId]) {
          const preco = Number(item.produto.preco)
          const produtoNome = item.produto.nome ?? 'Produto'
          const variacoes = item.variacoesSelecionadas ?? {}
          if (item.mesReferencia != null && item.anoReferencia != null && item.empresaId && (item.diasUteis ?? 0) > 0) {
            const totalMes = preco * item.quantidade
            const datas = await obterDatasDiasUteisMes(item.empresaId, item.anoReferencia, item.mesReferencia)
            const precoPorDia = datas.length > 0 ? totalMes / datas.length : 0
            for (const dia of datas) {
              itens.push({
                produto_id: item.produto.id,
                kit_produto_id: null,
                quantidade: 1,
                preco_unitario: precoPorDia,
                subtotal: precoPorDia,
                data_retirada: dia,
                produto_nome: produtoNome,
                variacoes_selecionadas: Object.keys(variacoes).length > 0 ? variacoes : undefined,
              })
            }
          } else if (item.diasSelecionados && item.diasSelecionados.length > 0) {
            for (const dia of item.diasSelecionados) {
              itens.push({
                produto_id: item.produto.id,
                kit_produto_id: null,
                quantidade: 1,
                preco_unitario: preco,
                subtotal: preco,
                data_retirada: dia,
                produto_nome: produtoNome,
                variacoes_selecionadas: Object.keys(variacoes).length > 0 ? variacoes : undefined,
              })
            }
          } else {
            const qtd = item.quantidade
            const dataRetiradaItem =
              item.kitFestaData ??
              (item.produto.tipo !== 'KIT_LANCHE' && item.produto.tipo !== 'KIT_FESTA' ? dataPadrao : null)
            const base = {
              produto_id: item.produto.id,
              kit_produto_id: null,
              quantidade: qtd,
              preco_unitario: preco,
              subtotal: preco * qtd,
              data_retirada: dataRetiradaItem,
              produto_nome: produtoNome,
              variacoes_selecionadas: Object.keys(variacoes).length > 0 ? variacoes : undefined,
              opcionais_selecionados: item.opcionaisSelecionados ?? [],
            }
            if (item.kitFestaData && item.kitFestaHorario && item.temaFesta && item.idadeFesta != null) {
              itens.push({
                ...base,
                tema_festa: item.temaFesta,
                idade_festa: item.idadeFesta,
                kit_festa_data: item.kitFestaData,
                kit_festa_horario_inicio: item.kitFestaHorario.inicio,
                kit_festa_horario_fim: item.kitFestaHorario.fim,
              })
            } else {
              itens.push(base)
            }
          }
        }
        const primeiroItem = agrupado[alunoId][0]
        // Opção A: 1 pedido por data_retirada (para kit lanche mensal cada dia vira um pedido; no PDV "marcar entregue" afeta só aquele dia)
        const itensPorData = new Map<string, typeof itens>()
        for (const i of itens) {
          const data = i.data_retirada ?? dataPadrao
          if (!data) continue
          if (!itensPorData.has(data)) itensPorData.set(data, [])
          itensPorData.get(data)!.push(i)
        }
        for (const [dataRetirada, itensDoDia] of itensPorData) {
          pedidos.push({
            alunoId,
            alunoNome: primeiroItem?.alunoNome ?? undefined,
            dataRetirada,
            itens: itensDoDia,
          })
        }
      }
      sessionStorage.setItem(CHECKOUT_PAYLOAD_KEY, JSON.stringify({ tipo: 'PEDIDO_LOJA', payload: { pedidos } }))
      router.push('/loja/checkout')
    } catch (e) {
      setErroCheckout(e instanceof Error ? e.message : 'Erro ao preparar checkout')
    } finally {
      setFinalizando(false)
    }
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto p-6 max-w-6xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Carregando carrinho...</p>
          </div>
        </div>
      </>
    )
  }

  if (carrinho.length === 0) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto p-6 max-w-6xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Carrinho de Compras</h1>
            <p className="text-muted-foreground">
              Seu carrinho está vazio
            </p>
          </div>

          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <div className="text-6xl mb-4">🛒</div>
              <h2 className="text-2xl font-semibold mb-2">Seu carrinho está vazio</h2>
              <p className="text-muted-foreground mb-6">
                Adicione produtos ao carrinho para continuar
              </p>
              <Link href="/loja">
                <Button size="lg">Ver Produtos</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  const agrupadoPorAluno = agruparPorAluno()

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto p-6 max-w-6xl pb-24 sm:pb-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Carrinho de Compras</h1>
            <p className="text-muted-foreground">
              {carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'} no carrinho
              {temApenasKitFesta && (
                <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                  Pedido exclusivo Kit Festa
                </span>
              )}
            </p>
          </div>
          <Link href="/loja">
            <Button variant="outline">Continuar Comprando</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de itens */}
          <div className="lg:col-span-2 space-y-4">
            {Object.entries(agrupadoPorAluno).map(([alunoId, itens]) => {
              const primeiroItem = itens[0]
              return (
                <Card key={alunoId} className={temApenasKitFesta ? 'border-primary/30 bg-primary/5' : ''}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Para: {primeiroItem.alunoNome}
                      {temApenasKitFesta && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">(Kit Festa)</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {itens.map((item, index) => (
                      <div
                        key={`${item.produto.id}-${item.alunoId}-${index}`}
                        className="flex flex-col sm:flex-row items-stretch sm:items-start gap-4 pb-4 border-b last:border-0"
                      >
                        <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                          {item.produto.imagem_url ? (
                            <img
                              src={item.produto.imagem_url}
                              alt={item.produto.nome}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget
                                target.style.display = 'none'
                                const placeholder = target.parentElement?.querySelector('.placeholder-carrinho') as HTMLElement
                                if (placeholder) {
                                  placeholder.style.display = 'flex'
                                }
                              }}
                            />
                          ) : null}
                          <div className={`placeholder-carrinho absolute inset-0 flex items-center justify-center ${item.produto.imagem_url ? 'hidden' : ''}`}>
                            <span className="text-2xl">
                              {item.produto.tipo === 'PRODUTO' ? '📦' : item.produto.tipo === 'SERVICO' ? '🔧' : '🎁'}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg mb-1">{item.produto.nome}</h3>
                          {item.produto.descricao && item.produto.tipo !== 'KIT_FESTA' && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {item.produto.descricao}
                            </p>
                          )}
                          {/* Kit Festa: lista clara, uma linha por informação, texto quebra em várias linhas */}
                          {item.produto.tipo === 'KIT_FESTA' && (item.kitFestaData || item.temaFesta) && (
                            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2 mb-2 max-w-full overflow-hidden">
                              {item.kitFestaData && (
                                <p className="break-words"><span className="font-medium text-muted-foreground">Data:</span>{' '}{new Date(item.kitFestaData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                              )}
                              {item.kitFestaHorario && (
                                <p className="break-words"><span className="font-medium text-muted-foreground">Horário:</span>{' '}{item.kitFestaHorario.inicio} às {item.kitFestaHorario.fim}</p>
                              )}
                              {item.temaFesta && (
                                <p className="break-words"><span className="font-medium text-muted-foreground">Tema:</span>{' '}{item.temaFesta}</p>
                              )}
                              {item.idadeFesta != null && (
                                <p className="break-words"><span className="font-medium text-muted-foreground">Idade:</span>{' '}{item.idadeFesta} {item.idadeFesta === 1 ? 'ano' : 'anos'}</p>
                              )}
                              {item.variacoesSelecionadas && Object.keys(item.variacoesSelecionadas).length > 0 && (
                                <div className="space-y-1.5 pt-1.5 border-t border-border/50">
                                  <p className="font-medium text-muted-foreground">Variações</p>
                                  <ul className="list-none space-y-1">
                                    {Object.entries(item.variacoesSelecionadas).map(([nome, valor]) => (
                                      <li key={nome} className="text-foreground break-words">
                                        <span className="text-muted-foreground">{nome}:</span>{' '}{valor}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {item.opcionaisSelecionados && item.opcionaisSelecionados.length > 0 && (
                                <div className="space-y-1 pt-1.5 border-t border-border/50">
                                  <p className="font-medium text-muted-foreground">Opcionais</p>
                                  <ul className="list-none text-foreground break-words space-y-0.5">
                                    {item.opcionaisSelecionados.map((opcional) => (
                                      <li key={opcional.opcional_id}>
                                        {opcional.nome}{opcional.quantidade > 1 ? ` (${opcional.quantidade}x)` : ''}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Para não-Kit Festa: variações e opcionais */}
                          {item.produto.tipo !== 'KIT_FESTA' && item.variacoesSelecionadas && Object.keys(item.variacoesSelecionadas).length > 0 && (
                            <div className="text-sm text-muted-foreground mb-2">
                              {Object.entries(item.variacoesSelecionadas).map(([nome, valor]) => (
                                <div key={nome} className="inline-block mr-2">
                                  <span className="font-medium">{nome}:</span> {valor}
                                </div>
                              ))}
                            </div>
                          )}
                          {item.produto.tipo !== 'KIT_FESTA' && item.opcionaisSelecionados && item.opcionaisSelecionados.length > 0 && (
                            <div className="text-sm text-muted-foreground mb-2">
                              <span className="font-medium">Adicionais:</span>
                              {item.opcionaisSelecionados.map((opcional, idx) => (
                                <span key={opcional.opcional_id} className="ml-1">
                                  {opcional.nome}
                                  {opcional.quantidade > 1 && ` (${opcional.quantidade}x)`}
                                  {idx < item.opcionaisSelecionados!.length - 1 && ', '}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Kit Lanche MENSAL: mês/ano e dias úteis */}
                          {item.produto.tipo === 'KIT_LANCHE' && item.mesReferencia != null && item.anoReferencia != null && (
                            <div className="text-sm text-muted-foreground mt-2">
                              {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][item.mesReferencia - 1]}/{item.anoReferencia}
                              {item.diasUteis != null && item.diasUteis > 0 && (
                                <span> — {item.diasUteis} dia(s) útil(eis)</span>
                              )}
                            </div>
                          )}
                          {/* Dias selecionados (Kit Lanche AVULSO) */}
                          {item.produto.tipo === 'KIT_LANCHE' && !item.mesReferencia && item.diasSelecionados && item.diasSelecionados.length > 0 && (
                            <div className="text-sm text-muted-foreground mt-2">
                              {item.diasSelecionados.map(d => {
                                const parts = d.split('-')
                                return `${parts[2]}/${parts[1]}`
                              }).join(', ')}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-3">
                            {item.produto.tipo === 'KIT_FESTA' && (
                              <span className="text-sm text-muted-foreground">Quantidade: 1</span>
                            )}
                            {item.produto.tipo === 'KIT_LANCHE' && (item.mesReferencia != null || (item.diasSelecionados && item.diasSelecionados.length > 0)) ? (
                              <span className="text-sm text-muted-foreground">
                                {item.mesReferencia != null
                                  ? `1 mês`
                                  : `Quantidade: ${item.quantidade} dias`}
                              </span>
                            ) : item.produto.tipo === 'KIT_LANCHE' ? null : item.produto.tipo !== 'KIT_FESTA' ? (
                            <div className="flex items-center gap-2 border rounded-md">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => atualizarQuantidade(item.produto.id, item.alunoId, item.quantidade - 1)}
                              >
                                −
                              </Button>
                              <span className="w-12 text-center font-medium">{item.quantidade}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => atualizarQuantidade(item.produto.id, item.alunoId, item.quantidade + 1)}
                              >
                                +
                              </Button>
                            </div>
                            ) : null}
                            {item.produto.tipo === 'KIT_LANCHE' && !item.mesReferencia && (!item.diasSelecionados || item.diasSelecionados.length === 0) && (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removerItem(item.produto.id, item.alunoId)}
                              className="text-destructive hover:text-destructive"
                            >
                              Remover
                            </Button>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold">
                            {formatPrice(Number(item.produto.preco) * item.quantidade)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {item.mesReferencia != null
                              ? 'Total do mês'
                              : `${formatPrice(Number(item.produto.preco))} cada`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Resumo do pedido */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {temApenasKitLanche && !temApenasKitFesta && (
                    <p className="text-sm text-muted-foreground">
                      As datas de retirada já foram definidas em cada item (Kit Lanche).
                    </p>
                  )}
                  {!temApenasKitLanche && !temApenasKitFesta && (
                    <div className="space-y-2">
                      <Label>Data de retirada</Label>
                      {carregandoDatasRetirada ? (
                        <p className="text-sm text-muted-foreground py-2">Carregando calendário...</p>
                      ) : !empresaIdCalendario ? (
                        <p className="text-sm text-amber-600 py-2">
                          Não foi possível carregar o calendário da escola. Verifique se há aluno vinculado.
                        </p>
                      ) : (
                        <CalendarioDiasUteis
                          empresaId={empresaIdCalendario}
                          diasSelecionados={dataRetirada ? [dataRetirada] : []}
                          onSelecaoChange={(dias) => setDataRetirada(dias[0] ?? '')}
                          minDias={1}
                          maxDias={1}
                          ocultarDescricao
                        />
                      )}
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(calcularTotal())}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-2xl font-bold">{formatPrice(calcularTotal())}</span>
                    </div>
                  </div>
                </div>
                {erroCheckout && (
                  <p className="text-sm text-destructive">{erroCheckout}</p>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={finalizarCompra}
                  disabled={
                    finalizando ||
                    (precisaDataRetirada && (carregandoDatasRetirada || !empresaIdCalendario || !dataRetirada))
                  }
                >
                  {finalizando ? 'Finalizando...' : 'Finalizar Compra'}
                </Button>

                <Link href="/loja" className="block">
                  <Button variant="outline" className="w-full">
                    Continuar Comprando
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
