'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  buscarAlunosPorNome,
  confirmarMigracao,
  listarHistoricoMigracoes,
  obterItensMigracao,
  type ItemMigracao,
  type ItemHistoricoMigracao,
} from '@/app/actions/migracao-saldo'
import type { HistoricoMigracao } from '@/lib/types/database'

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface AlunoOpcao {
  id: string
  nome: string
}

interface ItemLista {
  aluno_id: string
  nome: string
  valor: number
}

export default function MigrarSaldoPage() {
  const [buscaAluno, setBuscaAluno] = useState('')
  const [sugestoes, setSugestoes] = useState<AlunoOpcao[]>([])
  const [carregandoBusca, setCarregandoBusca] = useState(false)
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoOpcao | null>(null)
  const [saldoAntigo, setSaldoAntigo] = useState('')
  const [lista, setLista] = useState<ItemLista[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [historico, setHistorico] = useState<HistoricoMigracao[]>([])
  const [totalGeral, setTotalGeral] = useState(0)
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [itensExpandido, setItensExpandido] = useState<ItemHistoricoMigracao[]>([])
  const [carregandoItens, setCarregandoItens] = useState(false)

  const carregarHistorico = useCallback(async () => {
    const { lista: l, total_geral } = await listarHistoricoMigracoes()
    setHistorico(l)
    setTotalGeral(total_geral)
    setCarregandoHistorico(false)
  }, [])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  useEffect(() => {
    if (!buscaAluno.trim() || buscaAluno.length < 2) {
      setSugestoes([])
      setMostrarDropdown(false)
      return
    }
    let cancelled = false
    setCarregandoBusca(true)
    const t = setTimeout(async () => {
      const res = await buscarAlunosPorNome(buscaAluno.trim())
      if (!cancelled) {
        setSugestoes(res)
        setMostrarDropdown(res.length > 0)
        setCarregandoBusca(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [buscaAluno])

  function selecionarAluno(a: AlunoOpcao) {
    setAlunoSelecionado(a)
    setBuscaAluno(a.nome)
    setMostrarDropdown(false)
    setSugestoes([])
  }

  function adicionar() {
    if (!alunoSelecionado) return
    const valor = parseFloat(saldoAntigo.replace(',', '.'))
    if (Number.isNaN(valor) || valor === 0) {
      setMensagem({
        tipo: 'erro',
        texto: 'Informe um valor diferente de zero (pode ser positivo ou negativo).',
      })
      return
    }
    if (lista.some((i) => i.aluno_id === alunoSelecionado.id)) {
      setMensagem({ tipo: 'erro', texto: 'Este aluno já está na lista.' })
      return
    }
    setLista((prev) => [...prev, { aluno_id: alunoSelecionado.id, nome: alunoSelecionado.nome, valor }])
    setAlunoSelecionado(null)
    setBuscaAluno('')
    setSaldoAntigo('')
    setMensagem(null)
  }

  function remover(aluno_id: string) {
    setLista((prev) => prev.filter((i) => i.aluno_id !== aluno_id))
  }

  async function toggleExpand(h: HistoricoMigracao) {
    if (expandidoId === h.id) {
      setExpandidoId(null)
      setItensExpandido([])
      return
    }
    setExpandidoId(h.id)
    setCarregandoItens(true)
    setItensExpandido([])
    const itens = await obterItensMigracao(h.id)
    setItensExpandido(itens)
    setCarregandoItens(false)
  }

  async function handleConfirmar() {
    if (lista.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'Adicione pelo menos um aluno à lista.' })
      return
    }
    setConfirmando(true)
    setMensagem(null)
    const itens: ItemMigracao[] = lista.map((i) => ({ aluno_id: i.aluno_id, valor: i.valor }))
    const res = await confirmarMigracao(itens)
    setConfirmando(false)
    if (res.ok) {
      setMensagem({
        tipo: 'sucesso',
        texto: `Migração concluída: ${res.total_alunos} aluno(s), total ${res.valor_total != null ? formatPrice(res.valor_total) : ''}.`,
      })
      setLista([])
      carregarHistorico()
    } else {
      setMensagem({ tipo: 'erro', texto: res.erro ?? 'Erro ao confirmar migração.' })
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/admin">
              <Button variant="ghost" size="sm">← Voltar</Button>
            </Link>
            <h1 className="text-3xl font-bold">Migrar Saldo</h1>
          </div>
          <p className="text-muted-foreground">
            Importar créditos dos alunos do sistema antigo (página temporária)
          </p>
        </div>
      </div>

      {mensagem && (
        <div
          className={`mb-4 p-3 rounded-md text-sm ${
            mensagem.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      {/* Seção 1 – Adicionar alunos para migração */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Adicionar alunos para migração</CardTitle>
          <CardDescription>Busque pelo nome, informe o saldo antigo e adicione à lista.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Label htmlFor="busca-aluno">Buscar aluno</Label>
              <Input
                id="busca-aluno"
                type="text"
                placeholder="Digite o nome do aluno..."
                value={buscaAluno}
                onChange={(e) => setBuscaAluno(e.target.value)}
                onFocus={() => sugestoes.length > 0 && setMostrarDropdown(true)}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
              />
              {mostrarDropdown && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg max-h-60 overflow-auto">
                  {carregandoBusca ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Buscando...</li>
                  ) : (
                    sugestoes.map((a) => (
                      <li
                        key={a.id}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                        onMouseDown={() => selecionarAluno(a)}
                      >
                        {a.nome}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {alunoSelecionado && (
              <>
                <div className="w-36">
                  <Label htmlFor="saldo-antigo">Saldo antigo (R$)</Label>
                  <Input
                    id="saldo-antigo"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={saldoAntigo}
                    onChange={(e) => setSaldoAntigo(e.target.value)}
                  />
                </div>
                <Button type="button" onClick={adicionar}>
                  Adicionar
                </Button>
              </>
            )}
          </div>

          {lista.length > 0 && (
            <div className="border rounded-md divide-y">
              <div className="px-3 py-2 bg-muted/50 text-sm font-medium grid grid-cols-12 gap-2">
                <span className="col-span-6">Nome</span>
                <span className="col-span-3 text-right">Valor</span>
                <span className="col-span-3 text-right">Ação</span>
              </div>
              {lista.map((item) => (
                <div key={item.aluno_id} className="px-3 py-2 text-sm grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-6">{item.nome}</span>
                  <span className="col-span-3 text-right">{formatPrice(item.valor)}</span>
                  <div className="col-span-3 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remover(item.aluno_id)}>
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 2 – Confirmar migração */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Confirmar migração</CardTitle>
          <CardDescription>
            Ao confirmar, o saldo de cada aluno será atualizado (saldo atual + saldo migrado) e será criado registro de movimentação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleConfirmar}
            disabled={confirmando || lista.length === 0}
          >
            {confirmando ? 'Processando...' : 'Confirmar Migração'}
          </Button>
        </CardContent>
      </Card>

      {/* Seção 3 – Histórico de migração */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de migração</CardTitle>
          <CardDescription>Registro das migrações já realizadas e total geral migrado.</CardDescription>
        </CardHeader>
        <CardContent>
          {carregandoHistorico ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div className="mb-4 p-3 rounded-md bg-muted/50">
                <span className="text-sm font-medium">Total geral já migrado: </span>
                <span className="font-bold">{formatPrice(totalGeral)}</span>
              </div>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma migração realizada ainda.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="w-8 px-2 py-2" aria-label="Expandir" />
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-right px-3 py-2">Alunos</th>
                        <th className="text-right px-3 py-2">Valor total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((h) => (
                        <React.Fragment key={h.id}>
                          <tr
                            className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggleExpand(h)}
                          >
                            <td className="px-2 py-2 text-muted-foreground">
                              {expandidoId === h.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {new Date(h.created_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-3 py-2 text-right">{h.total_alunos}</td>
                            <td className="px-3 py-2 text-right">{formatPrice(Number(h.valor_total))}</td>
                          </tr>
                          {expandidoId === h.id && (
                            <tr className="border-t bg-muted/30">
                              <td colSpan={4} className="px-3 py-3">
                                {carregandoItens ? (
                                  <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
                                ) : itensExpandido.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Detalhes não disponíveis para este lançamento.</p>
                                ) : (
                                  <ul className="space-y-1.5 text-sm">
                                    {itensExpandido.map((item) => (
                                      <li key={item.aluno_id} className="flex justify-between items-center">
                                        <span>{item.aluno_nome}</span>
                                        <span className="font-medium">{formatPrice(item.valor)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
