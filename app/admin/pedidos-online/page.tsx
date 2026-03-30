import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from '@/app/actions/admin'
import { listarPedidosOnlineAdmin } from '@/app/actions/pedidos-online-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PedidosOnlineClient } from './PedidosOnlineClient'

const hoje = new Date()
const ontem = new Date(hoje)
ontem.setDate(hoje.getDate() - 1)
const hojeStr = hoje.toISOString().slice(0, 10)
const ontemStr = ontem.toISOString().slice(0, 10)

interface SearchParams {
  dataInicio?: string
  dataFim?: string
  termoAluno?: string
}

export default async function AdminPedidosOnlinePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button>Voltar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dataInicio = searchParams.dataInicio ?? null
  const dataFim = searchParams.dataFim ?? null
  const termoAluno = searchParams.termoAluno ?? null

  const initialPedidos = await listarPedidosOnlineAdmin({
    dataInicio,
    dataFim,
    termoAluno,
  })

  const initialDataInicio = dataInicio && dataInicio.length === 10 ? dataInicio : ontemStr
  const initialDataFim = dataFim && dataFim.length === 10 ? dataFim : hojeStr
  const initialTermoAluno = termoAluno ?? ''

  return (
    <PedidosOnlineClient
      initialPedidos={initialPedidos}
      initialDataInicio={initialDataInicio}
      initialDataFim={initialDataFim}
      initialTermoAluno={initialTermoAluno}
    />
  )
}
