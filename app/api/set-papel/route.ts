import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { CANTINA_PAPEIS, PAPEL_COOKIE } from '@/lib/cantina-papeis'
import type { PapelUsuario } from '@/lib/types/database'

const VALID_PAPEIS: PapelUsuario[] = ['RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'RH']

/**
 * Route Handler para definir o cookie de papel e redirecionar.
 * Usado quando um Server Component precisa "definir papel" sem chamar cookies().set() no render
 * (ex: página inicial com um único papel — redireciona aqui para setar cookie e ir ao destino).
 */
export async function GET(request: NextRequest) {
  const papel = request.nextUrl.searchParams.get('papel') as PapelUsuario | null
  if (!papel || !VALID_PAPEIS.includes(papel)) {
    return NextResponse.redirect(new URL('/escolher-modo', request.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const href = CANTINA_PAPEIS[papel]?.href ?? '/escolher-modo'
  const url = new URL(href, request.url)

  const cookieStore = await cookies()
  cookieStore.set(PAPEL_COOKIE, papel, { path: '/', maxAge: 60 * 60 * 24 * 7 }) // 7 dias

  return NextResponse.redirect(url)
}
