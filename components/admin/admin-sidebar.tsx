'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Gift,
  BarChart3,
  Package,
  Users,
  Building2,
  GraduationCap,
  UserCircle,
  Shield,
  Upload,
  Wallet,
  Briefcase,
  Calendar,
  Settings,
  FileCheck,
  PanelLeftClose,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RECURSOS_ADMIN } from '@/lib/admin-recursos'
import { obterRecursosDoUsuario } from '@/app/actions/perfis'
import { useAdminSidebar } from '@/components/admin/admin-sidebar-context'
import { Button } from '@/components/ui/button'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: LayoutDashboard,
  'admin.pedidosKitFesta': Gift,
  'admin.pedidosOnline': Gift,
  'admin.relatorios': BarChart3,
  'admin.produtos': Package,
  'admin.alunos': Users,
  'admin.empresas': Building2,
  'admin.turmas': GraduationCap,
  'admin.usuarios': UserCircle,
  'admin.perfis': Shield,
  'admin.importacao': Upload,
  'admin.migrarSaldo': Wallet,
  'admin.rh': Briefcase,
  'admin.calendario': Calendar,
  'admin.configuracoes': Settings,
  'admin.auditoria': FileCheck,
}

export function AdminSidebar() {
  const pathname = usePathname()
  const { state, toggleCollapsed } = useAdminSidebar()
  const [navItems, setNavItems] = useState<{ href: string; label: string; recurso: string }[]>([])

  useEffect(() => {
    let mounted = true
    obterRecursosDoUsuario().then((recursos) => {
      if (!mounted) return
      const items =
        recursos.length > 0
          ? RECURSOS_ADMIN.filter((r) => recursos.includes(r.recurso)).map((r) => ({
              href: r.href,
              label: r.label,
              recurso: r.recurso,
            }))
          : []
      setNavItems(items)
    })
    return () => {
      mounted = false
    }
  }, [])

  if (!state.open) return null

  const collapsed = state.collapsed
  const width = collapsed ? 'w-[72px]' : 'w-[260px]'

  if (navItems.length === 0) return null

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r bg-card shadow-sm transition-[width] duration-200 ease-in-out lg:flex',
        width
      )}
    >
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-20">
        {navItems.map((item) => {
          const active = pathname === item.href
          const Icon = ICONS[item.recurso] ?? LayoutDashboard
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-2 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full justify-center gap-2', collapsed && 'px-0')}
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>Recolher</span>
            </>
          )}
        </Button>
        {(() => {
          const ver =
            (process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
          if (!ver) return null
          return (
            <p
              className={cn(
                'text-[10px] text-muted-foreground text-center truncate',
                collapsed && 'px-1'
              )}
              title={`Versão ${ver}`}
            >
              {collapsed ? ver : `versão ${ver}`}
            </p>
          )
        })()}
      </div>
    </aside>
  )
}

export function AdminSidebarToggle() {
  const { state, toggleOpen } = useAdminSidebar()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="p-2"
      onClick={toggleOpen}
      title={state.open ? 'Ocultar menu' : 'Mostrar menu'}
      aria-label={state.open ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
    >
      {state.open ? (
        <PanelLeftClose className="h-5 w-5" />
      ) : (
        <PanelLeft className="h-5 w-5" />
      )}
    </Button>
  )
}
