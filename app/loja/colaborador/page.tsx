'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  obterSaldoNegativoColaborador,
  obterExtratoConsumoColaborador,
  obterExtratoBaixasColaborador,
  obterPedidosColaborador,
  obterNomeColaborador,
  type ConsumoMensalColaborador,
  type BaixaColaborador,
  type PedidoColaborador,
} from '@/app/actions/colaborador'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Retorna true se ano/mes está dentro do intervalo [dataInicio, dataFim] (inclusive). */
function mesNoPeriodo(ano: number, mes: number, dataInicio: string, dataFim: string): boolean {
  if (!dataInicio && !dataFim) return true
  const primeiroDia = new Date(ano, mes - 1, 1)
  if (dataInicio) {
    const ini = new Date(dataInicio + 'T00:00:00')
    if (primeiroDia < ini) return false
  }
  if (dataFim) {
    const fim = new Date(dataFim + 'T23:59:59')
    const ultimoDia = new Date(ano, mes, 0, 23, 59, 59)
    if (ultimoDia > fim) return false
  }
  return true
}

export default function LojaColaboradorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [nomeUsuario, setNomeUsuario] = useState<string | null>(null)
  const [saldoNegativo, setSaldoNegativo] = useState<number | null>(null)
  const [consumo, setConsumo] = useState<ConsumoMensalColaborador[]>([])
  const [baixas, setBaixas] = useState<BaixaColaborador[]>([])
  const [pedidos, setPedidos] = useState<PedidoColaborador[]>([])

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [paginaCompras, setPaginaCompras] = useState(1)
  const [paginaConsumo, setPaginaConsumo] = useState(1)
  const [paginaBaixas, setPaginaBaixas] = useState(1)

  useEffect(() => {
    carregarDados().catch(() => router.replace('/login?message=session_nao_encontrada'))
  }, [router])

  async function carregarDados() {
    setLoading(true)
    try {
      const [nome, saldo, extratoConsumo, extratoBaixas, listaPedidos] = await Promise.all([
        obterNomeColaborador(),
        obterSaldoNegativoColaborador(),
        obterExtratoConsumoColaborador(),
        obterExtratoBaixasColaborador(),
        obterPedidosColaborador(),
      ])
      setNomeUsuario(nome)
      setSaldoNegativo(saldo)
      setConsumo(extratoConsumo)
      setBaixas(extratoBaixas)
      setPedidos(listaPedidos)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const pedidosFiltrados = useMemo(() => {
    if (!dataInicio && !dataFim) return pedidos
    return pedidos.filter((p) => {
      const d = new Date(p.created_at)
      if (dataInicio) {
        const ini = new Date(dataInicio + 'T00:00:00')
        if (d < ini) return false
      }
      if (dataFim) {
        const fim = new Date(dataFim + 'T23:59:59')
        if (d > fim) return false
      }
      return true
    })
  }, [pedidos, dataInicio, dataFim])

  const consumoFiltrado = useMemo(() => {
    return consumo.filter((c) => mesNoPeriodo(c.ano, c.mes, dataInicio, dataFim))
  }, [consumo, dataInicio, dataFim])

  const baixasFiltradas = useMemo(() => {
    if (!dataInicio && !dataFim) return baixas
    return baixas.filter((b) => {
      const d = new Date(b.updated_at)
      if (dataInicio) {
        const ini = new Date(dataInicio + 'T00:00:00')
        if (d < ini) return false
      }
      if (dataFim) {
        const fim = new Date(dataFim + 'T23:59:59')
        if (d > fim) return false
      }
      return true
    })
  }, [baixas, dataInicio, dataFim])

  const totalPaginasCompras = Math.max(1, Math.ceil(pedidosFiltrados.length / PAGE_SIZE))
  const totalPaginasConsumo = Math.max(1, Math.ceil(consumoFiltrado.length / PAGE_SIZE))
  const totalPaginasBaixas = Math.max(1, Math.ceil(baixasFiltradas.length / PAGE_SIZE))

  const pedidosPaginados = useMemo(
    () =>
      pedidosFiltrados.slice(
        (paginaCompras - 1) * PAGE_SIZE,
        paginaCompras * PAGE_SIZE
      ),
    [pedidosFiltrados, paginaCompras]
  )
  const consumoPaginado = useMemo(
    () =>
      consumoFiltrado.slice(
        (paginaConsumo - 1) * PAGE_SIZE,
        paginaConsumo * PAGE_SIZE
      ),
    [consumoFiltrado, paginaConsumo]
  )
  const baixasPaginadas = useMemo(
    () =>
      baixasFiltradas.slice(
        (paginaBaixas - 1) * PAGE_SIZE,
        paginaBaixas * PAGE_SIZE
      ),
    [baixasFiltradas, paginaBaixas]
  )

  function resetPaginacao() {
    setPaginaCompras(1)
    setPaginaConsumo(1)
    setPaginaBaixas(1)
  }

  return (
    <>
      <LojaHeader />
      <div
        className="min-h-screen container mx-auto p-6 max-w-3xl"
        style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}
      >
        <Card className="mb-6 border-[var(--cantina-border)] shadow-[var(--cantina-shadow)] overflow-hidden">
          <CardHeader className="bg-[var(--cantina-primary)] text-white border-0">
            <CardTitle className="text-xl">
              Olá{(() => {
                const primeiro = nomeUsuario?.trim().split(/\s+/)[0]
                return primeiro ? `, ${primeiro}` : ''
              })()}
            </CardTitle>
            <CardDescription className="text-white/90">
            Acompanhe suas compras na cantina e o saldo para desconto em folha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 bg-white">
            {loading ? (
              <div className="flex justify-center py-8">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--cantina-primary)] border-t-transparent"
                  aria-hidden
                />
              </div>
            ) : (
              <>
                {/* Saldo em aberto */}
                <div
                  className="rounded-xl border-l-4 border-[var(--cantina-primary)] p-4"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--cantina-primary) 10%, white)' }}
                >
                  <p className="text-sm font-medium text-[var(--cantina-text-muted)]">
                    Saldo em aberto (a descontar em folha)
                  </p>
                  <p className="text-2xl font-bold text-[var(--cantina-primary)]">
                    {saldoNegativo != null ? formatPrice(saldoNegativo) : '-'}
                  </p>
                  {saldoNegativo != null && saldoNegativo > 0 && (
                    <p className="text-xs text-[var(--cantina-text-muted)] mt-1">
                      Valor total do consumo ainda não abatido pelo RH.
                    </p>
                  )}
                </div>

                <Tabs defaultValue="compras" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-11 bg-[var(--cantina-border)] p-1 rounded-xl">
                    <TabsTrigger
                      value="compras"
                      className="rounded-lg data-[state=active]:bg-[var(--cantina-primary)] data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Extrato de compra
                    </TabsTrigger>
                    <TabsTrigger
                      value="baixas"
                      className="rounded-lg data-[state=active]:bg-[var(--cantina-primary)] data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Extrato de baixas
                    </TabsTrigger>
                  </TabsList>

                  {/* Filtro por período (compartilhado entre as abas) */}
                  <div className="mt-4 flex flex-wrap gap-3 items-end p-3 rounded-xl bg-[var(--cantina-background)] border border-[var(--cantina-border)]">
                    <div>
                      <label className="block text-xs font-medium text-[var(--cantina-text-muted)] mb-1">
                        Data início
                      </label>
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => {
                          setDataInicio(e.target.value)
                          resetPaginacao()
                        }}
                        className="rounded-lg border border-[var(--cantina-border)] px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--cantina-text-muted)] mb-1">
                        Data fim
                      </label>
                      <input
                        type="date"
                        value={dataFim}
                        onChange={(e) => {
                          setDataFim(e.target.value)
                          resetPaginacao()
                        }}
                        className="rounded-lg border border-[var(--cantina-border)] px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    {(dataInicio || dataFim) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDataInicio('')
                          setDataFim('')
                          resetPaginacao()
                        }}
                        className="text-[var(--cantina-text-muted)]"
                      >
                        Limpar filtro
                      </Button>
                    )}
                  </div>

                  <TabsContent value="compras" className="space-y-4 mt-4">
                    <Card className="border-[var(--cantina-border)] shadow-[var(--cantina-shadow-sm)]">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-[var(--cantina-text)] flex items-center gap-2">
                          <span className="w-1 h-5 rounded-full bg-[var(--cantina-primary)]" />
                          Compras (pedidos)
                        </CardTitle>
                        <CardDescription className="text-[var(--cantina-text-muted)]">
                          Pedidos realizados por você no caixa da cantina.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {pedidosFiltrados.length === 0 ? (
                          <p className="text-sm text-[var(--cantina-text-muted)]">Nenhum pedido no período.</p>
                        ) : (
                          <>
                            <ul className="space-y-3">
                              {pedidosPaginados.map((p) => (
                                <li key={p.id} className="border-b border-[var(--cantina-border)] pb-3 last:border-0 last:pb-0">
                                  <div className="flex justify-between items-start">
                                    <span className="text-sm text-[var(--cantina-text-muted)]">
                                      {formatDate(p.created_at)}
                                      {p.origem ? ` · ${p.origem}` : ''}
                                    </span>
                                    <span className="font-medium text-[var(--cantina-text)]">{formatPrice(p.total)}</span>
                                  </div>
                                  <ul className="mt-1 text-sm text-[var(--cantina-text-muted)]">
                                    {p.itens.map((item, i) => (
                                      <li key={i}>
                                        {item.quantidade}x {item.produto_nome} — {formatPrice(item.subtotal)}
                                      </li>
                                    ))}
                                  </ul>
                                </li>
                              ))}
                            </ul>
                            {pedidosFiltrados.length > PAGE_SIZE && (
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--cantina-border)] text-sm text-[var(--cantina-text-muted)]">
                                <span>
                                  Página {paginaCompras} de {totalPaginasCompras}
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaCompras <= 1}
                                    onClick={() => setPaginaCompras((p) => Math.max(1, p - 1))}
                                    className="h-8"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaCompras >= totalPaginasCompras}
                                    onClick={() => setPaginaCompras((p) => Math.min(totalPaginasCompras, p + 1))}
                                    className="h-8"
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-[var(--cantina-border)] shadow-[var(--cantina-shadow-sm)]">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-[var(--cantina-text)] flex items-center gap-2">
                          <span className="w-1 h-5 rounded-full bg-[var(--cantina-accent)]" />
                          Consumo por mês
                        </CardTitle>
                        <CardDescription className="text-[var(--cantina-text-muted)]">
                          Resumo mensal do seu consumo (valor total e já abatido).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {consumoFiltrado.length === 0 ? (
                          <p className="text-sm text-[var(--cantina-text-muted)]">Nenhum registro no período.</p>
                        ) : (
                          <>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-[var(--cantina-border)]">
                                    <th className="text-left py-2 text-[var(--cantina-text-muted)] font-medium">Mês/Ano</th>
                                    <th className="text-right py-2 text-[var(--cantina-text-muted)] font-medium">Total</th>
                                    <th className="text-right py-2 text-[var(--cantina-text-muted)] font-medium">Abatido</th>
                                    <th className="text-right py-2 text-[var(--cantina-text-muted)] font-medium">Em aberto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {consumoPaginado.map((c) => (
                                    <tr key={c.id} className="border-b border-[var(--cantina-border)]">
                                      <td className="py-2 text-[var(--cantina-text)]">{String(c.mes).padStart(2, '0')}/{c.ano}</td>
                                      <td className="text-right py-2 text-[var(--cantina-text)]">{formatPrice(c.valor_total)}</td>
                                      <td className="text-right py-2 text-[var(--cantina-success)]">{formatPrice(c.valor_abatido)}</td>
                                      <td className="text-right py-2 text-[var(--cantina-text)]">{formatPrice(c.valor_total - c.valor_abatido)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {consumoFiltrado.length > PAGE_SIZE && (
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--cantina-border)] text-sm text-[var(--cantina-text-muted)]">
                                <span>
                                  Página {paginaConsumo} de {totalPaginasConsumo}
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaConsumo <= 1}
                                    onClick={() => setPaginaConsumo((p) => Math.max(1, p - 1))}
                                    className="h-8"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaConsumo >= totalPaginasConsumo}
                                    onClick={() => setPaginaConsumo((p) => Math.min(totalPaginasConsumo, p + 1))}
                                    className="h-8"
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="baixas" className="mt-4">
                    <Card className="border-[var(--cantina-border)] shadow-[var(--cantina-shadow-sm)]">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-[var(--cantina-text)] flex items-center gap-2">
                          <span className="w-1 h-5 rounded-full bg-[var(--cantina-success)]" />
                          Baixas de pagamento
                        </CardTitle>
                        <CardDescription className="text-[var(--cantina-text-muted)]">
                          Valores já descontados/abatidos pelo setor RH (desconto em folha).
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {baixasFiltradas.length === 0 ? (
                          <p className="text-sm text-[var(--cantina-text-muted)]">Nenhuma baixa no período.</p>
                        ) : (
                          <>
                            <ul className="space-y-3">
                              {baixasPaginadas.map((b) => (
                                <li key={b.id} className="flex justify-between items-center border-b border-[var(--cantina-border)] pb-3 last:border-0 last:pb-0">
                                  <div>
                                    <span className="font-medium text-[var(--cantina-text)]">{String(b.mes).padStart(2, '0')}/{b.ano}</span>
                                    {b.empresa_nome && (
                                      <span className="text-[var(--cantina-text-muted)] text-sm ml-2">· {b.empresa_nome}</span>
                                    )}
                                    <p className="text-xs text-[var(--cantina-text-muted)]">
                                      Registrado em {formatDate(b.updated_at)}
                                    </p>
                                  </div>
                                  <span className="text-[var(--cantina-success)] font-medium">- {formatPrice(b.valor_abatido)}</span>
                                </li>
                              ))}
                            </ul>
                            {baixasFiltradas.length > PAGE_SIZE && (
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--cantina-border)] text-sm text-[var(--cantina-text-muted)]">
                                <span>
                                  Página {paginaBaixas} de {totalPaginasBaixas}
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaBaixas <= 1}
                                    onClick={() => setPaginaBaixas((p) => Math.max(1, p - 1))}
                                    className="h-8"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={paginaBaixas >= totalPaginasBaixas}
                                    onClick={() => setPaginaBaixas((p) => Math.min(totalPaginasBaixas, p + 1))}
                                    className="h-8"
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                <Button
                  variant="outline"
                  onClick={() => router.push('/escolher-modo')}
                  className="border-[var(--cantina-primary)] text-[var(--cantina-primary)] hover:bg-[var(--cantina-primary)]/10"
                >
                  Trocar perfil
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
