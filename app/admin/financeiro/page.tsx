'use client'

import dynamic from 'next/dynamic'

const FinanceiroContent = dynamic(
  () => import('./FinanceiroContent').then((m) => ({ default: m.FinanceiroContent })),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6">
          <div className="h-9 w-48 bg-muted animate-pulse rounded" />
          <div className="h-5 w-96 mt-1 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    ),
  }
)

export default function AdminFinanceiroPage() {
  return <FinanceiroContent />
}
