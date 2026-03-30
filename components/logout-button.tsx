'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Erro ao fazer logout:', error)
      } else {
        router.push('/login')
        router.refresh()
      }
    } catch (err) {
      console.error('Erro ao fazer logout:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleLogout} disabled={loading}>
      {loading ? 'Saindo...' : 'Sair'}
    </Button>
  )
}
