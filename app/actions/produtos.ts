'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { ProdutoComDisponibilidade, ProdutoCompleto, KitItem, Aluno } from '@/lib/types/database'
import { obterDiasUteis } from '@/app/actions/dias-uteis'

const alunoIdSchema = z.string().uuid().optional()

// Nova função: buscar produtos disponíveis para TODOS os alunos do responsável
export async function getProdutosDisponiveisParaResponsavel(): Promise<ProdutoComDisponibilidade[]> {
  try {
    const supabase = await createClient()
    console.log('[getProdutosDisponiveisParaResponsavel] Iniciando...')

    // 1. Verificar autenticação
    const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

    console.log('[getProdutosDisponiveisParaResponsavel] Buscando responsável para user.id:', user.id, 'email:', user.email)
    
    // Primeiro tentar buscar por auth_user_id
    let responsavel: any = null
    let responsavelError: any = null
    
    const { data: respPorAuth, error: errorAuth } = await supabase
      .from('usuarios')
      .select('id, auth_user_id, ativo')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (errorAuth) {
      console.error('[getProdutosDisponiveisParaResponsavel] Erro ao buscar por auth_user_id:', errorAuth)
      responsavelError = errorAuth
    } else if (respPorAuth) {
      responsavel = respPorAuth
    }

    // Se não encontrou por auth_user_id, tentar buscar por email
    if (!responsavel && user.email) {
      console.log('[getProdutosDisponiveisParaResponsavel] Tentando buscar por email:', user.email)
      
      const { data: respPorEmail, error: errorEmail } = await supabase
        .from('usuarios')
        .select('id, email_financeiro, email_pedagogico, auth_user_id, ativo')
        .or(`email_financeiro.eq.${user.email},email_pedagogico.eq.${user.email}`)
        .maybeSingle()

      if (errorEmail) {
        console.error('[getProdutosDisponiveisParaResponsavel] Erro ao buscar por email:', errorEmail)
        if (!responsavelError) {
          responsavelError = errorEmail
        }
      } else if (respPorEmail) {
        console.log('[getProdutosDisponiveisParaResponsavel] Responsável encontrado por email, mas sem auth_user_id vinculado')
        console.log('[getProdutosDisponiveisParaResponsavel] Responsável ID:', respPorEmail.id, 'auth_user_id:', respPorEmail.auth_user_id)
        
        // Se encontrou por email mas não tem auth_user_id, tentar vincular
        if (!respPorEmail.auth_user_id) {
          const { error: updateError } = await supabase
            .from('usuarios')
            .update({ auth_user_id: user.id })
            .eq('id', respPorEmail.id)

          if (updateError) {
            console.error('[getProdutosDisponiveisParaResponsavel] Erro ao vincular auth_user_id:', updateError)
            throw new Error('Responsável encontrado mas não foi possível vincular à conta. Entre em contato com o suporte.')
          }
          
          console.log('[getProdutosDisponiveisParaResponsavel] auth_user_id vinculado com sucesso!')
          responsavel = { ...respPorEmail, auth_user_id: user.id }
        } else {
          // Se tem auth_user_id mas é diferente, não pode usar
          throw new Error('Este email já está vinculado a outra conta.')
        }
      }
    }

    if (responsavelError && !responsavel) {
      console.error('[getProdutosDisponiveisParaResponsavel] Erro ao buscar responsável:', responsavelError)
      throw new Error(`Erro ao buscar responsável: ${responsavelError.message || 'Erro desconhecido'}`)
    }

    if (!responsavel) {
      console.log('[getProdutosDisponiveisParaResponsavel] Responsável não encontrado para user.id:', user.id, 'email:', user.email)
      throw new Error('Responsável não encontrado. Verifique se seu email está cadastrado como responsável ou solicite primeiro acesso.')
    }

    if (!responsavel.ativo) {
      throw new Error('Sua conta está inativa. Entre em contato com a administração.')
    }

    console.log('[getProdutosDisponiveisParaResponsavel] Responsável encontrado:', responsavel.id)

    // 2. Buscar todos os alunos vinculados
    const { data: vinculos } = await supabase
      .from('usuario_aluno')
      .select('aluno_id')
      .eq('usuario_id', responsavel.id)

    if (!vinculos || vinculos.length === 0) {
      return []
    }

    const alunoIds = vinculos.map(v => v.aluno_id)

    // 3. Buscar dados dos alunos
    const { data: alunos } = await supabase
      .from('alunos')
      .select('id, nome, empresa_id, unidade_id, turma_id')
      .in('id', alunoIds)
      .eq('situacao', 'ATIVO')

      const alunosTyped = (alunos || []) as Pick<Aluno, 'id' | 'nome' | 'empresa_id' | 'unidade_id' | 'turma_id'>[]

      if (alunosTyped.length === 0) {
        return []
      }
      
    // Buscar turmas e segmentos separadamente
    const turmasIds = alunosTyped.map(a => a.turma_id).filter(Boolean) as string[]
    let turmas: any[] = []
    
    if (turmasIds.length > 0) {
      const { data: turmasData } = await supabase
        .from('turmas')
        .select('id, tipo_curso, segmento')
        .in('id', turmasIds)
      turmas = turmasData || []
    }

    const turmaSegmentoMap = new Map(
      turmas.map((t: { id: string; tipo_curso?: string | null; segmento?: string | null }) => [
        t.id,
        (t.tipo_curso && t.tipo_curso.trim()) || (t.segmento != null ? String(t.segmento).trim() : null),
      ])
    )

    // Normalizar turma_id para comparação (UUID pode vir em maiúsculas/minúsculas; garantir string)
    const turmasIdsLower = turmasIds.map((id) => String(id ?? '').trim().toLowerCase()).filter(Boolean)

    // 4. Coletar empresas e unidades únicas
    const empresasIds = [...new Set(alunosTyped.map(a => a.empresa_id))]
    const unidadesIds = alunosTyped.map(a => a.unidade_id).filter(Boolean) as string[]
    const alunosSemUnidade = alunosTyped.some(a => !a.unidade_id)
    const segmentos = alunosTyped
      .map((a) => turmaSegmentoMap.get(a.turma_id || ''))
      .filter(Boolean)
      .map((s) => (typeof s === 'string' ? s.trim() : String(s)).trim()) as string[]

    // 5. Buscar produtos das empresas/unidades dos alunos
    // Buscar produtos da empresa (sem filtro de unidade primeiro, depois filtrar no código)
    const { data: produtosRaw, error: produtosError } = await supabase
      .from('produtos')
      .select('id, empresa_id, unidade_id, tipo, nome, descricao, preco, estoque, compra_unica, limite_max_compra_unica, permitir_pix, permitir_cartao, ativo, imagem_url, sku, categoria_id, grupo_id, ordem, tipo_kit, desconto_kit_mensal_pct, visibilidade, created_at, updated_at, categoria:categorias(id, nome, ordem)')
      .eq('ativo', true)
      .in('empresa_id', empresasIds)

    if (produtosError) {
      console.error('Erro ao buscar produtos:', produtosError)
      return []
    }

    if (!produtosRaw || produtosRaw.length === 0) {
      return []
    }

    // Filtrar produtos por unidade no código
    // Regra: 
    // - Produto sem unidade (null) está disponível para TODOS os alunos da empresa
    // - Produto com unidade específica está disponível se:
    //   a) Algum aluno tem essa mesma unidade, OU
    //   b) Todos os alunos não têm unidade (null) - nesse caso, produto com unidade também aparece (assumindo que são da mesma empresa)
    console.log('[getProdutosDisponiveisParaResponsavel] Produtos brutos encontrados:', produtosRaw.length)
    console.log('[getProdutosDisponiveisParaResponsavel] Unidades dos alunos:', unidadesIds)
    console.log('[getProdutosDisponiveisParaResponsavel] Alunos sem unidade:', alunosSemUnidade)
    
    const produtos = produtosRaw.filter((p: any) => {
      // Visibilidade: APP mostra apenas produtos APP ou AMBOS (não CONSUMO_INTERNO sozinho)
      if (p.visibilidade === 'CONSUMO_INTERNO') return false
      if (p.visibilidade && p.visibilidade !== 'APP' && p.visibilidade !== 'AMBOS') {
        return false
      }
      // Se produto não tem unidade, está disponível para todos
      if (!p.unidade_id) {
        console.log(`[getProdutosDisponiveisParaResponsavel] Produto "${p.nome}" sem unidade - DISPONÍVEL`)
        return true
      }
      // Se produto tem unidade, verificar se algum aluno tem essa unidade
      if (unidadesIds.includes(p.unidade_id)) {
        console.log(`[getProdutosDisponiveisParaResponsavel] Produto "${p.nome}" com unidade ${p.unidade_id} - DISPONÍVEL (aluno tem essa unidade)`)
        return true
      }
      // Se todos os alunos não têm unidade (null), produto com unidade também aparece (mesma empresa)
      if (alunosSemUnidade && unidadesIds.length === 0) {
        console.log(`[getProdutosDisponiveisParaResponsavel] Produto "${p.nome}" com unidade ${p.unidade_id} - DISPONÍVEL (alunos sem unidade, mesma empresa)`)
        return true
      }
      console.log(`[getProdutosDisponiveisParaResponsavel] Produto "${p.nome}" com unidade ${p.unidade_id} - NÃO DISPONÍVEL`)
      return false
    })

    console.log('[getProdutosDisponiveisParaResponsavel] Produtos após filtro de unidade:', produtos.length)

    if (produtos.length === 0) {
      console.log('[getProdutosDisponiveisParaResponsavel] Nenhum produto passou no filtro de unidade')
      return []
    }

    // 6. IDs disponíveis via RPC (uma chamada; evita truncamento e milhares de linhas de produto_disponibilidade)
    const agora = new Date()
    let produtosFiltradosPorDisponibilidade: any[]
    let produtoIdsDisponiveis: string[]
    let disponibilidades: any[]

    const { data: idsDisponiveisRpc, error: rpcError } = await supabase.rpc('produtos_disponiveis_ids_responsavel')
    const idsDisponiveisSet = new Set<string>(
      (idsDisponiveisRpc ?? []).map((id: string) => String(id).trim().toLowerCase())
    )

    if (rpcError) {
      console.warn('[getProdutosDisponiveisParaResponsavel] RPC falhou, usando filtro em memória (aplique migration 079):', rpcError.message)
      const allIds = produtos.map((p: any) => p.id)
      const CHUNK = 80
      const dispList: any[] = []
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK)
        const { data: chunkData } = await supabase.from('produto_disponibilidade').select('*').in('produto_id', chunk).limit(5000)
        if (chunkData?.length) dispList.push(...chunkData)
      }
      const filtered: any[] = []
      for (const produto of produtos) {
        const dispProd = dispList.filter((d: any) => d.produto_id === produto.id)
        let ok = dispProd.length === 0
        if (!ok) {
          const todos = dispProd.find((d: any) => d.tipo === 'TODOS')
          if (todos && (!todos.disponivel_de || agora >= new Date(todos.disponivel_de)) && (!todos.disponivel_ate || agora <= new Date(todos.disponivel_ate))) ok = true
          for (const aluno of alunosTyped) {
            if (ok) break
            for (const d of dispProd) {
              if (d.tipo === 'TODOS') continue
              if (d.disponivel_de && agora < new Date(d.disponivel_de)) continue
              if (d.disponivel_ate && agora > new Date(d.disponivel_ate)) continue
              if (d.tipo === 'SEGMENTO' && d.segmento?.trim() && segmentos.some((s: string) => s.trim().toLowerCase() === String(d.segmento).trim().toLowerCase())) { ok = true; break }
              if (d.tipo === 'TURMA' && d.turma_id && turmasIdsLower.includes(String(d.turma_id).trim().toLowerCase())) { ok = true; break }
              if (d.tipo === 'ALUNO' && d.aluno_id && String(d.aluno_id).trim().toLowerCase() === String(aluno.id).trim().toLowerCase()) { ok = true; break }
            }
          }
        }
        if (ok) filtered.push(produto)
      }
      produtosFiltradosPorDisponibilidade = filtered
      produtoIdsDisponiveis = filtered.map((p: any) => p.id)
      disponibilidades = dispList
    } else {
      produtosFiltradosPorDisponibilidade = produtos.filter((p: any) => idsDisponiveisSet.has(String(p.id).trim().toLowerCase()))
      if (produtosFiltradosPorDisponibilidade.length === 0) {
        console.log('[getProdutosDisponiveisParaResponsavel] Nenhum produto disponível para os filhos do responsável (RPC)')
        return []
      }
      produtoIdsDisponiveis = produtosFiltradosPorDisponibilidade.map((p: any) => p.id)
      const CHUNK = 80
      const disponibilidadesList: any[] = []
      for (let i = 0; i < produtoIdsDisponiveis.length; i += CHUNK) {
        const chunk = produtoIdsDisponiveis.slice(i, i + CHUNK)
        const { data: chunkData } = await supabase.from('produto_disponibilidade').select('*').in('produto_id', chunk).limit(5000)
        if (chunkData?.length) disponibilidadesList.push(...chunkData)
      }
      disponibilidades = disponibilidadesList
    }

    // 8. Preço "a partir de": buscar variações e valor mínimo por produto
    const { data: variacoesRaw } = await supabase
      .from('variacoes')
      .select('id, produto_id')
      .in('produto_id', produtoIdsDisponiveis)
    const variacaoIds = (variacoesRaw || []).map((v: { id: string }) => v.id)
    const { data: valoresRaw } = variacaoIds.length > 0
      ? await supabase
          .from('variacao_valores')
          .select('variacao_id, preco_adicional, estoque')
          .in('variacao_id', variacaoIds)
      : { data: [] as { variacao_id: string; preco_adicional: number; estoque: number | null }[] }
    const variacaoPorId = new Map((variacoesRaw || []).map((v: any) => [v.id, v]))
    const minAdicionalPorVariacao = new Map<string, number>()
    const produtoIdsComEstoqueEmVariacao = new Set<string>()
    for (const val of valoresRaw || []) {
      const atual = minAdicionalPorVariacao.get(val.variacao_id)
      const p = Number(val.preco_adicional)
      if (atual === undefined || p < atual) minAdicionalPorVariacao.set(val.variacao_id, p)
      const est = (val as { estoque?: number | null }).estoque
      if (est === null || est === undefined || est > 0) {
        const variacao = variacaoPorId.get(val.variacao_id) as { produto_id?: string } | undefined
        if (variacao?.produto_id) produtoIdsComEstoqueEmVariacao.add(variacao.produto_id)
      }
    }
    const precoMinBasePorProduto = new Map<string, number>()
    for (const p of produtosFiltradosPorDisponibilidade) {
      const base = Number(p.preco)
      let adicionar = 0
      for (const v of variacoesRaw || []) {
        if ((v as any).produto_id !== p.id) continue
        const minVal = minAdicionalPorVariacao.get(v.id)
        if (minVal !== undefined) adicionar += minVal
      }
      precoMinBasePorProduto.set(p.id, base + adicionar)
    }
    const hoje = new Date()
    const proximoMes = hoje.getMonth() + 2
    const proximoAno = proximoMes > 12 ? hoje.getFullYear() + 1 : hoje.getFullYear()
    const proximoMesNorm = proximoMes > 12 ? 1 : proximoMes
    const empresasKitMensal = [...new Set(
      produtosFiltradosPorDisponibilidade
        .filter((p: any) => p.tipo === 'KIT_LANCHE' && p.tipo_kit === 'MENSAL')
        .map((p: any) => p.empresa_id)
    )] as string[]
    const diasUteisProximoMesPorEmpresa = new Map<string, number>()
    await Promise.all(empresasKitMensal.map(async (empresaId) => {
      const dias = await obterDiasUteis(empresaId, proximoAno, proximoMesNorm)
      diasUteisProximoMesPorEmpresa.set(empresaId, dias)
    }))

    // 9. Montar lista final: produtos já filtrados pela RPC + disponibilidades, preço e tem_estoque
    const produtosDisponiveis: ProdutoComDisponibilidade[] = produtosFiltradosPorDisponibilidade.map((produto: any) => {
      const disponibilidadesProduto = (disponibilidades || []).filter((d: any) => d.produto_id === produto.id)
      const precoMinBase = precoMinBasePorProduto.get(produto.id) ?? Number(produto.preco)
      let precoAPartirDe: number
      if (produto.tipo === 'KIT_LANCHE' && produto.tipo_kit === 'MENSAL') {
        const dias = diasUteisProximoMesPorEmpresa.get(produto.empresa_id) ?? 0
        const desconto = Number(produto.desconto_kit_mensal_pct ?? 0) / 100
        precoAPartirDe = precoMinBase * dias * (1 - desconto)
      } else {
        precoAPartirDe = precoMinBase
      }
      const estoqueProduto = Number(produto.estoque ?? 0)
      const temEstoqueVariacao = produtoIdsComEstoqueEmVariacao.has(produto.id)
      const tem_estoque = estoqueProduto > 0 || temEstoqueVariacao
      return {
        ...produto,
        disponibilidades: disponibilidadesProduto,
        preco_a_partir_de: precoAPartirDe,
        tem_estoque
      }
    })

    console.log('[getProdutosDisponiveisParaResponsavel] Sucesso:', produtosDisponiveis.length, 'produtos (via RPC)')
    return produtosDisponiveis
  } catch (error: any) {
    console.error('[getProdutosDisponiveisParaResponsavel] Erro completo:', error)
    console.error('[getProdutosDisponiveisParaResponsavel] Mensagem:', error?.message)
    console.error('[getProdutosDisponiveisParaResponsavel] Stack:', error?.stack)
    // Retornar array vazio em caso de erro ao invés de quebrar
    return []
  }
}

// Função original mantida para compatibilidade (usar no carrinho)
export async function getProdutosDisponiveis(alunoId: string): Promise<ProdutoComDisponibilidade[]> {
  const validatedAlunoId = alunoIdSchema.parse(alunoId)
  if (!validatedAlunoId) {
    throw new Error('Aluno ID é obrigatório')
  }

  const supabase = await createClient()

  // 1. Verificar se o aluno existe e obter dados
  const { data: aluno, error: alunoError } = await supabase
    .from('alunos')
    .select('id, empresa_id, unidade_id, turma_id')
    .eq('id', validatedAlunoId)
    .single()

  if (alunoError || !aluno) {
    throw new Error('Aluno não encontrado')
  }

  // 2. Verificar se o responsável tem acesso a este aluno
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  const { data: responsavel } = await supabase
  .from('usuarios')
  .select('id, ativo')
  .eq('auth_user_id', user.id)
  .maybeSingle()

if (!responsavel) {
  throw new Error('Responsável não encontrado')
}

if (!responsavel.ativo) {
  throw new Error('Sua conta está inativa. Entre em contato com a administração.')
}


  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
      .eq('usuario_id', responsavel.id)
    .eq('aluno_id', validatedAlunoId)
    .single()

  if (!vinculo) {
    throw new Error('Acesso negado: aluno não vinculado ao responsável')
  }

  // 3. Obter dados da turma: segmento para disponibilidade vem de tipo_curso (fallback segmento)
  let segmento: string | null = null
  if (aluno.turma_id) {
    const { data: turma } = await supabase
      .from('turmas')
      .select('tipo_curso, segmento')
      .eq('id', aluno.turma_id)
      .single()
    
    if (turma) {
      segmento = (turma.tipo_curso && turma.tipo_curso.trim()) || (turma.segmento != null ? String(turma.segmento) : null)
    }
  }

  // 4. Buscar produtos da empresa/unidade
  const { data: produtos, error: produtosError } = await supabase
    .from('produtos')
    .select('id, empresa_id, unidade_id, tipo, nome, descricao, preco, estoque, compra_unica, limite_max_compra_unica, permitir_pix, permitir_cartao, ativo, imagem_url, sku, categoria_id, grupo_id, ordem, created_at, updated_at')
    .eq('ativo', true)
    .eq('empresa_id', aluno.empresa_id)
    .or(
      aluno.unidade_id
        ? `unidade_id.is.null,unidade_id.eq.${aluno.unidade_id}`
        : 'unidade_id.is.null'
    )

  if (produtosError) {
    throw new Error('Erro ao buscar produtos')
  }

  if (!produtos || produtos.length === 0) {
    return []
  }

  // 5. Buscar disponibilidades (limite alto: PostgREST padrão 1000 pode truncar quando há muitos produtos/turmas)
  const produtoIds = produtos.map(p => p.id)
  const { data: disponibilidades } = await supabase
    .from('produto_disponibilidade')
    .select('*')
    .in('produto_id', produtoIds)
    .limit(10000)

  // 6. Filtrar produtos por disponibilidade
  const agora = new Date()
  const produtosDisponiveis: ProdutoComDisponibilidade[] = []

  for (const produto of produtos) {
    const disponibilidadesProduto = (disponibilidades || []).filter(d => d.produto_id === produto.id)

    // Sem disponibilidade definida: considerar disponível (TODOS), alinhado ao admin
    if (disponibilidadesProduto.length === 0) {
      produtosDisponiveis.push({ ...produto, disponibilidades: [] })
      continue
    }

    // Verificar cada regra de disponibilidade (comparação normalizada: segmento case-insensitive, turma/aluno por UUID em minúsculas)
    let disponivel = false
    const segmentoNorm = segmento?.trim().toLowerCase() ?? ''
    const turmaIdAlunoNorm = (aluno.turma_id ?? '').trim().toLowerCase()
    const alunoIdNorm = (aluno.id ?? '').trim().toLowerCase()
    for (const disp of disponibilidadesProduto) {
      // Verificar janela de datas
      if (disp.disponivel_de) {
        const dataInicio = new Date(disp.disponivel_de)
        if (agora < dataInicio) continue
      }
      if (disp.disponivel_ate) {
        const dataFim = new Date(disp.disponivel_ate)
        if (agora > dataFim) continue
      }

      // Verificar tipo de disponibilidade
      if (disp.tipo === 'TODOS') {
        disponivel = true
        break
      }
      const segmentoDisp = (disp.segmento ?? '').trim().toLowerCase()
      if (disp.tipo === 'SEGMENTO' && segmentoDisp && segmentoNorm && segmentoNorm === segmentoDisp) {
        disponivel = true
        break
      }
      const turmaIdDisp = (disp.turma_id ?? '').trim().toLowerCase()
      if (disp.tipo === 'TURMA' && turmaIdDisp && turmaIdAlunoNorm === turmaIdDisp) {
        disponivel = true
        break
      }
      const alunoIdDisp = (disp.aluno_id ?? '').trim().toLowerCase()
      if (disp.tipo === 'ALUNO' && alunoIdDisp && alunoIdNorm === alunoIdDisp) {
        disponivel = true
        break
      }
    }

    if (disponivel) {
      produtosDisponiveis.push({
        ...produto,
        disponibilidades: disponibilidadesProduto
      })
    }
  }

  return produtosDisponiveis
}

/**
 * Retorna os IDs dos alunos (do responsável logado) que têm permissão para comprar o produto,
 * conforme as regras de disponibilidade (TODOS, SEGMENTO, TURMA, ALUNO).
 * Usado na página do produto para restringir o select de aluno.
 */
export async function getAlunosComAcessoAoProduto(produtoId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: responsavel } = await supabase
    .from('usuarios')
    .select('id, ativo')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!responsavel?.ativo) return []

  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', responsavel.id)
  const alunoIds = (vinculos || []).map((v) => v.aluno_id)
  if (alunoIds.length === 0) return []

  const { data: alunos } = await supabase
    .from('alunos')
    .select('id, empresa_id, unidade_id, turma_id')
    .in('id', alunoIds)
    .eq('situacao', 'ATIVO')
  const alunosTyped = (alunos || []) as { id: string; empresa_id: string; unidade_id: string | null; turma_id: string | null }[]

  const { data: produto } = await supabase
    .from('produtos')
    .select('id, empresa_id, unidade_id')
    .eq('id', produtoId)
    .eq('ativo', true)
    .single()
  if (!produto) return []

  const { data: disponibilidades } = await supabase
    .from('produto_disponibilidade')
    .select('*')
    .eq('produto_id', produtoId)
  const disps = disponibilidades || []
  // Sem regras de disponibilidade: todos os alunos do produto têm acesso (TODOS)
  if (disps.length === 0) {
    return alunosTyped
      .filter((a) => produto.empresa_id === a.empresa_id && (produto.unidade_id == null || produto.unidade_id === a.unidade_id))
      .map((a) => a.id)
  }

  const turmasIds = alunosTyped.map((a) => a.turma_id).filter(Boolean) as string[]
  let turmas: { id: string; tipo_curso: string | null; segmento: string | null }[] = []
  if (turmasIds.length > 0) {
    const { data: turmasData } = await supabase
      .from('turmas')
      .select('id, tipo_curso, segmento')
      .in('id', turmasIds)
    turmas = (turmasData || []) as { id: string; tipo_curso: string | null; segmento: string | null }[]
  }
  const turmaSegmentoMap = new Map(
    turmas.map((t) => [
      t.id,
      (t.tipo_curso?.trim()) || (t.segmento != null ? String(t.segmento).trim() : null),
    ])
  )

  const agora = new Date()
  const idsComAcesso: string[] = []

  for (const aluno of alunosTyped) {
    if (produto.empresa_id !== aluno.empresa_id) continue
    if (produto.unidade_id != null && produto.unidade_id !== aluno.unidade_id) continue

    const segmentoAluno = aluno.turma_id ? turmaSegmentoMap.get(aluno.turma_id) ?? null : null
    const segmentoAlunoNorm = (segmentoAluno ?? '').trim().toLowerCase()
    const turmaIdAlunoNorm = (aluno.turma_id ?? '').trim().toLowerCase()
    const alunoIdNorm = (aluno.id ?? '').trim().toLowerCase()

    let permitido = false
    for (const disp of disps) {
      if (disp.disponivel_de && agora < new Date(disp.disponivel_de)) continue
      if (disp.disponivel_ate && agora > new Date(disp.disponivel_ate)) continue

      if (disp.tipo === 'TODOS') {
        permitido = true
        break
      }
      const segmentoDisp = (disp.segmento ?? '').trim().toLowerCase()
      if (disp.tipo === 'SEGMENTO' && segmentoDisp && segmentoAlunoNorm === segmentoDisp) {
        permitido = true
        break
      }
      const turmaIdDisp = (disp.turma_id ?? '').trim().toLowerCase()
      if (disp.tipo === 'TURMA' && turmaIdDisp && turmaIdAlunoNorm === turmaIdDisp) {
        permitido = true
        break
      }
      const alunoIdDisp = (disp.aluno_id ?? '').trim().toLowerCase()
      if (disp.tipo === 'ALUNO' && alunoIdDisp && alunoIdNorm === alunoIdDisp) {
        permitido = true
        break
      }
    }
    if (permitido) idsComAcesso.push(aluno.id)
  }

  return idsComAcesso
}

// Buscar produto completo com variações e opcionais para a loja
export async function obterProdutoCompleto(id: string): Promise<ProdutoCompleto | null> {
  const supabase = await createClient()
  
  // Verificar autenticação
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  // Buscar produto
  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select(`
      *,
      categoria:categorias(*),
      grupo:grupos_produtos(*)
    `)
    .eq('id', id)
    .eq('ativo', true)
    .single()

  if (produtoError || !produto) {
    return null
  }

  // Buscar variações — mesmo select do PDV (variacao_valores *) para exibição igual na loja
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

  // Filtrar valores de variação ativos (mesma lógica do PDV: ativo !== false, ordenar por ordem)
  const variacoesComValores = (variacoes || []).map((v: any) => ({
    ...v,
    valores: (v.valores || [])
      .filter((val: any) => val.ativo !== false)
      .sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999)),
  })).filter((v: any) => v.valores.length > 0)

  // Filtrar opcionais ativos manualmente
  const gruposComOpcionais = (gruposOpcionais || []).map(g => ({
    ...g,
    opcionais: (g.opcionais || []).filter((o: any) => o.ativo).sort((a: any, b: any) => a.ordem - b.ordem)
  })).filter(g => g.opcionais.length > 0)

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
    variacoes: variacoesComValores,
    grupos_opcionais: gruposComOpcionais,
    disponibilidades: disponibilidades || [],
    kits_itens: kitsItens,
  } as ProdutoCompleto
}
