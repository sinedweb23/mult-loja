'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, Wallet, User } from 'lucide-react'

const items = [
  { href: '/loja', label: 'Início', icon: Home },
  { href: '/loja/extrato', label: 'Extrato', icon: FileText },
  { href: '/loja/recarga', label: 'Recarga', icon: Wallet },
  { href: '/loja/perfil', label: 'Perfil', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()

  // Menu do rodapé é só para a loja (aluno/responsável). Não exibir no modo colaborador.
  if (pathname.startsWith('/loja/colaborador')) {
    return null
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B5ED7] text-white"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)' }}
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/loja' ? pathname === '/loja' : pathname.startsWith(href)
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors cantina-btn-transition ${active ? 'text-white font-semibold' : 'text-white/80'}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-6 h-6 ${active ? 'opacity-100' : 'opacity-90'}`} strokeWidth={active ? 2.5 : 2} />
              <span className="text-xs">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
