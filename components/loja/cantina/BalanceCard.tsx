'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

interface BalanceCardProps {
  alunoNome: string
  saldo?: number | null
  href?: string
  /** Se mais de 1 filho: mostrar botão Trocar e lista para escolher */
  alunos?: { id: string; nome: string }[]
  alunoAtualId?: string
  onAlunoChange?: (alunoId: string) => void
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function BalanceCard({
  alunoNome,
  saldo,
  href = '/loja/extrato',
  alunos,
  alunoAtualId,
  onAlunoChange,
}: BalanceCardProps) {
  const mostrarTrocar = alunos && alunos.length > 1 && onAlunoChange

  const content = (
    <div className="rounded-2xl bg-white p-4 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] flex items-center gap-4 cantina-card-hover">
      <div className="w-12 h-12 rounded-full bg-[#0B5ED7]/10 flex items-center justify-center flex-shrink-0">
        <Wallet className="w-6 h-6 text-[#0B5ED7]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--cantina-text)] truncate">{alunoNome}</p>
        <p className="text-lg font-bold text-[#0B5ED7]">
          Saldo: {saldo != null ? formatPrice(saldo) : '—'}
        </p>
      </div>
      {mostrarTrocar && alunoAtualId && (
        <Select value={alunoAtualId} onValueChange={(id) => onAlunoChange(id)}>
          <SelectTrigger className="shrink-0 w-auto rounded-xl border-[#0B5ED7]/40 text-[#0B5ED7] hover:bg-[#0B5ED7]/10 h-9 px-3 text-sm font-medium min-w-[90px]">
            <span className="pointer-events-none">Trocar</span>
          </SelectTrigger>
          <SelectContent align="end" className="min-w-[200px]">
            {alunos.map((a) => (
              <SelectItem key={a.id} value={a.id} className={a.id === alunoAtualId ? 'bg-[#0B5ED7]/10 font-medium' : ''}>
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )

  if (href && !mostrarTrocar) {
    return <Link href={href} className="block">{content}</Link>
  }
  if (href && mostrarTrocar) {
    return (
      <div className="block">
        {content}
        <Link href={href} className="mt-2 block text-center text-sm font-medium text-[#0B5ED7] hover:underline">
          Ver gestão de saldo
        </Link>
      </div>
    )
  }
  return content
}
