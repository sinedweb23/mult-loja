/**
 * Utilitários para gerenciar carrinho no localStorage
 */

export interface ItemCarrinho {
  produto: {
    id: string
    nome: string
    preco: number
    tipo: string
    descricao?: string | null
    imagem_url?: string | null
  }
  alunoId: string
  alunoNome: string
  quantidade: number
  variacoesSelecionadas?: Record<string, string> // { "Tamanho": "M", "Cor": "Vermelho" }
  opcionaisSelecionados?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }>
  /** Para Kit Lanche: datas selecionadas (YYYY-MM-DD). Quantidade = length */
  diasSelecionados?: string[]
  /** Para Kit Lanche MENSAL: mês/ano selecionado e dias úteis (preço já calculado) */
  mesReferencia?: number
  anoReferencia?: number
  diasUteis?: number
  tipo_kit?: 'MENSAL' | 'AVULSO'
  /** empresa_id do produto (para buscar datas de dias úteis no checkout MENSAL) */
  empresaId?: string
  /** Kit Festa: data e horário de retirada selecionados */
  kitFestaData?: string
  kitFestaHorario?: { inicio: string; fim: string }
  /** Kit Festa: tema da festa (obrigatório) */
  temaFesta?: string
  /** Kit Festa: idade que a criança fará, 1 a 15 (obrigatório) */
  idadeFesta?: number
}

const CARRINHO_KEY = 'loja_carrinho'

/** Chave no sessionStorage para o payload do checkout (pedido loja) antes do pagamento. */
export const CHECKOUT_PAYLOAD_KEY = 'loja_checkout_payload'

export function salvarCarrinho(carrinho: ItemCarrinho[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CARRINHO_KEY, JSON.stringify(carrinho))
  }
}

export function carregarCarrinho(): ItemCarrinho[] {
  if (typeof window === 'undefined') return []
  
  try {
    const carrinhoStr = localStorage.getItem(CARRINHO_KEY)
    if (!carrinhoStr) return []
    return JSON.parse(carrinhoStr)
  } catch {
    return []
  }
}

export function limparCarrinho() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CARRINHO_KEY)
  }
}

export function contarItensCarrinho(): number {
  const carrinho = carregarCarrinho()
  return carrinho.reduce((total, item) => total + item.quantidade, 0)
}
