'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wallet, FileText, Calendar, ArrowRight } from 'lucide-react'

export function CreditoCantinaContent() {
  const searchParams = useSearchParams()
  const q = searchParams.get('aluno') ? `?aluno=${encodeURIComponent(searchParams.get('aluno')!)}` : ''

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--cantina-background, #F5F7FB)' }}>
      <LojaHeader />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-[var(--cantina-text)] mb-2">Crédito Cantina</h1>
        <p className="text-[var(--cantina-text-muted)] text-sm mb-6">
          Gerencie o saldo e as movimentações dos seus alunos.
        </p>
        <div className="space-y-3">
          <Link href={`/loja/recarga${q}`}>
            <Card className="cantina-card-hover border-[var(--cantina-border)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#FF8A00]/20 text-[#FF8A00]">
                      <Wallet className="w-5 h-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">Recarga de Crédito</CardTitle>
                      <CardDescription>Adicionar saldo à cantina</CardDescription>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/loja/extrato${q}`}>
            <Card className="cantina-card-hover border-[var(--cantina-border)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#7C3AED]/20 text-[#7C3AED]">
                      <FileText className="w-5 h-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">Extrato</CardTitle>
                      <CardDescription>Ver movimentações de saldo</CardDescription>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/loja/controle${q}`}>
            <Card className="cantina-card-hover border-[var(--cantina-border)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#0B5ED7]/20 text-[#0B5ED7]">
                      <Calendar className="w-5 h-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">Controle</CardTitle>
                      <CardDescription>Limites e bloqueios</CardDescription>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
        <div className="mt-6">
          <Link href="/loja">
            <Button variant="outline" className="w-full">
              Voltar à Loja
            </Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
