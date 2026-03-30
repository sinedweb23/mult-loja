import './theme-cantina.css'
import { BottomNav } from '@/components/loja/cantina'
import { PwaSwRegister } from '@/components/pwa/pwa-sw-register'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LojaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?message=session_nao_encontrada')
  }

  return (
    <div className="cantina-theme min-h-screen">
      <PwaSwRegister />
      <div className="pb-20 md:pb-0">
        {children}
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
