'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { obterDashboard, type DashboardPayload } from '@/app/actions/dashboard'
import { todayISO } from '@/lib/date'
import { Wallet, AlertTriangle, ShoppingCart, Calendar, ExternalLink, Users, UserCheck, Briefcase } from 'lucide-react'
import Link from 'next/link'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const CORES = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#84cc16']

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataFiltro, setDataFiltro] = useState(() => todayISO())
  const [dataInicioConsumo, setDataInicioConsumo] = useState(() => todayISO())
  const [dataFimConsumo, setDataFimConsumo] = useState(() => todayISO())

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await obterDashboard(dataFiltro, dataInicioConsumo, dataFimConsumo)
      setData(payload ?? null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [dataFiltro, dataInicioConsumo, dataFimConsumo])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    )
  }

  const payload = data ?? {
    creditosCarteira: 0,
    pedidosNaoTratados: 0,
    pedidosEntregues: 0,
    pedidosTotal: 0,
    consumoPorCategoria: [],
    topProdutos: [],
    estatisticasAcessoCompra: {
      responsaveisTotal: 0,
      responsaveisComLogin: 0,
      responsaveisComPedido: 0,
      colaboradoresTotal: 0,
      colaboradoresComLogin: 0,
      colaboradoresComConsumo: 0,
    },
  }

  // Gráfico usa quantidade (unidades/kits) para refletir a nova lógica do kit mensal (1 kit = 1, não soma de dias)
  const dadosGrafico = payload.consumoPorCategoria.map((c, i) => ({
    name: c.categoria,
    value: c.quantidade,
    valor: c.valor,
    fill: CORES[i % CORES.length],
  }))

  return (
    <div className="space-y-6">
      {/* Data para KPIs (pedidos não tratados/entregues) */}
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="data-filtro-kpi" className="text-sm text-muted-foreground">Data para pedidos do dia:</Label>
        <Input
          id="data-filtro-kpi"
          type="date"
          value={dataFiltro}
          onChange={(e) => setDataFiltro(e.target.value)}
          className="w-40"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Créditos em Carteira
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${payload.creditosCarteira < 0 ? 'text-destructive' : ''}`}>
              {formatPrice(payload.creditosCarteira)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Soma do saldo de todos os alunos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Pedidos não tratados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{payload.pedidosNaoTratados}</p>
            <p className="text-xs text-muted-foreground mt-1">Aguardando retirada no balcão</p>
            {(() => {
              const ate = dataFiltro ? encodeURIComponent(dataFiltro) : null
              const href = ate ? `/pdv/pedidos?modo=nao-entregues&ate=${ate}` : `/pdv/pedidos?modo=nao-entregues`
              return (
            <Link
              href={href}
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Ver em PDV/Pedidos →
            </Link>
              )
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Pedidos entregues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {payload.pedidosEntregues} / {payload.pedidosTotal}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Retirados no dia</p>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas de consumo */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            Estatísticas de consumo
            <Link href="/admin/relatorios" className="text-muted-foreground hover:text-foreground" title="Ver relatórios">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="data-inicio-consumo" className="text-sm text-muted-foreground">De:</Label>
              <Input
                id="data-inicio-consumo"
                type="date"
                value={dataInicioConsumo}
                onChange={(e) => setDataInicioConsumo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="data-fim-consumo" className="text-sm text-muted-foreground">Até:</Label>
              <Input
                id="data-fim-consumo"
                type="date"
                value={dataFimConsumo}
                onChange={(e) => setDataFimConsumo(e.target.value)}
                className="w-40"
              />
            </div>
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Consumo por categoria */}
            <div>
              <h3 className="font-semibold mb-3">Consumo por categoria</h3>
              {payload.consumoPorCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
              ) : (
                <div className="space-y-2">
                  {payload.consumoPorCategoria.map((c, i) => (
                    <div
                      key={c.categoria}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white"
                          style={{ backgroundColor: CORES[i % CORES.length] }}
                        >
                          {c.quantidade}
                        </div>
                        <span>{c.categoria}</span>
                      </div>
                      <span className="font-medium">{formatPrice(c.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Donut chart */}
            <div className="flex items-center justify-center h-[280px]">
              {dadosGrafico.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosGrafico}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {dadosGrafico.map((_, i) => (
                        <Cell key={i} fill={dadosGrafico[i].fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => {
                        const payload = props?.payload as { valor?: number; name?: string }
                        const qtd = value != null ? Number(value) : 0
                        const val = payload?.valor != null ? formatPrice(payload.valor) : ''
                        return [`${qtd} un. · ${val}`, name]
                      }}
                      labelFormatter={() => ''}
                    />
                    <Legend verticalAlign="bottom" align="center" height={42} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum dado para o gráfico.</p>
              )}
            </div>

            {/* Top 5 produtos */}
            <div>
              <h3 className="font-semibold mb-3">Top 5 produtos consumidos</h3>
              {payload.topProdutos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
              ) : (
                <div className="space-y-2">
                  {payload.topProdutos.map((p, i) => (
                    <div
                      key={p.produto_nome}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0"
                          style={{ backgroundColor: CORES[i % CORES.length] }}
                        >
                          {p.quantidade}
                        </div>
                        <span className="truncate max-w-[140px]" title={p.produto_nome}>
                          {p.produto_nome}
                        </span>
                      </div>
                      <span className="font-medium shrink-0">{formatPrice(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas de acesso e compra */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Estatísticas de acesso e compra
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Responsáveis e colaboradores cadastrados, com login e com atividade (pedido/consumo)
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Responsáveis */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-primary">
                <UserCheck className="h-4 w-4" />
                Responsáveis
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <p className="text-muted-foreground">Cadastrados (ativos)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.responsaveisTotal}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Já acessaram (login)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.responsaveisComLogin}</p>
                  {payload.estatisticasAcessoCompra.responsaveisTotal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Math.round((payload.estatisticasAcessoCompra.responsaveisComLogin / payload.estatisticasAcessoCompra.responsaveisTotal) * 100)}% do total
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Já fizeram pedido (loja online)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.responsaveisComPedido}</p>
                  {payload.estatisticasAcessoCompra.responsaveisComLogin > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Math.round((payload.estatisticasAcessoCompra.responsaveisComPedido / payload.estatisticasAcessoCompra.responsaveisComLogin) * 100)}% dos que acessaram
                    </p>
                  )}
                </div>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { nome: 'Cadastrados', valor: payload.estatisticasAcessoCompra.responsaveisTotal, fill: CORES[0] },
                      { nome: 'Com login', valor: payload.estatisticasAcessoCompra.responsaveisComLogin, fill: CORES[1] },
                      { nome: 'Com pedido', valor: payload.estatisticasAcessoCompra.responsaveisComPedido, fill: CORES[2] },
                    ]}
                    margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number | undefined) => [v ?? 0, '']} labelFormatter={() => ''} />
                    <Bar dataKey="valor" name="Quantidade" radius={[4, 4, 0, 0]}>
                      {[CORES[0], CORES[1], CORES[2]].map((fill, i) => (
                        <Cell key={i} fill={fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Colaboradores */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-primary">
                <Briefcase className="h-4 w-4" />
                Colaboradores
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <p className="text-muted-foreground">Cadastrados (ativos)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.colaboradoresTotal}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Já acessaram (login)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.colaboradoresComLogin}</p>
                  {payload.estatisticasAcessoCompra.colaboradoresTotal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Math.round((payload.estatisticasAcessoCompra.colaboradoresComLogin / payload.estatisticasAcessoCompra.colaboradoresTotal) * 100)}% do total
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Já tiveram consumo (PDV)</p>
                  <p className="text-2xl font-bold">{payload.estatisticasAcessoCompra.colaboradoresComConsumo}</p>
                  {payload.estatisticasAcessoCompra.colaboradoresTotal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Math.round((payload.estatisticasAcessoCompra.colaboradoresComConsumo / payload.estatisticasAcessoCompra.colaboradoresTotal) * 100)}% dos cadastrados
                    </p>
                  )}
                </div>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { nome: 'Cadastrados', valor: payload.estatisticasAcessoCompra.colaboradoresTotal, fill: CORES[3] },
                      { nome: 'Com login', valor: payload.estatisticasAcessoCompra.colaboradoresComLogin, fill: CORES[4] },
                      { nome: 'Com consumo', valor: payload.estatisticasAcessoCompra.colaboradoresComConsumo, fill: CORES[5] },
                    ]}
                    margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number | undefined) => [v ?? 0, '']} labelFormatter={() => ''} />
                    <Bar dataKey="valor" name="Quantidade" radius={[4, 4, 0, 0]}>
                      {[CORES[3], CORES[4], CORES[5]].map((fill, i) => (
                        <Cell key={i} fill={fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
