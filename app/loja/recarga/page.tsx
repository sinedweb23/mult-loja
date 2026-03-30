'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obterMeuPerfil, type UsuarioCompleto } from '@/app/actions/responsavel'
import { obterSaldoAluno } from '@/app/actions/saldo'
import { turmaEstaBloqueadaParaRecarga } from '@/app/actions/configuracoes'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Wallet, CreditCard } from 'lucide-react'

const MIN_RECARGA = 25
const MAX_RECARGA = 600
const STEP_RECARGA = 25

function RecargaPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<UsuarioCompleto | null>(null)
  const [saldoPorAluno, setSaldoPorAluno] = useState<Record<string, number>>({})
  const [valorRecarga, setValorRecarga] = useState(MIN_RECARGA)
  const [error, setError] = useState<string | null>(null)
  const [acessoRecargaPorAluno, setAcessoRecargaPorAluno] = useState<Record<string, boolean>>({})

  const alunoIdFromUrl = searchParams.get('aluno')
  const alunos = useMemo(() => usuario?.alunos ?? [], [usuario])
  const selectedAluno = useMemo(() => {
    if (!alunos.length) return null
    const found = alunos.find((a: { id: string }) => a.id === alunoIdFromUrl)
    return found ?? alunos[0]
  }, [alunos, alunoIdFromUrl])
  const selectedAlunoId = selectedAluno?.id ?? null
  const saldo = selectedAlunoId ? saldoPorAluno[selectedAlunoId] : 0
  const alunoBloqueadoParaRecarga = selectedAlunoId
    ? acessoRecargaPorAluno[String(selectedAlunoId)] === false
    : false

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
      const perfil = await obterMeuPerfil()
      if (!perfil) {
        router.push('/loja')
        return
      }
      setUsuario(perfil)

      const resultados = await Promise.all(
        perfil.alunos.map(async (aluno: { id: string; turma_id?: string | null; turmas?: { id: string } | null }) => {
          const turmaId = aluno.turma_id ?? aluno.turmas?.id ?? null
          const [saldoVal, bloqueado] = await Promise.all([
            obterSaldoAluno(aluno.id),
            turmaEstaBloqueadaParaRecarga(turmaId),
          ])
          return { alunoId: aluno.id, saldo: saldoVal, bloqueado }
        })
      )
      const saldoMap: Record<string, number> = {}
      const acessoMap: Record<string, boolean> = {}
      resultados.forEach(({ alunoId, saldo: s, bloqueado }) => {
        saldoMap[alunoId] = s
        acessoMap[alunoId] = !bloqueado
      })
      setSaldoPorAluno(saldoMap)
      setAcessoRecargaPorAluno(acessoMap)
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

  function handleRecarga(valor: number) {
    if (!selectedAluno || !selectedAlunoId) return
    const v = Math.max(MIN_RECARGA, Math.min(MAX_RECARGA, Math.round(valor / STEP_RECARGA) * STEP_RECARGA))
    const nome = selectedAluno.nome ?? 'Aluno'
    const params = new URLSearchParams({
      tipo: 'recarga',
      alunoId: selectedAlunoId,
      valor: String(v),
      alunoNome: nome,
    })
    window.location.href = `/loja/checkout?${params.toString()}`
  }

  function handleAlunoChange(alunoId: string) {
    router.push('/loja/recarga?aluno=' + encodeURIComponent(alunoId))
  }

  if (loading) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent mb-4" />
            <p className="text-[var(--cantina-text-muted)]">Carregando...</p>
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
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF8A00]/20 text-[#FF8A00]">
              <Wallet className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--cantina-text)]">Recarga de Crédito</h1>
              <p className="text-sm text-[var(--cantina-text-muted)]">Adicione saldo para a cantina.</p>
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
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF8A00]/20 text-[#FF8A00]">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--cantina-text)]">Recarga de Crédito</h1>
            <p className="text-sm text-[var(--cantina-text-muted)]">Adicione saldo para consumo na cantina.</p>
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

        {selectedAluno && selectedAlunoId && (
          <Card className="rounded-2xl border-[var(--cantina-border)] shadow-[var(--cantina-shadow)] overflow-hidden mb-6">
            <CardHeader className="bg-white border-b border-[var(--cantina-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-[var(--cantina-text)] flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#0B5ED7]" />
                    {selectedAluno.nome}
                  </CardTitle>
                  <CardDescription className="text-sm text-[var(--cantina-text-muted)] mt-0.5">
                    Saldo atual
                  </CardDescription>
                </div>
                <span className="text-2xl font-bold text-[#0B5ED7]">
                  {formatPrice(saldo)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {alunoBloqueadoParaRecarga ? (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-center">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Recarga de crédito disponível apenas para alunos do 2º ano do EFAI ao EM.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    A turma deste aluno não está habilitada para recarga de crédito. Se tiver outro filho, selecione-o acima.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-[var(--cantina-text)]">Valor do crédito</Label>
                    <p className="text-2xl font-bold text-[var(--cantina-text)] mt-1">
                      {formatPrice(valorRecarga)}
                    </p>
                    <input
                      type="range"
                      min={MIN_RECARGA}
                      max={MAX_RECARGA}
                      step={STEP_RECARGA}
                      value={valorRecarga}
                      onChange={(e) => setValorRecarga(Number(e.target.value))}
                      className="mt-4 w-full h-2 rounded-full appearance-none cursor-pointer accent-[#FF8A00] bg-[var(--cantina-border)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--cantina-text-muted)] mt-1">
                      <span>{formatPrice(MIN_RECARGA)}</span>
                      <span>{formatPrice(MAX_RECARGA)}</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--cantina-background)] border border-[var(--cantina-border)] p-4 space-y-2">
                    <p className="text-sm text-[var(--cantina-text-muted)]">
                      Saldo atual: <span className="font-semibold text-[#16A34A]">{formatPrice(saldo)}</span>
                    </p>
                    <p className="text-sm text-[var(--cantina-text-muted)]">
                      Saldo após a compra: <span className="font-semibold text-[#16A34A]">{formatPrice(saldo + valorRecarga)}</span>
                    </p>
                  </div>
                  <Button
                    onClick={() => handleRecarga(valorRecarga)}
                    className="w-full rounded-xl bg-[#FF8A00] hover:bg-[#e67d00] text-white font-semibold py-6 text-base"
                  >
                    Pagar
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}

function RecargaPageFallback() {
  return (
    <>
      <LojaHeader />
      <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0B5ED7] border-t-transparent" />
      </div>
    </>
  )
}

export default function RecargaPage() {
  return (
    <Suspense fallback={<RecargaPageFallback />}>
      <RecargaPageContent />
    </Suspense>
  )
}
