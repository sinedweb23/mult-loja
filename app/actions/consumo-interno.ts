'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ItemConsumoInterno {
  produto_id: string
  variacao_valor_id?: string | null
  quantidade: number
}

/** Colaborador para select (solicitante / quem retirou) */
export interface ColaboradorConsumoInterno {
  id: string
  nome: string
}

/** Dados para impressão do comprovante de consumo interno */
export interface ComprovanteConsumoInternoData {
  nome_loja: string
  data_hora: string
  operador_nome: string
  departamento_nome: string
  segmento_nome: string
  solicitante_nome: string
  retirado_por_nome: string
  itens: Array<{
    produto_nome: string
    variacao_label?: string | null
    quantidade: number
    /** Ex.: "400g" para produto por kg; "2" para unitário */
    quantidade_display?: string
    custo_unitario: number
    total_custo: number
  }>
  total_custo: number
}

export interface ProdutoConsumoInterno {
  id: string
  nome: string
  estoque: number | null
  valor_custo: number | null
  /** UN = unitário; KG = por kg (informar gramas no lançamento) */
  unidade?: 'UN' | 'KG' | null
  variacoes?: Array<{
    id: string
    nome?: string
    valores: Array<{
      id: string
      valor?: string
      label?: string | null
      estoque: number | null
      ativo: boolean | null
    }>
  }>
}

/**
 * Lista todos os produtos cadastrados para Consumo Interno (sem filtro de visibilidade).
 */
export async function listarProdutosConsumoInterno(empresaId: string): Promise<ProdutoConsumoInterno[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      estoque,
      valor_custo,
      preco,
      unidade,
      variacoes:variacoes (
        id,
        nome,
        valores:variacao_valores (id, valor, label, estoque, ativo)
      )
    `)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome')

  if (error) {
    console.error('Erro ao listar produtos consumo interno:', error)
    throw new Error('Erro ao carregar produtos')
  }

  return (produtos || []).map((p: any) => {
    let estoqueTotal: number | null = null
    const variacoes = p.variacoes as any[] | undefined
    if (variacoes?.length) {
      let soma = 0
      for (const variacao of variacoes) {
        const valores = variacao?.valores as any[] | undefined
        if (!valores) continue
        for (const valor of valores) {
          if (valor?.ativo !== false && valor?.estoque != null) soma += Number(valor.estoque)
        }
      }
      if (soma > 0) estoqueTotal = soma
    }
    if (estoqueTotal === null && p.estoque != null) estoqueTotal = Number(p.estoque)

    const valorCustoNum =
      p.valor_custo != null ? Number(p.valor_custo) : null
    const precoNum = p.preco != null ? Number(p.preco) : null

    const baseCusto =
      valorCustoNum != null && valorCustoNum > 0
        ? valorCustoNum
        : precoNum != null && precoNum > 0
          ? precoNum
          : 0

    return {
      id: p.id,
      nome: p.nome,
      estoque: estoqueTotal,
      valor_custo: baseCusto,
      unidade: (p.unidade === 'KG' || p.unidade === 'UN' ? p.unidade : 'UN') as 'UN' | 'KG',
      variacoes: p.variacoes,
    }
  })
}

/**
 * Lista usuários com perfil COLABORADOR da empresa para select (solicitante / quem retirou).
 */
export async function listarColaboradoresParaConsumoInterno(empresaId: string): Promise<ColaboradorConsumoInterno[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: papeis } = await admin
    .from('usuario_papeis')
    .select('usuario_id')
    .eq('papel', 'COLABORADOR')
  const idsColab = [...new Set((papeis ?? []).map((p: { usuario_id: string }) => p.usuario_id))]
  if (idsColab.length === 0) return []

  const { data: usuarios, error } = await admin
    .from('usuarios')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .in('id', idsColab)
    .eq('ativo', true)
    .order('nome')

  if (error || !usuarios) return []
  return usuarios.map((u: { id: string; nome: string | null }) => ({
    id: u.id,
    nome: u.nome?.trim() || 'Sem nome',
  }))
}

/**
 * Abate estoque: se item tem variacao_valor_id, abate na variação; senão no produto.
 * Para produto por KG (unidade === 'KG'), quantidade do item está em gramas.
 */
async function abaterEstoqueConsumoInterno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itens: { produto_id: string; variacao_valor_id?: string | null; quantidade: number }[],
  produtosMap: Map<string, { unidade?: string | null }>
): Promise<void> {
  for (const item of itens) {
    if (item.variacao_valor_id) {
      const { data: vv } = await supabase
        .from('variacao_valores')
        .select('estoque')
        .eq('id', item.variacao_valor_id)
        .single()
      const estoqueAtual = vv?.estoque != null ? Number(vv.estoque) : 0
      const novoEstoque = Math.max(0, estoqueAtual - item.quantidade)
      await supabase
        .from('variacao_valores')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.variacao_valor_id)
    } else {
      const prod = produtosMap.get(item.produto_id) as { estoque?: number | null; unidade?: string | null } | undefined
      const { data: row } = await supabase
        .from('produtos')
        .select('estoque')
        .eq('id', item.produto_id)
        .single()
      const estoqueAtual = row?.estoque != null ? Number(row.estoque) : 0
      const qtyAbater = prod?.unidade === 'KG' ? item.quantidade : item.quantidade
      const novoEstoque = Math.max(0, estoqueAtual - qtyAbater)
      await supabase
        .from('produtos')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.produto_id)
    }
  }
}

/**
 * Repõe estoque para um lançamento de consumo interno (usado no cancelamento).
 */
async function reporEstoqueConsumoInterno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itens: { produto_id: string; variacao_valor_id?: string | null; quantidade: number }[],
  produtosMap: Map<string, { unidade?: string | null }>
): Promise<void> {
  for (const item of itens) {
    if (item.variacao_valor_id) {
      const { data: vv } = await supabase
        .from('variacao_valores')
        .select('estoque')
        .eq('id', item.variacao_valor_id)
        .single()
      const estoqueAtual = vv?.estoque != null ? Number(vv.estoque) : 0
      const novoEstoque = estoqueAtual + item.quantidade
      await supabase
        .from('variacao_valores')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.variacao_valor_id)
    } else {
      const prod = produtosMap.get(item.produto_id) as { estoque?: number | null; unidade?: string | null } | undefined
      const { data: row } = await supabase
        .from('produtos')
        .select('estoque')
        .eq('id', item.produto_id)
        .single()
      const estoqueAtual = row?.estoque != null ? Number(row.estoque) : 0
      const qtyRepor = prod?.unidade === 'KG' ? item.quantidade : item.quantidade
      const novoEstoque = estoqueAtual + qtyRepor
      await supabase
        .from('produtos')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.produto_id)
    }
  }
}

/**
 * Registra um lançamento de Consumo Interno: cabecalho, itens com custo histórico,
 * movimentação de estoque (tipo internal_consumption) e baixa de estoque.
 * Aceita solicitante_id e retirado_por_id (colaboradores); retorna dados para comprovante.
 */
export async function registrarConsumoInterno(
  empresaId: string,
  dados: {
    solicitante_id: string
    retirado_por_id: string
    department_id: string
    segment_id: string
    itens: ItemConsumoInterno[]
  }
): Promise<{ ok: boolean; consumoInternoId?: string; comprovante?: ComprovanteConsumoInternoData; erro?: string }> {
  if (!dados.solicitante_id?.trim()) return { ok: false, erro: 'Selecione quem solicitou' }
  if (!dados.retirado_por_id?.trim()) return { ok: false, erro: 'Selecione quem retirou' }
  if (!dados.department_id) return { ok: false, erro: 'Selecione o departamento' }
  if (!dados.segment_id) return { ok: false, erro: 'Selecione o segmento' }
  if (!dados.itens?.length) return { ok: false, erro: 'Adicione ao menos um item' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nome')
    .eq('auth_user_id', user.id)
    .single()
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado' }

  const admin = createAdminClient()
  const idsColab = await (async () => {
    const { data: papeis } = await admin.from('usuario_papeis').select('usuario_id').eq('papel', 'COLABORADOR')
    return [...new Set((papeis ?? []).map((p: { usuario_id: string }) => p.usuario_id))]
  })()
  if (!idsColab.includes(dados.solicitante_id) || !idsColab.includes(dados.retirado_por_id)) {
    return { ok: false, erro: 'Solicitante e quem retirou devem ser colaboradores da empresa' }
  }

  const { data: usuariosNomes } = await admin
    .from('usuarios')
    .select('id, nome')
    .in('id', [dados.solicitante_id, dados.retirado_por_id])
  const nomeSolicitante = usuariosNomes?.find((u: { id: string }) => u.id === dados.solicitante_id)?.nome?.trim() || 'Solicitante'
  const nomeRetiradoPor = usuariosNomes?.find((u: { id: string }) => u.id === dados.retirado_por_id)?.nome?.trim() || 'Quem retirou'

  const produtoIds = [...new Set(dados.itens.map((i) => i.produto_id))]
  const { data: produtosData, error: errProd } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      valor_custo,
      preco,
      estoque,
      unidade,
      variacoes:variacoes (
        id,
        valores:variacao_valores (id, estoque, ativo)
      )
    `)
    .in('id', produtoIds)

  if (errProd || !produtosData?.length) {
    return { ok: false, erro: 'Erro ao carregar produtos' }
  }

  const produtosMap = new Map(produtosData.map((p: any) => [p.id, p]))

  for (const item of dados.itens) {
    if (item.quantidade <= 0) return { ok: false, erro: 'Quantidade inválida' }
    const produto = produtosMap.get(item.produto_id) as any
    if (!produto) return { ok: false, erro: 'Produto não encontrado' }

    const variacoes = produto.variacoes as any[] | undefined
    const temVariacoes = variacoes?.length

    if (temVariacoes) {
      if (!item.variacao_valor_id) {
        return { ok: false, erro: `Selecione a variação do produto ${produto.nome}` }
      }
      let encontrado = false
      for (const variacao of variacoes) {
        const valores = variacao?.valores as any[] | undefined
        const valor = valores?.find((v: any) => v.id === item.variacao_valor_id)
        if (valor) {
          encontrado = true
          const est = valor.estoque != null ? Number(valor.estoque) : 0
          if (est < item.quantidade) {
            return { ok: false, erro: `Estoque insuficiente para ${produto.nome}` }
          }
          break
        }
      }
      if (!encontrado) return { ok: false, erro: `Variação inválida para ${produto.nome}` }
    } else {
      const estoqueProd = produto.estoque != null ? Number(produto.estoque) : null
      const qtyCheck = produto.unidade === 'KG' ? item.quantidade : item.quantidade
      if (estoqueProd !== null && estoqueProd < qtyCheck) {
        return { ok: false, erro: `Estoque insuficiente para ${produto.nome}` }
      }
    }
  }

  const { data: cabecalho, error: errCab } = await supabase
    .from('consumo_interno')
    .insert({
      empresa_id: empresaId,
      operador_id: usuario.id,
      solicitante_id: dados.solicitante_id,
      retirado_por_id: dados.retirado_por_id,
      withdrawn_by: nomeRetiradoPor,
      departamento_id: dados.department_id,
      segmento_id: dados.segment_id,
    })
    .select('id')
    .single()

  if (errCab || !cabecalho) {
    console.error('Erro ao criar consumo_interno:', errCab)
    return { ok: false, erro: errCab?.message ?? 'Erro ao registrar consumo interno' }
  }

  const consumoId = cabecalho.id

  const itensComprovante: ComprovanteConsumoInternoData['itens'] = []

  let totalCustoGeral = 0
  for (const item of dados.itens) {
    const produto = produtosMap.get(item.produto_id) as any
    const isKg = produto?.unidade === 'KG'
    const valorCustoNum =
      produto?.valor_custo != null ? Number(produto.valor_custo) : null
    const precoNum = produto?.preco != null ? Number(produto.preco) : null
    const baseCusto =
      valorCustoNum != null && valorCustoNum > 0
        ? valorCustoNum
        : precoNum != null && precoNum > 0
          ? precoNum
          : 0
    const custoUnitario = baseCusto
    const totalCusto = isKg ? (custoUnitario * item.quantidade) / 1000 : item.quantidade * custoUnitario
    totalCustoGeral += totalCusto

    let variacaoLabel: string | null = null
    if (item.variacao_valor_id && produto?.variacoes) {
      for (const variacao of produto.variacoes as any[]) {
        const valores = variacao?.valores as any[] | undefined
        const valor = valores?.find((v: any) => v.id === item.variacao_valor_id)
        if (valor) {
          variacaoLabel = (valor.label || valor.valor || '').trim() || null
          break
        }
      }
    }

    itensComprovante.push({
      produto_nome: produto?.nome ?? 'Produto',
      variacao_label: variacaoLabel,
      quantidade: item.quantidade,
      quantidade_display: isKg ? `${item.quantidade}g` : undefined,
      custo_unitario: isKg ? custoUnitario : custoUnitario,
      total_custo: totalCusto,
    })

    const { error: errItem } = await supabase.from('consumo_interno_itens').insert({
      consumo_interno_id: consumoId,
      produto_id: item.produto_id,
      variacao_valor_id: item.variacao_valor_id || null,
      quantidade: item.quantidade,
      custo_unitario: custoUnitario,
      total_custo: totalCusto,
    })
    if (errItem) {
      console.error('Erro ao inserir item consumo interno:', errItem)
      return { ok: false, erro: errItem.message }
    }

    const { error: errMov } = await supabase.from('movimento_estoque').insert({
      empresa_id: empresaId,
      produto_id: item.produto_id,
      variacao_valor_id: item.variacao_valor_id || null,
      quantidade: -item.quantidade,
      usuario_id: usuario.id,
      tipo: 'internal_consumption',
      consumo_interno_id: consumoId,
      valor_custo: totalCusto || null,
    })
    if (errMov) {
      console.error('Erro ao inserir movimento_estoque:', errMov)
      return { ok: false, erro: errMov.message }
    }
  }

  await abaterEstoqueConsumoInterno(supabase, dados.itens, produtosMap)

  const [{ data: dep }, { data: seg }, { data: emp }] = await Promise.all([
    supabase.from('departamentos').select('nome').eq('id', dados.department_id).single(),
    supabase.from('segmentos').select('nome').eq('id', dados.segment_id).single(),
    supabase.from('empresas').select('nome').eq('id', empresaId).single(),
  ])

  const comprovante: ComprovanteConsumoInternoData = {
    nome_loja: (emp as { nome?: string } | null)?.nome?.trim() || 'Consumo Interno',
    data_hora: new Date().toISOString(),
    operador_nome: (usuario as { nome?: string }).nome?.trim() || 'Operador',
    departamento_nome: (dep as { nome?: string } | null)?.nome?.trim() || '',
    segmento_nome: (seg as { nome?: string } | null)?.nome?.trim() || '',
    solicitante_nome: nomeSolicitante,
    retirado_por_nome: nomeRetiradoPor,
    itens: itensComprovante,
    total_custo: totalCustoGeral,
  }

  return { ok: true, consumoInternoId: consumoId, comprovante }
}

/**
 * Obtém dados do comprovante de um lançamento de consumo interno para reimpressão (ex.: em admin/consumo-interno).
 */
export async function obterComprovanteConsumoInternoReimpressao(
  consumoInternoId: string
): Promise<{ ok: boolean; comprovante?: ComprovanteConsumoInternoData; erro?: string }> {
  if (!consumoInternoId?.trim()) return { ok: false, erro: 'ID do lançamento não informado' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: cabecalho, error: errCab } = await supabase
    .from('consumo_interno')
    .select(`
      id,
      created_at,
      empresa_id,
      operador_id,
      solicitante_id,
      retirado_por_id,
      departamento_id,
      segmento_id,
      operadores:operador_id ( nome ),
      solicitante:solicitante_id ( nome ),
      retirou:retirado_por_id ( nome ),
      departamentos:departamento_id ( nome ),
      segmentos:segmento_id ( nome ),
      empresas:empresa_id ( nome )
    `)
    .eq('id', consumoInternoId)
    .single()

  if (errCab || !cabecalho) {
    return { ok: false, erro: errCab?.message ?? 'Lançamento não encontrado' }
  }

  const { data: itensRows, error: errItens } = await supabase
    .from('consumo_interno_itens')
    .select(`
      produto_id,
      variacao_valor_id,
      quantidade,
      custo_unitario,
      total_custo,
      produtos:produto_id ( nome, unidade ),
      variacao_valores:variacao_valor_id ( label, valor )
    `)
    .eq('consumo_interno_id', consumoInternoId)

  if (errItens) {
    return { ok: false, erro: errItens.message }
  }

  const itensComprovante: ComprovanteConsumoInternoData['itens'] = (itensRows ?? []).map((row: any) => {
    const produto = row.produtos
    const unidade = produto?.unidade ?? null
    const isKg = unidade === 'KG'
    const variacao = row.variacao_valores
    const variacaoLabel =
      variacao && (variacao.label?.trim() || variacao.valor?.trim())
        ? (variacao.label?.trim() || variacao.valor?.trim())
        : null
    return {
      produto_nome: produto?.nome ?? 'Produto',
      variacao_label: variacaoLabel,
      quantidade: Number(row.quantidade ?? 0),
      quantidade_display: isKg ? `${row.quantidade}g` : undefined,
      custo_unitario: Number(row.custo_unitario ?? 0),
      total_custo: Number(row.total_custo ?? 0),
    }
  })

  const emp = (cabecalho as any).empresas
  const empNome = emp?.nome?.trim() ?? ''
  const dep = (cabecalho as any).departamentos
  const depNome = dep?.nome?.trim() ?? ''
  const seg = (cabecalho as any).segmentos
  const segNome = seg?.nome?.trim() ?? ''
  const operadores = (cabecalho as any).operadores
  const operadorNome =
    operadores && !Array.isArray(operadores)
      ? operadores.nome?.trim()
      : Array.isArray(operadores)
        ? operadores[0]?.nome?.trim()
        : ''
  const solicitante = (cabecalho as any).solicitante
  const solicitanteNome =
    solicitante && !Array.isArray(solicitante)
      ? solicitante.nome?.trim()
      : Array.isArray(solicitante)
        ? solicitante[0]?.nome?.trim()
        : ''
  const retirou = (cabecalho as any).retirou
  const retiradoPorNome =
    retirou && !Array.isArray(retirou)
      ? retirou.nome?.trim()
      : Array.isArray(retirou)
        ? retirou[0]?.nome?.trim()
        : ''

  const totalCusto = itensComprovante.reduce((s, it) => s + it.total_custo, 0)

  const comprovante: ComprovanteConsumoInternoData = {
    nome_loja: empNome || 'Consumo Interno',
    data_hora: (cabecalho as any).created_at ?? new Date().toISOString(),
    operador_nome: operadorNome || 'Operador',
    departamento_nome: depNome,
    segmento_nome: segNome,
    solicitante_nome: solicitanteNome || 'Solicitante',
    retirado_por_nome: retiradoPorNome || 'Quem retirou',
    itens: itensComprovante,
    total_custo: totalCusto,
  }

  return { ok: true, comprovante }
}

/**
 * Cancela um lançamento de consumo interno, marca como cancelado e estorna o estoque.
 */
export async function cancelarConsumoInterno(
  consumoInternoId: string
): Promise<{ ok: boolean; erro?: string }> {
  if (!consumoInternoId?.trim()) return { ok: false, erro: 'ID do lançamento não informado' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: usuario, error: errUsuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()

  if (errUsuario || !usuario) {
    return { ok: false, erro: 'Usuário não encontrado' }
  }

  const empresaId = (usuario as any).empresa_id as string | null
  if (!empresaId) {
    return { ok: false, erro: 'Empresa do usuário não encontrada' }
  }

  const admin = createAdminClient()

  const { data: cabecalho, error: errCab } = await admin
    .from('consumo_interno')
    .select('id, empresa_id, status, cancelado_em')
    .eq('id', consumoInternoId)
    .eq('empresa_id', empresaId)
    .single()

  if (errCab || !cabecalho) {
    return { ok: false, erro: 'Lançamento não encontrado' }
  }

  if ((cabecalho as any).status === 'CANCELADO') {
    return { ok: false, erro: 'Lançamento já está cancelado' }
  }

  const { data: itensRows, error: errItens } = await admin
    .from('consumo_interno_itens')
    .select('produto_id, variacao_valor_id, quantidade, custo_unitario, total_custo')
    .eq('consumo_interno_id', consumoInternoId)

  if (errItens) {
    return { ok: false, erro: 'Erro ao buscar itens do lançamento' }
  }

  const itens = (itensRows ?? []).map((row: any) => ({
    produto_id: row.produto_id as string,
    variacao_valor_id: (row.variacao_valor_id as string | null) ?? null,
    quantidade: Number(row.quantidade ?? 0),
    custo_unitario: Number(row.custo_unitario ?? 0),
    total_custo: Number(row.total_custo ?? 0),
  }))

  if (!itens.length) {
    return { ok: false, erro: 'Lançamento sem itens para estornar' }
  }

  const produtoIds = [...new Set(itens.map((i) => i.produto_id))]
  const { data: produtosData, error: errProd } = await admin
    .from('produtos')
    .select('id, unidade, estoque')
    .in('id', produtoIds)

  if (errProd || !produtosData?.length) {
    return { ok: false, erro: 'Erro ao carregar produtos para estorno' }
  }

  const produtosMap = new Map(produtosData.map((p: any) => [p.id, p]))

  const { error: errUpdate } = await admin
    .from('consumo_interno')
    .update({
      status: 'CANCELADO',
      cancelado_em: new Date().toISOString(),
      cancelado_por_id: usuario.id,
    })
    .eq('id', consumoInternoId)

  if (errUpdate) {
    return { ok: false, erro: 'Erro ao marcar lançamento como cancelado' }
  }

  for (const item of itens) {
    const { error: errMov } = await admin.from('movimento_estoque').insert({
      empresa_id: empresaId,
      produto_id: item.produto_id,
      variacao_valor_id: item.variacao_valor_id || null,
      quantidade: item.quantidade,
      usuario_id: usuario.id,
      tipo: 'internal_consumption',
      consumo_interno_id: consumoInternoId,
      valor_custo: item.total_custo || null,
    })
    if (errMov) {
      console.error('Erro ao inserir movimento_estoque (estorno consumo interno):', errMov)
      return { ok: false, erro: 'Erro ao registrar movimento de estorno de estoque' }
    }
  }

  await reporEstoqueConsumoInterno(
    supabase,
    itens.map((i) => ({
      produto_id: i.produto_id,
      variacao_valor_id: i.variacao_valor_id,
      quantidade: i.quantidade,
    })),
    produtosMap
  )

  return { ok: true }
}
