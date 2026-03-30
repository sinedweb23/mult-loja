'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConsumoRow = {
  id: string
  ano: number
  mes: number
  valor_total: number
  valor_abatido: number
  usuarios?: { nome?: string } | null
  empresas?: { nome?: string } | null
}

export function FinanceiroContent() {
  const [consumo, setConsumo] = useState<ConsumoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    setLoading(true)
    void (async () => {
      try {
        const { data } = await supabase
          .from('consumo_colaborador_mensal')
          .select(`
            id,
            ano,
            mes,
            valor_total,
            valor_abatido,
            usuarios!usuario_id ( nome ),
            empresas!empresa_id ( nome )
          `)
          .order('ano', { ascending: false })
          .order('mes', { ascending: false })
          .limit(100)
        const rows: ConsumoRow[] = (data || []).map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ''),
          ano: Number(r.ano) || 0,
          mes: Number(r.mes) || 0,
          valor_total: Number(r.valor_total) || 0,
          valor_abatido: Number(r.valor_abatido) || 0,
          usuarios: (r.usuarios as { nome?: string } | null) ?? null,
          empresas: (r.empresas as { nome?: string } | null) ?? null,
        }))
        setConsumo(rows)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6">
          <div className="h-9 w-48 bg-muted animate-pulse rounded" />
          <div className="h-5 w-96 mt-1 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">
          Consumo dos colaboradores, apuração e abatimento em folha
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consumo colaborador (mensal)</CardTitle>
          <CardDescription>
            Valores por colaborador por mês. Use para apurar desconto em folha e registrar abatimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consumo.length === 0 ? (
            <p className="text-muted-foreground">Nenhum registro de consumo ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Colaborador</th>
                    <th className="text-left py-2">Empresa</th>
                    <th className="text-left py-2">Mês/Ano</th>
                    <th className="text-right py-2">Total</th>
                    <th className="text-right py-2">Abatido</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="py-2">{c.usuarios?.nome ?? '-'}</td>
                      <td className="py-2">{c.empresas?.nome ?? '-'}</td>
                      <td className="py-2">{String(c.mes).padStart(2, '0')}/{c.ano}</td>
                      <td className="text-right py-2">{formatPrice(c.valor_total)}</td>
                      <td className="text-right py-2">{formatPrice(c.valor_abatido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground text-sm mt-4">
            Em breve: tela para registrar abatimento (valor descontado em folha) por mês/colaborador.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
