'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obterMeuPerfil, type UsuarioCompleto } from '@/app/actions/responsavel'
import {
  obterConfigAlunoParaLoja,
  definirLimiteDiario,
  definirBloquearCompraSaldoNegativo,
  bloquearProduto,
  desbloquearProduto,
  listarProdutosCardapioParaBloqueio,
  type ProdutoCardapioItem,
} from '@/app/actions/aluno-config'
import { obterConfigCreditoCantinaParaResponsavel } from '@/app/actions/configuracoes'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Settings, CreditCard, ChevronDown } from 'lucide-react'

interface ConfigAluno {
  limite_gasto_diario: number | null
  produtos_bloqueados_ids: string[]
  bloquear_compra_saldo_negativo: boolean
}

function ControlePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<UsuarioCompleto | null>(null)
  const [configPorAluno, setConfigPorAluno] = useState<Record<string, ConfigAluno | null>>({})
  const [cardapioPorAluno, setCardapioPorAluno] = useState<Record<string, ProdutoCardapioItem[]>>({})
  const [valoresLimite, setValoresLimite] = useState<Record<string, string>>({})
  const [produtosParaBloquear, setProdutosParaBloquear] = useState<Record<string, string>>({})
  const [comboboxAberto, setComboboxAberto] = useState<Record<string, boolean>>({})
  const [buscaProduto, setBuscaProduto] = useState<Record<string, string>>({})
  const comboboxRef = useRef<HTMLDivElement>(null)
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [configCreditoCantina, setConfigCreditoCantina] = useState<{
    permitir_saldo_negativo: boolean
    limite_saldo_negativo: number
  }>({ permitir_saldo_negativo: false, limite_saldo_negativo: 0 })

  const alunoIdFromUrl = searchParams.get('aluno')
  const alunos = useMemo(() => usuario?.alunos ?? [], [usuario])
  const selectedAluno = useMemo(() => {
    if (!alunos.length) return null
    const found = alunos.find((a: { id: string }) => a.id === alunoIdFromUrl)
    return found ?? alunos[0]
  }, [alunos, alunoIdFromUrl])
  const selectedAlunoId = selectedAluno?.id ?? null
  const config = selectedAlunoId ? configPorAluno[selectedAlunoId] : null
  const cardapio = selectedAlunoId ? cardapioPorAluno[selectedAlunoId] ?? [] : []
  const bloqueadosComNome = useMemo(() => {
    if (!config) return []
    return (config.produtos_bloqueados_ids || [])
      .map((id) => ({ id, nome: cardapio.find((p) => p.id === id)?.nome || id }))
  }, [config, cardapio])
  const produtosDisponiveisParaBloquear = cardapio.filter(
    (p) => !config?.produtos_bloqueados_ids?.includes(p.id)
  )
  const produtoSelecionado = produtosParaBloquear[selectedAlunoId || '']
    ? produtosDisponiveisParaBloquear.find((p) => p.id === produtosParaBloquear[selectedAlunoId || ''])
    : null
  const buscaAtual = selectedAlunoId ? (buscaProduto[selectedAlunoId] ?? '') : ''
  const inputValue = comboboxAberto[selectedAlunoId || '']
    ? buscaAtual
    : produtoSelecionado?.nome ?? buscaAtual
  const produtosFiltrados = useMemo(() => {
    const q = buscaAtual.trim().toLowerCase()
    if (!q) return produtosDisponiveisParaBloquear
    return produtosDisponiveisParaBloquear.filter((p) => p.nome.toLowerCase().includes(q))
  }, [produtosDisponiveisParaBloquear, buscaAtual])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setComboboxAberto((prev) => {
          const next = { ...prev }
          Object.keys(next).forEach((k) => { next[k] = false })
          return next
        })
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    carregarDados().catch((err) => {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
      if (String(err).includes('Não autenticado')) router.replace('/login?message=session_nao_encontrada')
    })
  }, [])

  async function carregarDados() {
    try {
      setLoading(true)
      setError(null)
      const [perfil, creditoCantina] = await Promise.all([
        obterMeuPerfil(),
        obterConfigCreditoCantinaParaResponsavel(),
      ])
      if (!perfil) {
        router.push('/loja')
        return
      }
      setUsuario(perfil)
      setConfigCreditoCantina(creditoCantina)

      const resultados = await Promise.all(
        perfil.alunos.map(async (aluno: { id: string }) => {
          const [configData, cardapioList] = await Promise.all([
            obterConfigAlunoParaLoja(aluno.id),
            listarProdutosCardapioParaBloqueio(aluno.id),
          ])
          return {
            alunoId: aluno.id,
            config: configData,
            cardapio: cardapioList,
          }
        })
      )
      const configMap: Record<string, ConfigAluno | null> = {}
      const cardapioMap: Record<string, ProdutoCardapioItem[]> = {}
      resultados.forEach(({ alunoId, config: c, cardapio: card }) => {
        configMap[alunoId] = c
          ? {
              limite_gasto_diario: c.limite_gasto_diario,
              produtos_bloqueados_ids: c.produtos_bloqueados_ids ?? [],
              bloquear_compra_saldo_negativo: c.bloquear_compra_saldo_negativo ?? false,
            }
          : null
        cardapioMap[alunoId] = card
        setValoresLimite((prev) => ({
          ...prev,
          [alunoId]: c?.limite_gasto_diario != null ? String(c.limite_gasto_diario) : '',
        }))
      })
      setConfigPorAluno(configMap)
      setCardapioPorAluno(cardapioMap)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  async function handleSalvarLimite(alunoId: string) {
    if (!usuario) return
    const valorStr = valoresLimite[alunoId] || ''
    const v = valorStr.trim() === '' ? null : parseFloat(valorStr.replace(',', '.'))
    if (v !== null && (isNaN(v) || v < 0)) return
    setSalvando((prev) => ({ ...prev, [alunoId]: true }))
    setMsg((prev) => ({ ...prev, [alunoId]: null }))
    const res = await definirLimiteDiario(alunoId, usuario.id, v)
    setSalvando((prev) => ({ ...prev, [alunoId]: false }))
    if (res.ok) {
      setConfigPorAluno((prev) => ({
        ...prev,
        [alunoId]: prev[alunoId]
          ? { ...prev[alunoId]!, limite_gasto_diario: v }
          : { limite_gasto_diario: v, produtos_bloqueados_ids: [], bloquear_compra_saldo_negativo: false },
      }))
      setMsg((prev) => ({ ...prev, [alunoId]: 'Limite atualizado.' }))
    } else {
      setMsg((prev) => ({ ...prev, [alunoId]: res.erro || 'Erro' }))
    }
  }

  async function handleBloquearProduto(alunoId: string) {
    if (!usuario || !produtosParaBloquear[alunoId]) return
    setSalvando((prev) => ({ ...prev, [alunoId]: true }))
    setMsg((prev) => ({ ...prev, [alunoId]: null }))
    const res = await bloquearProduto(alunoId, usuario.id, produtosParaBloquear[alunoId])
    setSalvando((prev) => ({ ...prev, [alunoId]: false }))
    if (res.ok) {
      setConfigPorAluno((prev) => ({
        ...prev,
        [alunoId]: prev[alunoId]
          ? {
              ...prev[alunoId]!,
              produtos_bloqueados_ids: [...prev[alunoId]!.produtos_bloqueados_ids, produtosParaBloquear[alunoId]],
            }
          : {
              limite_gasto_diario: null,
              produtos_bloqueados_ids: [produtosParaBloquear[alunoId]],
              bloquear_compra_saldo_negativo: false,
            },
      }))
      setProdutosParaBloquear((prev) => ({ ...prev, [alunoId]: '' }))
      setBuscaProduto((prev) => ({ ...prev, [alunoId]: '' }))
      setMsg((prev) => ({ ...prev, [alunoId]: 'Produto bloqueado.' }))
    } else {
      setMsg((prev) => ({ ...prev, [alunoId]: res.erro || 'Erro ao bloquear' }))
    }
  }

  async function handleDesbloquearProduto(alunoId: string, produtoId: string) {
    if (!usuario) return
    setSalvando((prev) => ({ ...prev, [alunoId]: true }))
    setMsg((prev) => ({ ...prev, [alunoId]: null }))
    const res = await desbloquearProduto(alunoId, usuario.id, produtoId)
    setSalvando((prev) => ({ ...prev, [alunoId]: false }))
    if (res.ok) {
      setConfigPorAluno((prev) => ({
        ...prev,
        [alunoId]: prev[alunoId]
          ? {
              ...prev[alunoId]!,
              produtos_bloqueados_ids: prev[alunoId]!.produtos_bloqueados_ids.filter((id) => id !== produtoId),
            }
          : prev[alunoId],
      }))
      setMsg((prev) => ({ ...prev, [alunoId]: 'Produto desbloqueado.' }))
    } else {
      setMsg((prev) => ({ ...prev, [alunoId]: res.erro || 'Erro ao desbloquear' }))
    }
  }

  async function handleBloquearSaldoNegativo(alunoId: string, bloquear: boolean) {
    if (!usuario) return
    setSalvando((prev) => ({ ...prev, [alunoId]: true }))
    setMsg((prev) => ({ ...prev, [alunoId]: null }))
    const res = await definirBloquearCompraSaldoNegativo(alunoId, usuario.id, bloquear)
    setSalvando((prev) => ({ ...prev, [alunoId]: false }))
    if (res.ok) {
      setConfigPorAluno((prev) => ({
        ...prev,
        [alunoId]: prev[alunoId]
          ? { ...prev[alunoId]!, bloquear_compra_saldo_negativo: bloquear }
          : { limite_gasto_diario: null, produtos_bloqueados_ids: [], bloquear_compra_saldo_negativo: bloquear },
      }))
      setMsg((prev) => ({ ...prev, [alunoId]: bloquear ? 'Bloqueio ativado.' : 'Bloqueio desativado.' }))
    } else {
      setMsg((prev) => ({ ...prev, [alunoId]: res.erro || 'Erro ao salvar' }))
    }
  }

  function handleAlunoChange(alunoId: string) {
    router.push('/loja/controle?aluno=' + encodeURIComponent(alunoId))
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="min-h-[60vh] bg-gradient-to-b from-sky-50/80 to-indigo-50/50">
          <div className="container mx-auto px-4 py-12 max-w-2xl">
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 mb-4">
                <Settings className="h-7 w-7 animate-pulse" />
              </div>
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-500 border-t-transparent mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Carregando controle...</p>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (error || !usuario) {
    return (
      <>
        <LojaHeader />
        <div className="min-h-[60vh] bg-gradient-to-b from-sky-50/80 to-indigo-50/50">
          <div className="container mx-auto px-4 py-12 max-w-2xl">
            <Card className="rounded-2xl border-0 shadow-lg overflow-hidden bg-white">
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="h-7 w-7" />
                </div>
                <p className="text-red-600 font-medium">{error || 'Erro ao carregar dados'}</p>
                <Button onClick={carregarDados} className="mt-5 rounded-xl bg-[#0B5ED7] hover:bg-[#0a58c9] text-white shadow-md">
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    )
  }

  const alunosList = usuario.alunos || []
  if (alunosList.length === 0) {
    return (
      <>
        <LojaHeader />
        <div className="min-h-[60vh] bg-gradient-to-b from-sky-50/80 to-indigo-50/50">
          <div className="container mx-auto px-4 py-12 max-w-2xl">
            <div className="mb-8 flex items-center gap-4">
              <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg">
                <Settings className="h-7 w-7" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Controle</h1>
                <p className="text-sm text-slate-500">Limites e produtos bloqueados</p>
              </div>
            </div>
            <Card className="rounded-2xl border-0 shadow-xl bg-white overflow-hidden">
              <CardContent className="pt-14 pb-14 text-center">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="h-10 w-10 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">Nenhum dependente vinculado à sua conta.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <LojaHeader />
      <div className="min-h-[60vh] bg-gradient-to-b from-sky-50/80 via-white to-indigo-50/40 pb-12">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          {/* Título */}
          <div className="mb-8 flex items-center gap-4">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg">
              <Settings className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Controle</h1>
              <p className="text-sm text-slate-500">Limites e produtos bloqueados por filho</p>
            </div>
          </div>

          {alunosList.length > 1 && (
            <div className="mb-6">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Selecionar filho</label>
              <Select value={selectedAlunoId ?? ''} onValueChange={handleAlunoChange}>
                <SelectTrigger className="rounded-xl border-2 border-sky-100 bg-white text-slate-800 hover:border-sky-200 focus:ring-2 focus:ring-sky-500/20 max-w-md h-12">
                  <SelectValue placeholder="Selecione o filho" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-0 shadow-xl">
                  {alunosList.map((a: { id: string; nome: string }) => (
                    <SelectItem key={a.id} value={a.id} className="rounded-lg">
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedAluno && selectedAlunoId && (
            <div className="space-y-6">
              <Card className="rounded-2xl border-0 shadow-xl overflow-hidden bg-white">
                <CardHeader className="bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border-b border-sky-100/50 py-6">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500 text-white">
                      <CreditCard className="h-5 w-5" />
                    </span>
                    {selectedAluno.nome}
                  </CardTitle>
                  <CardDescription className="text-sm text-slate-500 pl-[3.25rem]">
                    Limite diário e itens bloqueados do cardápio
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-8">
                  {/* Limite diário */}
                  <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-5">
                    <h3 className="text-base font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-600 text-sm">R$</span>
                      Limite de gasto diário
                    </h3>
                    <p className="text-sm text-emerald-800/80 mb-4">
                      Valor máximo que {selectedAluno.nome} pode gastar por dia. Deixe vazio para sem limite.
                    </p>
                    <div className="flex gap-3 flex-wrap items-center">
                      <Input
                        type="text"
                        placeholder="Ex: 25,00"
                        value={valoresLimite[selectedAlunoId] || ''}
                        onChange={(e) =>
                          setValoresLimite((prev) => ({ ...prev, [selectedAlunoId]: e.target.value }))
                        }
                        className="max-w-[140px] rounded-xl border-emerald-200 bg-white focus:ring-2 focus:ring-emerald-500/20 text-slate-800"
                      />
                      <Button
                        onClick={() => handleSalvarLimite(selectedAlunoId)}
                        disabled={salvando[selectedAlunoId]}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                      >
                        {salvando[selectedAlunoId] ? 'Salvando...' : 'Salvar limite'}
                      </Button>
                    </div>
                  </div>

                  {/* Bloquear compra na cantina com saldo negativo (mostra só se admin liberou saldo negativo) */}
                  {configCreditoCantina.permitir_saldo_negativo && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900 mb-1">
                            Bloquear compra na cantina com saldo negativo
                          </h3>
                          <p className="text-sm text-slate-600">
                            A plataforma permite saldo negativo até{' '}
                            <strong>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                configCreditoCantina.limite_saldo_negativo
                              )}
                            </strong>
                            . Use a chavinha ao lado para definir se {selectedAluno.nome} pode ou não utilizar esse limite.
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            id="bloquear-saldo-negativo"
                            checked={config?.bloquear_compra_saldo_negativo ?? false}
                            onCheckedChange={(checked) => {
                              const value = checked === true
                              handleBloquearSaldoNegativo(selectedAlunoId, value)
                            }}
                            disabled={salvando[selectedAlunoId]}
                            className="h-5 w-5 rounded-full border-slate-400 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                          />
                          <span className="text-xs font-medium text-slate-700">
                            {config?.bloquear_compra_saldo_negativo ? 'Bloqueado' : 'Desbloqueado'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Produtos bloqueados */}
                  <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-5">
                    <h3 className="text-base font-semibold text-amber-900 mb-1">Produtos bloqueados do cardápio</h3>
                    <p className="text-sm text-amber-800/80 mb-4">
                      Itens que {selectedAluno.nome} não pode comprar na cantina.
                    </p>
                    {bloqueadosComNome.length > 0 && (
                      <ul className="space-y-2 mb-4">
                        {bloqueadosComNome.map(({ id, nome }) => (
                          <li
                            key={id}
                            className="flex items-center justify-between py-3 px-4 rounded-xl bg-white border border-amber-200/80 shadow-sm"
                          >
                            <span className="text-slate-800 font-medium">{nome}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDesbloquearProduto(selectedAlunoId, id)}
                              disabled={salvando[selectedAlunoId]}
                              className="text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"
                            >
                              Desbloquear
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {produtosDisponiveisParaBloquear.length > 0 ? (
                      <div className="flex gap-3 flex-wrap items-center">
                        <div ref={comboboxRef} className="relative min-w-[240px]">
                          <div className="flex rounded-xl border-2 border-amber-200/80 bg-white overflow-hidden shadow-sm">
                            <Input
                              type="text"
                              placeholder="Digite o nome do produto..."
                              value={inputValue}
                              onChange={(e) =>
                                setBuscaProduto((prev) => ({ ...prev, [selectedAlunoId]: e.target.value }))
                              }
                              onFocus={() =>
                                setComboboxAberto((prev) => ({ ...prev, [selectedAlunoId]: true }))
                              }
                              className="rounded-r-none border-0 focus-visible:ring-0 flex-1 min-w-0 text-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setComboboxAberto((prev) => ({
                                  ...prev,
                                  [selectedAlunoId]: !prev[selectedAlunoId],
                                }))
                              }
                              className="flex items-center justify-center px-3 border-l border-amber-200/80 bg-amber-50/50 text-amber-700 hover:bg-amber-100/50 transition-colors"
                              aria-label="Abrir lista"
                            >
                              <ChevronDown
                                className={`h-5 w-5 transition-transform ${comboboxAberto[selectedAlunoId] ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                          {comboboxAberto[selectedAlunoId] && (
                            <ul className="mt-2 w-full rounded-xl border-2 border-amber-200/80 bg-white shadow-lg py-1 max-h-56 overflow-auto">
                              {produtosFiltrados.length === 0 ? (
                                <li className="px-4 py-3 text-sm text-slate-500">
                                  Nenhum produto encontrado.
                                </li>
                              ) : (
                                produtosFiltrados.map((p) => (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      className="w-full text-left px-4 py-2.5 text-sm text-slate-800 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none transition-colors rounded-none"
                                      onClick={() => {
                                        setProdutosParaBloquear((prev) => ({
                                          ...prev,
                                          [selectedAlunoId]: p.id,
                                        }))
                                        setBuscaProduto((prev) => ({ ...prev, [selectedAlunoId]: '' }))
                                        setComboboxAberto((prev) => ({ ...prev, [selectedAlunoId]: false }))
                                      }}
                                    >
                                      {p.nome}
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                        </div>
                        <Button
                          onClick={() => handleBloquearProduto(selectedAlunoId)}
                          disabled={salvando[selectedAlunoId] || !produtosParaBloquear[selectedAlunoId]}
                          className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md"
                        >
                          Bloquear produto
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-800/80">
                        {bloqueadosComNome.length > 0
                          ? 'Todos os itens já bloqueados ou não há mais itens.'
                          : 'Nenhum produto no cardápio no momento.'}
                      </p>
                    )}
                    {msg[selectedAlunoId] && (
                      <p className={`text-sm mt-3 font-medium ${msg[selectedAlunoId]?.startsWith('Erro') ? 'text-red-600' : 'text-emerald-700'}`}>
                        {msg[selectedAlunoId]}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ControlePageFallback() {
  return (
    <>
      <LojaHeader />
      <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent" />
      </div>
    </>
  )
}

export default function ControlePage() {
  return (
    <Suspense fallback={<ControlePageFallback />}>
      <ControlePageContent />
    </Suspense>
  )
}
