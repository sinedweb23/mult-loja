'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  listarPedidosOnlineAdmin,
  atualizarDataRetiradaItemPedidoOnline,
  cancelarPedidoOnline,
  type PedidoOnlineAdmin,
  type PedidoOnlineAdminItem,
} from '@/app/actions/pedidos-online-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'

const hoje = new Date()
const ontem = new Date(hoje)
ontem.setDate(hoje.getDate() - 1)
const hojeStr = hoje.toISOString().slice(0, 10)
const ontemStr = ontem.toISOString().slice(0, 10)

export function PedidosOnlineClient({
  initialPedidos,
  initialDataInicio,
  initialDataFim,
  initialTermoAluno,
}: {
  initialPedidos: PedidoOnlineAdmin[]
  initialDataInicio: string
  initialDataFim: string
  initialTermoAluno: string
}) {
  const [pedidos, setPedidos] = useState<PedidoOnlineAdmin[]>(initialPedidos)
  const [dataInicio, setDataInicio] = useState(initialDataInicio)
  const [dataFim, setDataFim] = useState(initialDataFim)
  const [termoAluno, setTermoAluno] = useState(initialTermoAluno)
  const [isPending, startTransition] = useTransition()
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)

  function aplicarFiltro(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const lista = await listarPedidosOnlineAdmin({
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        termoAluno: termoAluno.trim() || null,
      })
      setPedidos(lista)
    })
  }

  async function handleAtualizarDataRetirada(pedidoId: string, itemId: string, novaDataRetirada: string) {
    if (!novaDataRetirada) return
    setAcaoEmAndamento(`data-${itemId}`)
    const res = await atualizarDataRetiradaItemPedidoOnline({ pedidoId, itemId, novaDataRetirada })
    setAcaoEmAndamento(null)
    if (res.ok) {
      startTransition(async () => {
        const lista = await listarPedidosOnlineAdmin({
          dataInicio: dataInicio || null,
          dataFim: dataFim || null,
          termoAluno: termoAluno.trim() || null,
        })
        setPedidos(lista)
      })
    }
  }

  async function handleCancelar(pedidoId: string) {
    if (!confirm('Cancelar este pedido? O valor será devolvido ao saldo do aluno e aparecerá no extrato.')) return
    setAcaoEmAndamento(`cancel-${pedidoId}`)
    const res = await cancelarPedidoOnline(pedidoId)
    setAcaoEmAndamento(null)
    if (res.ok) {
      startTransition(async () => {
        const lista = await listarPedidosOnlineAdmin({
          dataInicio: dataInicio || null,
          dataFim: dataFim || null,
          termoAluno: termoAluno.trim() || null,
        })
        setPedidos(lista)
      })
    } else {
      alert(res.erro ?? 'Erro ao cancelar')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Pedidos online</h1>
            <p className="text-muted-foreground text-sm">
              Listagem e edição de pedidos feitos na loja online (alunos).
            </p>
          </div>
        </div>

        <form onSubmit={aplicarFiltro} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataInicio">
              Data pedido (início)
            </label>
            <input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataFim">
              Data pedido (fim)
            </label>
            <input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs text-muted-foreground" htmlFor="termoAluno">
              Buscar por aluno (nome ou prontuário)
            </label>
            <div className="flex items-end gap-2">
              <input
                id="termoAluno"
                type="text"
                placeholder="Ex.: João, 12345"
                value={termoAluno}
                onChange={(e) => setTermoAluno(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Filtrar'}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum pedido online encontrado para o filtro selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido) => (
            <Card key={pedido.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">
                    {pedido.aluno.nome} ({pedido.aluno.prontuario})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium px-2 py-0.5 rounded ${
                        pedido.status === 'PAGO'
                          ? 'bg-green-100 text-green-800'
                          : pedido.status === 'ENTREGUE'
                            ? 'bg-blue-100 text-blue-800'
                            : pedido.status === 'CANCELADO'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {pedido.status}
                    </span>
                    {pedido.status === 'PAGO' || pedido.status === 'ENTREGUE' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={!!acaoEmAndamento}
                        onClick={() => handleCancelar(pedido.id)}
                      >
                        {acaoEmAndamento === `cancel-${pedido.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Cancelar pedido'
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedido #{pedido.id.slice(0, 8)} •{' '}
                  {new Date(pedido.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {pedido.aluno.turma_nome && (
                    <>
                      {' '}
                      • Turma: {pedido.aluno.turma_nome}
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  <span className="font-medium text-muted-foreground">Total:</span>{' '}
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(pedido.total)}
                </p>

                <div className="space-y-3">
                  {pedido.itens.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      pedido={pedido}
                      onSalvarData={(novaData) => handleAtualizarDataRetirada(pedido.id, item.id, novaData)}
                      acaoEmAndamento={acaoEmAndamento}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  pedido,
  onSalvarData,
  acaoEmAndamento,
}: {
  item: PedidoOnlineAdminItem
  pedido: PedidoOnlineAdmin
  onSalvarData: (novaData: string) => void
  acaoEmAndamento: string | null
}) {
  const temVariacao = Object.keys(item.variacoes_selecionadas || {}).length > 0
  const [dataRetiradaLocal, setDataRetiradaLocal] = useState(
    item.data_retirada ?? pedido.data_retirada ?? ''
  )

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{item.produto_nome ?? 'Produto'}</p>
          <p className="text-xs text-muted-foreground">
            Qtd: {item.quantidade} •{' '}
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(item.subtotal)}
          </p>
        </div>
      </div>

      {temVariacao && (
        <p className="text-xs text-muted-foreground">
          Variações:{' '}
          {Object.entries(item.variacoes_selecionadas)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')}
        </p>
      )}

      <div className="text-xs">
        <div className="space-y-1">
          <label className="block text-[11px] text-muted-foreground">Data retirada</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataRetiradaLocal}
              onChange={(e) => setDataRetiradaLocal(e.target.value)}
              className="flex-1 rounded border px-2 py-1 text-xs max-w-[180px]"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!acaoEmAndamento}
              onClick={() => onSalvarData(dataRetiradaLocal)}
            >
              {acaoEmAndamento === `data-${item.id}` ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
