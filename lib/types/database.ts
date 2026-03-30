export type SegmentoTipo = 'EDUCACAO_INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'EFAF' | 'EFAI' | 'OUTRO'
export type ProdutoTipo = 'PRODUTO' | 'SERVICO' | 'KIT' | 'KIT_FESTA' | 'KIT_LANCHE'
export type TipoKit = 'MENSAL' | 'AVULSO'
export type DisponibilidadeTipo = 'TODOS' | 'SEGMENTO' | 'TURMA' | 'ALUNO'
export type ResponsavelTipo = 'FINANCEIRO' | 'PEDAGOGICO' | 'AMBOS'
export type PedidoStatus = 'PENDENTE' | 'PAGO' | 'CANCELADO' | 'ESTORNADO' | 'ENTREGUE'
export type PagamentoStatus = 'PENDENTE' | 'PROCESSANDO' | 'APROVADO' | 'RECUSADO' | 'ESTORNADO'
export type PagamentoMetodo = 'PIX' | 'CARTAO' | 'DINHEIRO' | 'SALDO' | 'CREDITO' | 'DEBITO'
export type NotaTipo = 'NFE' | 'NFSE'

// Cantina escolar
export type PapelUsuario = 'RESPONSAVEL' | 'ADMIN' | 'OPERADOR' | 'COLABORADOR' | 'RH'
export type MovimentoSaldoTipo = 'RECARGA' | 'COMPRA' | 'ESTORNO' | 'DESCONTO' | 'RECARGA_PRESENCIAL' | 'MIGRACAO_SALDO'
export type CaixaStatus = 'ABERTO' | 'FECHADO'
export type PedidoOrigem = 'ONLINE' | 'PDV'
export type TipoBeneficiario = 'ALUNO' | 'COLABORADOR'

export interface UsuarioPapel {
  id: string
  usuario_id: string
  papel: PapelUsuario
  created_at: string
}

export interface AlunoSaldo {
  aluno_id: string
  saldo: number
  updated_at: string
}

export interface AlunoMovimentacao {
  id: string
  aluno_id: string
  tipo: MovimentoSaldoTipo
  valor: number
  pedido_id: string | null
  caixa_id: string | null
  usuario_id: string | null
  observacao: string | null
  created_at: string
}

export interface HistoricoMigracao {
  id: string
  total_alunos: number
  valor_total: number
  created_at: string
}

export interface AlunoConfig {
  id: string
  usuario_id: string
  aluno_id: string
  limite_gasto_diario: number | null
  created_at: string
  updated_at: string
}

export interface AlunoProdutoBloqueado {
  id: string
  usuario_id: string
  aluno_id: string
  produto_id: string
  created_at: string
}

export interface Caixa {
  id: string
  empresa_id: string
  unidade_id: string | null
  operador_id: string
  aberto_em: string
  fechado_em: string | null
  fundo_troco: number
  status: CaixaStatus
}

export interface ConsumoColaboradorMensal {
  id: string
  usuario_id: string
  empresa_id: string
  ano: number
  mes: number
  valor_total: number
  valor_abatido: number
  created_at: string
  updated_at: string
}
export type NotaStatus = 'PENDENTE' | 'EMITIDA' | 'CANCELADA' | 'ERRO'

export interface ImportacaoLog {
  id: string
  empresa_id: string
  admin_id: string | null
  tipo: 'MANUAL' | 'AGENDADA' | 'API'
  status: 'EM_PROGRESSO' | 'SUCESSO' | 'ERRO' | 'PARCIAL'
  total_registros: number
  registros_processados: number
  registros_criados: number
  registros_atualizados: number
  registros_com_erro: number
  erros: any[] | null
  payload_inicial: any | null
  iniciado_em: string
  finalizado_em: string | null
  created_at: string
  updated_at: string
}

export interface Aluno {
  id: string
  empresa_id: string
  unidade_id: string | null
  turma_id: string | null
  prontuario: string
  nome: string
  situacao: string
  /** Usuário vinculado ao aluno (aluno também é usuário no sistema) */
  usuario_id?: string | null
  created_at: string
  updated_at: string
}

export interface Perfil {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface PerfilPermissao {
  id: string
  perfil_id: string
  recurso: string
  created_at: string
}

/** 1 = financeiro, 2 = pedagógico, 3 = ambos (estrutura refatorada em usuarios) */
export type ResponsabilidadeUsuario = 1 | 2 | 3

/** Relação N:N usuário ↔ perfil (colaborador, responsável, admin, diretor, etc.) */
export interface UsuarioPerfil {
  usuario_id: string
  perfil_id: string
  created_at: string
}

export interface Usuario {
  id: string
  auth_user_id: string | null
  nome: string | null
  empresa_id: string | null
  unidade_id: string | null
  ativo: boolean
  /** Registro do empregado (RE), preenchido na importação de colaboradores pelo RH */
  re_colaborador?: string | null
  created_at: string
  updated_at: string
  cpf?: string | null
  email?: string | null
  celular?: string | null
  /** 1 = financeiro, 2 = pedagógico, 3 = ambos */
  responsabilidade?: ResponsabilidadeUsuario | null
  super_admin?: boolean
  /** Preenchido a partir de usuario_admin_cache em listagens (coluna não existe mais em usuarios). */
  eh_admin?: boolean
  /** Preenchido a partir de usuario_perfis em listagens (coluna não existe mais em usuarios). */
  perfil_id?: string | null
}

// Alias para compatibilidade
export type Responsavel = Usuario

export interface Turma {
  id: string
  empresa_id: string
  unidade_id: string | null
  descricao: string
  segmento: SegmentoTipo | null
  tipo_curso: string | null
  situacao: string
  created_at: string
  updated_at: string
}

export type ProdutoVisibilidade = 'APP' | 'CANTINA' | 'AMBOS' | 'CONSUMO_INTERNO'

/** Unidade de venda: UN = unitário, KG = preço por kg (no PDV informar gramas) */
export type ProdutoUnidade = 'UN' | 'KG'

export interface Produto {
  id: string
  empresa_id: string
  unidade_id: string | null
  tipo: ProdutoTipo
  nome: string
  descricao: string | null
  preco: number
  /** UN = unitário; KG = preço por kg */
  unidade?: ProdutoUnidade
  estoque: number
  compra_unica: boolean
  limite_max_compra_unica: number
  permitir_pix: boolean
  permitir_cartao: boolean
  ativo: boolean
  /** Onde o produto aparece: APP (loja), CANTINA (PDV), AMBOS ou CONSUMO_INTERNO (só página consumo interno) */
  visibilidade?: ProdutoVisibilidade
  /** Custo unitário do produto em R$ (uso interno). */
  valor_custo?: number | null
  /** Favorito: destacado no PDV (tela de vendas) */
  favorito?: boolean
  // Campos fiscais para NF-e
  ncm?: string | null
  cfop?: string | null
  unidade_comercial?: string | null
  cst_icms?: string | null
  csosn?: string | null
  icms_origem?: string | null
  aliq_icms?: number | null
  cst_pis?: string | null
  aliq_pis?: number | null
  cst_cofins?: string | null
  aliq_cofins?: number | null
  cbenef?: string | null
  tipo_kit?: TipoKit | null
  desconto_kit_mensal_pct?: number | null
  created_at: string
  updated_at: string
}

export interface ProdutoDisponibilidade {
  id: string
  produto_id: string
  tipo: DisponibilidadeTipo
  /** Valor de turmas.tipo_curso (ou legado: enum segmento_tipo). */
  segmento: string | null
  turma_id: string | null
  aluno_id: string | null
  disponivel_de: string | null
  disponivel_ate: string | null
  created_at: string
}

export interface ProdutoComDisponibilidade extends Produto {
  imagem_url?: string | null
  sku?: string | null
  categoria_id?: string | null
  grupo_id?: string | null
  ordem?: number
  disponibilidades: ProdutoDisponibilidade[]
  /** Preço mínimo (a partir de), considerando menor variação; para Kit Mensal já com dias úteis do próximo mês e desconto. */
  preco_a_partir_de?: number
  /** true se há estoque no produto ou em alguma variação (para listagem e bloqueio de carrinho). */
  tem_estoque?: boolean
}

export interface Categoria {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface GrupoProduto {
  id: string
  empresa_id: string
  nome: string
  descricao: string | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Variacao {
  id: string
  produto_id: string
  nome: string
  tipo: 'TEXTO' | 'NUMERO' | 'COR'
  obrigatorio: boolean
  ordem: number
  created_at: string
  updated_at: string
  valores?: VariacaoValor[]
}

export interface VariacaoValor {
  id: string
  variacao_id: string
  valor: string
  label: string | null
  preco_adicional: number
  estoque: number | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface GrupoOpcional {
  id: string
  produto_id: string
  nome: string
  descricao: string | null
  obrigatorio: boolean
  min_selecoes: number
  max_selecoes: number | null
  ordem: number
  created_at: string
  updated_at: string
  opcionais?: Opcional[]
}

export interface Opcional {
  id: string
  produto_id: string
  grupo_id: string | null
  nome: string
  descricao: string | null
  preco: number
  estoque: number | null
  obrigatorio: boolean
  max_selecoes: number | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface KitItem {
  id: string
  kit_produto_id: string
  produto_id: string
  quantidade: number
  ordem: number
  created_at: string
  produto?: Produto
}

export interface ProdutoCompleto extends Produto {
  categoria_id: string | null
  grupo_id: string | null
  sku: string | null
  imagem_url: string | null
  ordem: number
  categoria?: Categoria
  grupo?: GrupoProduto
  variacoes?: Variacao[]
  grupos_opcionais?: GrupoOpcional[]
  disponibilidades?: ProdutoDisponibilidade[]
  kits_itens?: KitItem[]
}

export interface Pagamento {
  id: string
  pedido_id: string
  caixa_id: string | null
  metodo: PagamentoMetodo
  status: PagamentoStatus
  valor: number
  provider_id: string | null
  provider_data: any | null
  webhook_events: any[] | null
  transacao_id?: string | null
  created_at: string
  updated_at: string
}

// Transações do gateway (Rede): checkout loja e recarga de saldo
export type TransacaoTipo = 'PEDIDO_LOJA' | 'RECARGA_SALDO'
export type TransacaoStatus = 'PENDENTE' | 'PROCESSANDO' | 'APROVADO' | 'RECUSADO' | 'ESTORNADO' | 'CANCELADO'
export type TransacaoMetodo = 'PIX' | 'CARTAO'

export interface Transacao {
  id: string
  tipo: TransacaoTipo
  usuario_id: string
  aluno_id: string | null
  pedido_id: string | null
  valor: number
  metodo: TransacaoMetodo
  status: TransacaoStatus
  gateway_id: string | null
  gateway_tid: string | null
  gateway_nsu: string | null
  gateway_data: Record<string, unknown> | null
  webhook_events: unknown[] | null
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}
