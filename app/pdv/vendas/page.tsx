'use client'

import { useEffect, useState } from 'react'
import { useCaixaPdv } from '@/app/pdv/caixa-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { VendaDireta } from '@/components/pdv/venda-direta'
import { VendaAluno } from '@/components/pdv/venda-aluno'
import { VendaColaborador } from '@/components/pdv/venda-colaborador'

export default function PdvVendasPage() {
  const caixa = useCaixaPdv()
  const [abaAtiva, setAbaAtiva] = useState<'direta' | 'aluno' | 'colaborador'>('direta')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'F1') {
        event.preventDefault()
        setAbaAtiva('direta')
      } else if (event.key === 'F2') {
        event.preventDefault()
        setAbaAtiva('aluno')
      } else if (event.key === 'F3') {
        event.preventDefault()
        setAbaAtiva('colaborador')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  if (!caixa) {
    return (
      <div className="w-full space-y-6">
        <h1 className="text-3xl font-bold">Vendas</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Abra o caixa no diálogo acima para acessar as vendas.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vendas</h1>
        <p className="text-muted-foreground mt-1">
          Realize vendas diretas, para alunos ou colaboradores
        </p>
      </div>

      <Tabs
        value={abaAtiva}
        onValueChange={(value) =>
          setAbaAtiva(value as 'direta' | 'aluno' | 'colaborador')
        }
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 h-12 p-1.5 bg-muted/80 rounded-lg gap-1.5">
          <TabsTrigger
            value="direta"
            className="rounded-md py-2.5 text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-foreground data-[state=inactive]:hover:bg-muted transition-all"
          >
            Venda Direta (F1)
          </TabsTrigger>
          <TabsTrigger
            value="aluno"
            className="rounded-md py-2.5 text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-foreground data-[state=inactive]:hover:bg-muted transition-all"
          >
            Venda Aluno (F2)
          </TabsTrigger>
          <TabsTrigger
            value="colaborador"
            className="rounded-md py-2.5 text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-foreground data-[state=inactive]:hover:bg-muted transition-all"
          >
            Venda Colaborador (F3)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="direta">
          <Card>
            <CardContent className="pt-6">
              <VendaDireta caixa={caixa} ativa={abaAtiva === 'direta'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aluno">
          <Card>
            <CardContent className="pt-6">
              <VendaAluno caixa={caixa} ativa={abaAtiva === 'aluno'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colaborador">
          <Card>
            <CardContent className="pt-6">
              <VendaColaborador caixa={caixa} ativa={abaAtiva === 'colaborador'} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
