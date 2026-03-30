'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { contarItensCarrinho } from '@/lib/carrinho'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu, ShoppingCart, LogOut, User, UtensilsCrossed, Wallet, FileText, Cake } from 'lucide-react'
import { PwaInstallButton } from '@/components/pwa/pwa-install-button'
import Link from 'next/link'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'

type Aparencia = {
  loja_nome: string
  loja_logo_url: string
  loja_favicon_url: string
}

function normalizarAparencia(raw: any): Aparencia {
  return {
    loja_nome: String(raw?.loja_nome ?? ''),
    loja_logo_url: String(raw?.loja_logo_url ?? ''),
    loja_favicon_url: String(raw?.loja_favicon_url ?? ''),
  }
}

export function LojaHeader() {
  const router = useRouter()
  const pathname = usePathname()

  const [config, setConfig] = useState<Aparencia>({
    loja_nome: '',
    loja_logo_url: '',
    loja_favicon_url: '',
  })
  const [totalItens, setTotalItens] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoFalhou, setLogoFalhou] = useState(false)
  const [papelAtivo, setPapelAtivo] = useState<string | null>(null)

  useEffect(() => {
    carregarConfig()
    setTotalItens(contarItensCarrinho())
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1] ?? null
      : null
    setPapelAtivo(papel)

    const interval = setInterval(() => {
      setTotalItens(contarItensCarrinho())
    }, 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const href = (config.loja_favicon_url || '').trim()
    if (!href) return

    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
    if (link) {
      link.href = href
      return
    }

    const newLink = document.createElement('link')
    newLink.rel = 'icon'
    newLink.href = href
    document.head.appendChild(newLink)
  }, [config.loja_favicon_url])

  async function carregarConfig() {
    try {
      const aparencia = await obterConfiguracaoAparencia()
      setConfig(normalizarAparencia(aparencia))
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
    } finally {
      setLoading(false)
    }
  }

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

  const ehModoColaborador =
    pathname.startsWith('/loja/colaborador') || papelAtivo === 'COLABORADOR'
  const navItems = ehModoColaborador
    ? [{ href: '/loja/colaborador', label: 'Meu consumo' }]
    : [
        { href: '/loja', label: 'Cardápio' },
        { href: '/loja/kit-festa', label: 'Kit festa' },
        { href: '/loja/recarga', label: 'Comprar saldo' },
        { href: '/loja/extrato', label: 'Extrato' },
        { href: '/loja/perfil', label: 'Minha Conta' },
      ]
  const trocarPerfilHref = '/escolher-modo'

  const nomeLoja = (config.loja_nome || '').trim() || 'Cantina Escolar'
  const logoUrl = (config.loja_logo_url || '').trim()
  const mostrarLogo = !!logoUrl && !logoFalhou
  const linkInicio = ehModoColaborador ? '/loja/colaborador' : '/loja'

  return (
    <header
      className="sticky top-0 z-50 w-full shadow-md"
      style={{ background: 'linear-gradient(135deg, #0B5ED7 0%, #0a58c9 100%)' }}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href={linkInicio} className="flex items-center hover:opacity-90 transition-opacity min-w-0 shrink-0">
            {mostrarLogo ? (
              <img
                src={logoUrl}
                alt={nomeLoja}
                className="h-12 w-auto max-w-[240px] object-contain object-left"
                onError={() => setLogoFalhou(true)}
              />
            ) : (
              <span className="font-bold text-lg text-white whitespace-nowrap truncate">
                {nomeLoja}
              </span>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-white/25 text-white'
                    : 'text-white/90 hover:bg-white/15 hover:text-white'
                }`}
              >
                {item.href === '/loja' && <UtensilsCrossed className="h-4 w-4" />}
                {item.href === '/loja/kit-festa' && <Cake className="h-4 w-4" />}
                {item.href === '/loja/recarga' && <Wallet className="h-4 w-4" />}
                {item.href === '/loja/extrato' && <FileText className="h-4 w-4" />}
                {item.href === '/loja/perfil' && <User className="h-4 w-4" />}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {!ehModoColaborador && (
              <>
                <Link href="/loja/carrinho">
                  <Button variant="secondary" size="sm" className="relative bg-white/20 hover:bg-white/30 text-white border-0">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Carrinho
                    {totalItens > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#FF8A00] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {totalItens}
                      </span>
                    )}
                  </Button>
                </Link>
                <PwaInstallButton />
              </>
            )}
            <Link href={trocarPerfilHref}>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/15">Trocar perfil</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/15">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>

          <div className="flex md:hidden items-center gap-1">
            {!ehModoColaborador && (
              <>
                <Link href="/loja/carrinho">
                  <button type="button" className="p-2 relative text-white rounded-xl hover:bg-white/15 transition-colors" aria-label="Carrinho">
                    <ShoppingCart className="h-6 w-6" />
                    {totalItens > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-[#FF8A00] text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {totalItens}
                      </span>
                    )}
                  </button>
                </Link>
                <PwaInstallButton />
              </>
            )}

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2 text-white hover:bg-white/15" aria-label="Abrir menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>

              <SheetContent side="right" className="w-80">
                <div className="flex flex-col h-full">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-1">Menu</h2>
                    <p className="text-sm text-muted-foreground">Cantina Escolar</p>
                  </div>

                  <nav className="flex-1 space-y-1">
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                          pathname === item.href
                            ? 'bg-[#0B5ED7]/15 text-[#0B5ED7]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {item.href === '/loja' && <UtensilsCrossed className="h-4 w-4" />}
                        {item.href === '/loja/kit-festa' && <Cake className="h-4 w-4" />}
                        {item.href === '/loja/recarga' && <Wallet className="h-4 w-4" />}
                        {item.href === '/loja/extrato' && <FileText className="h-4 w-4" />}
                        {item.href === '/loja/perfil' && <User className="h-4 w-4" />}
                        {item.label}
                      </Link>
                    ))}
                  </nav>

                  <div className="mt-auto pt-4 border-t space-y-1">
                    <Link href={trocarPerfilHref} onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        Trocar perfil
                      </Button>
                    </Link>
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
          </div>
        </div>
      </div>
    </header>
  )
}
