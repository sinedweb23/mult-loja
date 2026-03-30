'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const INFO_URL = 'https://info.eatsimple.com.br'

const BULLET_ITEMS = [
  'Cardápio atualizado',
  'Calendário',
  'Blog',
  'Pesquisa de satisfação',
  'Comunicados',
]

export function InfoCard({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="h-full w-full border-0 bg-white shadow-lg overflow-hidden rounded-lg flex flex-col">
      <CardHeader className={compact ? 'pb-2 pt-6 px-6' : 'pb-2 pt-8 px-8'}>
        <CardTitle className="text-lg font-semibold text-slate-800 leading-tight flex items-center gap-2">
          <span aria-hidden>🔎</span>
          Saiba mais sobre a Eat Simple
        </CardTitle>
        <a
          href={INFO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[#0B5ED7] hover:underline mt-1 block"
        >
          info.eatsimple.com.br
        </a>
      </CardHeader>
      <CardContent className={compact ? 'pt-0 pb-6 px-6 flex-1' : 'pt-0 pb-8 px-8 flex-1'}>
       
        <ul className="space-y-2 mb-6 text-sm text-slate-600">
          {BULLET_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-slate-400">•</span>
              {item}
            </li>
          ))}
        </ul>
        <a
          href={INFO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <Button
            type="button"
            className="w-full h-11 rounded-xl bg-[#0B5ED7] hover:bg-[#0a58c9] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Acessar o site institucional
          </Button>
        </a>
      </CardContent>
    </Card>
  )
}
