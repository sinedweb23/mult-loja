'use client'

import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  parseCsvAtualizacao,
  validarLinhasAtualizacao,
  gerarCsvAtualizacao,
  type LinhaAtualizacaoCsv,
  type ErroValidacaoAtualizacao,
} from '@/lib/atualizar-produtos-lote'
import { listarProdutosParaAtualizacaoLote } from '@/app/actions/produtos-admin'

interface AtualizarLoteTabProps {
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

export function AtualizarLoteTab({ empresaId, onSuccess }: AtualizarLoteTabProps) {
  const [linhas, setLinhas] = useState<LinhaAtualizacaoCsv[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCsv, setLoadingCsv] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [mensagemErro, setMensagemErro] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { atualizacoes, errosPorLinha } = useMemo(() => validarLinhasAtualizacao(linhas), [linhas])
  const temErro = errosPorLinha.size > 0

  async function handleBaixarCsv() {
    if (!empresaId) {
      setMensagemErro('Nenhuma empresa selecionada.')
      return
    }
    setLoadingCsv(true)
    setMensagemErro(null)
    try {
      const produtos = await listarProdutosParaAtualizacaoLote(empresaId)
      if (produtos.length === 0) {
        setMensagemErro('Nenhum produto cadastrado para exportar.')
        return
      }
      const csv = gerarCsvAtualizacao(produtos)
      downloadBlob(csv, `produtos-atualizacao-${new Date().toISOString().slice(0, 10)}.csv`)
      setMensagemSucesso(`CSV com ${produtos.length} produto(s) baixado. Edite e carregue para atualizar.`)
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : 'Erro ao gerar CSV')
    } finally {
      setLoadingCsv(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMensagemErro(null)
    setMensagemSucesso(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = (reader.result as string) ?? ''
      const parsed = parseCsvAtualizacao(text)
      if (parsed.length === 0) {
        setMensagemErro('Nenhuma linha de dados no CSV. Use o CSV baixado com os produtos para atualizar.')
        return
      }
      setLinhas(parsed)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  function updateLinha(index: number, field: keyof LinhaAtualizacaoCsv, value: string) {
    setLinhas((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  async function handleAtualizar() {
    if (!empresaId) {
      setMensagemErro('Nenhuma empresa selecionada.')
      return
    }
    if (temErro) {
      const numeros = Array.from(errosPorLinha.keys()).sort((a, b) => a - b)
      setMensagemErro(`Corrija as linhas inválidas: ${numeros.join(', ')}`)
      return
    }
    if (atualizacoes.length === 0) {
      setMensagemErro('Nenhum registro válido para atualizar.')
      return
    }
    setLoading(true)
    setMensagemErro(null)
    setMensagemSucesso(null)
    try {
      const res = await fetch('/api/admin/produtos/atualizar-em-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atualizacoes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensagemErro(data?.erro ?? `Erro ${res.status}`)
        return
      }
      setMensagemSucesso(`${data.atualizados ?? 0} produto(s) atualizado(s) com sucesso.`)
      setLinhas([])
      onSuccess?.()
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setLoading(false)
    }
  }

  if (!empresaId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Selecione uma empresa para atualizar produtos em lote.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Atualizar em lote</CardTitle>
          <CardDescription>
            Baixe o CSV com os produtos do tipo &quot;Produto&quot; <strong>sem variação</strong>. Ele contém:
            id, nome, descricao, preço, valor de custo, estoque, categoria, grupo, visibilidade e disponibilidade.
            Produtos com variação (ex.: tamanho P/M/G) não entram no CSV — o estoque deles é por variação. Edite no
            Google Sheets e exporte como CSV para carregar aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleBaixarCsv}
              disabled={loadingCsv}
            >
              {loadingCsv ? 'Gerando...' : 'Baixar CSV'}
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
              <span className="text-sm text-muted-foreground">Selecione o CSV editado</span>
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
              Ajuste os dados abaixo se necessário. O ID não deve ser alterado (identifica o produto). Campos obrigatórios: id, preço, estoque.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto border rounded-md">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium w-8">#</th>
                    <th className="text-left p-2 font-medium">id</th>
                    <th className="text-left p-2 font-medium">nome</th>
                    <th className="text-left p-2 font-medium">descricao</th>
                    <th className="text-left p-2 font-medium">preco</th>
                    <th className="text-left p-2 font-medium">valor_custo</th>
                    <th className="text-left p-2 font-medium">estoque</th>
                    <th className="text-left p-2 font-medium">categoria</th>
                    <th className="text-left p-2 font-medium">grupo</th>
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
                          <Input
                            className={`font-mono text-xs ${temErroLinha && erros.some((e) => e.campo === 'id') ? 'border-red-500' : ''}`}
                            value={row.id}
                            onChange={(e) => updateLinha(index, 'id', e.target.value)}
                            placeholder="UUID"
                            title="ID do produto (não altere para não perder a referência)"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className={temErroLinha && erros.some((e) => e.campo === 'nome') ? 'border-red-500' : ''}
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
                          <Input
                            type="text"
                            inputMode="decimal"
                            className={temErroLinha && erros.some((e) => e.campo === 'preco') ? 'border-red-500' : ''}
                            value={row.preco}
                            onChange={(e) => updateLinha(index, 'preco', e.target.value)}
                            placeholder="0,00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className={temErroLinha && erros.some((e) => e.campo === 'valor_custo') ? 'border-red-500' : ''}
                            value={row.valor_custo}
                            onChange={(e) => updateLinha(index, 'valor_custo', e.target.value)}
                            placeholder="vazio ou 0,00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className={temErroLinha && erros.some((e) => e.campo === 'estoque') ? 'border-red-500' : ''}
                            value={row.estoque}
                            onChange={(e) => updateLinha(index, 'estoque', e.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={row.categoria}
                            onChange={(e) => updateLinha(index, 'categoria', e.target.value)}
                            placeholder="Nome da categoria"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={row.grupo}
                            onChange={(e) => updateLinha(index, 'grupo', e.target.value)}
                            placeholder="Nome do grupo"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            className="w-full min-w-[120px] border rounded px-2 py-1.5 text-sm"
                            value={row.visibilidade}
                            onChange={(e) => updateLinha(index, 'visibilidade', e.target.value)}
                          >
                            <option value="">(não alterar)</option>
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
                            onChange={(e) => updateLinha(index, 'disp_tipo', e.target.value)}
                          >
                            <option value="">(não alterar)</option>
                            <option value="TODOS">TODOS</option>
                            <option value="SEGMENTO">SEGMENTO</option>
                            <option value="TURMA">TURMA</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            value={row.disp_valores}
                            onChange={(e) => updateLinha(index, 'disp_valores', e.target.value)}
                            placeholder="Ex.: EM;EFAI ou nomes das turmas"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
                onClick={handleAtualizar}
                disabled={loading || temErro || atualizacoes.length === 0}
              >
                {loading ? 'Atualizando...' : 'Atualizar Produtos'}
              </Button>
              {temErro && (
                <span className="text-sm text-muted-foreground">
                  Corrija as linhas em vermelho antes de atualizar.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
