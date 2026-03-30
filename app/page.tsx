import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterPapelAtivo, obterPapeisDoUsuario } from '@/app/actions/papeis'
import { CANTINA_PAPEIS } from '@/lib/cantina-papeis'

export default async function HomePage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const papelAtivo = await obterPapelAtivo()
    if (papelAtivo && CANTINA_PAPEIS[papelAtivo]) {
      redirect(CANTINA_PAPEIS[papelAtivo].href)
    }
    const papeis = await obterPapeisDoUsuario()
    if (papeis.length === 1) {
      // Redirecionar para Route Handler que seta o cookie (não é permitido cookies().set() no render)
      redirect(`/api/set-papel?papel=${encodeURIComponent(papeis[0])}`)
    }
    redirect('/escolher-modo')
  } catch (err) {
    console.error('[HomePage] Falha ao resolver rota inicial:', err)
    // Evita quebrar com 500 na raiz em produção.
    redirect('/login')
  }
}
