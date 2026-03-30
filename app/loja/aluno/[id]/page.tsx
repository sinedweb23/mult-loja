'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { obterMeuPerfil } from '@/app/actions/responsavel'
import { PAPEL_COOKIE } from '@/lib/cantina-papeis'
import { obterSaldoAluno, obterExtratoAluno, recargaOnline } from '@/app/actions/saldo'
import {
  obterConfigAlunoParaLoja,
  definirLimiteDiario,
  bloquearProduto,
  desbloquearProduto,
  listarProdutosCardapioParaBloqueio,
  type ProdutoCardapioItem,
} from '@/app/actions/aluno-config'
import { LojaHeader } from '@/components/loja/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { Package, CreditCard, Receipt, Settings, PlusCircle, ShoppingCart } from 'lucide-react'

export default function AlunoPage() {
  const router = useRouter()
  const params = useParams()
  const alunoId = params.id as string
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState<{ id: string; alunos: { id: string; nome: string }[] } | null>(null)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [extrato, setExtrato] = useState<any[]>([])
  const [config, setConfig] = useState<{ limite_gasto_diario: number | null; produtos_bloqueados_ids: string[] } | null>(null)
  const [cardapio, setCardapio] = useState<ProdutoCardapioItem[]>([])
  const [valorRecarga, setValorRecarga] = useState('')
  const [valorLimite, setValorLimite] = useState('')
  const [produtoParaBloquear, setProdutoParaBloquear] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const papel = typeof document !== 'undefined'
      ? document.cookie.split('; ').find((r) => r.startsWith(`${PAPEL_COOKIE}=`))?.split('=')[1]
      : null
    if (papel === 'COLABORADOR') {
      router.replace('/loja/colaborador')
      return
    }
    carregarDados()
  }, [alunoId, router])

  async function carregarDados() {
    try {
      const perfil = await obterMeuPerfil()
      if (!perfil) {
        router.push('/loja')
        return
      }
      const aluno = (perfil as any).alunos?.find((a: { id: string }) => a.id === alunoId)
      if (!aluno) {
        router.push('/loja/perfil')
        return
      }
      setUsuario(perfil as any)
      const [s, e, c, card] = await Promise.all([
        obterSaldoAluno(alunoId),
        obterExtratoAluno(alunoId),
        obterConfigAlunoParaLoja(alunoId),
        listarProdutosCardapioParaBloqueio(alunoId),
      ])
      setSaldo(s)
      setExtrato(e)
      setConfig(c)
      setCardapio(card)
      setValorLimite(c.limite_gasto_diario != null ? String(c.limite_gasto_diario) : '')
    } catch (err) {
      console.error(err)
      router.push('/loja')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecarga() {
    const v = parseFloat(valorRecarga.replace(',', '.'))
    if (!usuario || isNaN(v) || v <= 0) return
    setSalvando(true)
    setMsg(null)
    const res = await recargaOnline(alunoId, v, usuario.id)
    setSalvando(false)
    if (res.ok) {
      setValorRecarga('')
      const [novoSaldo, ext] = await Promise.all([obterSaldoAluno(alunoId), obterExtratoAluno(alunoId)])
      setSaldo(novoSaldo)
      setExtrato(ext)
      setMsg('Crédito adicionado com sucesso.')
    } else {
      setMsg(res.erro || 'Erro ao adicionar crédito')
    }
  }

  async function handleSalvarLimite() {
    if (!usuario) return
    const v = valorLimite.trim() === '' ? null : parseFloat(valorLimite.replace(',', '.'))
    if (v !== null && (isNaN(v) || v < 0)) return
    setSalvando(true)
    setMsg(null)
    const res = await definirLimiteDiario(alunoId, usuario.id, v)
    setSalvando(false)
    if (res.ok) {
      setConfig(prev => prev ? { ...prev, limite_gasto_diario: v } : null)
      setMsg('Limite atualizado.')
    } else {
      setMsg(res.erro || 'Erro')
    }
  }

  async function handleBloquearProduto() {
    if (!usuario || !produtoParaBloquear) return
    setSalvando(true)
    setMsg(null)
    const res = await bloquearProduto(alunoId, usuario.id, produtoParaBloquear)
    setSalvando(false)
    if (res.ok) {
      setConfig(prev => prev ? { ...prev, produtos_bloqueados_ids: [...prev.produtos_bloqueados_ids, produtoParaBloquear] } : { limite_gasto_diario: null, produtos_bloqueados_ids: [produtoParaBloquear] })
      setProdutoParaBloquear('')
      setMsg('Produto bloqueado.')
    } else {
      setMsg(res.erro || 'Erro ao bloquear')
    }
  }

  async function handleDesbloquearProduto(produtoId: string) {
    if (!usuario) return
    setSalvando(true)
    setMsg(null)
    const res = await desbloquearProduto(alunoId, usuario.id, produtoId)
    setSalvando(false)
    if (res.ok) {
      setConfig(prev => prev ? { ...prev, produtos_bloqueados_ids: prev.produtos_bloqueados_ids.filter(id => id !== produtoId) } : null)
      setMsg('Produto desbloqueado.')
    } else {
      setMsg(res.erro || 'Erro ao desbloquear')
    }
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }
  function formatDate(s: string) {
    return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  if (loading || !usuario) {
    return (
      <>
        <LojaHeader />
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="text-center py-12">Carregando...</div>
        </div>
      </>
    )
  }

  const alunoNome = (usuario as any).alunos?.find((a: { id: string }) => a.id === alunoId)?.nome || 'Aluno'
  const bloqueadosComNome = (config?.produtos_bloqueados_ids || [])
    .map(id => ({ id, nome: cardapio.find(p => p.id === id)?.nome || id }))
  const produtosDisponiveisParaBloquear = cardapio.filter(p => !config?.produtos_bloqueados_ids?.includes(p.id))

  return (
    <>
      <LojaHeader />
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link href="/loja/perfil" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            ← Minha Conta
          </Link>
          <h1 className="text-2xl font-bold">{alunoNome}</h1>
          <Link href="/loja">
            <Button size="sm">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Comprar lanche
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Saldo na cantina
            </CardTitle>
            <CardDescription>Créditos para consumo. Use &quot;Adicionar crédito&quot; para recarregar.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{saldo != null ? formatPrice(saldo) : '-'}</p>
          </CardContent>
        </Card>

        <Tabs defaultValue="extrato" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="extrato" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Extrato
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Controle
            </TabsTrigger>
            <TabsTrigger value="recarga" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Crédito
            </TabsTrigger>
            <TabsTrigger value="pedidos" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Pedidos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extrato">
            <Card>
              <CardHeader>
                <CardTitle>Extrato e histórico de recargas</CardTitle>
                <CardDescription>Compras e recargas que movimentaram o saldo</CardDescription>
              </CardHeader>
              <CardContent>
                {extrato.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma movimentação ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {extrato.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between items-center py-2 border-b last:border-0"
                      >
                        <div>
                          <span className="font-medium">{item.descricao}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                        <span className={item.tipo === 'COMPRA' || item.tipo === 'DESCONTO' ? 'text-red-600' : 'text-green-600'}>
                          {item.tipo === 'COMPRA' || item.tipo === 'DESCONTO' ? '-' : '+'}
                          {formatPrice(Math.abs(item.valor))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Limite de gasto diário</CardTitle>
                  <CardDescription>
                    Valor máximo que {alunoNome} pode gastar por dia na cantina. Deixe vazio para sem limite.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 flex-wrap items-center">
                    <Input
                      type="text"
                      placeholder="Ex: 25,00"
                      value={valorLimite}
                      onChange={(e) => setValorLimite(e.target.value)}
                      className="max-w-[140px]"
                    />
                    <Button onClick={handleSalvarLimite} disabled={salvando}>
                      {salvando ? 'Salvando...' : 'Salvar limite'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Produtos bloqueados do cardápio</CardTitle>
                  <CardDescription>
                    Itens que {alunoNome} não pode comprar na cantina. O caixa respeitará essa restrição.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {bloqueadosComNome.length > 0 && (
                    <ul className="space-y-2">
                      {bloqueadosComNome.map(({ id, nome }) => (
                        <li
                          key={id}
                          className="flex items-center justify-between py-2 px-3 rounded-md bg-muted"
                        >
                          <span>{nome}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDesbloquearProduto(id)}
                            disabled={salvando}
                          >
                            Desbloquear
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {produtosDisponiveisParaBloquear.length > 0 ? (
                    <div className="flex gap-2 flex-wrap items-center">
                      <select
                        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[200px]"
                        value={produtoParaBloquear}
                        onChange={(e) => setProdutoParaBloquear(e.target.value)}
                      >
                        <option value="">Escolher produto para bloquear</option>
                        {produtosDisponiveisParaBloquear.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome} — {formatPrice(p.preco)}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={handleBloquearProduto}
                        disabled={salvando || !produtoParaBloquear}
                      >
                        Bloquear produto
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {bloqueadosComNome.length > 0
                        ? 'Todos os itens do cardápio já estão bloqueados ou não há mais itens.'
                        : 'Nenhum produto no cardápio no momento.'}
                    </p>
                  )}
                  {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="recarga">
            <Card>
              <CardHeader>
                <CardTitle>Adicionar crédito</CardTitle>
                <CardDescription>
                  Adicione valor ao saldo de {alunoNome} para consumo na cantina.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap items-end">
                  <div>
                    <Label htmlFor="valor">Valor (R$)</Label>
                    <Input
                      id="valor"
                      type="text"
                      placeholder="Ex: 50,00"
                      value={valorRecarga}
                      onChange={(e) => setValorRecarga(e.target.value)}
                      className="mt-1 max-w-[160px]"
                    />
                  </div>
                  <Button onClick={handleRecarga} disabled={salvando}>
                    {salvando ? 'Processando...' : 'Adicionar crédito'}
                  </Button>
                </div>
                {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pedidos">
            <Card>
              <CardHeader>
                <CardTitle>Pedidos comprados</CardTitle>
                <CardDescription>
                  Lanches comprados online para retirada na cantina. Acompanhe status e data de retirada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/loja">
                  <Button variant="outline">Ir ao cardápio</Button>
                </Link>
                <p className="text-sm text-muted-foreground mt-2">
                  Aqui você controla o saldo e as restrições deste filho.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
