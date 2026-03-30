/**
 * Origem canônica para fluxos de auth (OAuth, recovery, primeiro acesso).
 * Em produção defina NEXT_PUBLIC_APP_URL (ex: https://app.seudominio.com) e use
 * sempre essa URL para redirectTo, evitando PKCE "code verifier not found" quando
 * o usuário acessa por www vs sem www, ou por navegador in-app (Gmail, etc.).
 */

const STRIP_TRAILING_SLASH = /\/$/

/** URL base do app (sem barra final). No server usa env; no client usa env ou window.origin. */
export function getAuthBaseUrl(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.replace(STRIP_TRAILING_SLASH, '')
      : ''
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}

/** URL exata para o callback do Supabase Auth (redirect após OAuth/recovery). */
export function getAuthCallbackUrl(): string {
  return `${getAuthBaseUrl()}/auth/callback`
}
