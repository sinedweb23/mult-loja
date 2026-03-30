/**
 * Utilitários para importação de produtos em lote via CSV.
 * Parse, validação e tipos reutilizáveis no front e na API.
 *
 * Modelo de colunas (ordem fixa no CSV):
 * - tipo           → PRODUTO, SERVICO, KIT, KIT_FESTA, KIT_LANCHE
 * - nome           → Nome do produto
 * - descricao      → Descrição (opcional)
 * - preco          → Valor de venda (R$)
 * - valor_custo    → Custo unitário (R$) - opcional
 * - estoque        → Estoque inicial
 * - disponibilidade → coluna antiga (true/false) – mantida apenas para compatibilidade
 *
 * As demais informações (categoria, grupo, visibilidade, tipo de disponibilidade e valores)
 * são definidas diretamente na tela "Revisar e editar" e NÃO vêm do CSV.
 */

export const CSV_COLUNAS = [
  'tipo',
  'nome',
  'descricao',
  'preco',
  'valor_custo',
  'estoque',
  'disponibilidade',
] as const
export type CsvColuna = (typeof CSV_COLUNAS)[number]

export const TIPOS_PRODUTO = ['PRODUTO', 'SERVICO', 'KIT', 'KIT_FESTA', 'KIT_LANCHE'] as const
export type TipoProdutoCsv = (typeof TIPOS_PRODUTO)[number]

export interface LinhaProdutoCsv {
  tipo: string
  nome: string
  descricao: string
  /** Nome da categoria, exatamente como cadastrada (configurado na tela, não no CSV) */
  categoria: string
  /** Nome do grupo de produto, exatamente como cadastrado (configurado na tela, não no CSV) */
  grupo: string
  preco: string
  valor_custo: string
  estoque: string
  /** Coluna antiga do CSV (true/false). Hoje é ignorada na importação. */
  disponibilidade: string
  /** Onde o produto aparece: APP, CANTINA, AMBOS, CONSUMO_INTERNO */
  visibilidade: string
  /** Tipo de disponibilidade: TODOS, SEGMENTO, TURMA */
  disp_tipo: string
  /**
   * Valores da disponibilidade, separados por ; conforme o tipo:
   * - SEGMENTO → ex.: EM;EFAI;EFAF (usa turmas.tipo_curso)
   * - TURMA    → nomes das turmas exatamente como no sistema, ex.:
   *              1ª SÉRIE A.M - EM;1º ANO C.M - EFAI
   */
  disp_valores: string
}

export interface ProdutoImportacao {
  tipo: TipoProdutoCsv
  nome: string
  descricao: string
  preco: number
  valor_custo: number | null
  estoque: number
  /**
   * Onde o produto será exibido:
   * - APP, CANTINA, AMBOS ou CONSUMO_INTERNO
   * Se vazio ou inválido, o backend pode aplicar um padrão (ex.: APP).
   */
  visibilidade?: string | null
  /**
   * Tipo de disponibilidade:
   * - TODOS, SEGMENTO, TURMA
   * Se vazio, considera TODOS (produto disponível para todos).
   */
  disp_tipo?: string | null
  /**
   * Valores crus da disponibilidade (segmentos ou nomes de turmas)
   * separados por ; conforme o tipo.
   */
  disp_valores?: string | null
  /** Nome da categoria do produto (igual ao cadastro), opcional. */
  categoria?: string | null
  /** Nome do grupo do produto (igual ao cadastro), opcional. */
  grupo?: string | null
}

export interface ErroValidacao {
  campo: string
  mensagem: string
}

export interface LinhaImportacaoComErro {
  linha: number
  dados: LinhaProdutoCsv
  erros: ErroValidacao[]
}

/**
 * Gera o conteúdo do CSV modelo com cabeçalho e 2 linhas de exemplo.
 */
export function gerarModeloCsv(): string {
  const BOM = '\uFEFF'
  const header = CSV_COLUNAS.join(';')
  const linha1 =
    'PRODUTO;Sanduíche Natural;Sanduíche com folhas e queijo;12,50;5,00;50;true'
  const linha2 =
    'PRODUTO;Suco de Laranja 300ml;Suco natural;8,00;;100;false'
  return BOM + [header, linha1, linha2].join('\r\n')
}

/**
 * Divide uma linha CSV pelo delimitador, respeitando campos entre aspas duplas.
 * Ex.: "a","b","12,5" com vírgula → ["a", "b", "12,5"]
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes && c === delimiter) {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Detecta o delimitador do CSV: ponto e vírgula (;) ou vírgula (,).
 * Google Sheets e Excel em PT-BR costumam exportar com vírgula.
 */
function detectarDelimitador(primeiraLinha: string): string {
  const comPontoVirgula = splitCsvLine(primeiraLinha, ';')
  if (comPontoVirgula.length >= 7) return ';'
  return ','
}

/**
 * Faz parse de um arquivo CSV.
 * Aceita separador ; (modelo do sistema) ou , (exportação Google Sheets / Excel).
 * Remove BOM (U+FEFF) do início. Respeita campos entre aspas (ex.: "12,5").
 */
export function parseCsv(conteudo: string): LinhaProdutoCsv[] {
  const texto = conteudo.replace(/^\uFEFF/, '')
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (linhas.length < 2) return []

  const primeiraLinha = linhas[0].replace(/^\uFEFF/, '')
  const delimiter = detectarDelimitador(primeiraLinha)
  const headerCells = splitCsvLine(primeiraLinha, delimiter).map((c) => c.trim().toLowerCase())
  const idx = (nome: string) => {
    const i = headerCells.indexOf(nome.toLowerCase())
    return i >= 0 ? i : -1
  }
  const getIdx = (nome: CsvColuna) => idx(nome)

  const resultado: LinhaProdutoCsv[] = []
  for (let i = 1; i < linhas.length; i++) {
    const colunas = splitCsvLine(linhas[i], delimiter)
    const get = (nome: CsvColuna) => {
      const i = getIdx(nome)
      return i >= 0 ? (colunas[i] ?? '') : ''
    }
    resultado.push({
      tipo: get('tipo'),
      nome: get('nome'),
      descricao: get('descricao'),
      preco: get('preco').replace(',', '.'),
      valor_custo: get('valor_custo').replace(',', '.'),
      estoque: get('estoque').replace(',', '.'),
      disponibilidade: get('disponibilidade'),
      // Campos complementares são preenchidos/ajustados apenas na tela de revisão
      categoria: '',
      grupo: '',
      visibilidade: '',
      disp_tipo: '',
      disp_valores: '',
    })
  }
  return resultado
}

function normalizarBoolean(val: string): boolean {
  const v = val.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'sim' || v === 's' || v === 'yes'
}

/**
 * Valida uma linha do CSV e retorna erros por campo.
 * Campos obrigatórios: tipo, nome, preco.
 * preco e estoque devem ser números.
 *
 * Os campos de visibilidade / disponibilidade / grupo / categoria são opcionais
 * e validados de forma mais branda aqui; validações de negócio detalhadas
 * (ex.: nomes de turmas, categorias, grupos) ficam no backend.
 */
export function validarProduto(dados: LinhaProdutoCsv, linhaIndex: number): { ok: true; produto: ProdutoImportacao } | { ok: false; erros: ErroValidacao[] } {
  const erros: ErroValidacao[] = []

  const tipo = dados.tipo.trim()
  if (!tipo) {
    erros.push({ campo: 'tipo', mensagem: 'Obrigatório' })
  } else if (!TIPOS_PRODUTO.includes(tipo as TipoProdutoCsv)) {
    erros.push({ campo: 'tipo', mensagem: `Deve ser um de: ${TIPOS_PRODUTO.join(', ')}` })
  }

  const nome = dados.nome.trim()
  if (!nome) {
    erros.push({ campo: 'nome', mensagem: 'Obrigatório' })
  }

  const precoStr = dados.preco.trim()
  if (!precoStr) {
    erros.push({ campo: 'preco', mensagem: 'Obrigatório' })
  } else {
    const precoNum = Number(precoStr)
    if (Number.isNaN(precoNum) || precoNum < 0) {
      erros.push({ campo: 'preco', mensagem: 'Deve ser um número maior ou igual a zero' })
    }
  }

  const estoqueStr = dados.estoque.trim()
  let estoqueNum = 0
  if (estoqueStr !== '') {
    estoqueNum = Number(estoqueStr)
    if (Number.isNaN(estoqueNum) || estoqueNum < 0) {
      erros.push({ campo: 'estoque', mensagem: 'Deve ser um número maior ou igual a zero' })
    }
  }

  let valorCustoNum: number | null = null
  const valorCustoStr = dados.valor_custo.trim()
  if (valorCustoStr !== '') {
    valorCustoNum = Number(valorCustoStr)
    if (Number.isNaN(valorCustoNum) || valorCustoNum < 0) {
      erros.push({ campo: 'valor_custo', mensagem: 'Deve ser número maior ou igual a zero ou vazio' })
    }
  }

  if (erros.length > 0) {
    return { ok: false, erros }
  }

  const precoNum = Number(precoStr)
  return {
    ok: true,
    produto: {
      tipo: tipo as TipoProdutoCsv,
      nome,
      descricao: dados.descricao.trim(),
      preco: precoNum,
      valor_custo: valorCustoNum,
      estoque: estoqueNum,
      visibilidade: dados.visibilidade.trim() || null,
      disp_tipo: dados.disp_tipo.trim() || null,
      disp_valores: dados.disp_valores.trim() || null,
      categoria: dados.categoria.trim() || null,
      grupo: dados.grupo.trim() || null,
    },
  }
}

/**
 * Valida um array de linhas e retorna produtos válidos + linhas com erro.
 */
export function validarLinhas(linhas: LinhaProdutoCsv[]): {
  produtos: ProdutoImportacao[]
  errosPorLinha: Map<number, ErroValidacao[]>
} {
  const produtos: ProdutoImportacao[] = []
  const errosPorLinha = new Map<number, ErroValidacao[]>()
  linhas.forEach((dados, i) => {
    const linhaNum = i + 2
    const result = validarProduto(dados, linhaNum)
    if (result.ok) {
      produtos.push(result.produto)
    } else {
      errosPorLinha.set(linhaNum, result.erros)
    }
  })
  return { produtos, errosPorLinha }
}
