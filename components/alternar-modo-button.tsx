'use client'

import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export function AlternarModoButton() {
  const pathname = usePathname()
  const [ehAdmin, setEhAdmin] = useState(false)
  const [ehResponsavel, setEhResponsavel] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    verificarPermissoes()
  }, [])

  async function verificarPermissoes() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('auth_user_id', user.id)
        .eq('ativo', true)
        .maybeSingle()
      if (!usuario) return

      const { data: cache } = await supabase
        .from('usuario_admin_cache')
        .select('is_admin')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      setEhAdmin(!!cache?.is_admin)

      const { data: vinculos } = await supabase
        .from('usuario_aluno')
        .select('aluno_id')
        .eq('usuario_id', usuario.id)
        .limit(1)
      setEhResponsavel(!!vinculos?.length)
    } catch (err) {
      console.error('Erro ao verificar permissões:', err)
    } finally {
      setLoading(false)
    }
  }

  // Só mostrar se for ambos
  if (loading || !ehAdmin || !ehResponsavel) {
    return null
  }

  // Verificar qual página está ativa
  const isAdminPage = pathname.startsWith('/admin')
  const isLojaPage = pathname.startsWith('/loja')

  if (isAdminPage) {
    return (
      <Link href="/loja">
        <Button variant="outline">Acessar como Responsável</Button>
      </Link>
    )
  } else if (isLojaPage) {
    return (
      <Link href="/admin">
        <Button variant="outline">Acessar como Admin</Button>
      </Link>
    )
  }

  return null
}
