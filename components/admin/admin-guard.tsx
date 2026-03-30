'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { obterRecursosDoUsuario } from '@/app/actions/perfis'
import { pathnameParaRecurso, primeiraPaginaPermitida } from '@/lib/admin-recursos'

/**
 * Redireciona para a primeira página permitida se o usuário não tiver acesso à página atual.
 * Usado dentro do layout do admin.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checado, setChecado] = useState(false)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const recursos = await obterRecursosDoUsuario()
      if (!mounted) return

      const recursoAtual = pathnameParaRecurso(pathname)
      if (!recursoAtual) {
        setChecado(true)
        return
      }

      if (recursos.length > 0 && !recursos.includes(recursoAtual)) {
        const destino = primeiraPaginaPermitida(recursos)
        router.replace(destino)
        return
      }

      setChecado(true)
    })()

    return () => {
      mounted = false
    }
  }, [pathname, router])

  if (!checado) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return <>{children}</>
}
