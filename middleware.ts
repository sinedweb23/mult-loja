import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Fallback: Supabase às vezes redireciona para Site URL (/) ou /login com code/token na query
  // em vez de /auth/callback. Redirecionar para /auth/callback para processar.
  // NUNCA forçar type=recovery quando houver só "code" — code é usado no OAuth (Google); forçar
  // recovery só para token/token_hash (link do email de primeiro acesso).
  const { pathname, searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const token = searchParams.get('token')
  const tokenHash = searchParams.get('token_hash')

  // Não interceptar rotas do fluxo de auth/reset e arquivos públicos
  const bypassPaths = [
    '/auth/callback',
    '/auth/reset-password',
    '/primeiro-acesso',
    '/esqueci-senha',
  ]
  const isBypass =
    bypassPaths.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json'

  if (isBypass) {
    return NextResponse.next({ request })
  }

  const hasAuthParams = code || token || tokenHash
  const isBasePath = pathname === '/' || pathname === '/login'
  const isRecoveryLink = type === 'recovery' || token || tokenHash
  if (hasAuthParams && isBasePath) {
    const callbackUrl = new URL('/auth/callback', request.url)
    searchParams.forEach((v, k) => callbackUrl.searchParams.set(k, v))
    if (!callbackUrl.searchParams.has('type') && isRecoveryLink) callbackUrl.searchParams.set('type', 'recovery')
    return NextResponse.redirect(callbackUrl)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Criar nova resposta para atualizar cookies
          supabaseResponse = NextResponse.next({
            request,
          })
          // Aplicar todos os cookies na resposta
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // IMPORTANTE: Atualizar a sessão do usuário
  // Primeiro verificar a sessão
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  console.log('[Middleware] Path:', request.nextUrl.pathname, 'Session:', session ? 'existe' : 'não existe', sessionError?.message)
  
  // Depois obter o usuário
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  console.log('[Middleware] User:', user ? user.id : 'não autenticado', userError?.message)

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * Note: Server actions are POST requests to the same route, so they will be caught by this matcher
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
