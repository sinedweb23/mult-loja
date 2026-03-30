import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  // Log para debug
  const allCookies = cookieStore.getAll()
  const supabaseCookies = allCookies.filter(c => 
    c.name.startsWith('sb-') || c.name.includes('supabase') || c.name.includes('auth-token')
  )
  console.log('[createClient] Total cookies:', allCookies.length, '| Supabase cookies:', supabaseCookies.length)
  if (supabaseCookies.length > 0) {
    console.log('[createClient] Nomes dos cookies Supabase:', supabaseCookies.map(c => c.name))
    // Verificar se o cookie auth-token tem valor
    const authTokenCookie = supabaseCookies.find(c => c.name.includes('auth-token'))
    if (authTokenCookie) {
      console.log('[createClient] Auth token cookie encontrado, tamanho do valor:', authTokenCookie.value?.length || 0)
    }
  } else {
    console.log('[createClient] AVISO: Nenhum cookie do Supabase encontrado!')
    console.log('[createClient] Todos os cookies:', allCookies.map(c => c.name))
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
