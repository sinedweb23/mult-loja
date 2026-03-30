'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  gerarModeloCsv,
  parseCsv,
  validarLinhas,
  TIPOS_PRODUTO,
  type LinhaProdutoCsv,
  type ErroValidacao,
} from '@/lib/importar-produtos'
import { listarCategorias, listarGruposProdutos, listarTurmas } from '@/app/actions/produtos-admin'
import type { Categoria, GrupoProduto, Turma } from '@/lib/types/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

interface ImportarLoteTabProps {
  empresaId: string | null
  onSuccess?: () => void
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportarLoteTab({ empresaId, onSuccess }: ImportarLoteTabProps) {
  const [linhas, setLinhas] = useState<LinhaProdutoCsv[]>([])
  const [loading, setLoading] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [mensagemErro, setMensagemErro] = useState<string | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [grupos, setGrupos] = useState<GrupoProduto[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dispModalOpen, setDispModalOpen] = useState(false)
  const [dispModalRow, setDispModalRow] = useState<number | null>(null)
  const [dispModalTipo, setDispModalTipo] = useState<'SEGMENTO' | 'TURMA'>('SEGMENTO')
  const [dispSegmentosSelecionados, setDispSegmentosSelecionados] = useState<string[]>([])
  const [dispTurmasSelecionadas, setDispTurmasSelecionadas] = useState<string[]>([])

  const { produtos, errosPorLinha } = useMemo(() => validarLinhas(linhas), [linhas])
  const temErro = errosPorLinha.size > 0

  const segmentos = useMemo(() => {
    const set = new Set<string>()
    turmas.forEach((t) => {
      const v = (t as any).tipo_curso?.trim()
      if (v) set.add(v)
    })
    return Array.from(set).sort()
  }, [turmas])

  // Carregar listas auxiliares para facilitar copiar/colar nomes
  useEffect(() => {
    async function carregarAuxiliares() {
      if (!empresaId) return
      try {
        const [cats, grps, trs] = await Promise.all([
          listarCategorias(empresaId),
          listarGruposProdutos(empresaId),
          listarTurmas(empresaId),
        ])
        setCategorias(cats)
        setGrupos(grps)
        setTurmas(trs as Turma[])
      } catch (err) {
        console.error('Erro ao carregar auxiliares de importação:', err)
      }
    }
    carregarAuxiliares()
  }, [empresaId])

  function handleBaixarModelo() {
    downloadBlob(gerarModeloCsv(), 'modelo-produtos.csv')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMensagemErro(null)
    setMensagemSucesso(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = (reader.result as string) ?? ''
      const parsed = parseCsv(text)
      if (parsed.length === 0) {
        setMensagemErro('Nenhuma linha de dados no CSV. Use o modelo com cabeçalho e pelo menos uma linha.')
        return
      }
      setLinhas(parsed)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  function updateLinha(index: number, field: keyof LinhaProdutoCsv, value: string) {
    setLinhas((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function abrirModalDisponibilidade(index: number, tipo: 'SEGMENTO' | 'TURMA') {
    const linha = linhas[index]
    if (!linha) return
    setDispModalRow(index)
    setDispModalTipo(tipo)

    const valoresAtuais = (linha.disp_valores ?? '')
      .split(';')
      .map((v) => v.trim())
      .filter(Boolean)

    if (tipo === 'SEGMENTO') {
      setDispSegmentosSelecionados(valoresAtuais)
      setDispTurmasSelecionadas([])
    } else {
      const selecionadasIds = turmas
        .filter((t) => valoresAtuais.includes(t.descricao))
        .map((t) => t.id)
      setDispTurmasSelecionadas(selecionadasIds)
      setDispSegmentosSelecionados([])
    }

    setDispModalOpen(true)
  }

  function salvarModalDisponibilidade() {
    if (dispModalRow == null) {
      setDispModalOpen(false)
      return
    }
    let valor = ''
    if (dispModalTipo === 'SEGMENTO') {
      valor = dispSegmentosSelecionados.join('; ')
    } else {
      const nomes = dispTurmasSelecionadas
        .map((id) => turmas.find((t) => t.id === id)?.descricao)
        .filter((n): n is string => Boolean(n))
      valor = nomes.join('; ')
    }
    updateLinha(dispModalRow, 'disp_valores', valor)
    setDispModalOpen(false)
  }

  async function handleCadastrar() {
    if (!empresaId) {
      setMensagemErro('Nenhuma empresa selecionada.')
      return
    }
    if (temErro) {
      const numeros = Array.from(errosPorLinha.keys()).sort((a, b) => a - b)
      setMensagemErro(`Corrija as linhas inválidas: ${numeros.join(', ')}`)
      return
    }
    if (produtos.length === 0) {
      setMensagemErro('Nenhum produto para cadastrar.')
      return
    }
    setLoading(true)
    setMensagemErro(null)
    setMensagemSucesso(null)
    try {
      const res = await fetch('/api/admin/produtos/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensagemErro(data?.erro ?? `Erro ${res.status}`)
        return
      }
      setMensagemSucesso(`${data.inseridos ?? 0} produto(s) cadastrado(s) com sucesso. Eles foram criados como inativos.`)
      setLinhas([])
      onSuccess?.()
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  if (!empresaId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Selecione uma empresa para importar produtos.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar em lote</CardTitle>
          <CardDescription>
            Baixe o modelo CSV, preencha com seus produtos, faça o upload e revise na tabela antes de cadastrar. Os
            produtos serão criados como inativos. Use as colunas de visibilidade, disponibilidade, grupo e categoria
            iguais às telas de cadastro para já deixar tudo pronto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button type="button" variant="outline" onClick={handleBaixarModelo}>
              Baixar modelo CSV
            </Button>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Carregar arquivo
              </Button>
              <span className="text-sm text-muted-foreground">Selecione um arquivo .csv</span>
            </div>
          </div>
          {mensagemSucesso && (
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 p-3 rounded-md">
              {mensagemSucesso}
            </p>
          )}
          {mensagemErro && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {mensagemErro}
            </p>
          )}
        </CardContent>
      </Card>

      {linhas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revisar e editar</CardTitle>
            <CardDescription>
              Ajuste os dados abaixo se necessário. Campos obrigatórios: tipo, nome, preço. Linhas com erro ficam em
              vermelho. As colunas de categoria, visibilidade, tipo de disponibilidade e valores são opcionais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border rounded-md">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium w-8">#</th>
                      <th className="text-left p-2 font-medium">tipo</th>
                      <th className="text-left p-2 font-medium">nome</th>
                      <th className="text-left p-2 font-medium">descricao</th>
                      <th className="text-left p-2 font-medium">categoria</th>
                      <th className="text-left p-2 font-medium">grupo</th>
                      <th className="text-left p-2 font-medium">preco</th>
                      <th className="text-left p-2 font-medium">valor_custo</th>
                      <th className="text-left p-2 font-medium">estoque</th>
                      <th className="text-left p-2 font-medium">visibilidade</th>
                      <th className="text-left p-2 font-medium">disp_tipo</th>
                      <th className="text-left p-2 font-medium">disp_valores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((row, index) => {
                      const linhaNum = index + 2
                      const erros = errosPorLinha.get(linhaNum) ?? []
                      const temErroLinha = erros.length > 0
                      return (
                        <tr
                          key={index}
                          className={`border-b ${temErroLinha ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                        >
                          <td className="p-2 text-muted-foreground text-sm">{linhaNum}</td>
                          <td className="p-2">
                            <select
                              className={`w-full min-w-[120px] border rounded px-2 py-1.5 text-sm ${
                                temErroLinha && erros.some((e) => e.campo === 'tipo') ? 'border-red-500' : ''
                              }`}
                              value={row.tipo}
                              onChange={(e) => updateLinha(index, 'tipo', e.target.value)}
                            >
                              <option value="">Selecione</option>
                              {TIPOS_PRODUTO.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <Input
                              className={
                                temErroLinha && erros.some((e) => e.campo === 'nome') ? 'border-red-500' : ''
                              }
                              value={row.nome}
                              onChange={(e) => updateLinha(index, 'nome', e.target.value)}
                              placeholder="Nome"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={row.descricao}
                              onChange={(e) => updateLinha(index, 'descricao', e.target.value)}
                              placeholder="Descrição"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full min-w-[140px] border rounded px-2 py-1.5 text-sm"
                              value={row.categoria}
                              onChange={(e) => updateLinha(index, 'categoria', e.target.value)}
                            >
                              <option value="">(sem)</option>
                              {categorias.map((c) => (
                                <option key={c.id} value={c.nome}>
                                  {c.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full min-w-[140px] border rounded px-2 py-1.5 text-sm"
                              value={row.grupo}
                              onChange={(e) => updateLinha(index, 'grupo', e.target.value)}
                            >
                              <option value="">(sem)</option>
                              {grupos.map((g) => (
                                <option key={g.id} value={g.nome}>
                                  {g.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={
                                temErroLinha && erros.some((e) => e.campo === 'preco') ? 'border-red-500' : ''
                              }
                              value={row.preco}
                              onChange={(e) => updateLinha(index, 'preco', e.target.value)}
                              placeholder="0,00"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={
                                temErroLinha && erros.some((e) => e.campo === 'valor_custo') ? 'border-red-500' : ''
                              }
                              value={row.valor_custo}
                              onChange={(e) => updateLinha(index, 'valor_custo', e.target.value)}
                              placeholder="opcional"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              className={
                                temErroLinha && erros.some((e) => e.campo === 'estoque') ? 'border-red-500' : ''
                              }
                              value={row.estoque}
                              onChange={(e) => updateLinha(index, 'estoque', e.target.value)}
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full min-w-[120px] border rounded px-2 py-1.5 text-sm"
                              value={row.visibilidade}
                              onChange={(e) => updateLinha(index, 'visibilidade', e.target.value)}
                            >
                              <option value="">(padrão)</option>
                              <option value="APP">APP</option>
                              <option value="CANTINA">CANTINA</option>
                              <option value="AMBOS">AMBOS</option>
                              <option value="CONSUMO_INTERNO">CONSUMO_INTERNO</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full min-w-[120px] border rounded px-2 py-1.5 text-sm"
                              value={row.disp_tipo}
                              onChange={(e) => {
                                const value = e.target.value
                                updateLinha(index, 'disp_tipo', value)
                                if (value === 'SEGMENTO' || value === 'TURMA') {
                                  abrirModalDisponibilidade(index, value as 'SEGMENTO' | 'TURMA')
                                }
                              }}
                            >
                              <option value="">TODOS</option>
                              <option value="SEGMENTO">SEGMENTO</option>
                              <option value="TURMA">TURMA</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Input
                                value={row.disp_valores}
                                onChange={(e) => updateLinha(index, 'disp_valores', e.target.value)}
                                placeholder="Defina pelo modal ou edite aqui"
                              />
                              {(row.disp_tipo === 'SEGMENTO' || row.disp_tipo === 'TURMA') && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 text-xs"
                                  onClick={() =>
                                    abrirModalDisponibilidade(
                                      index,
                                      (row.disp_tipo as 'SEGMENTO' | 'TURMA') || 'SEGMENTO',
                                    )
                                  }
                                >
                                  …
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
            <Dialog open={dispModalOpen} onOpenChange={setDispModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {dispModalTipo === 'SEGMENTO'
                      ? 'Selecionar segmentos'
                      : 'Selecionar turmas'}
                  </DialogTitle>
                </DialogHeader>
                {dispModalTipo === 'SEGMENTO' ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 mb-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDispSegmentosSelecionados(segmentos)}
                        disabled={segmentos.length === 0}
                      >
                        Selecionar todos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDispSegmentosSelecionados([])}
                      >
                        Limpar
                      </Button>
                    </div>
                    <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
                      {segmentos.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhum segmento encontrado. Cadastre tipo_curso nas turmas.
                        </p>
                      ) : (
                        segmentos.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={dispSegmentosSelecionados.includes(s)}
                              onCheckedChange={(checked) => {
                                setDispSegmentosSelecionados((prev) => {
                                  const set = new Set(prev)
                                  if (checked) set.add(s)
                                  else set.delete(s)
                                  return Array.from(set)
                                })
                              }}
                            />
                            <span>{s}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2 mb-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDispTurmasSelecionadas(turmas.map((t) => t.id))}
                        disabled={turmas.length === 0}
                      >
                        Selecionar todas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDispTurmasSelecionadas([])}
                      >
                        Limpar
                      </Button>
                    </div>
                    <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
                      {turmas.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma turma encontrada.</p>
                      ) : (
                        turmas.map((t) => (
                          <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={dispTurmasSelecionadas.includes(t.id)}
                              onCheckedChange={(checked) => {
                                setDispTurmasSelecionadas((prev) => {
                                  const set = new Set(prev)
                                  if (checked) set.add(t.id)
                                  else set.delete(t.id)
                                  return Array.from(set)
                                })
                              }}
                            />
                            <span>{t.descricao}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDispModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={salvarModalDisponibilidade}
                  >
                    Salvar seleção
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {linhas.some((_, i) => (errosPorLinha.get(i + 2) ?? []).length > 0) && (
              <div className="mt-3 space-y-1">
                <p className="text-sm font-medium text-destructive">Erros por linha:</p>
                {Array.from(errosPorLinha.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([num, errs]) => (
                    <p key={num} className="text-sm text-muted-foreground">
                      Linha {num}: {errs.map((e) => `${e.campo}: ${e.mensagem}`).join('; ')}
                    </p>
                  ))}
              </div>
            )}
            <div className="mt-4 flex items-center gap-4">
              <Button
                onClick={handleCadastrar}
                disabled={loading || temErro || produtos.length === 0}
              >
                {loading ? 'Cadastrando...' : 'Cadastrar Produtos'}
              </Button>
              {temErro && (
                <span className="text-sm text-muted-foreground">
                  Corrija as linhas em vermelho antes de cadastrar.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
