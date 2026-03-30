'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterSaldoAluno, obterGastoAlunoHojeParaPdv } from '@/app/actions/saldo'
import { obterConfigAlunoParaPdv } from '@/app/actions/aluno-config'
import { obterConfigCreditoCantinaSaldoNegativo } from '@/app/actions/configuracoes'
import { obterDiasUteis } from '@/app/actions/dias-uteis'
import { todayISO } from '@/lib/date'
import type { Caixa } from '@/lib/types/database'

export interface ItemVenda {
  produto_id: string
  quantidade: number
  preco_unitario: number
  subtotal: number
  produto_nome?: string
  variacoes_selecionadas?: Record<string, string> | null
  opcionais_selecionados?: Array<{ opcional_id: string; nome: string; preco: number; quantidade: number }> | null
  /** Kit Lanche: data de retirada (YYYY-MM-DD) para o item */
  data_retirada?: string | null
  /** Produto vendido por kg: gramas informados no PDV (ex.: 400 = 400g) */
  gramas?: number | null
}

export interface FormaPagamento {
  metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO'
  valor: number
  troco?: number // Apenas para dinheiro
}

/**
 * Lista produtos disponíveis para venda no PDV (sem filtro de aluno)
 */
export async function listarProdutosPdv(empresaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      descricao,
      preco,
      estoque,
      ativo,
      tipo,
      tipo_kit,
      unidade,
      desconto_kit_mensal_pct,
      empresa_id,
      imagem_url,
      sku,
      visibilidade,
      favorito,
      variacoes:variacoes (
        id,
        valores:variacao_valores (estoque, ativo, preco_adicional)
      )
    `)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome')

  if (error) {
    console.error('Erro ao listar produtos:', error)
    throw new Error('Erro ao carregar produtos')
  }

  const filtrados = (produtos || []).filter((p: any) => {
    // PDV: apenas CANTINA ou AMBOS (não CONSUMO_INTERNO sozinho)
    if (p.visibilidade === 'CONSUMO_INTERNO') return false
    if (p.visibilidade && p.visibilidade !== 'CANTINA' && p.visibilidade !== 'AMBOS') {
      return false
    }
    return true
  })

  // Dias úteis do próximo mês (para Kit Lanche Mensal "a partir de" = igual à loja)
  const hoje = new Date()
  let mesProximo = hoje.getMonth() + 2
  let anoProximo = hoje.getFullYear()
  if (mesProximo > 12) {
    mesProximo = 1
    anoProximo += 1
  }
  let diasUteisProximoMes = 0
  try {
    diasUteisProximoMes = await obterDiasUteis(empresaId, anoProximo, mesProximo)
  } catch {
    // ignora
  }

  // Ajustar estoque e calcular preço "a partir de" (Kit Mensal = base × dias úteis próximo mês × (1 - desconto))
  return filtrados.map((p: any) => {
    let estoqueTotal: number | null = null

    const variacoes = (p as any).variacoes as any[] | undefined
    let somaMinAdicionais = 0

    if (variacoes && variacoes.length > 0) {
      let soma = 0
      let encontrouAlgum = false
      for (const variacao of variacoes) {
        const valores = (variacao as any).valores as any[] | undefined
        if (!valores) continue
        // Estoque total por variação
        for (const valor of valores) {
          if (valor && valor.ativo !== false && valor.estoque != null) {
            soma += Number(valor.estoque)
            encontrouAlgum = true
          }
        }
        // Menor adicional de preço desta variação (para \"a partir de\")
        const ativosComPreco = valores.filter((v) => v.ativo !== false && v.preco_adicional != null)
        if (ativosComPreco.length > 0) {
          const minAdicional = Math.min(...ativosComPreco.map((v) => Number(v.preco_adicional)))
          if (isFinite(minAdicional) && minAdicional > 0) {
            somaMinAdicionais += minAdicional
          }
        }
      }
      if (encontrouAlgum) {
        estoqueTotal = soma
      }
    }

    if (estoqueTotal === null) {
      estoqueTotal = p.estoque != null ? Number(p.estoque) : null
    }

    const precoBase = Number(p.preco)
    const baseComVariacao = precoBase + somaMinAdicionais

    // Kit Lanche Mensal: "a partir de" = (base + variação) × dias úteis próximo mês × (1 - desconto), igual à loja
    const ehKitMensal = p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL'
    const descontoPct = Number(p.desconto_kit_mensal_pct ?? 0) / 100
    let precoAPartirDe: number | null = null
    if (ehKitMensal && diasUteisProximoMes > 0) {
      precoAPartirDe = baseComVariacao * diasUteisProximoMes * (1 - descontoPct)
    } else if (somaMinAdicionais > 0) {
      precoAPartirDe = baseComVariacao
    }

    return {
      ...p,
      estoque: estoqueTotal,
      preco_a_partir_de: precoAPartirDe,
      // Kit Mensal: preço base por dia (para o modal calcular total = base × dias × (1 - desconto))
      preco_base_kit_mensal: ehKitMensal ? baseComVariacao : undefined,
    }
  })
}

/**
 * Obtém produto completo com variações e opcionais para o PDV
 */
export async function obterProdutoCompletoPdv(produtoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Buscar produto
  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', produtoId)
    .eq('ativo', true)
    .single()

  if (produtoError || !produto) {
    return null
  }

  // Buscar variações
  const { data: variacoes } = await supabase
    .from('variacoes')
    .select(`
      *,
      valores:variacao_valores(*)
    `)
    .eq('produto_id', produtoId)
    .order('ordem', { ascending: true })

  // Buscar grupos de opcionais
  const { data: gruposOpcionais } = await supabase
    .from('grupos_opcionais')
    .select(`
      *,
      opcionais:opcionais(*)
    `)
    .eq('produto_id', produtoId)
    .order('ordem', { ascending: true })

  // Filtrar valores de variação ativos (ordenar por ordem; null/undefined = 999 para não quebrar)
  const variacoesComValores = (variacoes || []).map((v: any) => ({
    ...v,
    nome: v.nome ?? '',
    valores: (v.valores || [])
      .filter((val: any) => val.ativo !== false)
      .sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999)),
  })).filter((v: any) => v.valores.length > 0)

  // Filtrar opcionais ativos
  const gruposComOpcionais = (gruposOpcionais || []).map((g: any) => ({
    ...g,
    opcionais: (g.opcionais || [])
      .filter((o: any) => o.ativo !== false)
      .sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999)),
  })).filter((g: any) => g.opcionais.length > 0)

  return {
    ...produto,
    variacoes: variacoesComValores,
    grupos_opcionais: gruposComOpcionais,
  }
}

/** Normaliza string para comparação (trim, lowercase opcional) */
function normalizarValor(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).trim()
}

/**
 * Abate estoque após venda: se o item tiver variações selecionadas, abate do estoque
 * do valor da variação (variacao_valores.estoque); senão, abate do produto.estoque.
 * variacoes_selecionadas: { [nomeVariacao]: labelOuValor } (ex: { "Sabor": "Coca" })
 */
async function abaterEstoqueVenda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itens: ItemVenda[]
): Promise<void> {
  for (const item of itens) {
    const variacoesSel = item.variacoes_selecionadas && Object.keys(item.variacoes_selecionadas).length > 0
      ? item.variacoes_selecionadas
      : null

    if (variacoesSel) {
      const { data: variacoes, error: errVar } = await supabase
        .from('variacoes')
        .select(`
          id,
          nome,
          valores:variacao_valores(id, valor, label, estoque)
        `)
        .eq('produto_id', item.produto_id)

      if (errVar) {
        console.error('[abaterEstoqueVenda] Erro ao buscar variações:', errVar)
      }

      const valorSelNorm = (s: string) => normalizarValor(s)
      let abateuEmVariacao = false
      for (const [nomeVariacao, valorSelecionado] of Object.entries(variacoesSel)) {
        const variacao = (variacoes || []).find((v: any) => normalizarValor(v.nome) === valorSelNorm(nomeVariacao))
        if (!variacao) continue
        const valores = (variacao as any).valores as Array<{ id: string; valor: string; label: string | null; estoque: number | null }> | undefined
        if (!valores?.length) continue
        const busca = valorSelNorm(valorSelecionado)
        const valor = valores.find(
          (v) => valorSelNorm(v.label ?? '') === busca || valorSelNorm(v.valor) === busca
        )
        if (valor && valor.estoque != null) {
          const novoEstoque = Math.max(0, valor.estoque - item.quantidade)
          const { error: updateErr } = await supabase
            .from('variacao_valores')
            .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
            .eq('id', valor.id)
          if (updateErr) {
            console.error('[abaterEstoqueVenda] Erro ao atualizar estoque da variação:', valor.id, updateErr)
          } else {
            abateuEmVariacao = true
          }
          break
        }
      }

      if (abateuEmVariacao) continue
    }

    const { data: produto } = await supabase
      .from('produtos')
      .select('estoque')
      .eq('id', item.produto_id)
      .single()

    if (produto && produto.estoque !== null) {
      const novoEstoque = Math.max(0, produto.estoque - item.quantidade)
      await supabase
        .from('produtos')
        .update({ estoque: novoEstoque, updated_at: new Date().toISOString() })
        .eq('id', item.produto_id)
    }
  }
}

/**
 * Finaliza venda direta no PDV
 */
export async function finalizarVendaDireta(
  caixaId: string,
  itens: ItemVenda[],
  formasPagamento: FormaPagamento[]
): Promise<{ ok: boolean; pedidoId?: string; erro?: string }> {
  if (itens.length === 0) {
    return { ok: false, erro: 'Nenhum item na venda' }
  }

  if (formasPagamento.length === 0) {
    return { ok: false, erro: 'Nenhuma forma de pagamento informada' }
  }

  const totalVenda = itens.reduce((sum, item) => sum + item.subtotal, 0)
  const totalPagamentos = formasPagamento.reduce((sum, fp) => sum + fp.valor, 0)

  if (Math.abs(totalVenda - totalPagamentos) > 0.01) {
    return { ok: false, erro: 'Valor total não confere com formas de pagamento' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  // Obter dados do caixa
  const { data: caixa, error: caixaError } = await supabase
    .from('caixas')
    .select('empresa_id, unidade_id, operador_id')
    .eq('id', caixaId)
    .single()

  if (caixaError || !caixa) {
    return { ok: false, erro: 'Caixa não encontrado' }
  }

  // Verificar estoque e visibilidade antes de criar o pedido
  const produtosIds = Array.from(new Set(itens.map((i) => i.produto_id)))
  const { data: produtosEstoque, error: estoqueError } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      estoque,
      visibilidade,
      variacoes:variacoes (
        id,
        valores:variacao_valores (estoque, ativo)
      )
    `)
    .in('id', produtosIds)

  if (estoqueError) {
    console.error('Erro ao verificar estoque:', estoqueError)
    return { ok: false, erro: 'Erro ao verificar estoque dos produtos' }
  }

  for (const item of itens) {
    const produto = (produtosEstoque || []).find((p: any) => p.id === item.produto_id)

    if (!produto) {
      return { ok: false, erro: `Produto ${item.produto_id} não encontrado` }
    }

    // Visibilidade: garantir que o produto ainda pode ser vendido no PDV
    if (produto.visibilidade && produto.visibilidade !== 'CANTINA' && produto.visibilidade !== 'AMBOS') {
      return { ok: false, erro: `Produto ${produto.nome} não está disponível para venda no PDV` }
    }

    // Estoque: se houver estoque por variação, usar soma das variações; senão usar estoque do produto
    let estoqueTotal: number | null = null
    const variacoes = (produto as any).variacoes as any[] | undefined

    if (variacoes && variacoes.length > 0) {
      let soma = 0
      let encontrouAlgum = false
      for (const variacao of variacoes) {
        const valores = (variacao as any).valores as any[] | undefined
        if (!valores) continue
        for (const valor of valores) {
          if (valor && valor.ativo !== false && valor.estoque != null) {
            soma += Number(valor.estoque)
            encontrouAlgum = true
          }
        }
      }
      if (encontrouAlgum) {
        estoqueTotal = soma
      }
    }

    if (estoqueTotal === null) {
      estoqueTotal = produto.estoque != null ? Number(produto.estoque) : null
    }

    if (estoqueTotal !== null && estoqueTotal < item.quantidade) {
      return { ok: false, erro: `Estoque insuficiente para ${produto.nome}` }
    }
  }

  // Criar um aluno fictício para venda direta (ou usar NULL se permitido)
  // Por enquanto, vamos criar um registro temporário ou usar um aluno especial
  // Verificar se há um aluno "Venda Direta" ou criar um
  let alunoVendaDiretaId: string | null = null

  // Buscar ou criar aluno fictício para vendas diretas
  const { data: alunoExistente } = await supabase
    .from('alunos')
    .select('id')
    .eq('empresa_id', caixa.empresa_id)
    .eq('prontuario', 'VENDA_DIRETA')
    .maybeSingle()

  if (alunoExistente) {
    alunoVendaDiretaId = alunoExistente.id
  } else {
    // Criar aluno fictício para vendas diretas
    // Buscar uma turma da empresa para usar como padrão (ou null se não houver)
    const { data: turmaPadrao } = await supabase
      .from('turmas')
      .select('id')
      .eq('empresa_id', caixa.empresa_id)
      .limit(1)
      .maybeSingle()

    const { data: novoAluno, error: alunoError } = await supabase
      .from('alunos')
      .insert({
        empresa_id: caixa.empresa_id,
        unidade_id: caixa.unidade_id,
        nome: 'Venda Direta',
        prontuario: 'VENDA_DIRETA',
        situacao: 'ATIVO',
        turma_id: turmaPadrao?.id || null,
      })
      .select('id')
      .single()

    if (alunoError || !novoAluno) {
      return { ok: false, erro: 'Erro ao criar registro de venda direta' }
    }
    alunoVendaDiretaId = novoAluno.id
  }

  // Obter usuário do operador
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', caixa.operador_id)
    .single()

  if (!usuario) {
    return { ok: false, erro: 'Operador não encontrado' }
  }

  // Criar pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      empresa_id: caixa.empresa_id,
      unidade_id: caixa.unidade_id,
      usuario_id: usuario.id,
      aluno_id: alunoVendaDiretaId,
      status: 'PAGO',
      total: totalVenda,
      origem: 'PDV',
      tipo_beneficiario: 'ALUNO', // Usando ALUNO mesmo sendo venda direta
      caixa_id: caixaId,
    })
    .select('id')
    .single()

  if (pedidoError || !pedido) {
    return { ok: false, erro: pedidoError?.message || 'Erro ao criar pedido' }
  }

  // Criar itens do pedido (produto e kit lanche: data_retirada em todo item; sem data usa hoje)
  const itensInsert = itens.map((item) => ({
    pedido_id: pedido.id,
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
    subtotal: item.subtotal,
    produto_nome: item.produto_nome ?? null,
    variacoes_selecionadas: item.variacoes_selecionadas ?? {},
    opcionais_selecionados: item.opcionais_selecionados ?? [],
    data_retirada: item.data_retirada ?? todayISO(),
  }))

  const { error: itensError } = await supabase.from('pedido_itens').insert(itensInsert)
  if (itensError) {
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    return { ok: false, erro: itensError.message }
  }

  await abaterEstoqueVenda(supabase, itens)

  // Criar registros de pagamento vinculados ao caixa
  const pagamentosInsert = formasPagamento.map((fp) => {
    // Mapear métodos do frontend para o enum do banco
    let metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO' | 'PIX' | 'CARTAO'
    if (fp.metodo === 'DINHEIRO') {
      metodo = 'DINHEIRO'
    } else if (fp.metodo === 'CREDITO') {
      metodo = 'CREDITO'
    } else if (fp.metodo === 'DEBITO') {
      metodo = 'DEBITO'
    } else {
      metodo = 'CARTAO' // Fallback
    }

    return {
      pedido_id: pedido.id,
      caixa_id: caixaId,
      metodo,
      valor: fp.valor,
      status: 'APROVADO' as const, // Pagamentos no PDV são sempre aprovados
      provider_data: fp.troco !== undefined ? { troco: fp.troco } : null,
    }
  })

  const { error: pagamentosError } = await supabase.from('pagamentos').insert(pagamentosInsert)
  if (pagamentosError) {
    await supabase.from('pedido_itens').delete().eq('pedido_id', pedido.id)
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    return { ok: false, erro: `Erro ao registrar movimentação do caixa: ${pagamentosError.message}` }
  }

  return { ok: true, pedidoId: pedido.id }
}

/**
 * Lista pagamentos de um caixa (para fechamento de caixa)
 */
export async function listarPagamentosCaixa(caixaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: pagamentos, error } = await supabase
    .from('pagamentos')
    .select('id, pedido_id, metodo, valor, status, created_at, provider_data')
    .eq('caixa_id', caixaId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Erro ao listar pagamentos:', error)
    throw new Error('Erro ao carregar pagamentos')
  }

  return pagamentos || []
}

/**
 * Obtém resumo de pagamentos por método de um caixa
 */
export async function obterResumoPagamentosCaixa(caixaId: string) {
  const pagamentos = await listarPagamentosCaixa(caixaId)

  const resumo = {
    dinheiro: 0,
    credito: 0,
    debito: 0,
    pix: 0,
    cartao: 0,
    saldo: 0,
    total: 0,
  }

  for (const pagamento of pagamentos) {
    const valor = Number(pagamento.valor)
    resumo.total += valor

    switch (pagamento.metodo) {
      case 'DINHEIRO':
        resumo.dinheiro += valor
        break
      case 'CREDITO':
        resumo.credito += valor
        break
      case 'DEBITO':
        resumo.debito += valor
        break
      case 'PIX':
        resumo.pix += valor
        break
      case 'CARTAO':
        resumo.cartao += valor
        break
      case 'SALDO':
        resumo.saldo += valor
        break
    }
  }

  return resumo
}

/**
 * Buscar colaboradores por nome, email ou RE (para PDV - venda colaborador).
 * Usa admin para listar usuários com papel COLABORADOR da empresa.
 */
export async function buscarColaboradoresPdv(empresaId: string, termo: string): Promise<Array<{ id: string; nome: string | null; email: string | null; re_colaborador: string | null }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  if (!termo || termo.trim().length < 2) {
    return []
  }

  const admin = createAdminClient()
  const { data: papeis } = await admin
    .from('usuario_papeis')
    .select('usuario_id')
    .eq('papel', 'COLABORADOR')
  const idsColab = [...new Set((papeis ?? []).map((p: { usuario_id: string }) => p.usuario_id))]
  if (idsColab.length === 0) return []

  const termoLower = termo.trim().toLowerCase()
  const { data: usuarios, error } = await admin
    .from('usuarios')
    .select('id, nome, email, re_colaborador')
    .eq('empresa_id', empresaId)
    .in('id', idsColab)
    .eq('ativo', true)
    .or(`nome.ilike.%${termoLower}%,email.ilike.%${termoLower}%,re_colaborador.ilike.%${termoLower}%`)
    .order('nome')
    .limit(20)

  if (error || !usuarios) return []
  return usuarios.map((u: any) => ({
    id: u.id,
    nome: u.nome ?? null,
    email: u.email ?? null,
    re_colaborador: u.re_colaborador ?? null,
  }))
}

/**
 * Buscar alunos por nome ou prontuário (para PDV)
 */
export async function buscarAlunosPdv(empresaId: string, termo: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  if (!termo || termo.trim().length < 2) {
    return []
  }

  const termoLower = termo.trim().toLowerCase()

  try {
    const { data: alunos, error } = await supabase
      .from('alunos')
      .select('id, nome, prontuario, situacao, turma_id, turmas:turma_id(id, descricao, segmento)')
      .eq('empresa_id', empresaId)
      .eq('situacao', 'ATIVO')
      .or(`nome.ilike.%${termoLower}%,prontuario.ilike.%${termoLower}%`)
      .order('nome')
      .limit(20)

    if (error) {
      console.error('[buscarAlunosPdv] Erro ao buscar alunos:', {
        message: (error as any).message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      })
      // Não propagar erro para o usuário final: apenas retorna lista vazia
      return []
    }

    // Normalizar turmas: Supabase retorna como array quando há relação, mas queremos objeto único
    const alunosNormalizados = (alunos || []).map((aluno: any) => ({
      ...aluno,
      turmas: Array.isArray(aluno.turmas) ? (aluno.turmas[0] || null) : aluno.turmas,
    }))

    return alunosNormalizados
  } catch (err: any) {
    console.error('[buscarAlunosPdv] Erro inesperado:', err)
    // Em caso de erro inesperado, evitar 500 no PDV e apenas retornar vazio
    return []
  }
}

/**
 * Finaliza venda para aluno (debitando do saldo)
 */
export async function finalizarVendaAluno(
  caixaId: string,
  alunoId: string,
  itens: ItemVenda[]
): Promise<{ ok: boolean; pedidoId?: string; erro?: string }> {
  if (itens.length === 0) {
    return { ok: false, erro: 'Nenhum item na venda' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  // Obter dados do caixa
  const { data: caixa, error: caixaError } = await supabase
    .from('caixas')
    .select('empresa_id, unidade_id, operador_id')
    .eq('id', caixaId)
    .single()

  if (caixaError || !caixa) {
    return { ok: false, erro: 'Caixa não encontrado' }
  }

  // Verificar se aluno existe e pertence à mesma empresa
  const { data: aluno, error: alunoError } = await supabase
    .from('alunos')
    .select('id, empresa_id, unidade_id, nome, prontuario')
    .eq('id', alunoId)
    .eq('empresa_id', caixa.empresa_id)
    .single()

  if (alunoError || !aluno) {
    return { ok: false, erro: 'Aluno não encontrado ou não pertence à empresa do caixa' }
  }

  // Respeitar limite diário e produtos bloqueados pelo responsável
  const configAluno = await obterConfigAlunoParaPdv(alunoId)
  for (const item of itens) {
    if (configAluno.produtos_bloqueados_ids.includes(item.produto_id)) {
      return { ok: false, erro: 'Um ou mais itens estão bloqueados pelo responsável para este aluno. Remova-os da venda.' }
    }
  }
  const totalVenda = itens.reduce((sum, item) => sum + item.subtotal, 0)
  if (configAluno.limite_gasto_diario != null && configAluno.limite_gasto_diario >= 0) {
    const gastoHoje = await obterGastoAlunoHojeParaPdv(alunoId)
    if (gastoHoje + totalVenda > configAluno.limite_gasto_diario) {
      return {
        ok: false,
        erro: `Limite diário do aluno excedido. Limite: R$ ${configAluno.limite_gasto_diario.toFixed(2)}, já gasto hoje: R$ ${gastoHoje.toFixed(2)}, esta venda: R$ ${totalVenda.toFixed(2)}.`,
      }
    }
  }

  // Verificar estoque e visibilidade antes de criar o pedido
  const produtosIds = Array.from(new Set(itens.map((i) => i.produto_id)))
  const { data: produtosEstoque, error: estoqueError } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      estoque,
      visibilidade,
      variacoes:variacoes (
        id,
        valores:variacao_valores (estoque, ativo)
      )
    `)
    .in('id', produtosIds)

  if (estoqueError) {
    console.error('Erro ao verificar estoque:', estoqueError)
    return { ok: false, erro: 'Erro ao verificar estoque dos produtos' }
  }

  for (const item of itens) {
    const produto = (produtosEstoque || []).find((p: any) => p.id === item.produto_id)

    if (!produto) {
      return { ok: false, erro: `Produto ${item.produto_id} não encontrado` }
    }

    // Visibilidade: garantir que o produto ainda pode ser vendido no PDV
    if (produto.visibilidade && produto.visibilidade !== 'CANTINA' && produto.visibilidade !== 'AMBOS') {
      return { ok: false, erro: `Produto ${produto.nome} não está disponível para venda no PDV` }
    }

    // Estoque: se houver estoque por variação, usar soma das variações; senão usar estoque do produto
    let estoqueTotal: number | null = null
    const variacoes = (produto as any).variacoes as any[] | undefined

    if (variacoes && variacoes.length > 0) {
      let soma = 0
      let encontrouAlgum = false
      for (const variacao of variacoes) {
        const valores = (variacao as any).valores as any[] | undefined
        if (!valores) continue
        for (const valor of valores) {
          if (valor && valor.ativo !== false && valor.estoque != null) {
            soma += Number(valor.estoque)
            encontrouAlgum = true
          }
        }
      }
      if (encontrouAlgum) {
        estoqueTotal = soma
      }
    }

    if (estoqueTotal === null) {
      estoqueTotal = produto.estoque != null ? Number(produto.estoque) : null
    }

    if (estoqueTotal !== null && estoqueTotal < item.quantidade) {
      return { ok: false, erro: `Estoque insuficiente para ${produto.nome}` }
    }
  }

  // Verificar saldo do aluno (regras de saldo negativo: global, responsável, ilimitados)
  const saldoAtual = await obterSaldoAluno(alunoId)
  const configSaldoNegativo = await obterConfigCreditoCantinaSaldoNegativo()
  const alunoIlimitado = (configSaldoNegativo.alunos_ilimitados_ids || []).includes(alunoId)

  if (saldoAtual >= totalVenda) {
    // Saldo suficiente — permitir
  } else if (alunoIlimitado) {
    // Aluno na lista de ilimitados — permitir saldo negativo sem limite
  } else if (!configSaldoNegativo.permitir_saldo_negativo) {
    return { ok: false, erro: 'Saldo insuficiente.' }
  } else if (configAluno.bloquear_compra_saldo_negativo) {
    return { ok: false, erro: 'Saldo insuficiente.' }
  } else {
    const limite = configSaldoNegativo.limite_saldo_negativo ?? 0
    const novoSaldo = saldoAtual - totalVenda
    if (novoSaldo < -limite) {
      return {
        ok: false,
        erro: `Saldo insuficiente. Limite de saldo negativo: R$ ${limite.toFixed(2)}. Saldo atual: R$ ${saldoAtual.toFixed(2)}, esta venda: R$ ${totalVenda.toFixed(2)}.`,
      }
    }
  }

  // Obter usuário do operador
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', caixa.operador_id)
    .single()

  if (!usuario) {
    return { ok: false, erro: 'Operador não encontrado' }
  }

  // Agrupar itens por data de retirada (para Kit Lanche Mensal: um pedido por dia).
  const hojeStr = todayISO()
  const itensPorData = new Map<string, ItemVenda[]>()
  for (const item of itens) {
    const data = item.data_retirada ?? hojeStr
    const arr = itensPorData.get(data) ?? []
    // Garantir que cada item do grupo tenha data_retirada preenchida
    arr.push({ ...item, data_retirada: data })
    itensPorData.set(data, arr)
  }

  const pedidosCriados: { id: string; total: number }[] = []

  for (const [dataRetirada, itensDoDia] of itensPorData.entries()) {
    const totalDoDia = itensDoDia.reduce((sum, it) => sum + it.subtotal, 0)

    const { data: pedidoDia, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        empresa_id: caixa.empresa_id,
        unidade_id: caixa.unidade_id,
        usuario_id: usuario.id,
        aluno_id: alunoId,
        status: 'PAGO',
        total: totalDoDia,
        data_retirada: dataRetirada,
        origem: 'PDV',
        tipo_beneficiario: 'ALUNO',
        caixa_id: caixaId,
      })
      .select('id')
      .single()

    if (pedidoError || !pedidoDia) {
      // Rollback de quaisquer pedidos anteriores criados nesta venda
      if (pedidosCriados.length > 0) {
        await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
      }
      return { ok: false, erro: pedidoError?.message || 'Erro ao criar pedido' }
    }

    const itensInsertDia = itensDoDia.map((item) => ({
      pedido_id: pedidoDia.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      subtotal: item.subtotal,
      produto_nome: item.produto_nome ?? null,
      variacoes_selecionadas: item.variacoes_selecionadas ?? {},
      opcionais_selecionados: item.opcionais_selecionados ?? [],
      data_retirada: item.data_retirada ?? dataRetirada,
    }))

    const { error: itensError } = await supabase.from('pedido_itens').insert(itensInsertDia)
    if (itensError) {
      // Rollback: apagar este pedido e quaisquer anteriores
      await supabase.from('pedido_itens').delete().eq('pedido_id', pedidoDia.id)
      await supabase.from('pedidos').delete().eq('id', pedidoDia.id)
      if (pedidosCriados.length > 0) {
        await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
      }
      return { ok: false, erro: itensError.message }
    }

    pedidosCriados.push({ id: pedidoDia.id, total: totalDoDia })
  }

  // Após criar todos os pedidos/itens, abater estoque considerando todos os itens da venda
  await abaterEstoqueVenda(supabase, itens)

  // Debitar saldo do aluno
  const novoSaldo = saldoAtual - totalVenda
  const { error: saldoError } = await supabase
    .from('aluno_saldos')
    .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
    .eq('aluno_id', alunoId)

  if (saldoError) {
    // Rollback: deletar todos os pedidos e itens criados antes de falhar o débito de saldo
    if (pedidosCriados.length > 0) {
      await supabase.from('pedido_itens').delete().in('pedido_id', pedidosCriados.map((p) => p.id))
      await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
    }
    return { ok: false, erro: 'Erro ao debitar saldo: ' + saldoError.message }
  }

  // Criar movimentação no extrato
  const { error: movError } = await supabase.from('aluno_movimentacoes').insert({
    aluno_id: alunoId,
    tipo: 'COMPRA',
    valor: totalVenda,
    pedido_id: pedidosCriados[0]?.id,
    caixa_id: caixaId,
    usuario_id: usuario.id,
    observacao: `Compra no PDV - ${itens.length} item(ns) em ${pedidosCriados.length} pedido(s)`,
  })

  if (movError) {
    console.error('Erro ao criar movimentação:', movError)
    // Não falhar a venda por erro de movimentação, apenas logar
  }

  // Criar pagamento com método SALDO (movimentação do caixa)
  const { error: pagamentoError } = await supabase.from('pagamentos').insert({
    pedido_id: pedidosCriados[0]?.id,
    caixa_id: caixaId,
    metodo: 'SALDO',
    valor: totalVenda,
    status: 'APROVADO',
  })

  if (pagamentoError) {
    await supabase.from('aluno_saldos').update({ saldo: saldoAtual, updated_at: new Date().toISOString() }).eq('aluno_id', alunoId)
    // Remover movimentação de compra vinculada a estes pedidos (se houver)
    if (pedidosCriados.length > 0) {
      await supabase.from('aluno_movimentacoes').delete().in('pedido_id', pedidosCriados.map((p) => p.id))
    }
    // Remover todos os pedidos criados caso o pagamento falhe
    if (pedidosCriados.length > 0) {
      await supabase.from('pedido_itens').delete().in('pedido_id', pedidosCriados.map((p) => p.id))
      await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
    }
    return { ok: false, erro: `Erro ao registrar movimentação do caixa: ${pagamentoError.message}` }
  }

  // Retornar o primeiro pedido criado (demais ficam apenas para controle de retirada)
  return { ok: true, pedidoId: pedidosCriados[0]?.id }
}

/**
 * Finaliza venda para colaborador (sem saldo: consumo lançado para desconto em folha).
 * Cria pedido com colaborador_id, atualiza consumo_colaborador_mensal do mês.
 */
export async function finalizarVendaColaborador(
  caixaId: string,
  colaboradorId: string,
  itens: ItemVenda[]
): Promise<{ ok: boolean; pedidoId?: string; saldoDevedor?: number; erro?: string }> {
  if (itens.length === 0) {
    return { ok: false, erro: 'Nenhum item na venda' }
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  const { data: caixa, error: caixaError } = await supabase
    .from('caixas')
    .select('empresa_id, unidade_id, operador_id')
    .eq('id', caixaId)
    .single()

  if (caixaError || !caixa) {
    return { ok: false, erro: 'Caixa não encontrado' }
  }

  // Colaborador deve existir, ser COLABORADOR e da mesma empresa
  const { data: papeisColab } = await admin
    .from('usuario_papeis')
    .select('usuario_id')
    .eq('papel', 'COLABORADOR')
    .eq('usuario_id', colaboradorId)
  const { data: colaborador } = await admin
    .from('usuarios')
    .select('id, nome, empresa_id')
    .eq('id', colaboradorId)
    .eq('empresa_id', caixa.empresa_id)
    .single()

  if (!papeisColab?.length || !colaborador) {
    return { ok: false, erro: 'Colaborador não encontrado ou não pertence à empresa do caixa' }
  }

  // Verificar estoque e visibilidade (mesmo fluxo do aluno)
  const produtosIds = Array.from(new Set(itens.map((i) => i.produto_id)))
  const { data: produtosEstoque, error: estoqueError } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      estoque,
      visibilidade,
      variacoes:variacoes (
        id,
        valores:variacao_valores (estoque, ativo)
      )
    `)
    .in('id', produtosIds)

  if (estoqueError) {
    console.error('Erro ao verificar estoque:', estoqueError)
    return { ok: false, erro: 'Erro ao verificar estoque dos produtos' }
  }

  for (const item of itens) {
    const produto = (produtosEstoque || []).find((p: any) => p.id === item.produto_id)
    if (!produto) {
      return { ok: false, erro: `Produto ${item.produto_id} não encontrado` }
    }
    if (produto.visibilidade && produto.visibilidade !== 'CANTINA' && produto.visibilidade !== 'AMBOS') {
      return { ok: false, erro: `Produto ${produto.nome} não está disponível para venda no PDV` }
    }
    let estoqueTotal: number | null = null
    const variacoes = (produto as any).variacoes as any[] | undefined
    if (variacoes?.length) {
      let soma = 0
      for (const variacao of variacoes) {
        const valores = (variacao as any).valores as any[] | undefined
        if (!valores) continue
        for (const valor of valores) {
          if (valor?.ativo !== false && valor?.estoque != null) soma += Number(valor.estoque)
        }
      }
      if (soma > 0) estoqueTotal = soma
    }
    if (estoqueTotal === null) estoqueTotal = produto.estoque != null ? Number(produto.estoque) : null
    if (estoqueTotal !== null && estoqueTotal < item.quantidade) {
      return { ok: false, erro: `Estoque insuficiente para ${produto.nome}` }
    }
  }

  const totalVenda = itens.reduce((sum, item) => sum + item.subtotal, 0)

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', caixa.operador_id)
    .single()
  if (!usuario) return { ok: false, erro: 'Operador não encontrado' }

  // Aluno fictício para pedidos tipo COLABORADOR (pedidos exige aluno_id). Usa admin para contornar RLS.
  let alunoColabId: string | null = null
  const { data: alunoExistente } = await admin
    .from('alunos')
    .select('id')
    .eq('empresa_id', caixa.empresa_id)
    .eq('prontuario', 'COLABORADOR')
    .maybeSingle()
  if (alunoExistente) {
    alunoColabId = alunoExistente.id
  } else {
    const { data: turmaPadrao } = await admin
      .from('turmas')
      .select('id')
      .eq('empresa_id', caixa.empresa_id)
      .limit(1)
      .maybeSingle()
    const { data: novoAluno, error: alunoErr } = await admin
      .from('alunos')
      .insert({
        empresa_id: caixa.empresa_id,
        unidade_id: caixa.unidade_id,
        nome: 'Colaborador',
        prontuario: 'COLABORADOR',
        situacao: 'ATIVO',
        turma_id: turmaPadrao?.id || null,
      })
      .select('id')
      .single()
    if (alunoErr || !novoAluno) {
      console.error('[finalizarVendaColaborador] Erro ao criar aluno COLABORADOR:', alunoErr)
      return { ok: false, erro: alunoErr?.message ?? 'Erro ao criar registro de venda colaborador' }
    }
    alunoColabId = novoAluno.id
  }

  // Agrupar itens por data de retirada para criar um pedido por dia (Kit Lanche Mensal, etc.).
  const hojeStr = todayISO()
  const itensPorData = new Map<string, ItemVenda[]>()
  for (const item of itens) {
    const data = item.data_retirada ?? hojeStr
    const arr = itensPorData.get(data) ?? []
    arr.push({ ...item, data_retirada: data })
    itensPorData.set(data, arr)
  }

  const pedidosCriados: { id: string; total: number }[] = []

  for (const [dataRetirada, itensDoDia] of itensPorData.entries()) {
    const totalDoDia = itensDoDia.reduce((sum, it) => sum + it.subtotal, 0)

    const { data: pedidoDia, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        empresa_id: caixa.empresa_id,
        unidade_id: caixa.unidade_id,
        usuario_id: usuario.id,
        aluno_id: alunoColabId,
        colaborador_id: colaboradorId,
        status: 'PAGO',
        total: totalDoDia,
        origem: 'PDV',
        tipo_beneficiario: 'COLABORADOR',
        caixa_id: caixaId,
        data_retirada: dataRetirada,
      })
      .select('id')
      .single()

    if (pedidoError || !pedidoDia) {
      if (pedidosCriados.length > 0) {
        await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
      }
      return { ok: false, erro: pedidoError?.message ?? 'Erro ao criar pedido' }
    }

    const itensInsertDia = itensDoDia.map((item) => ({
      pedido_id: pedidoDia.id,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      subtotal: item.subtotal,
      produto_nome: item.produto_nome ?? null,
      variacoes_selecionadas: item.variacoes_selecionadas ?? {},
      opcionais_selecionados: item.opcionais_selecionados ?? [],
      data_retirada: item.data_retirada ?? dataRetirada,
    }))

    const { error: itensError } = await supabase.from('pedido_itens').insert(itensInsertDia)
    if (itensError) {
      await supabase.from('pedido_itens').delete().eq('pedido_id', pedidoDia.id)
      await supabase.from('pedidos').delete().eq('id', pedidoDia.id)
      if (pedidosCriados.length > 0) {
        await supabase.from('pedidos').delete().in('id', pedidosCriados.map((p) => p.id))
      }
      return { ok: false, erro: itensError.message }
    }

    pedidosCriados.push({ id: pedidoDia.id, total: totalDoDia })
  }

  await abaterEstoqueVenda(supabase, itens)

  // Atualizar consumo_colaborador_mensal (ano/mês atual)
  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1

  const { data: consumoExistente } = await admin
    .from('consumo_colaborador_mensal')
    .select('id, valor_total')
    .eq('usuario_id', colaboradorId)
    .eq('empresa_id', caixa.empresa_id)
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle()

  if (consumoExistente) {
    const novoValor = Number(consumoExistente.valor_total) + totalVenda
    const { error: updErr } = await admin
      .from('consumo_colaborador_mensal')
      .update({ valor_total: novoValor, updated_at: new Date().toISOString() })
      .eq('id', consumoExistente.id)
    if (updErr) {
      console.error('Erro ao atualizar consumo_colaborador_mensal:', updErr)
      // Não desfaz pedido; RH pode corrigir manualmente
    }
  } else {
    const { error: insErr } = await admin
      .from('consumo_colaborador_mensal')
      .insert({
        usuario_id: colaboradorId,
        empresa_id: caixa.empresa_id,
        ano,
        mes,
        valor_total: totalVenda,
        valor_abatido: 0,
      })
    if (insErr) {
      console.error('Erro ao inserir consumo_colaborador_mensal:', insErr)
    }
  }

  const { data: consumos } = await admin
    .from('consumo_colaborador_mensal')
    .select('valor_total, valor_abatido')
    .eq('usuario_id', colaboradorId)
  const saldoDevedor = (consumos || []).reduce(
    (s, r) => s + Number(r.valor_total) - Number(r.valor_abatido),
    0
  )

  return { ok: true, pedidoId: pedidosCriados[0]?.id, saldoDevedor }
}

/**
 * Recarga presencial: adiciona saldo ao aluno com pagamento no caixa
 */
export async function recargaPresencialAluno(
  caixaId: string,
  alunoId: string,
  valor: number,
  formaPagamento: FormaPagamento
): Promise<{ ok: boolean; erro?: string }> {
  if (valor <= 0) {
    return { ok: false, erro: 'Valor deve ser positivo' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Não autenticado' }

  // Obter dados do caixa
  const { data: caixa, error: caixaError } = await supabase
    .from('caixas')
    .select('empresa_id, unidade_id, operador_id')
    .eq('id', caixaId)
    .single()

  if (caixaError || !caixa) {
    return { ok: false, erro: 'Caixa não encontrado' }
  }

  // Verificar se aluno existe e pertence à mesma empresa
  const { data: aluno, error: alunoError } = await supabase
    .from('alunos')
    .select('id, empresa_id')
    .eq('id', alunoId)
    .eq('empresa_id', caixa.empresa_id)
    .single()

  if (alunoError || !aluno) {
    return { ok: false, erro: 'Aluno não encontrado ou não pertence à empresa do caixa' }
  }

  // Obter usuário do operador
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', caixa.operador_id)
    .single()

  if (!usuario) {
    return { ok: false, erro: 'Operador não encontrado' }
  }

  // Incremento atômico de saldo (evita duplicate key e race)
  const { error: saldoError } = await supabase.rpc('incrementar_saldo_aluno', {
    p_aluno_id: alunoId,
    p_valor: valor,
  })
  if (saldoError) {
    return { ok: false, erro: 'Erro ao atualizar saldo: ' + saldoError.message }
  }

  // Criar movimentação no extrato (RECARGA_PRESENCIAL)
  const { error: movError } = await supabase.from('aluno_movimentacoes').insert({
    aluno_id: alunoId,
    tipo: 'RECARGA_PRESENCIAL',
    valor,
    caixa_id: caixaId,
    usuario_id: usuario.id,
    observacao: `Recarga presencial - ${formaPagamento.metodo}`,
  })

  if (movError) {
    // Rollback: reverter saldo (subtrair o valor que acabamos de somar)
    const saldoAtual = await obterSaldoAluno(alunoId)
    await supabase
      .from('aluno_saldos')
      .update({ saldo: Math.max(0, saldoAtual - valor), updated_at: new Date().toISOString() })
      .eq('aluno_id', alunoId)
    return { ok: false, erro: 'Erro ao criar movimentação: ' + movError.message }
  }

  // Criar pedido especial para recarga (sem itens, apenas para vincular pagamento)
  const { data: pedidoRecarga, error: pedidoError } = await supabase
    .from('pedidos')
    .insert({
      empresa_id: caixa.empresa_id,
      unidade_id: caixa.unidade_id,
      usuario_id: usuario.id,
      aluno_id: alunoId,
      status: 'PAGO',
      total: valor,
      origem: 'PDV',
      tipo_beneficiario: 'ALUNO',
      caixa_id: caixaId,
    })
    .select('id')
    .single()

  if (pedidoError || !pedidoRecarga) {
    // Rollback: reverter saldo e movimentação
    const saldoAgora = await obterSaldoAluno(alunoId)
    await supabase
      .from('aluno_saldos')
      .update({ saldo: Math.max(0, saldoAgora - valor), updated_at: new Date().toISOString() })
      .eq('aluno_id', alunoId)
    // Deletar movimentação criada (a mais recente)
    const { data: movs } = await supabase
      .from('aluno_movimentacoes')
      .select('id')
      .eq('aluno_id', alunoId)
      .eq('tipo', 'RECARGA_PRESENCIAL')
      .eq('valor', valor)
      .order('created_at', { ascending: false })
      .limit(1)
    if (movs && movs.length > 0) {
      await supabase.from('aluno_movimentacoes').delete().eq('id', movs[0].id)
    }
    return { ok: false, erro: 'Erro ao criar registro de recarga: ' + pedidoError?.message }
  }

  // Criar pagamento
  let metodoPagamento: 'DINHEIRO' | 'CREDITO' | 'DEBITO'
  if (formaPagamento.metodo === 'DINHEIRO') {
    metodoPagamento = 'DINHEIRO'
  } else if (formaPagamento.metodo === 'CREDITO') {
    metodoPagamento = 'CREDITO'
  } else {
    metodoPagamento = 'DEBITO'
  }

  const { error: pagamentoError } = await supabase.from('pagamentos').insert({
    pedido_id: pedidoRecarga.id,
    caixa_id: caixaId,
    metodo: metodoPagamento,
    valor: formaPagamento.valor,
    status: 'APROVADO',
    provider_data: formaPagamento.troco !== undefined ? { troco: formaPagamento.troco } : null,
  })

  if (pagamentoError) {
    const saldoAgora = await obterSaldoAluno(alunoId)
    await supabase.from('aluno_saldos').update({ saldo: Math.max(0, saldoAgora - valor), updated_at: new Date().toISOString() }).eq('aluno_id', alunoId)
    const { data: movs } = await supabase.from('aluno_movimentacoes').select('id').eq('aluno_id', alunoId).eq('tipo', 'RECARGA_PRESENCIAL').eq('valor', valor).order('created_at', { ascending: false }).limit(1)
    if (movs?.length) await supabase.from('aluno_movimentacoes').delete().eq('id', movs[0].id)
    await supabase.from('pedidos').delete().eq('id', pedidoRecarga.id)
    return { ok: false, erro: `Erro ao registrar movimentação do caixa: ${pagamentoError.message}` }
  }

  return { ok: true }
}

/** Tipo de transação do caixa para relatório */
export type TipoTransacaoCaixa = 'VENDA_DIRETA' | 'VENDA_ALUNO' | 'VENDA_COLABORADOR' | 'RECARGA'

/** Item para comprovante (reimpressão) */
export interface ItemComprovanteRelatorio {
  produto_nome: string
  quantidade: number
  preco_unitario: number
  subtotal: number
  variacoes_selecionadas?: Record<string, string> | null
  data_retirada?: string | null
}

/** Forma de pagamento para comprovante */
export interface FormaPagamentoRelatorio {
  metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO'
  valor: number
  troco?: number
}

/** Registro de venda/recarga do dia para relatório e reimpressão */
export interface VendaDiaCaixa {
  id: string
  created_at: string
  total: number
  tipo: TipoTransacaoCaixa
  aluno_nome: string | null
  /** Dados para abrir ComprovanteModal (reimprimir) */
  comprovante: {
    tipo: 'DIRETA' | 'ALUNO' | 'COLABORADOR'
    dataHora: string
    itens: ItemComprovanteRelatorio[]
    total: number
    formasPagamento: FormaPagamentoRelatorio[]
    alunoNome?: string
    pedidoId: string
  }
}

/**
 * Lista todas as vendas e recargas do dia do caixa atual (para relatório e reimpressão de comprovante).
 */
export async function listarVendasDiaCaixa(caixaId: string): Promise<VendaDiaCaixa[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const isoStart = startOfDay.toISOString()
  const isoEnd = endOfDay.toISOString()

  const { data: pedidos, error: errPedidos } = await supabase
    .from('pedidos')
    .select(`
      id,
      created_at,
      total,
      aluno_id,
      colaborador_id,
      tipo_beneficiario,
      alunos:aluno_id ( nome, prontuario )
    `)
    .eq('caixa_id', caixaId)
    .eq('status', 'PAGO')
    .gte('created_at', isoStart)
    .lte('created_at', isoEnd)
    .order('created_at', { ascending: false })

  if (errPedidos) {
    console.error('Erro ao listar pedidos do dia:', errPedidos)
    throw new Error('Erro ao carregar vendas do dia')
  }

  if (!pedidos || pedidos.length === 0) {
    return []
  }

  // Buscar nomes dos alunos e colaboradores via admin (evita RLS no join; política em usuarios causaria recursão)
  const admin = createAdminClient()
  const alunoIds = Array.from(
    new Set(
      (pedidos as Array<{ aluno_id: string | null }>)
        .map((p) => p.aluno_id)
        .filter((id): id is string => !!id)
    )
  )
  const colaboradorIds = Array.from(
    new Set(
      (pedidos as Array<{ colaborador_id: string | null }>)
        .map((p) => p.colaborador_id)
        .filter((id): id is string => !!id)
    )
  )
  const mapaAlunos = new Map<string, { nome: string | null; prontuario: string | null }>()
  const mapaColaboradores = new Map<string, string | null>()
  if (alunoIds.length > 0) {
    try {
      const { data: alunosAdmin } = await admin
        .from('alunos')
        .select('id, nome, prontuario')
        .in('id', alunoIds)

      for (const a of (alunosAdmin || []) as Array<{ id: string; nome: string | null; prontuario: string | null }>) {
        mapaAlunos.set(a.id, { nome: a.nome, prontuario: a.prontuario })
      }
    } catch {
      // Se falhar, segue apenas com o que vier do join normal
    }
  }
  if (colaboradorIds.length > 0) {
    try {
      const { data: colabsAdmin } = await admin
        .from('usuarios')
        .select('id, nome')
        .in('id', colaboradorIds)
      for (const c of (colabsAdmin || []) as Array<{ id: string; nome: string | null }>) {
        mapaColaboradores.set(c.id, c.nome ?? null)
      }
    } catch {
      // Se falhar, nome do colaborador fica em branco
    }
  }

  // Buscar todos os itens e pagamentos de uma vez (evita N+1: 2 queries em vez de 2 por pedido)
  const pedidoIds = (pedidos as Array<{ id: string }>).map((p) => p.id)
  type ItemRow = {
    pedido_id: string
    produto_nome: string | null
    quantidade: number
    preco_unitario: number
    subtotal: number
    variacoes_selecionadas: Record<string, string> | null
    data_retirada: string | null
  }
  type PagamentoRow = { pedido_id: string; metodo: string; valor: number; provider_data: { troco?: number } | null }
  const itensPorPedido = new Map<string, ItemRow[]>()
  const pagamentosPorPedido = new Map<string, PagamentoRow[]>()
  if (pedidoIds.length > 0) {
    const [resItens, resPagamentos] = await Promise.all([
      supabase
        .from('pedido_itens')
        .select('pedido_id, produto_nome, quantidade, preco_unitario, subtotal, variacoes_selecionadas, data_retirada')
        .in('pedido_id', pedidoIds)
        .order('pedido_id')
        .order('id'),
      supabase
        .from('pagamentos')
        .select('pedido_id, metodo, valor, provider_data')
        .in('pedido_id', pedidoIds),
    ])
    for (const i of (resItens.data || []) as ItemRow[]) {
      const list = itensPorPedido.get(i.pedido_id) ?? []
      list.push(i)
      itensPorPedido.set(i.pedido_id, list)
    }
    for (const pg of (resPagamentos.data || []) as PagamentoRow[]) {
      const list = pagamentosPorPedido.get(pg.pedido_id) ?? []
      list.push(pg)
      pagamentosPorPedido.set(pg.pedido_id, list)
    }
  }

  const resultado: VendaDiaCaixa[] = []

  for (const p of pedidos as Array<{
    id: string
    created_at: string
    total: number
    aluno_id: string | null
    colaborador_id: string | null
    tipo_beneficiario: string | null
    alunos: { nome: string; prontuario: string }[] | null
  }>) {
    const alunoInfoAdmin = p.aluno_id ? mapaAlunos.get(p.aluno_id) : null
    const alunoNome = p.alunos?.[0]?.nome ?? alunoInfoAdmin?.nome ?? null
    const alunoProntuario = p.alunos?.[0]?.prontuario ?? alunoInfoAdmin?.prontuario ?? null
    const colabNome = p.colaborador_id ? mapaColaboradores.get(p.colaborador_id) ?? null : null

    const itensList = (itensPorPedido.get(p.id) || []) as Array<{
      produto_nome: string | null
      quantidade: number
      preco_unitario: number
      subtotal: number
      variacoes_selecionadas: Record<string, string> | null
      data_retirada: string | null
    }>
    const pagamentosList = (pagamentosPorPedido.get(p.id) || []) as Array<{
      metodo: string
      valor: number
      provider_data: { troco?: number } | null
    }>

    let tipo: TipoTransacaoCaixa = 'VENDA_DIRETA'
    if (itensList.length === 0) {
      tipo = 'RECARGA'
    } else if (p.tipo_beneficiario === 'COLABORADOR') {
      tipo = 'VENDA_COLABORADOR'
    } else if (p.tipo_beneficiario === 'ALUNO') {
      // Distinguir claramente:
      // - Prontuário especial "VENDA_DIRETA" => venda direta de balcão
      // - Demais prontuários => sempre tratar como venda de aluno,
      //   mesmo que o join com alunos venha nulo por RLS ou não haja pagamento SALDO vinculado.
      if (alunoProntuario === 'VENDA_DIRETA') {
        tipo = 'VENDA_DIRETA'
      } else {
        tipo = 'VENDA_ALUNO'
      }
    }

    const formasPagamento: FormaPagamentoRelatorio[] = pagamentosList
      .filter((pg) => ['DINHEIRO', 'CREDITO', 'DEBITO'].includes(pg.metodo))
      .map((pg) => {
        let metodo: 'DINHEIRO' | 'CREDITO' | 'DEBITO' = 'DINHEIRO'
        if (pg.metodo === 'CREDITO') metodo = 'CREDITO'
        else if (pg.metodo === 'DEBITO') metodo = 'DEBITO'
        else if (pg.metodo === 'DINHEIRO') metodo = 'DINHEIRO'
        return {
          metodo,
          valor: Number(pg.valor),
          troco: (pg.provider_data as { troco?: number } | null)?.troco,
        }
      })

    const itensComprovante: ItemComprovanteRelatorio[] =
      tipo === 'RECARGA'
        ? [
            {
              produto_nome: 'Recarga de saldo',
              quantidade: 1,
              preco_unitario: Number(p.total),
              subtotal: Number(p.total),
            },
          ]
        : itensList.map((i) => ({
            produto_nome: i.produto_nome ?? 'Produto',
            quantidade: i.quantidade,
            preco_unitario: Number(i.preco_unitario),
            subtotal: Number(i.subtotal),
            variacoes_selecionadas: i.variacoes_selecionadas ?? null,
            data_retirada: i.data_retirada ?? null,
          }))

    const comprovanteTipo: 'DIRETA' | 'ALUNO' | 'COLABORADOR' =
      tipo === 'VENDA_COLABORADOR' ? 'COLABORADOR' : tipo === 'VENDA_ALUNO' ? 'ALUNO' : 'DIRETA'
    const comprovanteBeneficiarioNome =
      tipo === 'VENDA_COLABORADOR'
        ? (colabNome ?? undefined)
        : tipo === 'VENDA_ALUNO'
          ? (alunoNome ?? undefined)
          : undefined

    resultado.push({
      id: p.id,
      created_at: p.created_at,
      total: Number(p.total),
      tipo,
      aluno_nome:
        tipo === 'VENDA_COLABORADOR'
          ? colabNome
          : tipo === 'VENDA_ALUNO' || tipo === 'RECARGA'
            ? alunoNome
            : null,
      comprovante: {
        tipo: comprovanteTipo,
        dataHora: p.created_at,
        itens: itensComprovante,
        total: Number(p.total),
        formasPagamento,
        alunoNome: comprovanteBeneficiarioNome,
        pedidoId: p.id,
      },
    })
  }

  return resultado
}
