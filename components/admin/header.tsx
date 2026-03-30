'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { obterRecursosDoUsuario, temOutroContextoParaTrocarPerfil } from '@/app/actions/perfis'
import { RECURSOS_ADMIN } from '@/lib/admin-recursos'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu, LogOut, UserCircle } from 'lucide-react'
import Link from 'next/link'
import { AdminSidebarToggle } from '@/components/admin/admin-sidebar'

type Aparencia = {
  loja_nome?: string | null
  loja_logo_url?: string | null
  loja_favicon_url?: string | null
}

export function AdminHeader() {
  const router = useRouter()
  const pathname = usePathname()

  const [config, setConfig] = useState<Aparencia>({
    loja_nome: '',
    loja_logo_url: '',
    loja_favicon_url: '',
  })
  const [recursos, setRecursos] = useState<string[]>([])
  const [temOutroContexto, setTemOutroContexto] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [aparencia, rec, outroCtx] = await Promise.all([
          obterConfiguracaoAparencia(),
          obterRecursosDoUsuario(),
          temOutroContextoParaTrocarPerfil(),
        ])
        if (!mounted) return
        setConfig((aparencia || {}) as Aparencia)
        setRecursos(rec || [])
        setTemOutroContexto(!!outroCtx)
      } catch (err) {
        console.error('Erro ao carregar configurações:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Erro ao fazer logout:', err)
    }
  }

  const navItems = (recursos.length > 0 ? RECURSOS_ADMIN.filter((r) => recursos.includes(r.recurso)) : []).map(
    (r) => ({ href: r.href, label: r.label })
  )
  const somenteRH = recursos.length === 1 && recursos[0] === 'admin.rh'
  const mostrarMenu = !somenteRH && navItems.length > 0

  const nomeLoja = (config.loja_nome || '').trim() || 'Painel Admin'
  const logoUrl = (config.loja_logo_url || '').trim()
  const mostrarLogo = !!logoUrl
  const mostrarNomeSempre = !mostrarLogo

  const [logoFalhou, setLogoFalhou] = useState(false)
  const mostrarNome = mostrarNomeSempre || logoFalhou

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            {mostrarMenu && (
              <div className="hidden lg:block">
                <AdminSidebarToggle />
              </div>
            )}
            <Link href="/admin" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0 max-w-[220px]">
              {mostrarLogo && !logoFalhou ? (
                <img
                  src={logoUrl}
                  alt={nomeLoja}
                  className="h-10 w-auto max-h-10 object-contain object-left"
                  onError={() => setLogoFalhou(true)}
                />
              ) : null}

              {mostrarNome ? (
                <span className="font-semibold text-lg text-foreground truncate">{nomeLoja}</span>
              ) : null}
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {mostrarMenu && (recursos.length === 0 || recursos.includes('pdv')) && (
              <Link href="/pdv">
                <Button variant="outline" size="sm">
                  PDV
                </Button>
              </Link>
            )}
            {temOutroContexto && (
              <Link href="/escolher-modo">
                <Button variant="outline" size="sm">
                  <UserCircle className="h-4 w-4 mr-2" />
                  Trocar de perfil
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>

          <div className="flex lg:hidden items-center gap-2">
            {mostrarMenu && (recursos.length === 0 || recursos.includes('pdv')) && (
              <Link href="/pdv">
                <Button variant="ghost" size="sm" className="p-2" aria-label="PDV">
                  PDV
                </Button>
              </Link>
            )}
            {temOutroContexto && (
              <Link href="/escolher-modo">
                <Button variant="ghost" size="sm" className="p-2" aria-label="Trocar de perfil">
                  <UserCircle className="h-5 w-5" />
                </Button>
              </Link>
            )}

            {mostrarMenu ? (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2" aria-label="Abrir menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>

                <SheetContent side="left" className="w-80">
                  <div className="flex flex-col h-full">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold mb-1">Menu</h2>
                      <p className="text-sm text-muted-foreground">Navegação do painel</p>
                    </div>

                    <nav className="flex-1 space-y-1">
                      {navItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`block px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                            pathname === item.href
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </nav>

                    <div className="mt-auto pt-4 border-t space-y-2">
                      {temOutroContexto && (
                        <Link href="/escolher-modo" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="outline" className="w-full justify-start">
                            <UserCircle className="h-4 w-4 mr-2" />
                            Trocar de perfil
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          setMobileMenuOpen(false)
                          handleLogout()
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sair
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            ) : (
              <>
                {temOutroContexto && (
                  <Link href="/escolher-modo">
                    <Button variant="outline" size="sm" className="gap-2">
                      Trocar perfil
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="sm" className="p-2" onClick={handleLogout} aria-label="Sair">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
