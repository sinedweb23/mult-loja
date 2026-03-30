'use client'

import { useState, useEffect } from 'react'
import { AdminSidebarProvider, useAdminSidebar } from '@/components/admin/admin-sidebar-context'
import { AdminHeader } from '@/components/admin/header'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminGuard } from '@/components/admin/admin-guard'

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const { state } = useAdminSidebar()
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(m.matches)
    const fn = () => setIsDesktop(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])
  const open = state.open
  const collapsed = state.collapsed
  const marginLeft = isDesktop && open ? (collapsed ? 72 : 260) : 0

  return (
    <>
      <AdminSidebar />
      <div
        className="flex min-h-screen flex-1 flex-col transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: `${marginLeft}px` }}
      >
        <AdminHeader />
        <main>
          <AdminGuard>{children}</AdminGuard>
        </main>
      </div>
    </>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminSidebarProvider>
      <div className="flex min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <AdminShellInner>{children}</AdminShellInner>
      </div>
    </AdminSidebarProvider>
  )
}
