/**
 * Utilitários para atualização de produtos em lote via CSV.
 *
 * Colunas (ordem fixa no CSV de atualização):
 * - id             → ID do produto (UUID)
 * - nome           → Nome do produto
 * - descricao      → Descrição
 * - preco          → Preço de venda
 * - valor_custo    → Custo unitário (opcional)
 * - estoque        → Estoque (para produtos sem variação)
 * - categoria      → Nome da categoria (igual ao cadastro)
 * - grupo          → Nome do grupo de produtos (igual ao cadastro)
 * - visibilidade   → APP, CANTINA, AMBOS ou CONSUMO_INTERNO
 * - disp_tipo      → TODOS, SEGMENTO ou TURMA
 * - disp_valores   → Segmentos (ex.: EM;EFAI) ou nomes de turmas separados por ;
 */

export const CSV_COLUNAS_ATUALIZACAO = [
  'id',
  'nome',
  'descricao',
  'preco',
  'valor_custo',
  'estoque',
  'categoria',
  'grupo',
  'visibilidade',
  'disp_tipo',
  'disp_valores',
] as const
export type ColunaAtualizacao = (typeof CSV_COLUNAS_ATUALIZACAO)[number]

export interface LinhaAtualizacaoCsv {
  id: string
  nome: string
  descricao: string
  preco: string
  valor_custo: string
  estoque: string
  categoria: string
  grupo: string
  visibilidade: string
  disp_tipo: string
  disp_valores: string
}

export interface AtualizacaoProdutoPayload {
  id: string
  nome: string
  descricao: string
  preco: number
  valor_custo: number | null
  estoque: number
  categoria?: string | null
  grupo?: string | null
  visibilidade?: string | null
  disp_tipo?: string | null
  disp_valores?: string | null
}

export interface ErroValidacaoAtualizacao {
  campo: string
  mensagem: string
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c === delimiter) {
      result.push(current.trim())
      current = ''
    } else current += c
  }
  result.push(current.trim())
  return result
}

function detectarDelimitador(primeiraLinha: string): string {
  if (splitCsvLine(primeiraLinha, ';').length >= 6) return ';'
  return ','
}

/**
 * Parse do CSV de atualização.
 * Aceita as colunas configuradas em CSV_COLUNAS_ATUALIZACAO.
 */
export function parseCsvAtualizacao(conteudo: string): LinhaAtualizacaoCsv[] {
  const texto = conteudo.replace(/^\uFEFF/, '')
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (linhas.length < 2) return []

  const primeiraLinha = linhas[0].replace(/^\uFEFF/, '')
  const delimiter = detectarDelimitador(primeiraLinha)
  const headerCells = splitCsvLine(primeiraLinha, delimiter).map((c) => c.trim().toLowerCase())
  const idx = (nome: string) => headerCells.indexOf(nome.toLowerCase())
  const getIdx = (nome: ColunaAtualizacao) => idx(nome)

  const resultado: LinhaAtualizacaoCsv[] = []
  for (let i = 1; i < linhas.length; i++) {
    const colunas = splitCsvLine(linhas[i], delimiter)
    const get = (nome: ColunaAtualizacao) => {
      const i = getIdx(nome)
      return i >= 0 ? (colunas[i] ?? '').trim() : ''
    }
    resultado.push({
      id: get('id'),
      nome: get('nome'),
      descricao: get('descricao'),
      preco: get('preco').replace(',', '.'),
      valor_custo: get('valor_custo').replace(',', '.'),
      estoque: get('estoque').replace(',', '.'),
      categoria: get('categoria'),
      grupo: get('grupo'),
      visibilidade: get('visibilidade'),
      disp_tipo: get('disp_tipo'),
      disp_valores: get('disp_valores'),
    })
  }
  return resultado
}

/**
 * Valida uma linha de atualização.
 * - id obrigatório
 * - preco, valor_custo e estoque numéricos >= 0.
 *
 * Campos de categoria, grupo, visibilidade e disponibilidade são tratados como
 * strings opcionais e validados de forma branda aqui. Regras de negócio
 * (ex.: nomes existentes, tipos válidos) são aplicadas no backend.
 */
export function validarLinhaAtualizacao(
  dados: LinhaAtualizacaoCsv,
  _linhaIndex: number
): { ok: true; payload: AtualizacaoProdutoPayload } | { ok: false; erros: ErroValidacaoAtualizacao[] } {
  const erros: ErroValidacaoAtualizacao[] = []

  const id = dados.id.trim()
  if (!id) {
    erros.push({ campo: 'id', mensagem: 'Obrigatório' })
  }

  const precoStr = dados.preco.trim()
  if (precoStr === '') {
    erros.push({ campo: 'preco', mensagem: 'Obrigatório' })
  } else {
    const n = Number(precoStr)
    if (Number.isNaN(n) || n < 0) erros.push({ campo: 'preco', mensagem: 'Deve ser número >= 0' })
  }

  let valorCusto: number | null = null
  if (dados.valor_custo.trim() !== '') {
    const v = Number(dados.valor_custo.trim())
    if (Number.isNaN(v) || v < 0) erros.push({ campo: 'valor_custo', mensagem: 'Deve ser número >= 0' })
    else valorCusto = v
  }

  const estoqueStr = dados.estoque.trim()
  let estoqueNum = 0
  if (estoqueStr !== '') {
    estoqueNum = Number(estoqueStr)
    if (Number.isNaN(estoqueNum) || estoqueNum < 0) erros.push({ campo: 'estoque', mensagem: 'Deve ser número >= 0' })
  }

  if (erros.length > 0) return { ok: false, erros }

  const precoNum = Number(precoStr)
  return {
    ok: true,
    payload: {
      id,
      nome: dados.nome.trim(),
      descricao: dados.descricao.trim(),
      preco: precoNum,
      valor_custo: valorCusto,
      estoque: estoqueNum,
      categoria: dados.categoria.trim() || null,
      grupo: dados.grupo.trim() || null,
      visibilidade: dados.visibilidade.trim() || null,
      disp_tipo: dados.disp_tipo.trim() || null,
      disp_valores: dados.disp_valores.trim() || null,
    },
  }
}

/**
 * Valida todas as linhas e retorna payloads válidos + erros por linha.
 */
export function validarLinhasAtualizacao(linhas: LinhaAtualizacaoCsv[]): {
  atualizacoes: AtualizacaoProdutoPayload[]
  errosPorLinha: Map<number, ErroValidacaoAtualizacao[]>
} {
  const atualizacoes: AtualizacaoProdutoPayload[] = []
  const errosPorLinha = new Map<number, ErroValidacaoAtualizacao[]>()
  linhas.forEach((dados, i) => {
    const linhaNum = i + 2
    const result = validarLinhaAtualizacao(dados, linhaNum)
    if (result.ok) atualizacoes.push(result.payload)
    else errosPorLinha.set(linhaNum, result.erros)
  })
  return { atualizacoes, errosPorLinha }
}

/**
 * Gera CSV para download. Usa vírgula como separador e aspas em todos os campos
 * para compatibilidade com Google Sheets. Decimais com ponto (.) para não deslocar colunas.
 */
export function gerarCsvAtualizacao(produtos: Array<{
  id: string
  nome: string
  descricao?: string | null
  preco: number
  valor_custo?: number | null
  estoque: number
  categoria_nome?: string | null
  grupo_nome?: string | null
  visibilidade?: string | null
  disponibilidade_tipo?: 'TODOS' | 'SEGMENTO' | 'TURMA' | null
  disponibilidade_valores?: string | null
}>): string {
  const BOM = '\uFEFF'
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const header = CSV_COLUNAS_ATUALIZACAO.map((c) => escape(c)).join(',')
  const linhas = produtos.map((p) => {
    const preco = Number(p.preco ?? 0).toFixed(2)
    const custo = p.valor_custo != null ? Number(p.valor_custo).toFixed(2) : ''
    const est = String(Math.max(0, Math.floor(Number(p.estoque ?? 0))))
    const categoria = p.categoria_nome ?? ''
    const grupo = p.grupo_nome ?? ''
    const vis = p.visibilidade ?? ''
    const dispTipo = p.disponibilidade_tipo ?? ''
    const dispValores = p.disponibilidade_valores ?? ''
    return [
      escape(p.id),
      escape(p.nome ?? ''),
      escape(p.descricao ?? ''),
      escape(preco),
      escape(custo),
      escape(est),
      escape(categoria),
      escape(grupo),
      escape(vis),
      escape(dispTipo),
      escape(dispValores),
    ].join(',')
  })
  return BOM + [header, ...linhas].join('\r\n')
}
