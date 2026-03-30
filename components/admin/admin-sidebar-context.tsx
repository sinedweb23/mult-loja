'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

type SidebarState = {
  /** Sidebar visível (false = oculto, só header) */
  open: boolean
  /** Dentro do sidebar: false = expandido com labels, true = só ícones */
  collapsed: boolean
}

const defaultState: SidebarState = { open: true, collapsed: false }

const STORAGE_KEY_OPEN = 'admin-sidebar-open'
const STORAGE_KEY_COLLAPSED = 'admin-sidebar-collapsed'

const AdminSidebarContext = createContext<{
  state: SidebarState
  setOpen: (v: boolean) => void
  setCollapsed: (v: boolean) => void
  toggleOpen: () => void
  toggleCollapsed: () => void
} | null>(null)

export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SidebarState>(() => {
    if (typeof window === 'undefined') return defaultState
    try {
      const open = localStorage.getItem(STORAGE_KEY_OPEN)
      const collapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED)
      return {
        open: open !== 'false',
        collapsed: collapsed === 'true',
      }
    } catch {
      return defaultState
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN, String(state.open))
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(state.collapsed))
    } catch {}
  }, [state.open, state.collapsed])

  const setOpen = (open: boolean) => setState((s) => ({ ...s, open }))
  const setCollapsed = (collapsed: boolean) => setState((s) => ({ ...s, collapsed }))
  const toggleOpen = () => setState((s) => ({ ...s, open: !s.open }))
  const toggleCollapsed = () => setState((s) => ({ ...s, collapsed: !s.collapsed }))

  return (
    <AdminSidebarContext.Provider
      value={{ state, setOpen, setCollapsed, toggleOpen, toggleCollapsed }}
    >
      {children}
    </AdminSidebarContext.Provider>
  )
}

export function useAdminSidebar() {
  const ctx = useContext(AdminSidebarContext)
  if (!ctx) throw new Error('useAdminSidebar must be used within AdminSidebarProvider')
  return ctx
}
