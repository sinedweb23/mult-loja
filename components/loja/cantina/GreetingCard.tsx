'use client'

interface GreetingCardProps {
  nome?: string
  alunoNome?: string
}

export function GreetingCard({ nome, alunoNome }: GreetingCardProps) {
  const titulo = nome ? `Olá, ${nome}!` : 'Olá!'
  const subtitulo = alunoNome ? `Gerencie os gastos de ${alunoNome}` : 'Gerencie os gastos dos seus filhos'

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--cantina-shadow)] border border-[var(--cantina-border)] cantina-card-hover">
      <h2 className="text-xl font-bold text-[var(--cantina-text)]">{titulo}</h2>
      <p className="text-sm text-[var(--cantina-text-muted)] mt-1">{subtitulo}</p>
    </div>
  )
}
