import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from '@/app/actions/admin'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ImportacaoManager } from '@/components/admin/importacao-manager'

export default async function ImportacaoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    redirect('/loja')
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/admin">
              <Button variant="ghost" size="sm">← Voltar</Button>
            </Link>
            <h1 className="text-3xl font-bold">Importação de Dados</h1>
          </div>
          <p className="text-muted-foreground">
            Importar dados de alunos, responsáveis e turmas via API
          </p>
        </div>
      </div>

      <ImportacaoManager />
    </div>
  )
}
