import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from '@/app/actions/admin'
import { listarPedidosKitFesta, marcarPedidoFeitoAction } from '@/app/actions/pedidos-kit-festa'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Calendar, CheckCircle2 } from 'lucide-react'
import { AlterarDataKitFestaButton } from '@/components/admin/alterar-data-kit-festa-button'

function getCountdownInfo(kit_festa_data: string | null) {
  if (!kit_festa_data) return { label: null as string | null, className: '' }
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const festa = new Date(kit_festa_data + 'T00:00:00')
  festa.setHours(0, 0, 0, 0)
  const diffDias = Math.round((festa.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDias === 0) {
    return {
      label: 'É hoje',
      className:
        'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800',
    }
  }
  if (diffDias > 0) {
    if (diffDias === 3) {
      return {
        label: `Em ${diffDias} dia(s)`,
        className:
          'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800',
      }
    }
    return {
      label: `Em ${diffDias} dia(s)`,
      className:
        'inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700',
    }
  }
  return {
    label: 'Já realizada',
    className:
      'inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800',
  }
}

export default async function AdminPedidosKitFestaPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin"><Button>Voltar</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const getParam = (key: string): string | undefined => {
    const val = sp[key]
    if (Array.isArray(val)) return val[0]
    return val
  }

  const dataPedidoInicio = getParam('dataPedidoInicio') || ''
  const dataPedidoFim = getParam('dataPedidoFim') || ''
  const dataFestaInicio = getParam('dataFestaInicio') || ''
  const dataFestaFim = getParam('dataFestaFim') || ''
  const buscaAluno = getParam('buscaAluno') || ''
  const pageParam = parseInt(getParam('page') || '1', 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1

  const { pedidos, total, page: currentPage, pageSize } = await listarPedidosKitFesta({
    dataPedidoInicio,
    dataPedidoFim,
    dataFestaInicio,
    dataFestaFim,
    buscaAluno,
    page,
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const buildQuery = (targetPage: number): Record<string, string> => {
    const q: Record<string, string> = {}
    if (dataPedidoInicio) q.dataPedidoInicio = dataPedidoInicio
    if (dataPedidoFim) q.dataPedidoFim = dataPedidoFim
    if (dataFestaInicio) q.dataFestaInicio = dataFestaInicio
    if (dataFestaFim) q.dataFestaFim = dataFestaFim
    if (buscaAluno) q.buscaAluno = buscaAluno
    q.page = String(targetPage)
    return q
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Pedidos – Kit Festa</h1>
            <p className="text-muted-foreground text-sm">Listagem de pedidos de Kit Festa com reserva na agenda</p>
          </div>
        </div>
        <form method="get" action="/admin/pedidos-kit-festa" className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataPedidoInicio">Data pedido (início)</label>
            <input
              id="dataPedidoInicio"
              name="dataPedidoInicio"
              type="date"
              defaultValue={dataPedidoInicio}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataPedidoFim">Data pedido (fim)</label>
            <input
              id="dataPedidoFim"
              name="dataPedidoFim"
              type="date"
              defaultValue={dataPedidoFim}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataFestaInicio">Data festa (início)</label>
            <input
              id="dataFestaInicio"
              name="dataFestaInicio"
              type="date"
              defaultValue={dataFestaInicio}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="dataFestaFim">Data festa (fim)</label>
            <div className="flex items-end gap-2">
              <input
                id="dataFestaFim"
                name="dataFestaFim"
                type="date"
                defaultValue={dataFestaFim}
                className="w-full rounded border px-2 py-1 text-sm"
              />
              <Button type="submit" size="sm">Filtrar</Button>
            </div>
          </div>
          <div className="space-y-1 md:col-span-1">
            <label className="block text-xs text-muted-foreground" htmlFor="buscaAluno">
              Buscar por aluno
            </label>
            <input
              id="buscaAluno"
              name="buscaAluno"
              type="text"
              placeholder="Nome do aluno"
              defaultValue={buscaAluno}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        </form>
      </div>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum pedido de Kit Festa encontrado.
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
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                    pedido.status === 'PAGO' ? 'bg-green-100 text-green-800' :
                    pedido.status === 'ENTREGUE' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {pedido.status}
                  </span>
                </div>
                <CardDescription>
                  Pedido #{pedido.id.slice(0, 8)} • {new Date(pedido.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <p><span className="font-medium text-muted-foreground">Turma:</span> {pedido.turma ?? '—'}</p>
                  <p><span className="font-medium text-muted-foreground">Total:</span> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedido.total)}</p>
                  <p>
                    <span className="font-medium text-muted-foreground">Dias até a festa:</span>{' '}
                    {(() => {
                      const datas = pedido.itens
                        .map((i) =>
                          i.kit_festa_data ? new Date(i.kit_festa_data + 'T00:00:00') : null,
                        )
                        .filter((d): d is Date => !!d)
                      if (!datas.length) return '—'
                      const hoje = new Date()
                      hoje.setHours(0, 0, 0, 0)
                      const menor = new Date(
                        Math.min(...datas.map((d) => d.getTime())),
                      )
                      menor.setHours(0, 0, 0, 0)
                      const diff = Math.round(
                        (menor.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
                      )
                      if (diff === 0) return 'É hoje'
                      if (diff > 0) return `${diff} dia(s)`
                      return <span className="text-rose-700 font-semibold">Já realizada</span>
                    })()}
                  </p>
                </div>
                {pedido.itens.map((item) => {
                  const countdown = getCountdownInfo(item.kit_festa_data)
                  return (
                    <div key={item.id} className="border rounded-lg p-4 space-y-2 bg-muted/30">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{item.produto_nome ?? 'Kit Festa'}</p>
                        {item.kit_festa_pedido_feito && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Pedido feito
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <p><span className="text-muted-foreground">Data:</span> {item.kit_festa_data ? new Date(item.kit_festa_data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</p>
                        <p><span className="text-muted-foreground">Horário:</span> {item.kit_festa_horario_inicio && item.kit_festa_horario_fim ? `${item.kit_festa_horario_inicio} às ${item.kit_festa_horario_fim}` : '—'}</p>
                        <p><span className="text-muted-foreground">Tema:</span> {item.tema_festa ?? '—'}</p>
                        <p><span className="text-muted-foreground">Idade:</span> {item.idade_festa != null ? `${item.idade_festa} anos` : '—'}</p>
                      </div>
                      {countdown.label && (
                        <div>
                          <span className={countdown.className}>{countdown.label}</span>
                        </div>
                      )}
                      {item.variacoes_selecionadas && Object.keys(item.variacoes_selecionadas).length > 0 && (
                        <p className="text-sm"><span className="text-muted-foreground">Variações:</span> {Object.entries(item.variacoes_selecionadas).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                      )}
                      {item.opcionais_selecionados && item.opcionais_selecionados.length > 0 && (
                        <p className="text-sm"><span className="text-muted-foreground">Opcionais:</span> {item.opcionais_selecionados.map((o: any) => `${o.nome ?? ''}${(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}`).join(', ')}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {item.google_event_id && (
                          <span className="text-xs text-muted-foreground">ID evento: {item.google_event_id}</span>
                        )}
                        {item.google_event_link ? (
                          <a href={item.google_event_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            <Calendar className="h-4 w-4" />
                            Abrir na Google Agenda
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : item.kit_festa_data && !item.google_event_id && (
                          <span className="text-xs text-amber-600">Evento na agenda não criado (verificar log)</span>
                        )}
                        <Link href={`/admin/pedidos-kit-festa/${pedido.id}/imprimir`} target="_blank" prefetch={false}>
                          <Button size="sm" variant="outline">
                            Imprimir A4
                          </Button>
                        </Link>
                        <AlterarDataKitFestaButton
                          itemId={item.id}
                          produtoId={item.produto_id ?? null}
                          googleEventId={item.google_event_id ?? null}
                          dataAtual={item.kit_festa_data ?? null}
                          inicioAtual={item.kit_festa_horario_inicio ?? null}
                          fimAtual={item.kit_festa_horario_fim ?? null}
                        />
                        <form action={marcarPedidoFeitoAction} className="ml-auto">
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant={item.kit_festa_pedido_feito ? 'outline' : 'default'}
                          >
                            {item.kit_festa_pedido_feito ? 'Pedido feito' : 'Marcar pedido feito'}
                          </Button>
                        </form>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center justify-between mt-4 text-sm">
            <p className="text-muted-foreground">
              Página {currentPage} de {totalPages} — {total} pedido(s) encontrado(s)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                asChild
                disabled={currentPage <= 1}
              >
                <Link
                  href={{
                    pathname: '/admin/pedidos-kit-festa',
                    query: buildQuery(currentPage - 1),
                  }}
                >
                  Anterior
                </Link>
              </Button>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                asChild
                disabled={currentPage >= totalPages}
              >
                <Link
                  href={{
                    pathname: '/admin/pedidos-kit-festa',
                    query: buildQuery(currentPage + 1),
                  }}
                >
                  Próxima
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
