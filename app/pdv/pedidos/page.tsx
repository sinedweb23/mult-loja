'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  listarPedidosParaRetirada,
  listarPedidosNaoEntreguesAte,
  marcarPedidoEntregue,
  desmarcarPedidoEntregue,
} from '@/app/actions/pedidos-cantina'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ComprovanteModal, type ItemComprovante } from '@/components/pdv/comprovante-modal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Printer } from 'lucide-react'
import { todayISO } from '@/lib/date'
import { useSearchParams } from 'next/navigation'

type PedidoRetirada = Awaited<ReturnType<typeof listarPedidosParaRetirada>>[number]

export default function PdvPedidosPage() {
  const searchParams = useSearchParams()
  const modoNaoEntregues = searchParams.get('modo') === 'nao-entregues'
  const ateParam = searchParams.get('ate')

  const [data, setData] = useState(() => (ateParam && ateParam.trim().length > 0 ? ateParam : todayISO()))
  const [pedidos, setPedidos] = useState<PedidoRetirada[]>([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [desmarcando, setDesmarcando] = useState<string | null>(null)
  const [erroMarcar, setErroMarcar] = useState<string | null>(null)
  const [nomeLoja, setNomeLoja] = useState('')
  const [comprovanteOpen, setComprovanteOpen] = useState(false)
  const [comprovantePedido, setComprovantePedido] = useState<PedidoRetirada | null>(null)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)
  const [segmentoFiltro, setSegmentoFiltro] = useState<string | null>(null)
  const [turnoFiltro, setTurnoFiltro] = useState<'todos' | 'MANHA' | 'TARDE'>('todos')

  useEffect(() => {
    carregar()
  }, [data, modoNaoEntregues])

  useEffect(() => {
    // Mantém o "ate" sincronizado com a URL quando entrar no modo via link.
    if (modoNaoEntregues && ateParam) setData(ateParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoNaoEntregues, ateParam])

  useEffect(() => {
    obterConfiguracaoAparencia().then((c) => setNomeLoja(c.loja_nome || ''))
  }, [])

  async function carregar() {
    setErroMarcar(null)
    setLoading(true)
    try {
      const list = modoNaoEntregues
        ? await listarPedidosNaoEntreguesAte(data)
        : await listarPedidosParaRetirada(data)
      setPedidos(list as unknown as PedidoRetirada[])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function marcarEntregue(pedidoId: string) {
    setErroMarcar(null)
    setMarcando(pedidoId)
    try {
      const res = await marcarPedidoEntregue(pedidoId)
      if (res.ok) {
        await carregar()
      } else {
        setErroMarcar(res.erro || 'Não foi possível marcar como entregue.')
      }
    } finally {
      setMarcando(null)
    }
  }

  async function desmarcarEntregue(pedidoId: string) {
    setErroMarcar(null)
    setDesmarcando(pedidoId)
    try {
      const res = await desmarcarPedidoEntregue(pedidoId)
      if (res.ok) {
        await carregar()
      } else {
        setErroMarcar(res.erro || 'Não foi possível desmarcar.')
      }
    } finally {
      setDesmarcando(null)
    }
  }

  function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  function abrirRecibo(p: PedidoRetirada) {
    setComprovantePedido(p)
    setComprovanteOpen(true)
  }

  function itensParaComprovante(p: PedidoRetirada): ItemComprovante[] {
    return p.itens.map((i) => ({
      produto_nome: i.produto_nome,
      quantidade: i.quantidade,
      preco_unitario: i.quantidade > 0 ? i.subtotal / i.quantidade : 0,
      subtotal: i.subtotal,
      variacoes_selecionadas: i.variacoes_selecionadas ?? null,
      data_retirada: i.data_retirada ?? null,
    }))
  }

  /** Categorias únicas presentes nos pedidos (para o filtro). Inclui "__sem__" se houver itens sem categoria. */
  const categoriasNaLista = useMemo(() => {
    const map = new Map<string, string>()
    let temSemCategoria = false
    for (const p of pedidos) {
      for (const i of p.itens) {
        if (i.categoria_id && i.categoria_nome) map.set(i.categoria_id, i.categoria_nome)
        else temSemCategoria = true
      }
    }
    const list = Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
    if (temSemCategoria) list.push(['__sem__', 'Sem categoria'])
    return list
  }, [pedidos])

  const LABELS_SEGMENTO: Record<string, string> = {
    EDUCACAO_INFANTIL: 'Educação Infantil',
    FUNDAMENTAL: 'Fundamental',
    MEDIO: 'Médio',
    OUTRO: 'Outro',
  }
  function labelSegmento(seg: string | null) {
    if (!seg) return 'Sem segmento'
    return LABELS_SEGMENTO[seg] ?? seg
  }

  /** Segmentos únicos presentes nos pedidos (turma do aluno). */
  const segmentosNaLista = useMemo(() => {
    const set = new Set<string>()
    for (const p of pedidos) {
      const seg = p.aluno.turma_segmento
      if (seg) set.add(seg)
    }
    return Array.from(set).sort((a, b) => labelSegmento(a).localeCompare(labelSegmento(b)))
  }, [pedidos])

  /** Pedidos filtrados por categoria, segmento e turno. */
  const pedidosFiltrados = useMemo(() => {
    let list = pedidos
    if (categoriaFiltro) {
      if (categoriaFiltro === '__sem__')
        list = list.filter((p) => p.itens.some((i) => !i.categoria_id))
      else
        list = list.filter((p) => p.itens.some((i) => i.categoria_id === categoriaFiltro))
    }
    if (segmentoFiltro)
      list = list.filter((p) => p.aluno.turma_segmento === segmentoFiltro)
    if (turnoFiltro !== 'todos')
      list = list.filter((p) => p.aluno.turma_turno === turnoFiltro)
    return list
  }, [pedidos, categoriaFiltro, segmentoFiltro, turnoFiltro])

  /** Imprime lista de pedidos em A4 com caixa para X (retirada manual) */
  function imprimirListaRetirada() {
    const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const rotuloData = modoNaoEntregues ? 'Até:' : 'Data de retirada:'
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Lista para retirada - ${dataFmt}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: system-ui, sans-serif; font-size: 12px; padding: 12px; max-width: 210mm; margin: 0 auto; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .data { color: #666; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; }
    .col-check { width: 32px; text-align: center; }
    .box { display: inline-block; width: 20px; height: 20px; border: 2px solid #333; vertical-align: middle; }
    .itens { font-size: 11px; color: #444; }
    .total { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Pedidos para retirada</h1>
  <p class="data">${rotuloData} ${dataFmt}</p>
  <table>
    <thead>
      <tr>
        <th class="col-check"></th>
        <th>Beneficiário</th>
        <th>Turma</th>
        <th>Itens</th>
        <th class="total">Total</th>
      </tr>
    </thead>
    <tbody>
      ${pedidosFiltrados.map((p) => {
        const itensTexto = agruparItensKitMensal(p.itens)
          .map((l) => `${l.quantidade}x ${l.produto_nome}${l.textoVariacoes}${l.umPorDia ? ` (${l.dias} dias)` : ''}`)
          .join('; ')
        const totalFmt = formatPrice(p.total)
        const beneficiario = p.beneficiario_nome || p.aluno.nome
        const turma = p.aluno.turma_nome ?? '—'
        return `<tr>
          <td class="col-check"><span class="box"></span></td>
          <td>${beneficiario}</td>
          <td>${turma}</td>
          <td class="itens">${itensTexto}</td>
          <td class="total">${totalFmt}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>
  <p style="margin-top: 12px; font-size: 11px; color: #666;">Marque com X na caixa quando o pedido for retirado.</p>
</body>
</html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      w.onafterprint = () => w.close()
    }
  }

  /** Agrupa itens iguais (mesmo produto + variações) com 1 por data = "1 por dia (N dias)" em uma linha. */
  type ItemPedido = { produto_nome: string; quantidade: number; subtotal: number; data_retirada: string | null; variacoes_selecionadas: Record<string, string> }
  type LinhaAgrupada = { produto_nome: string; textoVariacoes: string; quantidade: number; subtotal: number; umPorDia: boolean; dias: number }
  function agruparItensKitMensal(itens: ItemPedido[]): LinhaAgrupada[] {
    const key = (i: ItemPedido) =>
      `${i.produto_nome}|${Object.keys(i.variacoes_selecionadas ?? {}).sort().map((k) => `${k}=${(i.variacoes_selecionadas ?? {})[k]}`).join(',')}`
    const grupos = new Map<string, ItemPedido[]>()
    for (const item of itens) {
      const k = key(item)
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(item)
    }
    const out: LinhaAgrupada[] = []
    for (const [, grupo] of grupos) {
      const primeiro = grupo[0]
      const variacoes = primeiro.variacoes_selecionadas ?? {}
      const temVariacoes = Object.keys(variacoes).length > 0
      const textoVariacoes = temVariacoes
        ? ` (${Object.entries(variacoes).map(([k, v]) => `${k}: ${v}`).join(', ')})`
        : ''
      const quantidade = grupo.reduce((s, i) => s + i.quantidade, 0)
      const subtotal = grupo.reduce((s, i) => s + i.subtotal, 0)
      const datasUnicas = new Set(grupo.map((i) => i.data_retirada ?? '').filter(Boolean))
      const umPorDia = grupo.length > 1 && datasUnicas.size === grupo.length && grupo.every((i) => (i.quantidade === 1))
      out.push({
        produto_nome: primeiro.produto_nome || 'Produto',
        textoVariacoes,
        quantidade,
        subtotal,
        umPorDia: !!umPorDia,
        dias: umPorDia ? grupo.length : quantidade,
      })
    }
    return out
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{modoNaoEntregues ? 'Pedidos não entregues' : 'Pedidos para retirada'}</h1>
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label>{modoNaoEntregues ? 'Até' : 'Data de retirada'}</Label>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="mt-1 w-48"
          />
        </div>
        {categoriasNaLista.length > 0 && (
          <div>
            <Label>Categoria</Label>
            <Select
              value={categoriaFiltro ?? 'todas'}
              onValueChange={(v) => setCategoriaFiltro(v === 'todas' ? null : v)}
            >
              <SelectTrigger className="mt-1 w-[180px]">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categoriasNaLista.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {segmentosNaLista.length > 0 && (
          <div>
            <Label>Segmento</Label>
            <Select
              value={segmentoFiltro ?? 'todos'}
              onValueChange={(v) => setSegmentoFiltro(v === 'todos' ? null : v)}
            >
              <SelectTrigger className="mt-1 w-[180px]">
                <SelectValue placeholder="Todos os segmentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os segmentos</SelectItem>
                {segmentosNaLista.map((seg) => (
                  <SelectItem key={seg} value={seg}>{labelSegmento(seg)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="sr-only">Turno</Label>
          <div className="flex gap-1 mt-1">
            <Button
              type="button"
              variant={turnoFiltro === 'todos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTurnoFiltro('todos')}
            >
              Todos
            </Button>
            <Button
              type="button"
              variant={turnoFiltro === 'MANHA' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTurnoFiltro('MANHA')}
            >
              Manhã
            </Button>
            <Button
              type="button"
              variant={turnoFiltro === 'TARDE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTurnoFiltro('TARDE')}
            >
              Tarde
            </Button>
          </div>
        </div>
        <Button variant="outline" onClick={carregar}>Atualizar</Button>
        <Button variant="outline" onClick={imprimirListaRetirada} className="gap-2" disabled={pedidosFiltrados.length === 0}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {erroMarcar && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
          {erroMarcar}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {modoNaoEntregues ? 'Nenhum pedido não entregue até esta data.' : 'Nenhum pedido para retirada nesta data.'}
          </CardContent>
        </Card>
      ) : pedidosFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum pedido com os filtros selecionados. Ajuste categoria, segmento ou turno.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pedidosFiltrados.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {p.beneficiario_nome || p.aluno.nome}
                    </CardTitle>
                    {p.tipo_beneficiario !== 'COLABORADOR' && p.aluno.turma_nome && (
                      <p className="text-sm text-muted-foreground mt-0.5">{p.aluno.turma_nome}</p>
                    )}
                    <CardDescription>
                      {p.itens.length} item(ns) • Total {formatPrice(p.total)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirRecibo(p)}
                      className="gap-1"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir recibo
                    </Button>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        p.status === 'ENTREGUE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {p.status === 'ENTREGUE' ? 'Entregue' : 'Pago'}
                    </span>
                    {p.status !== 'ENTREGUE' ? (
                      <Button
                        size="sm"
                        onClick={() => marcarEntregue(p.id)}
                        disabled={marcando === p.id}
                      >
                        {marcando === p.id ? '...' : 'Marcar entregue'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => desmarcarEntregue(p.id)}
                        disabled={desmarcando === p.id}
                      >
                        {desmarcando === p.id ? '...' : 'Desmarcar entregue'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="text-sm text-muted-foreground space-y-1">
                  {agruparItensKitMensal(p.itens).map((linha, i) => (
                    <li key={i}>
                      {linha.quantidade}x {linha.produto_nome}
                      {linha.textoVariacoes && <span className="text-muted-foreground/90">{linha.textoVariacoes}</span>}
                      {linha.umPorDia && <span className="text-muted-foreground/90"> — 1 por dia ({linha.dias} dias)</span>}
                      {' — '}
                      {formatPrice(linha.subtotal)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {comprovantePedido && (
        <ComprovanteModal
          open={comprovanteOpen}
          onClose={() => {
            setComprovanteOpen(false)
            setComprovantePedido(null)
          }}
          tipo={comprovantePedido.tipo_beneficiario === 'COLABORADOR' ? 'COLABORADOR' : 'ALUNO'}
          nomeLoja={nomeLoja}
          dataHora={comprovantePedido.created_at}
          itens={itensParaComprovante(comprovantePedido)}
          total={comprovantePedido.total}
          alunoNome={comprovantePedido.beneficiario_nome}
          pedidoId={comprovantePedido.id}
          rotuloTipo="PEDIDO ONLINE"
        />
      )}
    </div>
  )
}
