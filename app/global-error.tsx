'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: '#b91c1c', marginBottom: '1rem' }}>Erro inesperado</h1>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Ocorreu um erro. Tente recarregar a página.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#e5e7eb',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  )
}
