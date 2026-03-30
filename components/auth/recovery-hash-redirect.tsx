'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Se o usuário chegar em / ou /login com hash de recovery (Supabase usa fragmento em alguns fluxos),
 * redireciona para /auth/reset-password para processar o token.
 */
export function RecoveryHashRedirect() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname !== '/' && pathname !== '/login') return

    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.substring(1))
    const hasRecovery =
      (params.has('access_token') && params.has('refresh_token')) ||
      (params.get('type') === 'recovery' && (params.has('token') || params.has('token_hash'))) ||
      params.has('code')

    if (hasRecovery) {
      router.replace(`/auth/reset-password${window.location.search}${hash}`)
    }
  }, [pathname, router])

  return null
}
