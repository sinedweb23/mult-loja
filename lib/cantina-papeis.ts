/**
 * Papéis da cantina: rotas e labels por papel.
 */
import type { PapelUsuario } from '@/lib/types/database'

export const CANTINA_PAPEIS: Record<
  PapelUsuario,
  { label: string; description: string; href: string; icon: string }
> = {
  RESPONSAVEL: {
    label: 'Responsável',
    description: 'Comprar lanches para alunos, ver extrato, recargas e limites',
    href: '/loja',
    icon: '👨‍👩‍👧',
  },
  ADMIN: {
    label: 'Administrador',
    description: 'Painel administrativo: pedidos, produtos, empresas, usuários',
    href: '/admin',
    icon: '⚙️',
  },
  OPERADOR: {
    label: 'PDV / Caixa',
    description: 'Abrir caixa, pedidos do dia, vendas e recargas presenciais',
    href: '/pdv',
    icon: '🖥️',
  },
  COLABORADOR: {
    label: 'Colaborador',
    description: 'Comprar na cantina (consumo mensal, sem saldo)',
    href: '/loja/colaborador',
    icon: '🧑‍💼',
  },
  RH: {
    label: 'RH',
    description: 'Consumo dos colaboradores, apuração e abatimento em folha',
    href: '/admin/rh',
    icon: '📊',
  },
}

export const PAPEL_COOKIE = 'cantina_papel'

export function getConfigForPapel(papel: PapelUsuario) {
  return CANTINA_PAPEIS[papel]
}

/** Retorna o href do primeiro papel da lista (para redirecionamento). */
export function primeiraRotaPermitida(papeis: PapelUsuario[]): string {
  const ordem: PapelUsuario[] = ['ADMIN', 'RH', 'OPERADOR', 'RESPONSAVEL', 'COLABORADOR']
  for (const p of ordem) {
    if (papeis.includes(p)) return CANTINA_PAPEIS[p].href
  }
  return '/loja'
}
