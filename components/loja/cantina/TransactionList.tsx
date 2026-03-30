'use client'

import Link from 'next/link'
import { FileText, Wallet, UtensilsCrossed } from 'lucide-react'

export interface TransactionItem {
  id: string
  descricao: string
  subdescricao?: string
  valor: number
  tipo: 'entrada' | 'saida'
  dataHora: string
}

interface TransactionListProps {
  items: TransactionItem[]
  formatPrice: (value: number) => string
  emptyMessage?: string
  emptyHref?: string
  emptyLabel?: string
}

export function TransactionList({
  items,
  formatPrice,
  emptyMessage = 'Nenhuma transação recente',
  emptyHref = '/loja/extrato',
  emptyLabel = 'Ver extrato',
}: TransactionListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] text-center">
        <p className="text-sm text-[var(--cantina-text-muted)]">{emptyMessage}</p>
        <Link href={emptyHref} className="inline-block mt-2 text-sm font-medium text-[#0B5ED7] hover:underline">
          {emptyLabel}
        </Link>
      </div>
    )
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isEntrada = item.tipo === 'entrada'
        const Icon = isEntrada ? Wallet : UtensilsCrossed
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-[var(--cantina-shadow-sm)] border border-[var(--cantina-border)]"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isEntrada ? 'bg-[#16A34A]/15 text-[#16A34A]' : 'bg-[#0B5ED7]/10 text-[#0B5ED7]'}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--cantina-text)]">{item.descricao}</p>
              {item.subdescricao && (
                <p className="text-xs text-[var(--cantina-text-muted)]">{item.subdescricao}</p>
              )}
              <p className="text-xs text-[var(--cantina-text-muted)] mt-0.5">{item.dataHora}</p>
            </div>
            <span
              className={`font-semibold flex-shrink-0 ${isEntrada ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}
            >
              {isEntrada ? '+' : '-'}{formatPrice(Math.abs(item.valor))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
