'use server'

import { createClient } from '@/lib/supabase/server'
import type { PedidoStatus } from '@/lib/types/database'

/** Opcional selecionado no pedido (nome + quantidade) */
export interface OpcionalSelecionadoPedido {
  opcional_id: string
  nome: string
  quantidade: number
  preco?: number
}

export interface ItemPedidoCompleto {
  id: string
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_unitario: number
  subtotal: number
  variacoes_selecionadas?: Record<string, string>
  /** Kit Festa */
  tema_festa?: string | null
  idade_festa?: number | null
  kit_festa_data?: string | null
  kit_festa_horario_inicio?: string | null
  kit_festa_horario_fim?: string | null
  google_event_id?: string | null
  google_event_link?: string | null
  opcionais_selecionados?: OpcionalSelecionadoPedido[]
}

export interface PedidoCompleto {
  id: string
  status: PedidoStatus
  total: number
  created_at: string
  updated_at: string
  data_retirada: string | null
  aluno: {
    id: string
    nome: string
    prontuario: string
  }
  itens: ItemPedidoCompleto[]
}

/**
 * Listar pedidos do usuário logado
 */
export async function listarMeusPedidos(): Promise<PedidoCompleto[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  // Buscar usuário
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!usuario) {
    return []
  }

  // Buscar pedidos: apenas os feitos como responsável (para filhos).
  // Exclui pedidos tipo COLABORADOR (vendas no PDV para colaborador), que devem aparecer só no extrato colaborador.
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id,
      status,
      total,
      created_at,
      updated_at,
      data_retirada,
      aluno_id,
      alunos!inner (
        id,
        nome,
        prontuario
      )
    `)
    .eq('usuario_id', usuario.id)
    .or('tipo_beneficiario.eq.ALUNO,tipo_beneficiario.is.null')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar pedidos:', error)
    throw new Error('Erro ao buscar pedidos')
  }

  if (!pedidos || pedidos.length === 0) {
    return []
  }

  // Buscar itens via RPC (contorna RLS; só retorna itens de pedidos do usuário)
  const pedidoIds = pedidos.map(p => p.id)
  const { data: itens, error: itensError } = await supabase.rpc('get_itens_meus_pedidos', {
    p_pedido_ids: pedidoIds,
  })

  if (itensError) {
    console.error('Erro ao buscar itens dos pedidos:', itensError)
  }

  type ItemRpc = {
    id: string
    pedido_id: string
    produto_id: string
    quantidade: number
    preco_unitario: number
    subtotal: number
    variacoes_selecionadas: Record<string, string> | null
    produto_nome: string
    tema_festa?: string | null
    idade_festa?: number | null
    kit_festa_data?: string | null
    kit_festa_horario_inicio?: string | null
    kit_festa_horario_fim?: string | null
    google_event_id?: string | null
    google_event_link?: string | null
    opcionais_selecionados?: unknown
  }

  const itensList = (itens || []) as ItemRpc[]

  function mapOpcionais(raw: unknown): OpcionalSelecionadoPedido[] {
    if (!Array.isArray(raw)) return []
    return raw.map((o: any) => ({
      opcional_id: o.opcional_id ?? o.id ?? '',
      nome: o.nome ?? 'Opcional',
      quantidade: typeof o.quantidade === 'number' ? o.quantidade : 1,
      preco: typeof o.preco === 'number' ? o.preco : undefined,
    }))
  }

  function mapItem(item: ItemRpc): ItemPedidoCompleto {
    return {
      id: item.id,
      produto_id: item.produto_id,
      produto_nome: item.produto_nome ?? 'Produto',
      quantidade: item.quantidade,
      preco_unitario: Number(item.preco_unitario),
      subtotal: Number(item.subtotal),
      variacoes_selecionadas: item.variacoes_selecionadas && typeof item.variacoes_selecionadas === 'object' ? item.variacoes_selecionadas : undefined,
      tema_festa: item.tema_festa ?? null,
      idade_festa: item.idade_festa ?? null,
      kit_festa_data: item.kit_festa_data ? String(item.kit_festa_data).slice(0, 10) : null,
      kit_festa_horario_inicio: item.kit_festa_horario_inicio ?? null,
      kit_festa_horario_fim: item.kit_festa_horario_fim ?? null,
      google_event_id: item.google_event_id ?? null,
      google_event_link: item.google_event_link ?? null,
      opcionais_selecionados: mapOpcionais(item.opcionais_selecionados),
    }
  }

  // Montar resposta
  const pedidosCompletos: PedidoCompleto[] = pedidos.map((pedido: any) => {
    const itensPedido = itensList.filter((item) => item.pedido_id === pedido.id)
    return {
      id: pedido.id,
      status: pedido.status,
      total: Number(pedido.total),
      created_at: pedido.created_at,
      updated_at: pedido.updated_at,
      data_retirada: pedido.data_retirada ?? null,
      aluno: {
        id: pedido.alunos.id,
        nome: pedido.alunos.nome,
        prontuario: pedido.alunos.prontuario,
      },
      itens: itensPedido.map(mapItem),
    }
  })

  return pedidosCompletos
}

/**
 * Listar pedidos de um aluno específico
 */
export async function listarPedidosPorAluno(alunoId: string): Promise<PedidoCompleto[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  // Buscar usuário
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!usuario) {
    return []
  }

  // Verificar se o aluno pertence ao usuário
  const { data: vinculo } = await supabase
    .from('usuario_aluno')
    .select('id')
    .eq('usuario_id', usuario.id)
    .eq('aluno_id', alunoId)
    .single()

  if (!vinculo) {
    return []
  }

  // Buscar pedidos do aluno (apenas tipo ALUNO; exclui COLABORADOR)
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id,
      status,
      total,
      created_at,
      updated_at,
      data_retirada,
      aluno_id,
      alunos!inner (
        id,
        nome,
        prontuario
      )
    `)
    .eq('usuario_id', usuario.id)
    .eq('aluno_id', alunoId)
    .or('tipo_beneficiario.eq.ALUNO,tipo_beneficiario.is.null')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar pedidos:', error)
    throw new Error('Erro ao buscar pedidos')
  }

  if (!pedidos || pedidos.length === 0) {
    return []
  }

  // Buscar itens via RPC
  const pedidoIds = pedidos.map(p => p.id)
  const { data: itens, error: itensError } = await supabase.rpc('get_itens_meus_pedidos', {
    p_pedido_ids: pedidoIds,
  })

  if (itensError) {
    console.error('Erro ao buscar itens dos pedidos:', itensError)
  }

  type ItemRpc = {
    id: string
    pedido_id: string
    produto_id: string
    quantidade: number
    preco_unitario: number
    subtotal: number
    variacoes_selecionadas: Record<string, string> | null
    produto_nome: string
    tema_festa?: string | null
    idade_festa?: number | null
    kit_festa_data?: string | null
    kit_festa_horario_inicio?: string | null
    kit_festa_horario_fim?: string | null
    google_event_id?: string | null
    google_event_link?: string | null
    opcionais_selecionados?: unknown
  }

  const itensList = (itens || []) as ItemRpc[]

  function mapOpcionais(raw: unknown): OpcionalSelecionadoPedido[] {
    if (!Array.isArray(raw)) return []
    return raw.map((o: any) => ({
      opcional_id: o.opcional_id ?? o.id ?? '',
      nome: o.nome ?? 'Opcional',
      quantidade: typeof o.quantidade === 'number' ? o.quantidade : 1,
      preco: typeof o.preco === 'number' ? o.preco : undefined,
    }))
  }

  function mapItem(item: ItemRpc): ItemPedidoCompleto {
    return {
      id: item.id,
      produto_id: item.produto_id,
      produto_nome: item.produto_nome ?? 'Produto',
      quantidade: item.quantidade,
      preco_unitario: Number(item.preco_unitario),
      subtotal: Number(item.subtotal),
      variacoes_selecionadas: item.variacoes_selecionadas && typeof item.variacoes_selecionadas === 'object' ? item.variacoes_selecionadas : undefined,
      tema_festa: item.tema_festa ?? null,
      idade_festa: item.idade_festa ?? null,
      kit_festa_data: item.kit_festa_data ? String(item.kit_festa_data).slice(0, 10) : null,
      kit_festa_horario_inicio: item.kit_festa_horario_inicio ?? null,
      kit_festa_horario_fim: item.kit_festa_horario_fim ?? null,
      google_event_id: item.google_event_id ?? null,
      google_event_link: item.google_event_link ?? null,
      opcionais_selecionados: mapOpcionais(item.opcionais_selecionados),
    }
  }

  // Montar resposta
  const pedidosCompletos: PedidoCompleto[] = pedidos.map((pedido: any) => {
    const itensPedido = itensList.filter((item) => item.pedido_id === pedido.id)
    return {
      id: pedido.id,
      status: pedido.status,
      total: Number(pedido.total),
      created_at: pedido.created_at,
      updated_at: pedido.updated_at,
      data_retirada: pedido.data_retirada ?? null,
      aluno: {
        id: pedido.alunos.id,
        nome: pedido.alunos.nome,
        prontuario: pedido.alunos.prontuario,
      },
      itens: itensPedido.map(mapItem),
    }
  })

  return pedidosCompletos
}