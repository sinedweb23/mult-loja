'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { podeAcessarPdv } from '@/app/actions/perfis'
import {
  obterCaixaAberto,
  abrirCaixa,
  fecharCaixa,
  obterDadosFechamentoParaComprovante,
  type DadosComprovanteFechamento,
} from '@/app/actions/caixa'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import { ComprovanteFechamentoModal } from '@/components/pdv/comprovante-fechamento-modal'
import { listarEmpresas } from '@/app/actions/empresas'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, LogOut, Package, ShoppingCart, UtensilsCrossed, Wallet } from 'lucide-react'
import type { Caixa } from '@/lib/types/database'
import { CaixaContext } from './caixa-context'

export default function PdvLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [checking, setChecking] = useState(true)
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null)
  const [mostrarDialogAbertura, setMostrarDialogAbertura] = useState(false)
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [fundoTroco, setFundoTroco] = useState('0')
  const [abrirLoading, setAbrirLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarFecharCaixa, setMostrarFecharCaixa] = useState(false)
  const [dadosFechamento, setDadosFechamento] = useState<DadosComprovanteFechamento | null>(null)
  const [fechandoCaixa, setFechandoCaixa] = useState(false)
  const [erroFechar, setErroFechar] = useState<string | null>(null)
  const [nomeLoja, setNomeLoja] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFalhou, setLogoFalhou] = useState(false)
  const [comprovanteFechamentoOpen, setComprovanteFechamentoOpen] = useState(false)
  const [comprovanteFechamentoDados, setComprovanteFechamentoDados] = useState<{
    dados: DadosComprovanteFechamento
    dataHoraFechamento: string
  } | null>(null)
  const [nomeUsuario, setNomeUsuario] = useState<string>('')

  useEffect(() => {
    verificarAcesso()
  }, [router, supabase.auth])

  async function verificarAcesso() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const pode = await podeAcessarPdv()
      if (!pode) {
        router.replace('/escolher-modo')
        return
      }
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome')
        .eq('auth_user_id', user.id)
        .single()
      const nomeCompleto = usuario?.nome?.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || ''
      setNomeUsuario(nomeCompleto ? nomeCompleto.split(/\s+/)[0] : '')
      
      // Verificar se há caixa aberto
      const caixa = await obterCaixaAberto()
      setCaixaAberto(caixa)
      
      // Se não houver caixa aberto, mostrar dialog de abertura
      if (!caixa) {
        const listaEmpresas = await listarEmpresas()
        setEmpresas(listaEmpresas.map((e: { id: string; nome: string }) => ({ id: e.id, nome: e.nome })))
        if (listaEmpresas.length === 1) {
          setEmpresaId(listaEmpresas[0].id)
        }
        setMostrarDialogAbertura(true)
      }
      
      setChecking(false)
    } catch (err) {
      console.error('Erro ao verificar acesso:', err)
      router.replace('/login')
    }
  }

  function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  useEffect(() => {
    obterConfiguracaoAparencia().then((c) => {
      setNomeLoja((c.loja_nome || '').trim())
      setLogoUrl((c.loja_logo_url || '').trim())
      setLogoFalhou(false)
    })
  }, [])

  async function abrirDialogFecharCaixa() {
    if (!caixaAberto) return
    setErroFechar(null)
    const dados = await obterDadosFechamentoParaComprovante(caixaAberto.id)
    setDadosFechamento(dados ?? null)
    setMostrarFecharCaixa(true)
  }

  async function confirmarFecharCaixa() {
    if (!dadosFechamento) return
    setFechandoCaixa(true)
    setErroFechar(null)
    const res = await fecharCaixa()
    setFechandoCaixa(false)
    if (res.ok) {
      setMostrarFecharCaixa(false)
      setComprovanteFechamentoDados({
        dados: dadosFechamento,
        dataHoraFechamento: new Date().toISOString(),
      })
      setComprovanteFechamentoOpen(true)
      setDadosFechamento(null)
      setCaixaAberto(null)
    } else {
      setErroFechar(res.erro || 'Erro ao fechar caixa')
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Erro ao sair:', err)
    }
  }

  async function handleAbrirCaixa() {
    const empresa = empresaId || empresas[0]?.id
    if (!empresa) {
      setErro('Selecione uma empresa')
      return
    }
    const valor = parseFloat(fundoTroco.replace(',', '.')) || 0
    setAbrirLoading(true)
    setErro(null)
    
    const res = await abrirCaixa(empresa, valor)
    setAbrirLoading(false)
    
    if (res.ok && res.caixa) {
      setCaixaAberto(res.caixa)
      setMostrarDialogAbertura(false)
      setFundoTroco('0')
      router.push('/pdv/vendas')
    } else {
      setErro(res.erro || 'Erro ao abrir caixa')
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const nav = [
    { href: '/pdv/vendas', label: 'Vendas', icon: ShoppingCart },
    { href: '/pdv/consumo-interno', label: 'Consumo Interno', icon: UtensilsCrossed },
    { href: '/pdv/pedidos', label: 'Pedidos do dia', icon: Package },
    { href: '/pdv/relatorio', label: 'Vendas do dia', icon: FileText },
  ]

  return (
    <>
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background sticky top-0 z-10">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/pdv/vendas" className="flex items-center gap-2 shrink-0 min-w-0 max-w-[200px] hover:opacity-80 transition-opacity">
              {logoUrl && !logoFalhou ? (
                <img
                  src={logoUrl}
                  alt={nomeLoja || 'Loja'}
                  className="h-9 w-auto max-h-9 object-contain object-left"
                  onError={() => setLogoFalhou(true)}
                />
              ) : (
                <span className="font-semibold truncate">{nomeLoja || 'PDV'}</span>
              )}
            </Link>
            <nav className="flex items-center gap-2">
              {nomeUsuario && (
                <span className="text-sm text-muted-foreground mr-2 hidden sm:inline">
                  Olá, {nomeUsuario}
                </span>
              )}
              {nav.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button variant={pathname === href ? 'default' : 'ghost'} size="sm">
                    <Icon className="h-4 w-4 mr-2" />
                    {label}
                  </Button>
                </Link>
              ))}
              {caixaAberto && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={abrirDialogFecharCaixa}
                  className="ml-2"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Fechar Caixa
                </Button>
              )}
              <Link href="/escolher-modo">
                <Button variant="outline" size="sm">Trocar perfil</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </nav>
          </div>
        </header>
        <main className="w-full max-w-full px-4 py-6">
          <CaixaContext.Provider value={caixaAberto}>{children}</CaixaContext.Provider>
        </main>
      </div>

      {/* Dialog de abertura de caixa */}
      <Dialog 
        open={mostrarDialogAbertura} 
        onOpenChange={(open) => {
          // Não permitir fechar o dialog sem abrir o caixa
          if (!caixaAberto && !open) {
            // Se tentar fechar sem caixa aberto, redirecionar para escolher modo
            router.replace('/escolher-modo')
          } else if (caixaAberto) {
            // Se já tem caixa aberto, permitir fechar
            setMostrarDialogAbertura(open)
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-[425px]"
          onInteractOutside={(e) => {
            // Prevenir fechar clicando fora se não houver caixa aberto
            if (!caixaAberto) {
              e.preventDefault()
            }
          }}
          onEscapeKeyDown={(e) => {
            // Prevenir fechar com ESC se não houver caixa aberto
            if (!caixaAberto) {
              e.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Abrir Caixa</DialogTitle>
            <DialogDescription>
              Para acessar o PDV, é necessário abrir um caixa primeiro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {erro && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{erro}</p>
            )}
            <div>
              <Label htmlFor="empresa">Empresa *</Label>
              <select
                id="empresa"
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                required
              >
                <option value="">Selecione uma empresa</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="fundo-troco">Fundo de Troco (R$)</Label>
              <Input
                id="fundo-troco"
                type="text"
                placeholder="0,00"
                value={fundoTroco}
                onChange={(e) => setFundoTroco(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Valor inicial para troco. Deixe em branco ou 0 se não houver fundo.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={handleAbrirCaixa}
              disabled={abrirLoading || !empresaId}
              className="w-full"
            >
              {abrirLoading ? 'Abrindo...' : 'Abrir Caixa'}
            </Button>
            <Link href="/escolher-modo" className="w-full">
              <Button type="button" variant="ghost" className="w-full text-muted-foreground">
                Sair
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de fechamento de caixa (conferência) */}
      <Dialog open={mostrarFecharCaixa} onOpenChange={setMostrarFecharCaixa}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>
              Confira os valores abaixo com o dinheiro e movimentações do dia antes de concluir.
            </DialogDescription>
          </DialogHeader>
          {dadosFechamento && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Operador</span>
                <span className="font-medium">{dadosFechamento.operador_nome}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fundo de troco</span>
                <span className="font-medium">{formatPrice(dadosFechamento.fundo_troco)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dinheiro (esperado no caixa)</span>
                <span className="font-medium">{formatPrice(dadosFechamento.dinheiro_esperado)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Débito</span>
                <span className="font-medium">{formatPrice(dadosFechamento.debito)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Crédito</span>
                <span className="font-medium">{formatPrice(dadosFechamento.credito)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo do aluno</span>
                <span className="font-medium">{formatPrice(dadosFechamento.saldo_aluno)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendas para colaboradores</span>
                <span className="font-medium">{formatPrice(dadosFechamento.colaboradores)}</span>
              </div>
              {(dadosFechamento.valor_cancelado > 0 || dadosFechamento.comprovantes_cancelados > 0) && (
                <>
                  <div className="flex justify-between text-sm text-amber-600 dark:text-amber-500">
                    <span>Valor cancelado (estornos)</span>
                    <span className="font-medium">{formatPrice(dadosFechamento.valor_cancelado)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-amber-600 dark:text-amber-500">
                    <span>Comprovantes de cancelamento</span>
                    <span className="font-medium">{dadosFechamento.comprovantes_cancelados}</span>
                  </div>
                </>
              )}
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>Total geral</span>
                <span>{formatPrice(dadosFechamento.total_geral)}</span>
              </div>
            </div>
          )}
          {erroFechar && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{erroFechar}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMostrarFecharCaixa(false)} disabled={fechandoCaixa}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarFecharCaixa} disabled={fechandoCaixa}>
              {fechandoCaixa ? 'Fechando...' : 'Concluir fechamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comprovante de fechamento (impressão após concluir) */}
      {comprovanteFechamentoDados && (
        <ComprovanteFechamentoModal
          open={comprovanteFechamentoOpen}
          onClose={() => {
            setComprovanteFechamentoOpen(false)
            setComprovanteFechamentoDados(null)
            setMostrarDialogAbertura(true)
            window.location.reload()
          }}
          nomeLoja={nomeLoja}
          dataHoraFechamento={comprovanteFechamentoDados.dataHoraFechamento}
          dados={comprovanteFechamentoDados.dados}
        />
      )}
    </>
  )
}
