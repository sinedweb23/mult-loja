'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

interface SnackOfTheDayCardProps {
  nome: string
  preco: number
  /** Quando definido (ex.: kit lanche mensal/avulso), exibe "A partir de R$ X" como no cardápio. */
  precoAPartirDe?: number | null
  imagemUrl?: string | null
  href: string
  formatPrice: (value: number) => string
}

export function SnackOfTheDayCard({ nome, preco, precoAPartirDe, imagemUrl, href, formatPrice }: SnackOfTheDayCardProps) {
  const precoExibicao =
    precoAPartirDe != null ? `A partir de ${formatPrice(precoAPartirDe)}` : formatPrice(preco)

  return (
    <div className="rounded-2xl bg-white overflow-hidden shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] cantina-card-hover">
      <div className="flex gap-4 p-4">
        <div className="w-24 h-24 rounded-xl bg-[var(--cantina-background)] flex-shrink-0 overflow-hidden">
          {imagemUrl ? (
            <img src={imagemUrl} alt={nome} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">🍔</div>
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <h3 className="font-bold text-[var(--cantina-text)]">{nome}</h3>
          <p className="text-lg font-bold text-[#0B5ED7] mt-0.5">{precoExibicao}</p>
          <Link href={href} className="mt-2 inline-flex">
            <Button size="sm" className="bg-[#FF8A00] hover:bg-[#e67d00] text-white rounded-xl cantina-btn-transition">
              Comprar
            </Button>
          </Link>
        </div>
        <ChevronRight className="w-5 h-5 text-[var(--cantina-text-muted)] self-center flex-shrink-0" />
      </div>
    </div>
  )
}
