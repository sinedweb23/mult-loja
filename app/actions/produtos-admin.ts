'use server'

import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from './admin'
import { z } from 'zod'
import type { ProdutoCompleto, Categoria, GrupoProduto, Variacao, VariacaoValor, GrupoOpcional, Opcional, KitItem } from '@/lib/types/database'

// Schemas de validação
const categoriaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional(),
  ordem: z.number().default(0),
  ativo: z.boolean().default(true),
})

const grupoProdutoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional(),
  ordem: z.number().default(0),
  ativo: z.boolean().default(true),
})

const produtoSchema = z.object({
  empresa_id: z.string().uuid(),
  unidade_id: z.string().uuid().optional().nullable(),
  tipo: z.enum(['PRODUTO', 'SERVICO', 'KIT', 'KIT_FESTA', 'KIT_LANCHE']),
  tipo_kit: z.enum(['MENSAL', 'AVULSO']).optional().nullable(),
  desconto_kit_mensal_pct: z.number().min(0).max(100).optional().nullable(),
  /** Kit Festa: dias de antecedência para compra (mín e máx) */
  kit_festa_dias_antecedencia_min: z.number().min(0).max(365).optional().nullable(),
  kit_festa_dias_antecedencia_max: z.number().min(0).max(365).optional().nullable(),
  /** Kit Festa: horários disponíveis [{ periodo, inicio, fim }] */
  kit_festa_horarios: z.array(z.object({
    periodo: z.enum(['MANHA', 'TARDE']),
    inicio: z.string().regex(/^\d{2}:\d{2}$/),
    fim: z.string().regex(/^\d{2}:\d{2}$/),
  })).optional().nullable(),
  /** UN = unitário; KG = preço por kg (no PDV informar gramas) */
  unidade: z.enum(['UN', 'KG']).optional().default('UN'),
  nome: z.string().min(1, 'Nome é obrigatório'),
  descricao: z.string().optional().nullable(),
  preco: z.number().min(0, 'Preço deve ser maior ou igual a zero'),
  valor_custo: z.number().min(0).optional().nullable(),
  estoque: z.number().default(0),
  compra_unica: z.boolean().default(false),
  limite_max_compra_unica: z.number().default(1),
  permitir_pix: z.boolean().default(true),
  permitir_cartao: z.boolean().default(true),
  ativo: z.boolean().default(true),
  favorito: z.boolean().default(false),
  categoria_id: z.string().uuid().optional().nullable(),
  grupo_id: z.string().uuid().optional().nullable(),
  sku: z.string().optional().nullable(),
  imagem_url: z.string().url().optional().nullable(),
  ordem: z.number().default(0),
  // Campos fiscais
  ncm: z.string().optional().nullable(),
  cfop: z.string().optional().nullable(),
  unidade_comercial: z.string().optional().nullable(),
  cst_icms: z.string().optional().nullable(),
  csosn: z.string().optional().nullable(),
  icms_origem: z.string().optional().nullable(),
  aliq_icms: z.number().optional().nullable(),
  cst_pis: z.string().optional().nullable(),
  aliq_pis: z.number().optional().nullable(),
  cst_cofins: z.string().optional().nullable(),
  aliq_cofins: z.number().optional().nullable(),
  cbenef: z.string().optional().nullable(),
  exigir_termo_aceite: z.boolean().optional().default(false),
  texto_termo_aceite: z.string().optional().nullable(),
})

// Categorias
export async function listarCategorias(empresaId: string): Promise<Categoria[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error) throw error
  return (data || []) as Categoria[]
}

export async function criarCategoria(empresaId: string, dados: z.infer<typeof categoriaSchema>): Promise<Categoria> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const validado = categoriaSchema.parse(dados)
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('categorias')
    .insert({ ...validado, empresa_id: empresaId })
    .select()
    .single()

  if (error) throw error
  return data as Categoria
}

export async function atualizarCategoria(id: string, dados: Partial<z.infer<typeof categoriaSchema>>): Promise<Categoria> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Categoria
}

export async function deletarCategoria(id: string): Promise<void> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// Grupos de Produtos
export async function listarGruposProdutos(empresaId: string): Promise<GrupoProduto[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grupos_produtos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error) throw error
  return (data || []) as GrupoProduto[]
}

export async function criarGrupoProduto(empresaId: string, dados: z.infer<typeof grupoProdutoSchema>): Promise<GrupoProduto> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const validado = grupoProdutoSchema.parse(dados)
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('grupos_produtos')
    .insert({ ...validado, empresa_id: empresaId })
    .select()
    .single()

  if (error) throw error
  return data as GrupoProduto
}

/** Retorno mínimo para gerar CSV de atualização em lote. */
export interface ProdutoParaCsvAtualizacao {
  id: string
  nome: string
  descricao: string | null
  preco: number
  valor_custo: number | null
  estoque: number
  categoria_nome: string | null
  grupo_nome: string | null
  visibilidade: string | null
  disponibilidade_tipo: 'TODOS' | 'SEGMENTO' | 'TURMA' | null
  disponibilidade_valores: string | null
}

export async function listarProdutosParaAtualizacaoLote(empresaId: string): Promise<ProdutoParaCsvAtualizacao[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')

  const supabase = await createClient()
  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, nome, descricao, preco, valor_custo, estoque, visibilidade, categoria:categorias(nome), grupo:grupos_produtos(nome)')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'PRODUTO')
    .order('nome', { ascending: true })

  if (error) throw error
  const lista = produtos || []

  // Lista de atualização em lote: apenas produtos SEM variação (produtos com variação são excluídos)
  if (lista.length === 0) return []
  const idsProdutosLista = lista.map((p: any) => p.id)
  const { data: variacoes, error: errVariacoes } = await supabase
    .from('variacoes')
    .select('produto_id')
    .in('produto_id', idsProdutosLista)
  if (errVariacoes) throw errVariacoes
  const idsComVariacao = new Set((variacoes || []).map((v: any) => v.produto_id))
  const semVariacao = lista.filter((p: any) => !idsComVariacao.has(p.id))

  const idsProdutos = semVariacao.map((p: any) => p.id as string)

  // Buscar disponibilidades para os produtos sem variação
  const { data: disponibilidades } = idsProdutos.length
    ? await supabase
        .from('produto_disponibilidade')
        .select('produto_id, tipo, segmento, turma_id')
        .in('produto_id', idsProdutos)
    : { data: [] }

  const dispByProduto = new Map<string, any[]>()
  for (const d of disponibilidades || []) {
    const pid = (d as any).produto_id as string
    if (!pid) continue
    const current = dispByProduto.get(pid) ?? []
    current.push(d)
    dispByProduto.set(pid, current)
  }

  // Buscar descrições de turmas para disponibilidades do tipo TURMA
  const turmaIds = Array.from(
    new Set(
      (disponibilidades || [])
        .map((d: any) => d.turma_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const turmaDescricaoById = new Map<string, string>()
  if (turmaIds.length > 0) {
    const { data: turmas } = await supabase
      .from('turmas')
      .select('id, descricao')
      .in('id', turmaIds)
    for (const t of turmas || []) {
      if (!t?.id) continue
      turmaDescricaoById.set(String(t.id), String(t.descricao ?? ''))
    }
  }

  function resumoDisponibilidade(produtoId: string): {
    tipo: 'TODOS' | 'SEGMENTO' | 'TURMA' | null
    valores: string | null
  } {
    const disps = dispByProduto.get(produtoId) ?? []
    if (disps.length === 0) {
      return { tipo: 'TODOS', valores: null }
    }
    const tipos = Array.from(new Set(disps.map((d: any) => d.tipo as string | null).filter(Boolean)))
    if (tipos.length !== 1) {
      // Caso misto (SEGMENTO+TURMA, etc.) não é suportado no CSV de atualização: trata como TODOS.
      return { tipo: 'TODOS', valores: null }
    }
    const tipo = tipos[0] as 'TODOS' | 'SEGMENTO' | 'TURMA'
    if (tipo === 'SEGMENTO') {
      const valores = Array.from(
        new Set(
          disps
            .map((d: any) => (d.segmento as string | null)?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      )
      return { tipo, valores: valores.length ? valores.join('; ') : null }
    }
    if (tipo === 'TURMA') {
      const valores = Array.from(
        new Set(
          disps
            .map((d: any) => turmaDescricaoById.get(String(d.turma_id)) ?? null)
            .filter((s): s is string => Boolean(s)),
        ),
      )
      return { tipo, valores: valores.length ? valores.join('; ') : null }
    }
    // tipo TODOS com linhas explícitas: não faz sentido para o CSV, retorna TODOS sem valores
    return { tipo: 'TODOS', valores: null }
  }

  return semVariacao.map((p: any) => {
    const resumo = resumoDisponibilidade(p.id)
    return {
      id: p.id,
      nome: p.nome ?? '',
      descricao: p.descricao ?? null,
      preco: Number(p.preco ?? 0),
      valor_custo: p.valor_custo != null ? Number(p.valor_custo) : null,
      estoque: Number(p.estoque ?? 0),
      categoria_nome: (p as any).categoria?.nome ?? null,
      grupo_nome: (p as any).grupo?.nome ?? null,
      visibilidade: p.visibilidade ?? null,
      disponibilidade_tipo: resumo.tipo,
      disponibilidade_valores: resumo.valores,
    }
  })
}

/** Payload de atualização em lote (apenas campos permitidos). */
export type AtualizacaoLotePayload = {
  id: string
  nome: string
  descricao: string
  preco: number
  valor_custo: number | null
  estoque: number
   /** Nome da categoria para atualização (por nome), opcional. */
  categoria_nome?: string | null
  /** Nome do grupo para atualização (por nome), opcional. */
  grupo_nome?: string | null
  /** Visibilidade: APP, CANTINA, AMBOS, CONSUMO_INTERNO. */
  visibilidade?: 'APP' | 'CANTINA' | 'AMBOS' | 'CONSUMO_INTERNO' | null
  /** Tipo de disponibilidade: TODOS, SEGMENTO, TURMA. */
  disponibilidade_tipo?: 'TODOS' | 'SEGMENTO' | 'TURMA' | null
  /**
   * Valores de disponibilidade:
   * - SEGMENTO → segmentos separados por ; (ex.: EM;EFAI)
   * - TURMA    → nomes das turmas separados por ;
   */
  disponibilidade_valores?: string | null
}

export async function atualizarProdutosBatch(empresaId: string, atualizacoes: AtualizacaoLotePayload[]): Promise<{ atualizados: number; erro?: string }> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')
  if (!empresaId || atualizacoes.length === 0) return { atualizados: 0 }

  const supabase = await createClient()
  // Mapear categorias e grupos por nome para atualização
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id,nome')
    .eq('empresa_id', empresaId)

  const { data: grupos } = await supabase
    .from('grupos_produtos')
    .select('id,nome')
    .eq('empresa_id', empresaId)

  const categoriaPorNome = new Map<string, string>()
  for (const c of categorias || []) {
    if (!c?.nome) continue
    categoriaPorNome.set(String(c.nome).trim(), String(c.id))
  }

  const grupoPorNome = new Map<string, string>()
  for (const g of grupos || []) {
    if (!g?.nome) continue
    grupoPorNome.set(String(g.nome).trim(), String(g.id))
  }

  // Carregar turmas uma vez para atualização de disponibilidade por TURMA
  const { data: turmas } = await supabase
    .from('turmas')
    .select('id,descricao')
    .eq('empresa_id', empresaId)

  const turmaIdPorDescricao = new Map<string, string>()
  for (const t of turmas || []) {
    if (!t?.descricao) continue
    turmaIdPorDescricao.set(String(t.descricao).trim(), String(t.id))
  }

  const ids = atualizacoes.map((a) => a.id)
  const { data: variacoes } = await supabase
    .from('variacoes')
    .select('produto_id')
    .in('produto_id', ids)
  const idsComVariacao = new Set((variacoes || []).map((v: any) => v.produto_id))

  let atualizados = 0
  for (const a of atualizacoes) {
    const temVariacao = idsComVariacao.has(a.id)
    const payload: Record<string, unknown> = {
      nome: a.nome.trim(),
      descricao: a.descricao.trim() || null,
      preco: a.preco,
      valor_custo: a.valor_custo,
      updated_at: new Date().toISOString(),
    }
    if (a.categoria_nome != null) {
      const nome = a.categoria_nome.trim()
      payload.categoria_id = nome ? categoriaPorNome.get(nome) ?? null : null
    }
    if (a.grupo_nome != null) {
      const nome = a.grupo_nome.trim()
      payload.grupo_id = nome ? grupoPorNome.get(nome) ?? null : null
    }
    if (a.visibilidade != null) {
      const vis = a.visibilidade as string
      if (['APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'].includes(vis)) {
        payload.visibilidade = vis
      }
    }
    if (!temVariacao) {
      payload.estoque = a.estoque
    }
    const { error } = await supabase
      .from('produtos')
      .update(payload)
      .eq('id', a.id)
      .eq('empresa_id', empresaId)
    if (error) return { atualizados, erro: `Produto ${a.id}: ${error.message}` }

    // Atualizar disponibilidade, se informado
    if (a.disponibilidade_tipo != null) {
      const tipo = a.disponibilidade_tipo ?? 'TODOS'
      const valoresRaw = (a.disponibilidade_valores ?? '').trim()

      // Remove disponibilidades atuais
      const { error: delError } = await supabase
        .from('produto_disponibilidade')
        .delete()
        .eq('produto_id', a.id)
      if (delError) return { atualizados, erro: `Produto ${a.id}: ${delError.message}` }

      if (!tipo || tipo === 'TODOS' || !valoresRaw) {
        // TODOS = sem linhas específicas; produto disponível para todos
      } else {
        const valores = valoresRaw
          .split(';')
          .map((v) => v.trim())
          .filter(Boolean)

        const rows: any[] = []
        if (tipo === 'SEGMENTO') {
          for (const seg of valores) {
            rows.push({
              produto_id: a.id,
              tipo: 'SEGMENTO',
              segmento: seg,
              turma_id: null,
              aluno_id: null,
              disponivel_de: null,
              disponivel_ate: null,
            })
          }
        } else if (tipo === 'TURMA') {
          for (const nomeTurma of valores) {
            const turmaId = turmaIdPorDescricao.get(nomeTurma)
            if (!turmaId) continue
            rows.push({
              produto_id: a.id,
              tipo: 'TURMA',
              segmento: null,
              turma_id: turmaId,
              aluno_id: null,
              disponivel_de: null,
              disponivel_ate: null,
            })
          }
        }
        if (rows.length > 0) {
          const { error: insError } = await supabase
            .from('produto_disponibilidade')
            .insert(rows)
          if (insError) return { atualizados, erro: `Produto ${a.id}: ${insError.message}` }
        }
      }
    }

    atualizados++
  }
  return { atualizados }
}

// Produtos
export async function listarProdutos(empresaId: string): Promise<ProdutoCompleto[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produtos')
    .select(`
      *,
      categoria:categorias(*),
      grupo:grupos_produtos(*),
      variacoes:variacoes( id, valores:variacao_valores( id, estoque ) )
    `)
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as ProdutoCompleto[]
}

const SELECT_PRODUTO_LISTA = `
  *,
  categoria:categorias(*),
  grupo:grupos_produtos(*),
  variacoes:variacoes( id, nome, valores:variacao_valores( id, valor, label, estoque, ordem ) )
`

export interface ListarProdutosPaginadoParams {
  page?: number
  pageSize?: number
  busca?: string
}

export interface ListarProdutosPaginadoResult {
  produtos: ProdutoCompleto[]
  total: number
  page: number
  pageSize: number
}

export async function listarProdutosPaginado(
  empresaId: string,
  params: ListarProdutosPaginadoParams = {}
): Promise<ListarProdutosPaginadoResult> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20))
  const busca = (params.busca ?? '').trim()

  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('produtos')
    .select(SELECT_PRODUTO_LISTA, { count: 'exact' })
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true })

  if (busca) {
    const term = `%${busca.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    q = q.or(`nome.ilike.${term},sku.ilike.${term}`)
  }

  const { data, error, count } = await q.range(from, to)
  if (error) throw error

  const produtos = (data || []) as ProdutoCompleto[]
  const total = count ?? 0
  return { produtos, total, page, pageSize }
}

/** Busca produtos por SKU ou nome (para entrada de estoque). Limite 50. */
export async function buscarProdutosParaEntrada(empresaId: string, termo: string): Promise<ProdutoCompleto[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')

  const t = (termo ?? '').trim()
  if (!t) return []

  const supabase = await createClient()
  const term = `%${t.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
  const { data, error } = await supabase
    .from('produtos')
    .select(SELECT_PRODUTO_LISTA)
    .eq('empresa_id', empresaId)
    .or(`nome.ilike.${term},sku.ilike.${term}`)
    .order('nome', { ascending: true })
    .limit(50)

  if (error) throw error
  return (data || []) as ProdutoCompleto[]
}

export interface ItemEntradaEstoque {
  produto_id: string
  variacao_valor_id?: string | null
  quantidade: number
  valor_custo?: number | null
}

export async function registrarEntradaEstoque(
  empresaId: string,
  dados: { numero_nota?: string | null; itens: ItemEntradaEstoque[] }
): Promise<{ ok: boolean; erro?: string }> {
  const { numero_nota, itens } = dados
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) return { ok: false, erro: 'Não autorizado' }

  if (!itens?.length || itens.every((i) => i.quantidade <= 0)) {
    return { ok: false, erro: 'Informe ao menos um item com quantidade maior que zero.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const usuarioId = (usuario as { id: string } | null)?.id ?? null

  const { data: maxRow } = await supabase
    .from('entrada_estoque')
    .select('numero_entrada')
    .eq('empresa_id', empresaId)
    .order('numero_entrada', { ascending: false })
    .limit(1)
    .maybeSingle()
  const proximoNumero = (maxRow?.numero_entrada != null ? Number(maxRow.numero_entrada) : 0) + 1

  const { data: entrada, error: errEntrada } = await supabase
    .from('entrada_estoque')
    .insert({
      empresa_id: empresaId,
      numero_entrada: proximoNumero,
      numero_nota: numero_nota?.trim() || null,
      usuario_id: usuarioId,
      valor_total: 0,
    })
    .select('id')
    .single()
  if (errEntrada || !entrada) {
    console.error('Erro ao criar entrada_estoque:', errEntrada)
    return { ok: false, erro: errEntrada?.message ?? 'Erro ao criar entrada' }
  }

  let valorTotal = 0
  for (const item of itens) {
    if (item.quantidade <= 0) continue
    const custo = item.valor_custo != null ? Number(item.valor_custo) : 0
    valorTotal += item.quantidade * custo

    const { error: errMov } = await supabase.from('movimento_estoque').insert({
      empresa_id: empresaId,
      produto_id: item.produto_id,
      variacao_valor_id: item.variacao_valor_id || null,
      quantidade: item.quantidade,
      usuario_id: usuarioId,
      entrada_id: entrada.id,
      valor_custo: custo || null,
    })
    if (errMov) {
      console.error('Erro ao inserir movimento_estoque:', errMov)
      return { ok: false, erro: errMov.message }
    }

    if (item.variacao_valor_id) {
      const { data: vv } = await supabase
        .from('variacao_valores')
        .select('estoque')
        .eq('id', item.variacao_valor_id)
        .single()
      const estoqueAtual = vv?.estoque != null ? Number(vv.estoque) : 0
      const { error: errUpd } = await supabase
        .from('variacao_valores')
        .update({ estoque: estoqueAtual + item.quantidade })
        .eq('id', item.variacao_valor_id)
      if (errUpd) {
        console.error('Erro ao atualizar estoque variacao_valores:', errUpd)
        return { ok: false, erro: errUpd.message }
      }
    } else {
      const { data: prod } = await supabase
        .from('produtos')
        .select('estoque')
        .eq('id', item.produto_id)
        .single()
      const estoqueAtual = prod?.estoque != null ? Number(prod.estoque) : 0
      const { error: errUpd } = await supabase
        .from('produtos')
        .update({ estoque: estoqueAtual + item.quantidade })
        .eq('id', item.produto_id)
      if (errUpd) {
        console.error('Erro ao atualizar estoque produto:', errUpd)
        return { ok: false, erro: errUpd.message }
      }
    }
  }

  await supabase
    .from('entrada_estoque')
    .update({ valor_total: valorTotal })
    .eq('id', entrada.id)

  return { ok: true }
}

export interface EntradaEstoqueResumo {
  id: string
  numero_entrada: number
  numero_nota: string | null
  usuario_nome: string | null
  valor_total: number
  created_at: string
  itens: {
    produto_nome: string
    variacao_label: string | null
    quantidade: number
    valor_custo: number | null
    total_linha: number
  }[]
}

export async function listarEntradasEstoque(
  empresaId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ entradas: EntradaEstoqueResumo[]; total: number }> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(5, params.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  const { data: entradas, error: errE, count } = await supabase
    .from('entrada_estoque')
    .select(`
      id,
      numero_entrada,
      numero_nota,
      valor_total,
      created_at,
      usuarios:usuario_id ( nome )
    `, { count: 'exact' })
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (errE) throw errE
  const lista = (entradas || []) as any[]
  const ids = lista.map((e) => e.id)

  const { data: movimentos } = ids.length
    ? await supabase
        .from('movimento_estoque')
        .select(`
          entrada_id,
          quantidade,
          valor_custo,
          produtos:produto_id ( nome ),
          variacao_valores:variacao_valor_id ( valor, label )
        `)
        .in('entrada_id', ids)
    : { data: [] }

  const movsByEntrada = new Map<string, any[]>()
  for (const m of movimentos || []) {
    const eid = (m as any).entrada_id
    if (!eid) continue
    const arr = movsByEntrada.get(eid) || []
    const p = (m as any).produtos
    const vv = (m as any).variacao_valores
    arr.push({
      produto_nome: p?.nome ?? '—',
      variacao_label: vv ? (vv.label || vv.valor) : null,
      quantidade: (m as any).quantidade,
      valor_custo: (m as any).valor_custo,
      total_linha: ((m as any).quantidade ?? 0) * (Number((m as any).valor_custo) || 0),
    })
    movsByEntrada.set(eid, arr)
  }

  const result: EntradaEstoqueResumo[] = lista.map((e) => ({
    id: e.id,
    numero_entrada: e.numero_entrada,
    numero_nota: e.numero_nota ?? null,
    usuario_nome: e.usuarios?.nome ?? null,
    valor_total: Number(e.valor_total ?? 0),
    created_at: e.created_at,
    itens: movsByEntrada.get(e.id) || [],
  }))

  return { entradas: result, total: count ?? 0 }
}

export async function obterProduto(id: string): Promise<ProdutoCompleto | null> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  
  // Buscar produto
  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select(`
      *,
      categoria:categorias(*),
      grupo:grupos_produtos(*)
    `)
    .eq('id', id)
    .single()

  if (produtoError) throw produtoError
  if (!produto) return null

  // Buscar variações
  const { data: variacoes } = await supabase
    .from('variacoes')
    .select(`
      *,
      valores:variacao_valores(*)
    `)
    .eq('produto_id', id)
    .order('ordem', { ascending: true })

  // Buscar grupos de opcionais
  const { data: gruposOpcionais } = await supabase
    .from('grupos_opcionais')
    .select(`
      *,
      opcionais:opcionais(*)
    `)
    .eq('produto_id', id)
    .order('ordem', { ascending: true })

  // Buscar disponibilidades
  const { data: disponibilidades } = await supabase
    .from('produto_disponibilidade')
    .select('*')
    .eq('produto_id', id)

  // Buscar itens do kit (se for kit)
  let kitsItens: KitItem[] = []
  if (['KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(produto.tipo)) {
    const { data: itens } = await supabase
      .from('kits_itens')
      .select(`
        *,
        produto:produtos!kits_itens_produto_id_fkey(*)
      `)
      .eq('kit_produto_id', id)
      .order('ordem', { ascending: true })
    kitsItens = (itens || []) as KitItem[]
  }

  return {
    ...produto,
    variacoes: variacoes || [],
    grupos_opcionais: gruposOpcionais || [],
    disponibilidades: disponibilidades || [],
    kits_itens: kitsItens,
  } as ProdutoCompleto
}

export async function criarProduto(dados: z.infer<typeof produtoSchema>): Promise<ProdutoCompleto> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const validado = produtoSchema.parse(dados)
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('produtos')
    .insert(validado)
    .select(`
      *,
      categoria:categorias(*),
      grupo:grupos_produtos(*)
    `)
    .single()

  if (error) {
    if (error.message?.includes('favorito') || error.code === '42703') {
      throw new Error('A coluna "favorito" não existe. No Supabase (SQL Editor), execute: ALTER TABLE produtos ADD COLUMN IF NOT EXISTS favorito BOOLEAN DEFAULT FALSE;')
    }
    throw error
  }
  return data as ProdutoCompleto
}

/** Payload já validado (ex.: pela lib/importar-produtos). Inserção em lote com ativo = false. */
export type ProdutoImportacaoPayload = {
  tipo: 'PRODUTO' | 'SERVICO' | 'KIT' | 'KIT_FESTA' | 'KIT_LANCHE'
  nome: string
  descricao: string
  preco: number
  valor_custo?: number | null
  estoque: number
  /** Visibilidade onde o produto aparece. Se não informado, backend aplica padrão (APP). */
  visibilidade?: 'APP' | 'CANTINA' | 'AMBOS' | 'CONSUMO_INTERNO'
  /**
   * Tipo de disponibilidade:
   * - TODOS    → produto disponível para todos (não cria linhas em produto_disponibilidade)
   * - SEGMENTO → usa produto_disponibilidade.segmento (valor de turmas.tipo_curso)
   * - TURMA    → usa produto_disponibilidade.turma_id
   */
  disponibilidade_tipo?: 'TODOS' | 'SEGMENTO' | 'TURMA'
  /**
   * Valores crus da disponibilidade separados por ;
   * - SEGMENTO → ex.: EM;EFAI;EFAF (usa turmas.tipo_curso)
   * - TURMA    → nomes das turmas exatamente como no sistema
   */
  disponibilidade_valores?: string
  /** Nome da categoria, exatamente como cadastrada (opcional). */
  categoria_nome?: string
  /** Nome do grupo, exatamente como cadastrado (opcional). */
  grupo_nome?: string
}

const BATCH_SIZE = 100

export async function inserirProdutosBatch(empresaId: string, produtos: ProdutoImportacaoPayload[]): Promise<{ inseridos: number; erro?: string }> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }
  if (!empresaId || produtos.length === 0) {
    return { inseridos: 0 }
  }

  const supabase = await createClient()

  // Mapear categorias e grupos por nome para associar por id na inserção.
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id,nome')
    .eq('empresa_id', empresaId)

  const { data: grupos } = await supabase
    .from('grupos_produtos')
    .select('id,nome')
    .eq('empresa_id', empresaId)

  const categoriaPorNome = new Map<string, string>()
  for (const c of categorias || []) {
    if (!c?.nome) continue
    categoriaPorNome.set(String(c.nome).trim(), String(c.id))
  }

  const grupoPorNome = new Map<string, string>()
  for (const g of grupos || []) {
    if (!g?.nome) continue
    grupoPorNome.set(String(g.nome).trim(), String(g.id))
  }

  const rows = produtos.map((p) => {
    const vis = p.visibilidade ?? 'APP'
    const nomeCategoria = p.categoria_nome?.trim() || ''
    const nomeGrupo = p.grupo_nome?.trim() || ''
    const categoria_id = nomeCategoria ? categoriaPorNome.get(nomeCategoria) ?? null : null
    const grupo_id = nomeGrupo ? grupoPorNome.get(nomeGrupo) ?? null : null

    return {
      empresa_id: empresaId,
      tipo: p.tipo,
      nome: p.nome.trim(),
      descricao: p.descricao.trim() || null,
      preco: p.preco,
      valor_custo: p.valor_custo != null ? p.valor_custo : null,
      estoque: p.estoque,
      ativo: false,
      unidade: 'UN',
      compra_unica: false,
      limite_max_compra_unica: 1,
      permitir_pix: true,
      permitir_cartao: true,
      visibilidade: ['APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'].includes(vis) ? vis : 'APP',
      ordem: 0,
      categoria_id,
      grupo_id,
    }
  })

  let inseridos = 0
  const disponibilidadesParaCriar: Array<{
    produto_id: string
    tipo: 'TODOS' | 'SEGMENTO' | 'TURMA'
    segmento: string | null
    turma_id: string | null
  }> = []

  // Carregar turmas uma vez para mapear nomes → ids (disponibilidade por TURMA)
  const { data: turmas } = await supabase
    .from('turmas')
    .select('id,descricao,tipo_curso')
    .eq('empresa_id', empresaId)

  const turmaPorDescricao = new Map<string, string>()
  for (const t of turmas || []) {
    if (!t?.descricao) continue
    turmaPorDescricao.set(String(t.descricao).trim(), String(t.id))
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const produtosChunk = produtos.slice(i, i + BATCH_SIZE)
    const { data: inseridosChunk, error } = await supabase
      .from('produtos')
      .insert(chunk)
      .select('id')

    if (error) {
      return { inseridos, erro: error.message }
    }
    const inseridosData = inseridosChunk || []
    inseridos += inseridosData.length

    // Preparar disponibilidades para os produtos deste chunk
    for (let idx = 0; idx < inseridosData.length; idx++) {
      const prodRow = inseridosData[idx]
      const payload = produtosChunk[idx]
      if (!prodRow?.id || !payload) continue

      const tipo = payload.disponibilidade_tipo ?? 'TODOS'
      const valoresRaw = (payload.disponibilidade_valores ?? '').trim()
      if (!tipo || tipo === 'TODOS' || !valoresRaw) {
        // TODOS = sem linhas específicas; produto disponível para todos
        continue
      }

      const valores = valoresRaw
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean)

      if (tipo === 'SEGMENTO') {
        for (const seg of valores) {
          disponibilidadesParaCriar.push({
            produto_id: String(prodRow.id),
            tipo: 'SEGMENTO',
            segmento: seg,
            turma_id: null,
          })
        }
      } else if (tipo === 'TURMA') {
        for (const nomeTurma of valores) {
          const turmaId = turmaPorDescricao.get(nomeTurma)
          if (!turmaId) {
            // Se a turma não existir com esse nome, apenas ignora silenciosamente.
            // O usuário normalmente irá copiar/colar da lista exibida na tela.
            continue
          }
          disponibilidadesParaCriar.push({
            produto_id: String(prodRow.id),
            tipo: 'TURMA',
            segmento: null,
            turma_id: turmaId,
          })
        }
      }
    }
  }

  if (disponibilidadesParaCriar.length > 0) {
    const { error: dispError } = await supabase
      .from('produto_disponibilidade')
      .insert(
        disponibilidadesParaCriar.map((d) => ({
          produto_id: d.produto_id,
          tipo: d.tipo,
          segmento: d.segmento,
          turma_id: d.turma_id,
          aluno_id: null,
          disponivel_de: null,
          disponivel_ate: null,
        })),
      )
    if (dispError) {
      return { inseridos, erro: `Produtos inseridos, mas falha ao criar disponibilidades: ${dispError.message}` }
    }
  }

  return { inseridos }
}

export async function atualizarProduto(id: string, dados: Partial<z.infer<typeof produtoSchema>>): Promise<ProdutoCompleto> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const payload = { ...dados, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('produtos')
    .update(payload)
    .eq('id', id)
    .select(`*, categoria:categorias(*), grupo:grupos_produtos(*)`)
    .single()

  if (error) {
    if (error.message?.includes('favorito') || error.code === '42703') {
      throw new Error('A coluna "favorito" não existe. No Supabase (SQL Editor), execute: ALTER TABLE produtos ADD COLUMN IF NOT EXISTS favorito BOOLEAN DEFAULT FALSE;')
    }
    throw error
  }
  return data as ProdutoCompleto
}

/** Verifica se o produto possui alguma venda (item em pedido). */
async function produtoTemVenda(supabase: Awaited<ReturnType<typeof createClient>>, produtoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pedido_itens')
    .select('id')
    .eq('produto_id', produtoId)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * Exclui produto: se não tiver venda, remove do banco; se tiver venda, apenas inativa.
 */
export async function excluirOuInativarProduto(id: string): Promise<{ excluido: boolean; mensagem: string }> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const temVenda = await produtoTemVenda(supabase, id)

  if (temVenda) {
    const { error } = await supabase
      .from('produtos')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return { excluido: false, mensagem: 'Produto inativado (possui vendas).' }
  }

  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) {
    // Se falhar (ex.: FK de variacoes, disponibilidade), inativa em vez de excluir
    const { error: updateErr } = await supabase
      .from('produtos')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateErr) throw updateErr
    return { excluido: false, mensagem: 'Produto inativado (não foi possível excluir).' }
  }
  return { excluido: true, mensagem: 'Produto excluído.' }
}

/** @deprecated Use excluirOuInativarProduto. Mantido para compatibilidade. */
export async function deletarProduto(id: string): Promise<void> {
  const res = await excluirOuInativarProduto(id)
  if (!res.excluido) return
}

// Variações
export async function criarVariacao(produtoId: string, dados: { nome: string; tipo: 'TEXTO' | 'NUMERO' | 'COR'; obrigatorio?: boolean; ordem?: number }): Promise<Variacao> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('variacoes')
    .insert({
      produto_id: produtoId,
      nome: dados.nome,
      tipo: dados.tipo,
      obrigatorio: dados.obrigatorio || false,
      ordem: dados.ordem || 0,
    })
    .select()
    .single()

  if (error) throw error
  return data as Variacao
}

export async function atualizarVariacao(id: string, dados: { nome?: string; tipo?: string; obrigatorio?: boolean; ordem?: number }): Promise<Variacao> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const updateData: Record<string, unknown> = {}
  if (dados.nome !== undefined) updateData.nome = dados.nome
  if (dados.tipo !== undefined) updateData.tipo = dados.tipo
  if (dados.obrigatorio !== undefined) updateData.obrigatorio = dados.obrigatorio
  if (dados.ordem !== undefined) updateData.ordem = dados.ordem

  const { data, error } = await supabase
    .from('variacoes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Variacao
}

export async function criarVariacaoValor(variacaoId: string, dados: { valor: string; label?: string; preco_adicional?: number; estoque?: number; ordem?: number }): Promise<VariacaoValor> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  // Label igual ao valor quando não informado, para exibição correta na loja e PDV
  const label = (dados.label != null && String(dados.label).trim()) ? String(dados.label).trim() : dados.valor

  const { data, error } = await supabase
    .from('variacao_valores')
    .insert({
      variacao_id: variacaoId,
      valor: dados.valor,
      label,
      preco_adicional: dados.preco_adicional ?? 0,
      estoque: dados.estoque,
      ordem: dados.ordem || 0,
      ativo: true,
    })
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Já existe uma opção com esse mesmo "Valor" nesta variação. Use um valor diferente (ex.: P, M, G).')
    }
    throw error
  }
  return data as VariacaoValor
}

export async function atualizarVariacaoValor(id: string, dados: { valor?: string; label?: string; preco_adicional?: number; estoque?: number; ordem?: number }): Promise<VariacaoValor> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const updateData: any = {}
  
  if (dados.valor !== undefined) updateData.valor = dados.valor
  // Label: se informado usa; senão, mantém igual ao valor para não quebrar exibição na loja/PDV
  if (dados.label !== undefined) {
    updateData.label = (dados.label != null && String(dados.label).trim()) ? String(dados.label).trim() : (dados.valor ?? undefined)
  } else if (dados.valor !== undefined) {
    updateData.label = dados.valor
  }
  if (dados.preco_adicional !== undefined) updateData.preco_adicional = dados.preco_adicional ?? 0
  if (dados.estoque !== undefined) updateData.estoque = dados.estoque
  if (dados.ordem !== undefined) updateData.ordem = dados.ordem

  const { data, error } = await supabase
    .from('variacao_valores')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Já existe uma opção com esse mesmo "Valor" nesta variação. Use um valor diferente.')
    }
    throw error
  }
  return data as VariacaoValor
}

// Opcionais
export async function criarGrupoOpcional(produtoId: string, dados: { nome: string; descricao?: string; obrigatorio?: boolean; min_selecoes?: number; max_selecoes?: number; ordem?: number }): Promise<GrupoOpcional> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grupos_opcionais')
    .insert({
      produto_id: produtoId,
      nome: dados.nome,
      descricao: dados.descricao,
      obrigatorio: dados.obrigatorio || false,
      min_selecoes: dados.min_selecoes || 0,
      max_selecoes: dados.max_selecoes,
      ordem: dados.ordem || 0,
    })
    .select()
    .single()

  if (error) throw error
  return data as GrupoOpcional
}

export async function atualizarGrupoOpcional(id: string, dados: { nome?: string; descricao?: string; obrigatorio?: boolean; min_selecoes?: number; max_selecoes?: number | null; ordem?: number }): Promise<GrupoOpcional> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const updateData: Record<string, unknown> = {}
  if (dados.nome !== undefined) updateData.nome = dados.nome
  if (dados.descricao !== undefined) updateData.descricao = dados.descricao
  if (dados.obrigatorio !== undefined) updateData.obrigatorio = dados.obrigatorio
  if (dados.min_selecoes !== undefined) updateData.min_selecoes = dados.min_selecoes
  if (dados.max_selecoes !== undefined) updateData.max_selecoes = dados.max_selecoes
  if (dados.ordem !== undefined) updateData.ordem = dados.ordem

  const { data, error } = await supabase
    .from('grupos_opcionais')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as GrupoOpcional
}

export async function criarOpcional(produtoId: string, dados: { nome: string; descricao?: string; preco: number; estoque?: number; grupo_id?: string; obrigatorio?: boolean; max_selecoes?: number; ordem?: number }): Promise<Opcional> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('opcionais')
    .insert({
      produto_id: produtoId,
      nome: dados.nome,
      descricao: dados.descricao,
      preco: dados.preco,
      estoque: dados.estoque,
      grupo_id: dados.grupo_id,
      obrigatorio: dados.obrigatorio || false,
      max_selecoes: dados.max_selecoes,
      ordem: dados.ordem || 0,
      ativo: true,
    })
    .select()
    .single()

  if (error) throw error
  return data as Opcional
}

export async function atualizarOpcional(id: string, dados: { nome?: string; descricao?: string | null; preco?: number; estoque?: number | null; grupo_id?: string | null; obrigatorio?: boolean; max_selecoes?: number | null; ordem?: number }): Promise<Opcional> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const updateData: Record<string, unknown> = {}
  if (dados.nome !== undefined) updateData.nome = dados.nome
  if (dados.descricao !== undefined) updateData.descricao = dados.descricao
  if (dados.preco !== undefined) updateData.preco = dados.preco
  if (dados.estoque !== undefined) updateData.estoque = dados.estoque
  if (dados.grupo_id !== undefined) updateData.grupo_id = dados.grupo_id
  if (dados.obrigatorio !== undefined) updateData.obrigatorio = dados.obrigatorio
  if (dados.max_selecoes !== undefined) updateData.max_selecoes = dados.max_selecoes
  if (dados.ordem !== undefined) updateData.ordem = dados.ordem

  if (Object.keys(updateData).length === 0) return (await supabase.from('opcionais').select('*').eq('id', id).single()).data as Opcional

  const { data, error } = await supabase
    .from('opcionais')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Opcional
}

// Disponibilidade
export async function listarTurmas(empresaId: string) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('turmas')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('situacao', 'ATIVA')
    .order('descricao', { ascending: true })

  if (error) throw error
  return data || []
}

export async function listarAlunos(empresaId: string) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alunos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('situacao', 'ATIVO')
    .order('nome', { ascending: true })

  if (error) throw error
  return data || []
}

export async function criarDisponibilidade(produtoId: string, dados: { tipo: 'TODOS' | 'SEGMENTO' | 'TURMA' | 'ALUNO'; segmento?: string; turma_id?: string; aluno_id?: string; disponivel_de?: string; disponivel_ate?: string }) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const tipo = dados.tipo
  const segmento = tipo === 'SEGMENTO' && dados.segmento?.trim() ? dados.segmento.trim() : null
  const turma_id = tipo === 'TURMA' && dados.turma_id?.trim() ? dados.turma_id.trim() : null
  const aluno_id = tipo === 'ALUNO' && dados.aluno_id?.trim() ? dados.aluno_id.trim() : null

  let disponivel_de: string | null = null
  let disponivel_ate: string | null = null
  if (dados.disponivel_de?.trim()) {
    const d = dados.disponivel_de.trim()
    disponivel_de = d.length <= 16 ? `${d}:00.000Z` : d
  }
  if (dados.disponivel_ate?.trim()) {
    const d = dados.disponivel_ate.trim()
    disponivel_ate = d.length <= 16 ? `${d}:00.000Z` : d
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produto_disponibilidade')
    .insert({
      produto_id: produtoId,
      tipo,
      segmento,
      turma_id,
      aluno_id,
      disponivel_de,
      disponivel_ate,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '22P02' && tipo === 'SEGMENTO') {
      throw new Error(
        'Erro ao salvar segmento. Execute a migration 060 (segmento como texto). No terminal: npx supabase db push ou aplique 060_produto_disponibilidade_segmento_tipo_curso.sql no banco.'
      )
    }
    throw error
  }
  return data
}

export async function deletarDisponibilidade(id: string) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('produto_disponibilidade')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Actions para gerenciar itens do kit
export async function criarKitItem(kitProdutoId: string, produtoId: string, quantidade: number, ordem?: number): Promise<KitItem> {
  try {
    const ehAdmin = await verificarSeEhAdmin()
    if (!ehAdmin) {
      throw new Error('Não autorizado')
    }

    const supabase = await createClient()

    // Verificar se o produto é um kit
    const { data: kit, error: kitError } = await supabase
      .from('produtos')
      .select('tipo')
      .eq('id', kitProdutoId)
      .single()

    if (kitError) {
      console.error('[criarKitItem] Erro ao verificar kit:', kitError)
      throw new Error(`Erro ao verificar kit: ${kitError.message}`)
    }

    const tiposKit = ['KIT', 'KIT_FESTA', 'KIT_LANCHE']
    if (!kit || !tiposKit.includes(kit.tipo)) {
      throw new Error('Produto não é um kit')
    }

    // Verificar se o produto a ser adicionado não é o próprio kit
    if (kitProdutoId === produtoId) {
      throw new Error('Um kit não pode conter a si mesmo')
    }

    // Verificar se o produto a ser adicionado existe e não é um kit
    const { data: produto, error: produtoError } = await supabase
      .from('produtos')
      .select('id, tipo')
      .eq('id', produtoId)
      .single()

    if (produtoError) {
      console.error('[criarKitItem] Erro ao verificar produto:', produtoError)
      throw new Error(`Erro ao verificar produto: ${produtoError.message}`)
    }

    if (!produto) {
      throw new Error('Produto não encontrado')
    }

    if (['KIT', 'KIT_FESTA', 'KIT_LANCHE'].includes(produto.tipo)) {
      throw new Error('Não é possível adicionar um kit dentro de outro kit')
    }

    const { data, error } = await supabase
      .from('kits_itens')
      .insert({
        kit_produto_id: kitProdutoId,
        produto_id: produtoId,
        quantidade,
        ordem: ordem || 0,
      })
      .select(`
        *,
        produto:produtos!kits_itens_produto_id_fkey(*)
      `)
      .single()

    if (error) {
      console.error('[criarKitItem] Erro ao inserir item do kit:', JSON.stringify(error, null, 2))
      const errorMessage = error.message || error.details || error.hint || 'Erro desconhecido ao adicionar produto ao kit'
      throw new Error(`Erro ao adicionar produto ao kit: ${errorMessage}`)
    }

    if (!data) {
      throw new Error('Item do kit não foi criado')
    }

    return data as KitItem
  } catch (error: any) {
    console.error('[criarKitItem] Erro completo:', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function listarKitItens(kitProdutoId: string): Promise<KitItem[]> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('kits_itens')
    .select(`
      *,
      produto:produtos!kits_itens_produto_id_fkey(*)
    `)
    .eq('kit_produto_id', kitProdutoId)
    .order('ordem', { ascending: true })

  if (error) throw error
  return (data || []) as KitItem[]
}

export async function deletarKitItem(id: string): Promise<void> {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) {
    throw new Error('Não autorizado')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('kits_itens')
    .delete()
    .eq('id', id)

  if (error) throw error
}
