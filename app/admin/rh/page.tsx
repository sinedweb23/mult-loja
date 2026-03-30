'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  processarImportacaoColaboradoresCSV,
  obterModeloCSVColaboradores,
  listarColaboradores,
  listarConsumoComSaldoDevedor,
  listarConsumoColaboradorMensalRecente,
  listarConsumoMensalPorPeriodo,
  registrarAbatimentoColaborador,
  listarMovimentacoesColaboradorPeriodo,
  getColaboradoresComMovimentacao,
  atualizarColaborador,
  inativarColaborador,
  reativarColaborador,
  excluirColaborador,
  criarColaboradorManual,
  type ResultadoImportacaoColaboradores,
  type ColaboradorListagem,
  type SaldoDevedorColaborador,
  type MovimentacaoRH,
  type ConsumoMensalPorPeriodoItem,
  type ColaboradorForm,
} from '@/app/actions/colaboradores-importacao'
import { listarEmpresas } from '@/app/actions/empresas'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, Upload, FileText, DollarSign, Users, BarChart3, ChevronDown, ChevronRight, Search, Pencil, UserPlus, Ban, Trash2, UserCheck } from 'lucide-react'
import { todayISO, firstDayOfMonthISO } from '@/lib/date'

export default function AdminRHPage() {
  const [consumo, setConsumo] = useState<any[]>([])
  const [colaboradores, setColaboradores] = useState<ColaboradorListagem[]>([])
  const [saldoDevedorList, setSaldoDevedorList] = useState<SaldoDevedorColaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<ResultadoImportacaoColaboradores | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [lancamentoOpen, setLancamentoOpen] = useState(false)
  const [lancamentoColaborador, setLancamentoColaborador] = useState<SaldoDevedorColaborador | null>(null)
  const [valorLancamento, setValorLancamento] = useState('')
  const [salvandoLancamento, setSalvandoLancamento] = useState(false)
  const [erroLancamento, setErroLancamento] = useState<string | null>(null)

  const hoje = new Date()
  const [relatorioDataIni, setRelatorioDataIni] = useState(
    () => firstDayOfMonthISO(hoje)
  )
  const [relatorioDataFim, setRelatorioDataFim] = useState(() => todayISO(hoje))
  const [buscaSaldoDevedor, setBuscaSaldoDevedor] = useState('')
  const [buscaColaborador, setBuscaColaborador] = useState('')
  const [colaboradorRelatorio, setColaboradorRelatorio] = useState<ColaboradorListagem | null>(null)
  const [mostrarListaBuscaRelatorio, setMostrarListaBuscaRelatorio] = useState(false)
  const [movimentacoesPeriodo, setMovimentacoesPeriodo] = useState<MovimentacaoRH[]>([])
  const [loadingMovimentacoes, setLoadingMovimentacoes] = useState(false)
  const [expandidoCompraId, setExpandidoCompraId] = useState<string | null>(null)
  const [relatorioJaCarregado, setRelatorioJaCarregado] = useState(false)
  const listaBuscaRef = useRef<HTMLDivElement>(null)

  const [consumoPeriodoAno, setConsumoPeriodoAno] = useState(() => new Date().getFullYear())
  const [consumoPeriodoMesIni, setConsumoPeriodoMesIni] = useState(1)
  const [consumoPeriodoMesFim, setConsumoPeriodoMesFim] = useState(12)
  const [consumoPeriodoLista, setConsumoPeriodoLista] = useState<ConsumoMensalPorPeriodoItem[]>([])
  const [loadingConsumoPeriodo, setLoadingConsumoPeriodo] = useState(false)

  const [buscaCadastrados, setBuscaCadastrados] = useState('')
  const [paginaCadastrados, setPaginaCadastrados] = useState(1)
  const pageSizeCadastrados = 20

  const [buscaConsumoPeriodo, setBuscaConsumoPeriodo] = useState('')
  const [paginaConsumoPeriodo, setPaginaConsumoPeriodo] = useState(1)
  const pageSizeConsumoPeriodo = 20

  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([])
  const [idsComMovimentacao, setIdsComMovimentacao] = useState<Set<string>>(new Set())
  const [editOpen, setEditOpen] = useState(false)
  const [editColaborador, setEditColaborador] = useState<ColaboradorListagem | null>(null)
  const [formEdit, setFormEdit] = useState<ColaboradorForm>({ nome: '', cpf: '', email: '', re_colaborador: '', empresa_id: null })
  const [newOpen, setNewOpen] = useState(false)
  const [formNew, setFormNew] = useState<ColaboradorForm>({ nome: '', cpf: '', email: '', re_colaborador: '', empresa_id: null })
  const [saving, setSaving] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [confirmInativar, setConfirmInativar] = useState<ColaboradorListagem | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState<ColaboradorListagem | null>(null)
  const [acaoLoading, setAcaoLoading] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const container = listaBuscaRef.current
      const target = e.target
      if (!container) return
      if (!(target instanceof Node) || !container.contains(target)) {
        setMostrarListaBuscaRelatorio(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const [consumoList, colaboradoresList, saldoList, movIds, empresasList] = await Promise.all([
        listarConsumoColaboradorMensalRecente(),
        listarColaboradores(),
        listarConsumoComSaldoDevedor(),
        getColaboradoresComMovimentacao(),
        listarEmpresas().then((e) => (Array.isArray(e) ? e : [])),
      ])
      setConsumo(consumoList || [])
      setColaboradores(colaboradoresList || [])
      setSaldoDevedorList(saldoList || [])
      setIdsComMovimentacao(new Set(movIds || []))
      setEmpresas((empresasList || []).map((x: { id: string; nome: string }) => ({ id: x.id, nome: x.nome })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function abrirEditar(c: ColaboradorListagem) {
    setEditColaborador(c)
    setFormEdit({
      nome: c.nome ?? '',
      cpf: c.cpf ?? '',
      email: c.email ?? '',
      re_colaborador: c.re_colaborador ?? '',
      empresa_id: c.empresa_id ?? null,
    })
    setErroForm(null)
    setEditOpen(true)
  }

  async function salvarEdicao() {
    if (!editColaborador) return
    setSaving(true)
    setErroForm(null)
    try {
      const res = await atualizarColaborador(editColaborador.id, formEdit)
      if (res.ok) {
        setEditOpen(false)
        setEditColaborador(null)
        await carregar()
      } else {
        setErroForm(res.erro ?? 'Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  function abrirNovo() {
    setFormNew({ nome: '', cpf: '', email: '', re_colaborador: '', empresa_id: empresas[0]?.id ?? null })
    setErroForm(null)
    setNewOpen(true)
  }

  async function salvarNovo() {
    setSaving(true)
    setErroForm(null)
    try {
      const res = await criarColaboradorManual(formNew)
      if (res.ok) {
        setNewOpen(false)
        await carregar()
      } else {
        setErroForm(res.erro ?? 'Erro ao cadastrar')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleInativar(c: ColaboradorListagem) {
    setAcaoLoading(c.id)
    try {
      const res = await inativarColaborador(c.id)
      if (res.ok) {
        setConfirmInativar(null)
        await carregar()
      } else {
        setErroForm(res.erro ?? 'Erro ao inativar')
      }
    } finally {
      setAcaoLoading(null)
    }
  }

  async function handleReativar(c: ColaboradorListagem) {
    setAcaoLoading(c.id)
    try {
      const res = await reativarColaborador(c.id)
      if (res.ok) await carregar()
    } finally {
      setAcaoLoading(null)
    }
  }

  async function handleExcluir(c: ColaboradorListagem) {
    setAcaoLoading(c.id)
    try {
      const res = await excluirColaborador(c.id)
      if (res.ok) {
        setConfirmExcluir(null)
        await carregar()
      } else {
        setErroForm(res.erro ?? 'Erro ao excluir')
      }
    } finally {
      setAcaoLoading(null)
    }
  }

  function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  async function downloadModeloCSV() {
    const csv = await obterModeloCSVColaboradores()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_colaboradores.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResultadoImportacao(null)
    setImportando(true)
    try {
      const text = await file.text()
      const resultado = await processarImportacaoColaboradoresCSV(text)
      setResultadoImportacao(resultado)
      if (resultado.criados > 0 || resultado.atualizados > 0) {
        await carregar()
      }
    } catch (err) {
      setResultadoImportacao({
        sucesso: false,
        criados: 0,
        atualizados: 0,
        erros: [{ linha: 0, cpf: '', mensagem: err instanceof Error ? err.message : 'Erro ao processar' }],
      })
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  function abrirLancamento(col: SaldoDevedorColaborador) {
    setLancamentoColaborador(col)
    setValorLancamento(col.saldo_devedor.toString().replace('.', ','))
    setErroLancamento(null)
    setLancamentoOpen(true)
  }

  async function confirmarLancamento() {
    if (!lancamentoColaborador) return
    const valor = parseFloat(valorLancamento.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErroLancamento('Informe um valor positivo.')
      return
    }
    setSalvandoLancamento(true)
    setErroLancamento(null)
    try {
      const res = await registrarAbatimentoColaborador(lancamentoColaborador.usuario_id, valor)
      if (res.ok) {
        setLancamentoOpen(false)
        setLancamentoColaborador(null)
        setValorLancamento('')
        await carregar()
      } else {
        setErroLancamento(res.erro ?? 'Erro ao registrar.')
      }
    } finally {
      setSalvandoLancamento(false)
    }
  }

  const colaboradorNomePorId = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? 'Colaborador'

  function normalizarBusca(s: string) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }
  const termosBuscaColab = normalizarBusca(buscaColaborador).split(/\s+/).filter(Boolean)
  const colaboradoresFiltrados =
    termosBuscaColab.length === 0
      ? colaboradores
      : colaboradores.filter((c) => {
          const texto = normalizarBusca(String(c.nome ?? '') + ' ' + String(c.re_colaborador ?? ''))
          return termosBuscaColab.every((t) => texto.includes(t))
        })

  const termoCadastrados = normalizarBusca(buscaCadastrados)
  const colaboradoresCadastradosFiltrados = termoCadastrados
    ? colaboradores.filter((c) => {
        const texto = normalizarBusca(
          [
            String(c.nome ?? ''),
            String(c.cpf ?? ''),
            String(c.re_colaborador ?? ''),
            String(c.email ?? ''),
            String(c.empresa_nome ?? ''),
          ].join(' ')
        )
        return texto.includes(termoCadastrados)
      })
    : colaboradores
  const totalCadastrados = colaboradoresCadastradosFiltrados.length
  const totalPaginasCadastrados = Math.max(1, Math.ceil(totalCadastrados / pageSizeCadastrados))
  const paginaCorrigidaCadastrados = Math.min(paginaCadastrados, totalPaginasCadastrados)
  const inicioCadastrados = (paginaCorrigidaCadastrados - 1) * pageSizeCadastrados
  const fimCadastrados = inicioCadastrados + pageSizeCadastrados
  const paginaItensCadastrados = colaboradoresCadastradosFiltrados.slice(inicioCadastrados, fimCadastrados)

  const termoConsumoPeriodo = normalizarBusca(buscaConsumoPeriodo)
  const consumoPeriodoFiltrado = termoConsumoPeriodo
    ? consumoPeriodoLista.filter((r) => {
        const texto = normalizarBusca(
          [String(r.nome ?? ''), String(r.empresa_nome ?? ''), `${String(r.mes).padStart(2, '0')}/${r.ano}`].join(' ')
        )
        return texto.includes(termoConsumoPeriodo)
      })
    : consumoPeriodoLista
  const totalConsumoPeriodo = consumoPeriodoFiltrado.length
  const totalPaginasConsumoPeriodo = Math.max(1, Math.ceil(totalConsumoPeriodo / pageSizeConsumoPeriodo))
  const paginaCorrigidaConsumoPeriodo = Math.min(paginaConsumoPeriodo, totalPaginasConsumoPeriodo)
  const inicioConsumoPeriodo = (paginaCorrigidaConsumoPeriodo - 1) * pageSizeConsumoPeriodo
  const fimConsumoPeriodo = inicioConsumoPeriodo + pageSizeConsumoPeriodo
  const paginaItensConsumoPeriodo = consumoPeriodoFiltrado.slice(inicioConsumoPeriodo, fimConsumoPeriodo)

  async function carregarRelatorio() {
    if (!colaboradorRelatorio) return
    setLoadingMovimentacoes(true)
    setRelatorioJaCarregado(true)
    try {
      const dataIni = relatorioDataIni || new Date(0).toISOString().slice(0, 10)
      const dataFim = relatorioDataFim || new Date().toISOString().slice(0, 10)
      const lista = await listarMovimentacoesColaboradorPeriodo(colaboradorRelatorio.id, dataIni, dataFim)
      setMovimentacoesPeriodo(lista)
    } finally {
      setLoadingMovimentacoes(false)
    }
  }

  async function carregarConsumoPorPeriodo() {
    setLoadingConsumoPeriodo(true)
    try {
      const lista = await listarConsumoMensalPorPeriodo(
        consumoPeriodoAno,
        consumoPeriodoMesIni,
        consumoPeriodoMesFim
      )
      setConsumoPeriodoLista(lista)
    } finally {
      setLoadingConsumoPeriodo(false)
    }
  }

  const totalSaldoDevedor = saldoDevedorList.reduce((acc, item) => acc + (item.saldo_devedor || 0), 0)

  function formatPriceLocal(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  function imprimirConsumoPorPeriodo() {
    if (!consumoPeriodoLista.length) return
    const totalConsumido = consumoPeriodoLista.reduce((acc, r) => acc + (r.valor_total || 0), 0)
    const totalAbatido = consumoPeriodoLista.reduce((acc, r) => acc + (r.valor_abatido || 0), 0)
    const totalSaldo = consumoPeriodoLista.reduce((acc, r) => acc + (r.saldo_devedor || 0), 0)
    const hojeStr = new Date().toLocaleDateString('pt-BR')
    const periodoStr = `${String(consumoPeriodoMesIni).padStart(2, '0')}/${consumoPeriodoAno} a ${String(
      consumoPeriodoMesFim
    ).padStart(2, '0')}/${consumoPeriodoAno}`

    const linhas = consumoPeriodoLista
      .map(
        (r) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ddd;">${r.nome}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${String(r.mes).padStart(2, '0')}/${r.ano}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;">${(r as any).re_colaborador ?? '-'}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatPriceLocal(r.valor_total)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatPriceLocal(r.valor_abatido)}</td>
          <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${formatPriceLocal(r.saldo_devedor)}</td>
        </tr>`
      )
      .join('')

    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(`
      <html>
        <head>
          <title>Relatório de consumo por período</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            h2 { font-size: 14px; margin: 12px 0 4px; }
            table { border-collapse: collapse; width: 100%; margin-top: 8px; }
            .totais { margin-top: 8px; }
          </style>
        </head>
        <body>
          <h1>Relatório de consumo por período (RH)</h1>
          <p><strong>Período filtrado:</strong> ${periodoStr}</p>
          <p><strong>Data de emissão:</strong> ${hojeStr}</p>

          <div class="totais">
            <h2>Totais do período</h2>
            <p><strong>Total consumido:</strong> ${formatPriceLocal(totalConsumido)}</p>
            <p><strong>Total abatido:</strong> ${formatPriceLocal(totalAbatido)}</p>
            <p><strong>Total saldo devedor (mês):</strong> ${formatPriceLocal(totalSaldo)}</p>
          </div>

          <h2>Detalhamento por colaborador / mês</h2>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Colaborador</th>
                <th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">Mês/Ano</th>
                <th style="text-align:left;padding:4px 8px;border:1px solid #ddd;">RE</th>
                <th style="text-align:right;padding:4px 8px;border:1px solid #ddd;">Consumido</th>
                <th style="text-align:right;padding:4px 8px;border:1px solid #ddd;">Abatido</th>
                <th style="text-align:right;padding:4px 8px;border:1px solid #ddd;">Saldo devedor (mês)</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
            </tbody>
          </table>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="w-full max-w-full px-6 py-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm">← Voltar</Button>
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">RH</h1>
        <p className="text-muted-foreground">
          Consumo dos colaboradores, apuração e abatimento em folha. Importe colaboradores via CSV.
        </p>
      </div>

      <Tabs defaultValue="importar" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="importar" className="gap-2">
            <FileText className="h-4 w-4" />
            Importar colaboradores
          </TabsTrigger>
          <TabsTrigger value="cadastrados" className="gap-2">
            <Users className="h-4 w-4" />
            Colaboradores cadastrados
          </TabsTrigger>
          <TabsTrigger value="consumo" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Consumo mensal
          </TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Relatório
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Importar colaboradores (CSV)
              </CardTitle>
              <CardDescription>
                Aceita CSV ou TSV (tab). Com ou sem cabeçalho (nome, cpf, email, re). Nome e CPF obrigatórios. Se o CPF já existir, atualiza e mantém os outros perfis do usuário.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={downloadModeloCSV} className="gap-2">
                  <Download className="h-4 w-4" />
                  Baixar modelo CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={importando}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importando}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {importando ? 'Processando...' : 'Enviar e processar CSV'}
                </Button>
              </div>
              {resultadoImportacao && (
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="font-medium">
                    {resultadoImportacao.criados} criado(s), {resultadoImportacao.atualizados} atualizado(s).
                    {resultadoImportacao.erros.length > 0 && ` ${resultadoImportacao.erros.length} erro(s).`}
                  </p>
                  {resultadoImportacao.erros.length > 0 && (
                    <ul className="text-sm text-muted-foreground list-disc list-inside max-h-40 overflow-y-auto">
                      {resultadoImportacao.erros.slice(0, 20).map((e, i) => (
                        <li key={i}>Linha {e.linha} (CPF {e.cpf}): {e.mensagem}</li>
                      ))}
                      {resultadoImportacao.erros.length > 20 && (
                        <li>… e mais {resultadoImportacao.erros.length - 20} erro(s)</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cadastrados" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Colaboradores cadastrados</CardTitle>
                  <CardDescription>
                    Edite, inative (quem já teve movimentação) ou exclua (quem nunca movimentou). RE é opcional.
                  </CardDescription>
                </div>
                <Button onClick={abrirNovo} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Cadastrar colaborador
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {erroForm && (
                <p className="text-sm text-destructive mb-4">{erroForm}</p>
              )}
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : colaboradores.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhum colaborador cadastrado. Use &quot;Cadastrar colaborador&quot; ou a aba Importar.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Buscar por nome, CPF, RE, email ou empresa..."
                        value={buscaCadastrados}
                        onChange={(e) => {
                          setBuscaCadastrados(e.target.value)
                          setPaginaCadastrados(1)
                        }}
                        className="pl-9"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Mostrando {Math.min(totalCadastrados, inicioCadastrados + 1)}–
                      {Math.min(totalCadastrados, fimCadastrados)} de {totalCadastrados} colaboradores
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Nome</th>
                          <th className="text-left py-2">CPF</th>
                          <th className="text-left py-2">RE</th>
                          <th className="text-left py-2">Email</th>
                          <th className="text-left py-2">Empresa</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-right py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginaItensCadastrados.map((c) => {
                        const temMov = idsComMovimentacao.has(c.id)
                          return (
                            <tr key={c.id} className="border-b">
                              <td className="py-2 font-medium">{c.nome ?? '-'}</td>
                              <td className="py-2">{c.cpf ?? '-'}</td>
                              <td className="py-2">{c.re_colaborador ?? '-'}</td>
                              <td className="py-2">{c.email ?? '-'}</td>
                              <td className="py-2">{c.empresa_nome ?? '-'}</td>
                              <td className="py-2">
                                <span className={c.ativo ? 'text-green-600' : 'text-muted-foreground'}>
                                  {c.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td className="py-2 text-right">
                                <div className="flex flex-wrap justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)} title="Editar">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {c.ativo ? (
                                    temMov && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setConfirmInativar(c)}
                                        disabled={acaoLoading === c.id}
                                        title="Inativar (teve movimentação)"
                                      >
                                        {acaoLoading === c.id ? (
                                          <span className="animate-spin h-4 w-4 border border-primary border-t-transparent rounded-full" />
                                        ) : (
                                          <Ban className="h-4 w-4 text-amber-600" />
                                        )}
                                      </Button>
                                    )
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleReativar(c)}
                                      disabled={acaoLoading === c.id}
                                      title="Reativar"
                                    >
                                      {acaoLoading === c.id ? (
                                        <span className="animate-spin h-4 w-4 border border-primary border-t-transparent rounded-full" />
                                      ) : (
                                        <UserCheck className="h-4 w-4 text-green-600" />
                                      )}
                                    </Button>
                                  )}
                                  {!temMov && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmExcluir(c)}
                                      disabled={acaoLoading === c.id}
                                      title="Excluir (nunca movimentou)"
                                    >
                                      {acaoLoading === c.id ? (
                                        <span className="animate-spin h-4 w-4 border border-primary border-t-transparent rounded-full" />
                                      ) : (
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">
                      Página {paginaCorrigidaCadastrados} de {totalPaginasCadastrados}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginaCorrigidaCadastrados <= 1}
                        onClick={() => setPaginaCadastrados((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginaCorrigidaCadastrados >= totalPaginasCadastrados}
                        onClick={() => setPaginaCadastrados((p) => Math.min(totalPaginasCadastrados, p + 1))}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saldo devedor por colaborador</CardTitle>
              <CardDescription>
                Colaboradores com consumo a abater. Use &quot;Fazer lançamento&quot; para registrar o abatimento (desconto em folha).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : saldoDevedorList.length === 0 ? (
                <p className="text-muted-foreground">Nenhum saldo devedor no momento.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Buscar por nome, RE ou CPF..."
                        value={buscaSaldoDevedor}
                        onChange={(e) => setBuscaSaldoDevedor(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Colaborador</th>
                          <th className="text-left py-2">RE</th>
                          <th className="text-right py-2">Saldo devedor</th>
                          <th className="text-right py-2 w-40">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saldoDevedorList
                          .filter((c) => {
                            const termoNorm = normalizarBusca(buscaSaldoDevedor).trim()
                            if (!termoNorm) return true
                            const termos = termoNorm.split(/\s+/).filter(Boolean)
                            const textoNome = normalizarBusca(String(c.nome ?? ''))
                            const textoRe = normalizarBusca(String(c.re_colaborador ?? ''))
                            const cpfDigitos = (c.cpf || '').replace(/\D/g, '')
                            return termos.every(
                              (t) =>
                                textoNome.includes(t) ||
                                textoRe.includes(t) ||
                                (t.replace(/\D/g, '').length >= 3 && cpfDigitos.includes(t.replace(/\D/g, '')))
                            )
                          })
                          .map((c) => (
                            <tr key={c.usuario_id} className="border-b">
                              <td className="py-2 font-medium">{c.nome}</td>
                              <td className="py-2">{c.re_colaborador || '-'}</td>
                              <td className="text-right py-2 font-medium text-destructive">
                                {formatPrice(c.saldo_devedor)}
                              </td>
                              <td className="text-right py-2">
                                <Button size="sm" onClick={() => abrirLancamento(c)}>
                                  Fazer lançamento
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end text-sm font-semibold">
                    <span className="mr-2 text-muted-foreground">Total saldo devedor:</span>
                    <span className="text-destructive">{formatPriceLocal(totalSaldoDevedor)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por período</CardTitle>
              <CardDescription>
                Veja o consumo de cada colaborador por mês: valor consumido, valor já abatido pelo RH e saldo devedor naquele mês (mesmo que já tenha sido abatido depois).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input
                    type="number"
                    min={2020}
                    max={2030}
                    value={consumoPeriodoAno}
                    onChange={(e) => setConsumoPeriodoAno(Number(e.target.value) || new Date().getFullYear())}
                    className="w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mês inicial</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={consumoPeriodoMesIni}
                    onChange={(e) => setConsumoPeriodoMesIni(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}/{consumoPeriodoAno}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Mês final</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={consumoPeriodoMesFim}
                    onChange={(e) => setConsumoPeriodoMesFim(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}/{consumoPeriodoAno}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={carregarConsumoPorPeriodo} disabled={loadingConsumoPeriodo}>
                    {loadingConsumoPeriodo ? 'Carregando...' : 'Buscar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingConsumoPeriodo || consumoPeriodoLista.length === 0}
                    onClick={imprimirConsumoPorPeriodo}
                  >
                    Imprimir relatório (A4)
                  </Button>
                </div>
              </div>
              {loadingConsumoPeriodo ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : consumoPeriodoLista.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Selecione o período e clique em Buscar para ver o consumo mensal (consumido, abatido e saldo devedor por colaborador).
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Buscar por colaborador, empresa ou mês/ano..."
                        value={buscaConsumoPeriodo}
                        onChange={(e) => {
                          setBuscaConsumoPeriodo(e.target.value)
                          setPaginaConsumoPeriodo(1)
                        }}
                        className="pl-9"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Mostrando {Math.min(totalConsumoPeriodo, inicioConsumoPeriodo + 1)}–
                      {Math.min(totalConsumoPeriodo, fimConsumoPeriodo)} de {totalConsumoPeriodo} registros
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Colaborador</th>
                          <th className="text-left py-2">Mês/Ano</th>
                          <th className="text-left py-2">RE</th>
                          <th className="text-right py-2">Consumido</th>
                          <th className="text-right py-2">Abatido</th>
                          <th className="text-right py-2">Saldo devedor (mês)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginaItensConsumoPeriodo.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-muted-foreground text-sm">
                              Nenhum registro encontrado para o filtro informado.
                            </td>
                          </tr>
                        ) : (
                          paginaItensConsumoPeriodo.map((r) => (
                            <tr key={r.id} className="border-b">
                              <td className="py-2 font-medium">{r.nome}</td>
                              <td className="py-2">
                                {String(r.mes).padStart(2, '0')}/{r.ano}
                              </td>
                              <td className="py-2">{(r as any).re_colaborador ?? '-'}</td>
                              <td className="text-right py-2">{formatPrice(r.valor_total)}</td>
                              <td className="text-right py-2">{formatPrice(r.valor_abatido)}</td>
                              <td className="text-right py-2 font-medium">
                                {r.saldo_devedor > 0 ? (
                                  <span className="text-destructive">{formatPrice(r.saldo_devedor)}</span>
                                ) : (
                                  formatPrice(r.saldo_devedor)
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">
                      Página {paginaCorrigidaConsumoPeriodo} de {totalPaginasConsumoPeriodo}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginaCorrigidaConsumoPeriodo <= 1}
                        onClick={() => setPaginaConsumoPeriodo((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginaCorrigidaConsumoPeriodo >= totalPaginasConsumoPeriodo}
                        onClick={() => setPaginaConsumoPeriodo((p) => Math.min(totalPaginasConsumoPeriodo, p + 1))}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relatorio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatório por colaborador e período</CardTitle>
              <CardDescription>
                Defina o período, busque o colaborador pelo nome e visualize compras e baixas (abatimentos) do RH. Clique em uma compra para expandir e ver os itens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : colaboradores.length === 0 ? (
                <p className="text-muted-foreground">Nenhum colaborador cadastrado.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data inicial</Label>
                      <Input
                        type="date"
                        value={relatorioDataIni}
                        onChange={(e) => setRelatorioDataIni(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data final</Label>
                      <Input
                        type="date"
                        value={relatorioDataFim}
                        onChange={(e) => setRelatorioDataFim(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="relative space-y-2" ref={listaBuscaRef}>
                    <Label>Colaborador</Label>
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        autoComplete="off"
                        placeholder="Digite o nome ou RE para buscar..."
                        value={colaboradorRelatorio ? colaboradorRelatorio.nome ?? '' : buscaColaborador}
                        onChange={(e) => {
                          setBuscaColaborador(e.target.value)
                          if (!colaboradorRelatorio) setMostrarListaBuscaRelatorio(true)
                          else setColaboradorRelatorio(null)
                        }}
                        onFocus={() => setMostrarListaBuscaRelatorio(true)}
                        className="pl-9"
                      />
                      {colaboradorRelatorio && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2"
                          onClick={() => {
                            setColaboradorRelatorio(null)
                            setBuscaColaborador('')
                            setMovimentacoesPeriodo([])
                            setRelatorioJaCarregado(false)
                          }}
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                    {mostrarListaBuscaRelatorio && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto border-border">
                        {colaboradoresFiltrados.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum colaborador encontrado</div>
                        ) : (
                          colaboradoresFiltrados.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-accent flex justify-between items-center gap-2 border-b last:border-b-0"
                              onClick={() => {
                                setColaboradorRelatorio(c)
                                setBuscaColaborador('')
                                setMostrarListaBuscaRelatorio(false)
                              }}
                            >
                              <span className="font-medium truncate">{c.nome ?? '-'}</span>
                              {c.re_colaborador && (
                                <span className="text-xs text-muted-foreground shrink-0">RE {c.re_colaborador}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {colaboradorRelatorio && (
                    <>
                      <Button onClick={carregarRelatorio} disabled={loadingMovimentacoes}>
                        {loadingMovimentacoes ? 'Carregando...' : 'Abrir relatório'}
                      </Button>

                      {movimentacoesPeriodo.length > 0 && (
                        <div className="rounded-lg border divide-y mt-4">
                          <div className="px-4 py-3 bg-muted/50 font-medium">
                            {colaboradorRelatorio.nome ?? '-'} — {relatorioDataIni} a {relatorioDataFim}
                          </div>
                          {movimentacoesPeriodo.map((mov) => {
                            const dataHora = new Date(mov.data_hora)
                            const dataHoraStr = dataHora.toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                            if (mov.tipo === 'compra') {
                              const expandido = expandidoCompraId === mov.id
                              const cancelado = mov.status === 'CANCELADO'
                              return (
                                <div key={mov.id} className="divide-y">
                                  <button
                                    type="button"
                                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                                    onClick={() => setExpandidoCompraId(expandido ? null : mov.id)}
                                  >
                                    <span className="text-muted-foreground text-sm">{dataHoraStr}</span>
                                    <span className={`font-medium ${cancelado ? 'text-muted-foreground line-through' : ''}`}>
                                      Compra — {formatPrice(mov.total)}
                                      {cancelado && (
                                        <span className="ml-2 inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                                          Cancelado
                                        </span>
                                      )}
                                    </span>
                                    <ChevronDown
                                      className={`h-4 w-4 text-muted-foreground transition-transform ${expandido ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                  {expandido && (
                                    <div className="px-4 pb-3 pt-0 bg-muted/20">
                                      {cancelado && (
                                        <p className="text-xs text-destructive font-medium mb-2">Este pedido foi cancelado (ex.: em Relatórios → Vendas por operador).</p>
                                      )}
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b">
                                            <th className="text-left py-2">Produto</th>
                                            <th className="text-right py-2">Qtd</th>
                                            <th className="text-right py-2">Unit.</th>
                                            <th className="text-right py-2">Subtotal</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {mov.itens.map((item, idx) => (
                                            <tr key={idx} className="border-b last:border-0">
                                              <td className="py-2">{item.produto_nome}</td>
                                              <td className="text-right py-2">{item.quantidade}</td>
                                              <td className="text-right py-2">{formatPrice(item.preco_unitario)}</td>
                                              <td className="text-right py-2">{formatPrice(item.subtotal)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            return (
                              <div key={mov.id} className="flex items-center justify-between px-4 py-3">
                                <span className="text-muted-foreground text-sm">{dataHoraStr}</span>
                                <span className="font-medium text-green-700">Baixa (RH) — {formatPrice(mov.valor)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {!loadingMovimentacoes && colaboradorRelatorio && movimentacoesPeriodo.length === 0 && (
                        <p className="text-muted-foreground text-sm mt-4">
                          {relatorioJaCarregado
                            ? 'Nenhuma movimentação no período.'
                            : 'Clique em "Abrir relatório" para carregar as movimentações (compras e baixas) do período.'}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Editar colaborador */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar colaborador</DialogTitle>
            <DialogDescription>Altere nome, CPF, email, RE (opcional) e empresa.</DialogDescription>
          </DialogHeader>
          {editColaborador && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formEdit.nome}
                  onChange={(e) => setFormEdit((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input
                  value={formEdit.cpf}
                  onChange={(e) => setFormEdit((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, '') }))}
                  placeholder="11 dígitos"
                  maxLength={11}
                />
              </div>
              <div className="space-y-2">
                <Label>RE (opcional)</Label>
                <Input
                  value={formEdit.re_colaborador ?? ''}
                  onChange={(e) => setFormEdit((f) => ({ ...f, re_colaborador: e.target.value }))}
                  placeholder="Registro do empregado"
                />
              </div>
              <div className="space-y-2">
                <Label>Email (opcional)</Label>
                <Input
                  type="email"
                  value={formEdit.email ?? ''}
                  onChange={(e) => setFormEdit((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={formEdit.empresa_id ?? ''}
                  onChange={(e) => setFormEdit((f) => ({ ...f, empresa_id: e.target.value || null }))}
                >
                  <option value="">—</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.nome}</option>
                  ))}
                </select>
              </div>
              {erroForm && <p className="text-sm text-destructive">{erroForm}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo colaborador */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar colaborador</DialogTitle>
            <DialogDescription>Nome e CPF obrigatórios. RE e email opcionais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formNew.nome}
                onChange={(e) => setFormNew((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF *</Label>
              <Input
                value={formNew.cpf}
                onChange={(e) => setFormNew((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, '') }))}
                placeholder="11 dígitos"
                maxLength={11}
              />
            </div>
            <div className="space-y-2">
              <Label>RE (opcional)</Label>
              <Input
                value={formNew.re_colaborador ?? ''}
                onChange={(e) => setFormNew((f) => ({ ...f, re_colaborador: e.target.value }))}
                placeholder="Registro do empregado"
              />
            </div>
            <div className="space-y-2">
              <Label>Email (opcional)</Label>
              <Input
                type="email"
                value={formNew.email ?? ''}
                onChange={(e) => setFormNew((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={formNew.empresa_id ?? ''}
                onChange={(e) => setFormNew((f) => ({ ...f, empresa_id: e.target.value || null }))}
              >
                <option value="">—</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nome}</option>
                ))}
              </select>
            </div>
            {erroForm && <p className="text-sm text-destructive">{erroForm}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={saving}>{saving ? 'Cadastrando...' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar inativar */}
      <Dialog open={!!confirmInativar} onOpenChange={(open) => !open && setConfirmInativar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inativar colaborador</DialogTitle>
            <DialogDescription>
              {confirmInativar && (
                <>O colaborador <strong>{confirmInativar.nome}</strong> já teve movimentação. Ele ficará inativo e não aparecerá em novas listas de consumo, mas o histórico será mantido.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmInativar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmInativar && handleInativar(confirmInativar)} disabled={!!acaoLoading}>
              {acaoLoading ? 'Inativando...' : 'Inativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar excluir */}
      <Dialog open={!!confirmExcluir} onOpenChange={(open) => !open && setConfirmExcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir colaborador</DialogTitle>
            <DialogDescription>
              {confirmExcluir && (
                <>O colaborador <strong>{confirmExcluir.nome}</strong> nunca teve movimentação e será removido do sistema. Esta ação não pode ser desfeita.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExcluir(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmExcluir && handleExcluir(confirmExcluir)} disabled={!!acaoLoading}>
              {acaoLoading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Fazer lançamento */}
      <Dialog open={lancamentoOpen} onOpenChange={setLancamentoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fazer lançamento (abatimento)</DialogTitle>
            <DialogDescription>
              Registre o valor abatido em folha para reduzir o saldo devedor do colaborador.
            </DialogDescription>
          </DialogHeader>
          {lancamentoColaborador && (
            <div className="space-y-4 py-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Colaborador:</span>{' '}
                <strong>{lancamentoColaborador.nome}</strong>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Saldo devedor atual:</span>{' '}
                <strong className="text-destructive">{formatPrice(lancamentoColaborador.saldo_devedor)}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="valor-lancamento">Valor a abater (R$)</Label>
                <Input
                  id="valor-lancamento"
                  type="text"
                  placeholder="0,00"
                  value={valorLancamento}
                  onChange={(e) => setValorLancamento(e.target.value)}
                />
              </div>
              {erroLancamento && (
                <p className="text-sm text-destructive">{erroLancamento}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLancamentoOpen(false)} disabled={salvandoLancamento}>
              Cancelar
            </Button>
            <Button onClick={confirmarLancamento} disabled={salvandoLancamento}>
              {salvandoLancamento ? 'Registrando...' : 'Confirmar lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
