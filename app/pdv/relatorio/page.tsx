'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCaixaPdv } from '@/app/pdv/caixa-context'
import {
  listarVendasDiaCaixa,
  type VendaDiaCaixa,
  type TipoTransacaoCaixa,
} from '@/app/actions/pdv-vendas'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ComprovanteModal } from '@/components/pdv/comprovante-modal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Printer, FileText } from 'lucide-react'

const LABEL_TIPO: Record<TipoTransacaoCaixa, string> = {
  VENDA_DIRETA: 'Venda direta',
  VENDA_ALUNO: 'Venda (aluno)',
  VENDA_COLABORADOR: 'Venda (colaborador)',
  RECARGA: 'Recarga de saldo',
}

export default function PdvRelatorioPage() {
  const router = useRouter()
  const caixa = useCaixaPdv()
  const [vendas, setVendas] = useState<VendaDiaCaixa[]>([])
  const [loading, setLoading] = useState(true)
  const [nomeLoja, setNomeLoja] = useState('')
  const [comprovanteAberto, setComprovanteAberto] = useState(false)
  const [comprovanteDados, setComprovanteDados] = useState<VendaDiaCaixa['comprovante'] | null>(null)

  useEffect(() => {
    if (!caixa) {
      router.replace('/pdv/vendas')
      return
    }
    carregar()
  }, [caixa?.id])

  useEffect(() => {
    obterConfiguracaoAparencia().then((c) => setNomeLoja(c.loja_nome || ''))
  }, [])

  async function carregar() {
    if (!caixa) return
    setLoading(true)
    try {
      const list = await listarVendasDiaCaixa(caixa.id)
      setVendas(list)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  function formatDataHora(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function reimprimir(v: VendaDiaCaixa) {
    setComprovanteDados(v.comprovante)
    setComprovanteAberto(true)
  }

  if (!caixa) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Relatório do dia
        </h1>
        <p className="text-muted-foreground">
          Vendas e recargas do caixa atual. Clique em Reimprimir para gerar o comprovante novamente.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transações de hoje</CardTitle>
            <CardDescription>
              {vendas.length} {vendas.length === 1 ? 'transação' : 'transações'} no período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vendas.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center">
                Nenhuma venda ou recarga registrada hoje neste caixa.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Data/Hora</th>
                      <th className="text-left py-2">Tipo</th>
                      <th className="text-left py-2">Aluno/Colaborador</th>
                      <th className="text-right py-2">Total</th>
                      <th className="text-right py-2 w-28">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b hover:bg-accent/5 cursor-pointer"
                        onClick={() => reimprimir(v)}
                      >
                        <td className="py-2">{formatDataHora(v.created_at)}</td>
                        <td className="py-2">{LABEL_TIPO[v.tipo]}</td>
                        <td className="py-2">{v.aluno_nome ?? '—'}</td>
                        <td className="text-right py-2 font-medium">{formatPrice(v.total)}</td>
                        <td className="text-right py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              reimprimir(v)
                            }}
                            className="gap-1"
                          >
                            <Printer className="h-4 w-4" />
                            Reimprimir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {comprovanteDados && (
        <ComprovanteModal
          open={comprovanteAberto}
          onClose={() => {
            setComprovanteAberto(false)
            setComprovanteDados(null)
          }}
          tipo={comprovanteDados.tipo}
          nomeLoja={nomeLoja}
          dataHora={comprovanteDados.dataHora}
          itens={comprovanteDados.itens}
          total={comprovanteDados.total}
          formasPagamento={comprovanteDados.formasPagamento}
          alunoNome={comprovanteDados.alunoNome}
          pedidoId={comprovanteDados.pedidoId}
        />
      )}
    </div>
  )
}
