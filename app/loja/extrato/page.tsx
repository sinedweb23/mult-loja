'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obterMeuPerfil, type UsuarioCompleto } from '@/app/actions/responsavel'
import { obterSaldoAluno, obterExtratoAluno, type ExtratoItem } from '@/app/actions/saldo'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Receipt, CreditCard } from 'lucide-react'

function ExtratoPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<UsuarioCompleto | null>(null)
  const [extratoPorAluno, setExtratoPorAluno] = useState<Record<string, ExtratoItem[]>>({})
  const [saldoPorAluno, setSaldoPorAluno] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [filtroOrigem, setFiltroOrigem] = useState<'TODOS' | 'LOJA_ONLINE' | 'CANTINA'>('TODOS')
  const [pagina, setPagina] = useState(1)
  const pageSize = 20

  const alunoIdFromUrl = searchParams.get('aluno')
  const alunos = useMemo(() => usuario?.alunos ?? [], [usuario])
  const selectedAluno = useMemo(() => {
    if (!alunos.length) return null
    const found = alunos.find((a: { id: string }) => a.id === alunoIdFromUrl)
    return found ?? alunos[0]
  }, [alunos, alunoIdFromUrl])
  const selectedAlunoId = selectedAluno?.id ?? null
  const extratoBruto = selectedAlunoId ? extratoPorAluno[selectedAlunoId] ?? [] : []
  const saldo = selectedAlunoId ? saldoPorAluno[selectedAlunoId] : 0

  const extratoFiltrado = useMemo(() => {
    let itens = extratoBruto
    if (dataInicio) {
      const ini = new Date(dataInicio + 'T00:00:00')
      itens = itens.filter((i) => new Date(i.created_at) >= ini)
    }
    if (dataFim) {
      const fim = new Date(dataFim + 'T23:59:59')
      itens = itens.filter((i) => new Date(i.created_at) <= fim)
    }
    if (filtroOrigem !== 'TODOS') {
      itens = itens.filter((i) => i.origem === filtroOrigem)
    }
    return itens
  }, [extratoBruto, dataInicio, dataFim, filtroOrigem])

  const totalPaginas = Math.max(1, Math.ceil(extratoFiltrado.length / pageSize))
  const paginaCorrigida = Math.min(Math.max(1, pagina), totalPaginas)
  const extratoPaginado = useMemo(
    () =>
      extratoFiltrado.slice(
        (paginaCorrigida - 1) * pageSize,
        paginaCorrigida * pageSize
      ),
    [extratoFiltrado, paginaCorrigida]
  )

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
      const msg = String(err)
      if (msg.includes('Não autenticado') || msg.includes('perfil')) {
        router.replace('/login?message=session_nao_encontrada')
      }
    })
  }, [])

  async function carregarDados() {
    try {
      setLoading(true)
      setError(null)
      const perfil = await obterMeuPerfil()
      if (!perfil) {
        router.push('/loja')
        return
      }
      setUsuario(perfil)

      const resultados = await Promise.all(
        perfil.alunos.map(async (aluno: { id: string }) => {
          const [saldoVal, extratoList] = await Promise.all([
            obterSaldoAluno(aluno.id),
            obterExtratoAluno(aluno.id),
          ])
          return { alunoId: aluno.id, saldo: saldoVal, extrato: extratoList }
        })
      )
      const extratoMap: Record<string, ExtratoItem[]> = {}
      const saldoMap: Record<string, number> = {}
      resultados.forEach(({ alunoId, saldo: s, extrato: e }) => {
        extratoMap[alunoId] = e
        saldoMap[alunoId] = s
      })
      setExtratoPorAluno(extratoMap)
      setSaldoPorAluno(saldoMap)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  function handleAlunoChange(alunoId: string) {
    router.push('/loja/extrato?aluno=' + encodeURIComponent(alunoId))
    setPagina(1)
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent mb-4" />
            <p className="text-[var(--cantina-text-muted)]">Carregando extrato...</p>
          </div>
        </div>
      </>
    )
  }

  if (error || !usuario) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Card className="rounded-2xl border-[var(--cantina-border)]">
            <CardContent className="pt-6 text-center">
              <p className="text-[#DC2626]">{error || 'Erro ao carregar dados'}</p>
              <Button onClick={carregarDados} className="mt-4 rounded-xl bg-[#0B5ED7] hover:bg-[#0a58c9]">
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  const alunosList = usuario.alunos || []
  if (alunosList.length === 0) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#0B5ED7]/10 text-[#0B5ED7]">
              <Receipt className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--cantina-text)]">Extrato</h1>
              <p className="text-sm text-[var(--cantina-text-muted)]">Movimentações e saldo.</p>
            </div>
          </div>
          <Card className="rounded-2xl border-[var(--cantina-border)]">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-[var(--cantina-text-muted)]">Nenhum dependente vinculado à sua conta.</p>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto px-4 py-6 max-w-2xl" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
        <div className="mb-6 flex items-center gap-3">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#0B5ED7]/10 text-[#0B5ED7]">
            <Receipt className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--cantina-text)]">Extrato</h1>
            <p className="text-sm text-[var(--cantina-text-muted)]">Movimentações e saldo.</p>
          </div>
        </div>

        {alunosList.length > 1 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-[var(--cantina-text)] block mb-2">Filho</label>
            <Select value={selectedAlunoId ?? ''} onValueChange={handleAlunoChange}>
              <SelectTrigger className="rounded-xl border-[var(--cantina-border)] bg-white max-w-md">
                <SelectValue placeholder="Selecione o filho" />
              </SelectTrigger>
              <SelectContent>
                {alunosList.map((a: { id: string; nome: string }) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedAluno && (
          <Card className="rounded-2xl border-[var(--cantina-border)] shadow-[var(--cantina-shadow)] overflow-hidden mb-6">
            <CardHeader className="bg-white border-b border-[var(--cantina-border)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg text-[var(--cantina-text)]">{selectedAluno.nome}</CardTitle>
                  <CardDescription className="text-sm text-[var(--cantina-text-muted)] mt-0.5">
                    Extrato de compras e recargas
                  </CardDescription>
                </div>
                <div className="rounded-xl bg-[#0B5ED7]/10 px-4 py-2 border border-[#0B5ED7]/20">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#0B5ED7]" />
                    <span className="text-sm font-medium text-[#0B5ED7]">Saldo</span>
                  </div>
                  <span className="text-xl font-bold text-[#0B5ED7]">
                    {formatPrice(saldo)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 bg-white">
              <div className="mb-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-[var(--cantina-text-muted)] mb-1">
                    Data início
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => {
                      setDataInicio(e.target.value)
                      setPagina(1)
                    }}
                    className="rounded-lg border border-[var(--cantina-border)] px-2 py-1 text-sm"
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
                      setPagina(1)
                    }}
                    className="rounded-lg border border-[var(--cantina-border)] px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cantina-text-muted)] mb-1">
                    Tipo de compra
                  </label>
                  <Select
                    value={filtroOrigem}
                    onValueChange={(v: 'TODOS' | 'LOJA_ONLINE' | 'CANTINA') => {
                      setFiltroOrigem(v)
                      setPagina(1)
                    }}
                  >
                    <SelectTrigger className="rounded-lg border border-[var(--cantina-border)] bg-white w-40 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODOS">Todas</SelectItem>
                      <SelectItem value="LOJA_ONLINE">Loja online</SelectItem>
                      <SelectItem value="CANTINA">Cantina / PDV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {extratoFiltrado.length === 0 ? (
                <p className="text-[var(--cantina-text-muted)] text-center py-8">Nenhuma movimentação ainda.</p>
              ) : (
                <ul className="space-y-4">
                  {extratoPaginado.map((item) => (
                    <li
                      key={item.id}
                      className="py-3 border-b border-[var(--cantina-border)] last:border-0"
                    >
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-[var(--cantina-text)]">{item.descricao}</span>
                          {item.origem && (
                            <span className="text-xs text-[var(--cantina-text-muted)] ml-2">
                              • {item.origem === 'CANTINA' ? 'Cantina / caixa' : 'Loja online'}
                            </span>
                          )}
                          {item.metodo_pagamento && (
                            <span className="text-xs text-[var(--cantina-text-muted)] ml-2">
                              • {item.origem === 'LOJA_ONLINE' ? `Pagamento online (${item.metodo_pagamento === 'PIX' ? 'PIX' : 'Cartão'})` : item.metodo_pagamento}
                            </span>
                          )}
                          <p className="text-sm text-[var(--cantina-text-muted)] mt-1">
                            {formatDate(item.created_at)}
                          </p>
                          {item.itens && item.itens.length > 0 && (
                            <ul className="mt-2 pl-4 space-y-1 text-sm text-[var(--cantina-text-muted)]">
                              {item.itens.map((linha: { quantidade: number; produto_nome: string; subtotal: number }, idx: number) => (
                                <li key={idx}>
                                  {linha.quantidade}x {linha.produto_nome}
                                  {' — '}
                                  {formatPrice(linha.subtotal)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <span
                          className={
                            item.tipo === 'COMPRA' || item.tipo === 'DESCONTO'
                              ? 'text-[#DC2626] font-semibold shrink-0'
                              : 'text-[#16A34A] font-semibold shrink-0'
                          }
                        >
                          {item.tipo === 'COMPRA' || item.tipo === 'DESCONTO' ? '-' : '+'}
                          {formatPrice(Math.abs(item.valor))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {extratoFiltrado.length > pageSize && (
                <div className="flex items-center justify-between mt-4 text-xs text-[var(--cantina-text-muted)]">
                  <span>
                    Página {paginaCorrigida} de {totalPaginas}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={paginaCorrigida <= 1}
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      className="h-7 px-2 text-xs"
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={paginaCorrigida >= totalPaginas}
                      onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                      className="h-7 px-2 text-xs"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

function ExtratoPageFallback() {
  return (
    <>
      <LojaHeader />
      <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent" />
      </div>
    </>
  )
}

export default function ExtratoPage() {
  return (
    <Suspense fallback={<ExtratoPageFallback />}>
      <ExtratoPageContent />
    </Suspense>
  )
}
