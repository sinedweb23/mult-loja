'use client'

import Link from 'next/link'
import { UtensilsCrossed, Wallet, Calendar, FileText, CreditCard } from 'lucide-react'

export function ActionGrid({
  alunoId,
  mostrarCreditoCantina = false,
}: {
  alunoId?: string | null
  mostrarCreditoCantina?: boolean
}) {
  const q = alunoId ? `?aluno=${encodeURIComponent(alunoId)}` : ''
  const actions = [
    { href: '/loja#cardapio', label: 'Comprar Lanche', sublabel: 'Cardápio', icon: UtensilsCrossed, color: 'bg-[#16A34A]' },
    { href: `/loja/recarga${q}`, label: 'Recarga de Crédito', sublabel: 'Adicionar saldo', icon: Wallet, color: 'bg-[#FF8A00]' },
    ...(mostrarCreditoCantina
      ? [{ href: `/loja/credito-cantina${q}`, label: 'Crédito Cantina', sublabel: 'Gestão de saldo', icon: CreditCard, color: 'bg-[#059669]' as const }]
      : []),
    { href: `/loja/controle${q}`, label: 'Controle', sublabel: 'Limites e bloqueios', icon: Calendar, color: 'bg-[#0B5ED7]' },
    { href: `/loja/extrato${q}`, label: 'Extrato', sublabel: 'Ver movimentações', icon: FileText, color: 'bg-[#7C3AED]' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map(({ href, label, sublabel, icon: Icon, color }) => (
        <Link
          key={href + label}
          href={href}
          className={`rounded-2xl p-4 ${color} text-white shadow-[var(--cantina-shadow)] cantina-card-hover cantina-btn-transition flex flex-col gap-2`}
        >
          <Icon className="w-8 h-8 opacity-95" />
          <span className="font-bold text-sm leading-tight">{label}</span>
          <span className="text-xs text-white/90">{sublabel}</span>
        </Link>
      ))}
    </div>
  )
}
