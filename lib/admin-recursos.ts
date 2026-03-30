/**
 * Recursos (páginas/funcionalidades) do painel admin.
 * Cada recurso corresponde a uma rota; o menu e o redirecionamento usam esta lista.
 */
export const RECURSOS_ADMIN = [
  { recurso: 'admin', label: 'Dashboard', href: '/admin' },
  { recurso: 'admin.pedidosKitFesta', label: 'Pedidos – Kit Festa', href: '/admin/pedidos-kit-festa' },
  { recurso: 'admin.pedidosOnline', label: 'Pedidos online', href: '/admin/pedidos-online' },
  { recurso: 'admin.relatorios', label: 'Relatórios', href: '/admin/relatorios' },
  { recurso: 'admin.consumoInterno', label: 'Consumo Interno', href: '/admin/consumo-interno' },
  { recurso: 'admin.produtos', label: 'Produtos', href: '/admin/produtos' },
  { recurso: 'admin.alunos', label: 'Alunos', href: '/admin/alunos' },
  { recurso: 'admin.empresas', label: 'Empresas', href: '/admin/empresas' },
  { recurso: 'admin.turmas', label: 'Turmas', href: '/admin/turmas' },
  { recurso: 'admin.usuarios', label: 'Usuários', href: '/admin/usuarios' },
  { recurso: 'admin.perfis', label: 'Perfis', href: '/admin/perfis' },
  { recurso: 'admin.importacao', label: 'Importação', href: '/admin/importacao' },
  { recurso: 'admin.migrarSaldo', label: 'Migrar Saldo', href: '/admin/migrar-saldo' },
  { recurso: 'admin.rh', label: 'RH', href: '/admin/rh' },
  { recurso: 'admin.calendario', label: 'Calendário', href: '/admin/calendario' },
  { recurso: 'admin.configuracoes', label: 'Configurações', href: '/admin/configuracoes' },
  { recurso: 'admin.auditoria', label: 'Auditoria', href: '/admin/auditoria' },
] as const

export type RecursoAdmin = (typeof RECURSOS_ADMIN)[number]['recurso']

/** Retorna o href da primeira página permitida (para redirecionamento após login). */
export function primeiraPaginaPermitida(recursosPermitidos: string[]): string {
  const set = new Set(recursosPermitidos)
  for (const item of RECURSOS_ADMIN) {
    if (set.has(item.recurso)) return item.href
  }
  return '/admin'
}

/** Mapeia pathname para recurso (ex: /admin/pedidos -> admin.pedidos, /pdv -> pdv). */
export function pathnameParaRecurso(pathname: string): string | null {
  if (pathname === '/admin' || pathname === '/admin/') return 'admin'
  if (pathname === '/pdv' || pathname.startsWith('/pdv/')) return 'pdv'
  const match = pathname.match(/^\/admin\/([^/]+)/)
  if (!match) return null
  const slug = match[1]
  if (slug === 'relatorios') return 'admin.relatorios'
  if (slug === 'consumo-interno') return 'admin.consumoInterno'
  if (slug === 'pedidos-kit-festa') return 'admin.pedidosKitFesta'
  if (slug === 'pedidos-online') return 'admin.pedidosOnline'
  if (slug === 'migrar-saldo') return 'admin.migrarSaldo'
  if (slug === 'auditoria') return 'admin.auditoria'
  return `admin.${slug}`
}

/** Lista de recursos (ids) para uso em selects/checkboxes. */
export const LISTA_RECURSOS: RecursoAdmin[] = RECURSOS_ADMIN.map((r) => r.recurso)
