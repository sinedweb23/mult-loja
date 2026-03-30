'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Variacao {
  id: string
  nome: string
  obrigatorio: boolean
  valores: Array<{
    id: string
    valor: string
    label: string | null
    preco_adicional: number
  }>
}

interface Opcional {
  id: string
  nome: string
  preco: number
  obrigatorio: boolean
}

interface GrupoOpcional {
  id: string
  nome: string
  obrigatorio: boolean
  min_selecoes: number
  max_selecoes: number | null
  opcionais: Opcional[]
}

interface ProdutoCompleto {
  id: string
  nome: string
  preco: number
  variacoes?: Variacao[]
  grupos_opcionais?: GrupoOpcional[]
}

interface ProdutoVariacoesModalProps {
  produto: ProdutoCompleto
  open: boolean
  onClose: () => void
  onConfirm: (variacoes: Record<string, string>, opcionais: Record<string, number>, precoFinal: number) => void
}

export function ProdutoVariacoesModal({
  produto,
  open,
  onClose,
  onConfirm,
}: ProdutoVariacoesModalProps) {
  const [variacoesSelecionadas, setVariacoesSelecionadas] = useState<Record<string, string>>({})
  const [opcionaisSelecionados, setOpcionaisSelecionados] = useState<Record<string, number>>({})

  useEffect(() => {
    if (open) {
      // Não pré-selecionar: é obrigatório o usuário clicar em uma opção de cada variação
      setVariacoesSelecionadas({})
      setOpcionaisSelecionados({})
    }
  }, [open, produto])

  function calcularPrecoFinal(): number {
    let preco = produto.preco

    // Adicionar preços das variações
    if (produto.variacoes) {
      for (const variacao of produto.variacoes) {
        const valorId = variacoesSelecionadas[variacao.id]
        if (valorId) {
          const valor = variacao.valores.find((v) => v.id === valorId)
          if (valor) {
            preco += valor.preco_adicional
          }
        }
      }
    }

    // Adicionar preços dos opcionais
    if (produto.grupos_opcionais) {
      for (const grupo of produto.grupos_opcionais) {
        for (const opcional of grupo.opcionais) {
          const quantidade = opcionaisSelecionados[opcional.id] || 0
          preco += opcional.preco * quantidade
        }
      }
    }

    return preco
  }

  function validarSelecoes(): string | null {
    // Quando o produto tem variações, é obrigatório selecionar uma opção em cada uma
    if (produto.variacoes && produto.variacoes.length > 0) {
      for (const variacao of produto.variacoes) {
        if (!variacoesSelecionadas[variacao.id]) {
          return `Selecione ${variacao.nome || 'a variação'}`
        }
      }
    }

    // Validar grupos de opcionais obrigatórios
    if (produto.grupos_opcionais) {
      for (const grupo of produto.grupos_opcionais) {
        if (grupo.obrigatorio) {
          const totalSelecionado = grupo.opcionais.reduce(
            (sum, opc) => sum + (opcionaisSelecionados[opc.id] || 0),
            0
          )
          if (totalSelecionado < grupo.min_selecoes) {
            return `Selecione pelo menos ${grupo.min_selecoes} item(ns) em ${grupo.nome}`
          }
        }

        // Validar máximo de seleções
        if (grupo.max_selecoes !== null) {
          const totalSelecionado = grupo.opcionais.reduce(
            (sum, opc) => sum + (opcionaisSelecionados[opc.id] || 0),
            0
          )
          if (totalSelecionado > grupo.max_selecoes) {
            return `Selecione no máximo ${grupo.max_selecoes} item(ns) em ${grupo.nome}`
          }
        }
      }
    }

    return null
  }

  function handleConfirmar() {
    const erro = validarSelecoes()
    if (erro) {
      alert(erro)
      return
    }

    // Converter variações de { variacao_id: valor_id } para { nome_variacao: valor_label }
    const variacoesFormatadas: Record<string, string> = {}
    if (produto.variacoes) {
      for (const variacao of produto.variacoes) {
        const valorId = variacoesSelecionadas[variacao.id]
        if (valorId) {
          const valor = variacao.valores.find((v) => v.id === valorId)
          if (valor) {
            variacoesFormatadas[variacao.nome || variacao.id] = (valor.valor ?? '').trim() || (valor.label ?? '').trim() || ''
          }
        }
      }
    }

    // Converter opcionais para formato esperado: array de objetos
    // Mas a action espera Record<string, string[]> ou Record<string, number>
    // Vou converter para o formato que a action espera: { opcional_id: quantidade }
    // A action vai converter isso para o formato JSONB do banco

    const precoFinal = calcularPrecoFinal()
    onConfirm(variacoesFormatadas, opcionaisSelecionados, precoFinal)
    onClose()
  }

  function formatPrice(valor: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  const precoFinal = calcularPrecoFinal()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{produto.nome}</DialogTitle>
          <DialogDescription>
            Selecione as variações e opcionais desejados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Variações — botões clicáveis (igual PDV consumo-interno) */}
          {produto.variacoes && produto.variacoes.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Variações</h3>
              {produto.variacoes.map((variacao) => (
                <div key={variacao.id} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {variacao.nome || variacao.id || 'Variação'}
                    {variacao.obrigatorio && <span className="text-destructive ml-1">*</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {variacao.valores.map((valor, idx) => {
                      const texto = (valor.valor ?? '').trim() || (valor.label ?? '').trim() || `Opção ${idx + 1}`
                      const selecionado = variacoesSelecionadas[variacao.id] === valor.id
                      return (
                        <Button
                          key={valor.id}
                          type="button"
                          variant={selecionado ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            'min-w-[100px]',
                            selecionado && 'ring-2 ring-primary ring-offset-2'
                          )}
                          onClick={() => {
                            setVariacoesSelecionadas({
                              ...variacoesSelecionadas,
                              [variacao.id]: valor.id,
                            })
                          }}
                        >
                          {texto}
                          {valor.preco_adicional > 0 && (
                            <span className={cn('ml-1', selecionado ? 'text-primary-foreground/90' : 'text-muted-foreground')}>
                              (+{formatPrice(valor.preco_adicional)})
                            </span>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Opcionais */}
          {produto.grupos_opcionais && produto.grupos_opcionais.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Opcionais</h3>
              {produto.grupos_opcionais.map((grupo) => (
                <div key={grupo.id} className="space-y-3 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">
                      {grupo.nome}
                      {grupo.obrigatorio && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {grupo.max_selecoes !== null && (
                      <span className="text-xs text-muted-foreground">
                        Máximo: {grupo.max_selecoes}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {grupo.opcionais.map((opcional) => {
                      const quantidade = opcionaisSelecionados[opcional.id] || 0
                      return (
                        <div
                          key={opcional.id}
                          className="flex items-center justify-between p-2 border rounded"
                        >
                          <div className="flex-1">
                            <Label className="cursor-pointer">
                              {opcional.nome}
                              {opcional.preco > 0 && (
                                <span className="text-sm text-muted-foreground ml-2">
                                  {formatPrice(opcional.preco)}
                                </span>
                              )}
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (quantidade > 0) {
                                  setOpcionaisSelecionados({
                                    ...opcionaisSelecionados,
                                    [opcional.id]: quantidade - 1,
                                  })
                                }
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{quantidade}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (
                                  grupo.max_selecoes === null ||
                                  Object.values(opcionaisSelecionados).reduce(
                                    (sum, qtd) => sum + qtd,
                                    0
                                  ) < grupo.max_selecoes
                                ) {
                                  setOpcionaisSelecionados({
                                    ...opcionaisSelecionados,
                                    [opcional.id]: quantidade + 1,
                                  })
                                }
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Preço final */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Preço final:</span>
              <span className="text-2xl font-bold">{formatPrice(precoFinal)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!!validarSelecoes()}>
            Adicionar ao Carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
