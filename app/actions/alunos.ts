'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Listar todos os alunos com informações básicas
 */
export async function listarAlunos() {
  const supabase = await createClient()

  console.log('[listarAlunos] Iniciando busca de alunos...')

  const { data, error } = await supabase
    .from('alunos')
    .select(`
      id,
      prontuario,
      nome,
      situacao,
      empresa_id,
      unidade_id,
      turma_id,
      turmas:turma_id (
        id,
        descricao,
        segmento,
        tipo_curso,
        situacao
      ),
      empresas:empresa_id (
        id,
        nome
      ),
      unidades:unidade_id (
        id,
        nome
      )
    `)
    .order('nome')
    .limit(1000) // Limitar para não sobrecarregar

  if (error) {
    console.error('[listarAlunos] Erro ao listar alunos:', error)
    console.error('[listarAlunos] Detalhes do erro:', JSON.stringify(error, null, 2))
    throw new Error(`Erro ao carregar alunos: ${error.message}`)
  }

  console.log(`[listarAlunos] Alunos encontrados: ${data?.length || 0}`)

  return data || []
}

/**
 * Obter detalhes completos de um aluno
 */
export async function obterAlunoDetalhes(alunoId: string) {
  const supabase = await createClient()

  // Buscar aluno com turma, empresa e unidade
  const { data: aluno, error: alunoError } = await supabase
    .from('alunos')
    .select(`
      id,
      prontuario,
      nome,
      situacao,
      empresa_id,
      unidade_id,
      turma_id,
      created_at,
      updated_at,
      turmas:turma_id (
        id,
        descricao,
        segmento,
        tipo_curso,
        situacao
      ),
      empresas:empresa_id (
        id,
        nome,
        cnpj
      ),
      unidades:unidade_id (
        id,
        nome
      )
    `)
    .eq('id', alunoId)
    .single()

  if (alunoError) {
    console.error('Erro ao buscar aluno:', alunoError)
    throw new Error('Erro ao carregar dados do aluno')
  }

  if (!aluno) {
    throw new Error('Aluno não encontrado')
  }

  // Buscar responsáveis vinculados (estrutura refatorada: usuarios com nome, cpf, email, celular, responsabilidade 1=fin, 2=ped, 3=ambos)
  const { data: responsaveis, error: responsaveisError } = await supabase
    .from('usuario_aluno')
    .select(`
      id,
      usuario_id,
      usuarios:usuario_id (
        id,
        nome,
        cpf,
        email,
        celular,
        responsabilidade,
        ativo
      )
    `)
    .eq('aluno_id', alunoId)

  if (responsaveisError) {
    console.error('Erro ao buscar responsáveis:', responsaveisError)
    // Não falhar aqui, apenas logar o erro
  }

  return {
    aluno,
    responsaveis: responsaveis || [],
  }
}

/**
 * Buscar alunos por filtro (nome, prontuário, turma, etc)
 */
export async function buscarAlunos(filtro: {
  nome?: string
  prontuario?: string
  turma_id?: string
  situacao?: string
  empresa_id?: string
}) {
  const supabase = await createClient()

  let query = supabase
    .from('alunos')
    .select(`
      id,
      prontuario,
      nome,
      situacao,
      turma_id,
      turmas:turma_id (
        id,
        descricao,
        segmento
      )
    `)

  if (filtro.nome) {
    query = query.ilike('nome', `%${filtro.nome}%`)
  }

  if (filtro.prontuario) {
    query = query.eq('prontuario', filtro.prontuario)
  }

  if (filtro.turma_id) {
    query = query.eq('turma_id', filtro.turma_id)
  }

  if (filtro.situacao) {
    query = query.eq('situacao', filtro.situacao)
  }

  if (filtro.empresa_id) {
    query = query.eq('empresa_id', filtro.empresa_id)
  }

  const { data, error } = await query.order('nome')

  if (error) {
    console.error('Erro ao buscar alunos:', error)
    throw new Error('Erro ao buscar alunos')
  }

  return data || []
}

/**
 * Atualizar situação (ATIVO/INATIVO) de um aluno.
 * Usa client admin para ignorar restrições de RLS, assumindo que apenas admins chamam.
 */
export async function atualizarSituacaoAluno(alunoId: string, situacao: 'ATIVO' | 'INATIVO') {
  const admin = createAdminClient()

  const { error } = await admin
    .from('alunos')
    .update({
      situacao,
      updated_at: new Date().toISOString(),
    })
    .eq('id', alunoId)

  if (error) {
    console.error('Erro ao atualizar situação do aluno:', error)
    throw new Error('Erro ao atualizar situação do aluno')
  }

  return { ok: true, situacao }
}
