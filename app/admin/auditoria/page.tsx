'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  buscarTransacoesAuditoria,
  buscarEventosAuditoria,
  buscarGatewayLogsAuditoria,
  buscarDetalheTransacao,
  reconsultarTransacaoRede,
  podeAcessarAuditoria,
  type FiltroTransacoes,
  type FiltroEventos,
  type FiltroGatewayLogs,
  type TransacaoAuditoria,
  type EventoAuditoria,
  type GatewayLogAuditoria,
  type DetalheTransacao,
} from '@/app/actions/auditoria'
import { FileSearch, Receipt, ListChecks, Radio, RefreshCw, Info } from 'lucide-react'

function formatDate(s: string) {
  if (!s) return '-'
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function AdminAuditoriaPage() {
  const router = useRouter()
  const [autorizado, setAutorizado] = useState<boolean | null>(null)

  const [filtroTrans, setFiltroTrans] = useState<FiltroTransacoes>({})
  const [transacoes, setTransacoes] = useState<TransacaoAuditoria[]>([])
  const [loadingTrans, setLoadingTrans] = useState(false)

  const [filtroEventos, setFiltroEventos] = useState<FiltroEventos>({ limit: 100 })
  const [eventos, setEventos] = useState<EventoAuditoria[]>([])
  const [loadingEventos, setLoadingEventos] = useState(false)

  const [filtroGateway, setFiltroGateway] = useState<FiltroGatewayLogs>({ limit: 100 })
  const [gatewayLogs, setGatewayLogs] = useState<GatewayLogAuditoria[]>([])
  const [loadingGateway, setLoadingGateway] = useState(false)

  const [detalheTransacao, setDetalheTransacao] = useState<DetalheTransacao | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [reconsultandoId, setReconsultandoId] = useState<string | null>(null)
  const [msgReconsulta, setMsgReconsulta] = useState<string | null>(null)

  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    podeAcessarAuditoria().then((ok) => {
      if (!mounted) return
      setAutorizado(ok)
      if (!ok) router.replace('/admin')
    })
    return () => {
      mounted = false
    }
  }, [router])

  async function buscarTransacoes() {
    setErro(null)
    setLoadingTrans(true)
    try {
      const lista = await buscarTransacoesAuditoria(filtroTrans)
      setTransacoes(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar transações')
    } finally {
      setLoadingTrans(false)
    }
  }

  async function buscarEventos() {
    setErro(null)
    setLoadingEventos(true)
    try {
      const lista = await buscarEventosAuditoria(filtroEventos)
      setEventos(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar eventos')
    } finally {
      setLoadingEventos(false)
    }
  }

  async function buscarGateway() {
    setErro(null)
    setLoadingGateway(true)
    try {
      const lista = await buscarGatewayLogsAuditoria(filtroGateway)
      setGatewayLogs(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar logs do gateway')
    } finally {
      setLoadingGateway(false)
    }
  }

  async function abrirDetalhe(transacaoId: string) {
    setLoadingDetalhe(true)
    setDetalheTransacao(null)
    try {
      const d = await buscarDetalheTransacao(transacaoId)
      setDetalheTransacao(d ?? null)
    } catch {
      setDetalheTransacao(null)
    } finally {
      setLoadingDetalhe(false)
    }
  }

  async function reconsultarRede(transacaoId: string) {
    setMsgReconsulta(null)
    setReconsultandoId(transacaoId)
    try {
      const r = await reconsultarTransacaoRede(transacaoId)
      setMsgReconsulta(r.mensagem)
      if (r.ok) buscarTransacoes()
    } finally {
      setReconsultandoId(null)
    }
  }

  if (autorizado === null) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Verificando acesso...</p>
      </div>
    )
  }

  if (!autorizado) {
    return null
  }

  return (
    <div className="w-full max-w-full px-6 py-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm">← Voltar</Button>
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileSearch className="h-8 w-8" />
          Auditoria
        </h1>
        <p className="text-muted-foreground mt-1">
          Consulte transações, eventos de auditoria e logs do gateway. Apenas super admin.
        </p>
      </div>

      {erro && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          {erro}
        </div>
      )}

      <Tabs defaultValue="transacoes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
          <TabsTrigger value="transacoes" className="gap-2">
            <Receipt className="h-4 w-4" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="eventos" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Eventos
          </TabsTrigger>
          <TabsTrigger value="gateway" className="gap-2">
            <Radio className="h-4 w-4" />
            Gateway logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transacoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transações (checkout / recarga)</CardTitle>
              <CardDescription>
                Busque por ID da transação, TID, NSU, referência (idempotency), usuário, aluno ou período.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>ID transação</Label>
                  <Input
                    placeholder="UUID"
                    value={filtroTrans.transacaoId ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, transacaoId: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>TID</Label>
                  <Input
                    placeholder="Gateway TID"
                    value={filtroTrans.gatewayTid ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, gatewayTid: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>NSU</Label>
                  <Input
                    placeholder="Gateway NSU"
                    value={filtroTrans.gatewayNsu ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, gatewayNsu: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Referência / Idempotency key</Label>
                  <Input
                    placeholder="Até 16 caracteres"
                    value={filtroTrans.referencia ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, referencia: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input
                    type="date"
                    value={filtroTrans.dataIni ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, dataIni: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input
                    type="date"
                    value={filtroTrans.dataFim ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, dataFim: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Input
                    placeholder="ex: APROVADO, PENDENTE"
                    value={filtroTrans.status ?? ''}
                    onChange={(e) => setFiltroTrans((f) => ({ ...f, status: e.target.value || undefined }))}
                  />
                </div>
              </div>
              <Button onClick={buscarTransacoes} disabled={loadingTrans}>
                {loadingTrans ? 'Buscando...' : 'Buscar transações'}
              </Button>
              {msgReconsulta && (
                <div className="p-3 rounded-md bg-muted text-sm">
                  {msgReconsulta}
                </div>
              )}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">ID</th>
                      <th className="text-left p-2">Tipo</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-left p-2">TID / NSU</th>
                      <th className="text-left p-2">Usuário / Aluno</th>
                      <th className="text-left p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transacoes.length === 0 && !loadingTrans && (
                      <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Use os filtros e clique em Buscar.</td></tr>
                    )}
                    {transacoes.map((t) => (
                      <tr key={t.id} className="border-b">
                        <td className="p-2 whitespace-nowrap">{formatDate(t.created_at)}</td>
                        <td className="p-2 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                        <td className="p-2">{t.tipo}</td>
                        <td className="p-2">{t.status}</td>
                        <td className="p-2 text-right">{formatPrice(t.valor)}</td>
                        <td className="p-2 text-xs">{t.gateway_tid ?? '-'} / {t.gateway_nsu ?? '-'}</td>
                        <td className="p-2 text-xs">{t.usuario_nome ?? '-'} / {t.aluno_nome ?? '-'}</td>
                        <td className="p-2">
                          <div className="flex gap-1 flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => abrirDetalhe(t.id)} disabled={loadingDetalhe} title="Ver webhook_events e gateway_data">
                              <Info className="h-4 w-4" />
                            </Button>
                            {(t.gateway_id || t.gateway_tid) && t.status !== 'APROVADO' && (
                              <Button variant="outline" size="sm" onClick={() => reconsultarRede(t.id)} disabled={!!reconsultandoId} title="Reconsultar status na Rede">
                                {reconsultandoId === t.id ? '...' : <RefreshCw className="h-4 w-4" />}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detalheTransacao && (
                <Card className="mt-4">
                  <CardHeader className="py-3">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base">Detalhe da transação (diagnóstico)</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setDetalheTransacao(null)}>Fechar</Button>
                    </div>
                    <CardDescription className="text-xs">
                      ID: {detalheTransacao.id} · Status: {detalheTransacao.status} · gateway_id: {detalheTransacao.gateway_id ?? '-'} · gateway_tid: {detalheTransacao.gateway_tid ?? '-'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium mb-1">webhook_events ({detalheTransacao.webhook_events.length} evento(s))</p>
                      <p className="text-muted-foreground text-xs mb-1">Se vazio, o webhook da Rede não chegou ou não encontrou esta transação (confira TID/URL do webhook).</p>
                      <pre className="p-2 bg-muted rounded overflow-auto max-h-40 text-xs">{JSON.stringify(detalheTransacao.webhook_events, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="font-medium mb-1">gateway_data</p>
                      <pre className="p-2 bg-muted rounded overflow-auto max-h-40 text-xs">{JSON.stringify(detalheTransacao.gateway_data, null, 2)}</pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eventos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Eventos de auditoria</CardTitle>
              <CardDescription>
                Ações registradas (quem, quando, entidade). Use tipo de ator &quot;webhook&quot; para ver chamadas do webhook PIX.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de ator</Label>
                  <Input
                    placeholder="ex: webhook, admin, sistema"
                    value={filtroEventos.actorType ?? ''}
                    onChange={(e) => setFiltroEventos((f) => ({ ...f, actorType: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Entidade</Label>
                  <Input
                    placeholder="ex: transacao, webhook_pix"
                    value={filtroEventos.entidade ?? ''}
                    onChange={(e) => setFiltroEventos((f) => ({ ...f, entidade: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ID da entidade</Label>
                  <Input
                    placeholder="UUID"
                    value={filtroEventos.entidadeId ?? ''}
                    onChange={(e) => setFiltroEventos((f) => ({ ...f, entidadeId: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input
                    type="date"
                    value={filtroEventos.dataIni ?? ''}
                    onChange={(e) => setFiltroEventos((f) => ({ ...f, dataIni: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input
                    type="date"
                    value={filtroEventos.dataFim ?? ''}
                    onChange={(e) => setFiltroEventos((f) => ({ ...f, dataFim: e.target.value || undefined }))}
                  />
                </div>
              </div>
              <Button onClick={buscarEventos} disabled={loadingEventos}>
                {loadingEventos ? 'Buscando...' : 'Buscar eventos'}
              </Button>
              <div className="overflow-x-auto border rounded-lg max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Actor</th>
                      <th className="text-left p-2">Ação</th>
                      <th className="text-left p-2">Entidade</th>
                      <th className="text-left p-2">ID entidade</th>
                      <th className="text-left p-2">Rota</th>
                      <th className="text-left p-2">Detalhe (payload)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.length === 0 && !loadingEventos && (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Busque eventos (tabela pode estar vazia até o backend gravar).</td></tr>
                    )}
                    {eventos.map((e) => (
                      <tr key={e.id} className="border-b">
                        <td className="p-2 whitespace-nowrap">{formatDate(e.created_at)}</td>
                        <td className="p-2">{e.actor_type}</td>
                        <td className="p-2">{e.action}</td>
                        <td className="p-2">{e.entidade}</td>
                        <td className="p-2 font-mono text-xs">{e.entidade_id ? e.entidade_id.slice(0, 8) + '…' : '-'}</td>
                        <td className="p-2 text-xs">{e.route ?? '-'}</td>
                        <td className="p-2 text-xs max-w-[200px] truncate" title={JSON.stringify(e.payload_reduzido)}>
                          {Object.keys(e.payload_reduzido || {}).length > 0
                            ? JSON.stringify(e.payload_reduzido).slice(0, 80) + (JSON.stringify(e.payload_reduzido).length > 80 ? '…' : '')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs do gateway (e.Rede)</CardTitle>
              <CardDescription>
                Request e webhook recebidos. Busque por transação, TID, NSU ou período.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>ID transação</Label>
                  <Input
                    placeholder="UUID"
                    value={filtroGateway.transacaoId ?? ''}
                    onChange={(e) => setFiltroGateway((f) => ({ ...f, transacaoId: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>TID</Label>
                  <Input
                    placeholder="Gateway TID"
                    value={filtroGateway.gatewayTid ?? ''}
                    onChange={(e) => setFiltroGateway((f) => ({ ...f, gatewayTid: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input
                    type="date"
                    value={filtroGateway.dataIni ?? ''}
                    onChange={(e) => setFiltroGateway((f) => ({ ...f, dataIni: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input
                    type="date"
                    value={filtroGateway.dataFim ?? ''}
                    onChange={(e) => setFiltroGateway((f) => ({ ...f, dataFim: e.target.value || undefined }))}
                  />
                </div>
              </div>
              <Button onClick={buscarGateway} disabled={loadingGateway}>
                {loadingGateway ? 'Buscando...' : 'Buscar logs'}
              </Button>
              <div className="overflow-x-auto border rounded-lg max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Direção</th>
                      <th className="text-left p-2">Transação ID</th>
                      <th className="text-left p-2">TID / NSU</th>
                      <th className="text-left p-2">HTTP</th>
                      <th className="text-left p-2">returnCode / Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gatewayLogs.length === 0 && !loadingGateway && (
                      <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Busque logs (tabela preenchida quando o backend registrar).</td></tr>
                    )}
                    {gatewayLogs.map((g) => (
                      <tr key={g.id} className="border-b">
                        <td className="p-2 whitespace-nowrap">{formatDate(g.created_at)}</td>
                        <td className="p-2">{g.direcao}</td>
                        <td className="p-2 font-mono text-xs">{g.transacao_id ? g.transacao_id.slice(0, 8) + '…' : '-'}</td>
                        <td className="p-2 text-xs">{g.gateway_tid ?? '-'} / {g.gateway_nsu ?? '-'}</td>
                        <td className="p-2">{g.http_status ?? '-'}</td>
                        <td className="p-2 text-xs">{g.return_code ?? '-'} {g.return_message ?? ''} {g.erro ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
