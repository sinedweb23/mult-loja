'use server'

import { createClient } from '@/lib/supabase/server'
import type { Aluno } from '@/lib/types/database'

export interface UsuarioCompleto {
  id: string
  nome: string | null
  nome_financeiro: string | null
  nome_pedagogico: string | null
  email_financeiro: string | null
  email_pedagogico: string | null
  cpf_financeiro: string | null
  cpf_pedagogico: string | null
  celular_financeiro: string | null
  celular_pedagogico: string | null
  tipo: 'FINANCEIRO' | 'PEDAGOGICO' | 'AMBOS'
  alunos: Aluno[]
}

/**
 * Verificar se o usuário tem filhos ativos vinculados
 */
export async function temFilhosAtivos(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return false
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!usuario) {
      return false
    }

    // Buscar vínculos com alunos
    const { data: vinculos } = await supabase
      .from('usuario_aluno')
      .select('aluno_id')
      .eq('usuario_id', usuario.id)

    if (!vinculos || vinculos.length === 0) {
      return false
    }

    const alunoIds = vinculos.map(v => v.aluno_id)

    // Verificar se há alunos ativos
    const { data: alunos } = await supabase
      .from('alunos')
      .select('id')
      .in('id', alunoIds)
      .eq('situacao', 'ATIVO')
      .limit(1)

    return (alunos && alunos.length > 0) || false
  } catch (error) {
    console.error('Erro ao verificar filhos ativos:', error)
    return false
  }
}

export async function getAlunosDoResponsavel(): Promise<Aluno[]> {
  try {
    const supabase = await createClient()

    // Tentar obter a sessão primeiro
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('[getAlunosDoResponsavel] Sessão:', session ? 'existe' : 'não existe', sessionError)
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('[getAlunosDoResponsavel] User:', user ? user.id : 'não encontrado', userError)
    
    if (!user) {
      throw new Error('Não autenticado')
    }

    const { data: responsavel, error: responsavelError } = await supabase
      .from('usuarios')
      .select('id, nome')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (responsavelError) {
      console.error('Erro ao buscar responsável:', responsavelError)
      throw new Error('Erro ao buscar responsável')
    }

    if (!responsavel) {
      return []
    }

    const { data: cache } = await supabase
      .from('usuario_admin_cache')
      .select('is_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    console.log('[getAlunosDoResponsavel] Usuário encontrado:', {
      id: responsavel.id,
      eh_admin: !!cache?.is_admin,
      nome: responsavel.nome
    })

    // Buscar IDs dos alunos vinculados
    const { data: vinculos, error: vinculosError } = await supabase
      .from('usuario_aluno')
      .select('aluno_id')
      .eq('usuario_id', responsavel.id)

    if (vinculosError) {
      console.error('[getAlunosDoResponsavel] Erro ao buscar vínculos:', vinculosError)
      throw new Error('Erro ao buscar vínculos com alunos')
    }

    if (!vinculos || vinculos.length === 0) {
      console.log('[getAlunosDoResponsavel] Nenhum vínculo encontrado para usuario_id:', responsavel.id)
      return []
    }

    console.log('[getAlunosDoResponsavel] Vínculos encontrados:', vinculos.length)

    const alunoIds = vinculos.map(v => v.aluno_id)
    console.log('[getAlunosDoResponsavel] IDs dos alunos:', alunoIds)

    const { data: alunos, error: alunosError } = await supabase
      .from('alunos')
      .select(`
        *,
        turmas:turma_id ( id, turno, descricao )
      `)
      .in('id', alunoIds)
      .eq('situacao', 'ATIVO')

    if (alunosError) {
      console.error('[getAlunosDoResponsavel] Erro ao buscar alunos:', alunosError)
      throw new Error('Erro ao buscar alunos')
    }

    console.log('[getAlunosDoResponsavel] Alunos encontrados:', alunos?.length || 0)
    if (alunos && alunos.length > 0) {
      console.log('[getAlunosDoResponsavel] Nomes dos alunos:', alunos.map(a => a.nome))
    }

    return (alunos || []) as Aluno[]
  } catch (error: any) {
    console.error('[getAlunosDoResponsavel] Erro:', error)
    throw error // Re-throw para que o erro seja capturado no cliente
  }
}

/** Mapeia responsabilidade (1, 2, 3) para tipo UsuarioCompleto e preenche campos unificados (nome, cpf, email, celular) */
function mapUsuarioToCompleto(usuario: Record<string, unknown>, alunos: Aluno[]): UsuarioCompleto {
  const r = (usuario.responsabilidade as number) ?? 3
  const tipo: 'FINANCEIRO' | 'PEDAGOGICO' | 'AMBOS' =
    r === 1 ? 'FINANCEIRO' : r === 2 ? 'PEDAGOGICO' : 'AMBOS'
  const nome = (usuario.nome as string) ?? null
  const cpf = (usuario.cpf as string) ?? null
  const email = (usuario.email as string) ?? null
  const celular = (usuario.celular as string) ?? null
  return {
    id: usuario.id as string,
    nome,
    nome_financeiro: tipo === 'PEDAGOGICO' ? null : nome,
    nome_pedagogico: tipo === 'FINANCEIRO' ? null : nome,
    email_financeiro: tipo === 'PEDAGOGICO' ? null : email,
    email_pedagogico: tipo === 'FINANCEIRO' ? null : email,
    cpf_financeiro: tipo === 'PEDAGOGICO' ? null : cpf,
    cpf_pedagogico: tipo === 'FINANCEIRO' ? null : cpf,
    celular_financeiro: tipo === 'PEDAGOGICO' ? null : celular,
    celular_pedagogico: tipo === 'FINANCEIRO' ? null : celular,
    tipo,
    alunos,
  }
}

/**
 * Obter dados completos do usuário logado (com alunos)
 */
export async function obterMeuPerfil(): Promise<UsuarioCompleto | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado')
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (usuarioError || !usuario) {
    console.error('Erro ao buscar usuário:', usuarioError)
    return null
  }

  const { data: vinculos } = await supabase
    .from('usuario_aluno')
    .select('aluno_id')
    .eq('usuario_id', usuario.id)

  if (!vinculos || vinculos.length === 0) {
    return mapUsuarioToCompleto(usuario as Record<string, unknown>, [])
  }

  const alunoIds = vinculos.map(v => v.aluno_id)

  const { data: alunos, error: alunosError } = await supabase
    .from('alunos')
    .select(`
      *,
      turmas (
        id,
        descricao,
        segmento
      )
    `)
    .in('id', alunoIds)
    .eq('situacao', 'ATIVO')

  if (alunosError) {
    console.error('Erro ao buscar alunos:', alunosError)
  }

  return mapUsuarioToCompleto(usuario as Record<string, unknown>, (alunos || []) as Aluno[])
}
