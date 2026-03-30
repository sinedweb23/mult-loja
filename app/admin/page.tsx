import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from '@/app/actions/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DashboardClient } from './dashboard-client'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar o painel administrativo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/loja">
              <Button>Voltar para Loja</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Painel de Controle</h1>
        <p className="text-muted-foreground">
          Visão geral de créditos, pedidos e consumo
        </p>
      </div>

      <DashboardClient />

      <div className="mt-12 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-4">Acesso rápido</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <Link href="/admin/pedidos-kit-festa">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Pedidos – Kit Festa</Button>
          </Link>
          <Link href="/admin/pedidos-online">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Pedidos online</Button>
          </Link>
          <Link href="/admin/produtos">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Produtos</Button>
          </Link>
          <Link href="/admin/empresas">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Empresas/Unidades</Button>
          </Link>
          <Link href="/admin/turmas">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Turmas</Button>
          </Link>
          <Link href="/admin/usuarios">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Usuários Admin</Button>
          </Link>
          <Link href="/admin/alunos">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Alunos</Button>
          </Link>
          <Link href="/admin/relatorios">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Relatórios</Button>
          </Link>
          <Link href="/admin/importacao">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Importação</Button>
          </Link>
          <Link href="/admin/configuracoes">
            <Button variant="outline" className="w-full justify-start h-auto py-3">Configurações</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
