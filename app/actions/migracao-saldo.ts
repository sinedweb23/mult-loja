'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { HistoricoMigracao } from '@/lib/types/database'

/** Buscar alunos por nome para autocomplete (lista suspensa) */
export async function buscarAlunosPorNome(nome: string): Promise<{ id: string; nome: string }[]> {
  if (!nome || nome.trim().length < 2) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alunos')
    .select('id, nome')
    .ilike('nome', `%${nome.trim()}%`)
    .order('nome')
    .limit(30)
  if (error) {
    console.error('[buscarAlunosPorNome]', error)
    return []
  }
  return (data ?? []).map((r) => ({ id: r.id, nome: r.nome ?? '' }))
}

export interface ItemMigracao {
  aluno_id: string
  valor: number
}

/** Confirmar migração: atualiza saldos, cria movimentações e registro no histórico (via RPC em transação). */
export async function confirmarMigracao(
  itens: ItemMigracao[]
): Promise<{ ok: boolean; total_alunos?: number; valor_total?: number; erro?: string }> {
  if (!itens.length) return { ok: false, erro: 'Nenhum aluno na lista para migrar.' }
  const payload = itens.map((i) => ({
    aluno_id: i.aluno_id,
    valor: Number(i.valor),
  }))
  const invalid = payload.filter((p) => !p.aluno_id || p.valor === 0)
  if (invalid.length) {
    return {
      ok: false,
      erro: 'Todos os itens devem ter aluno e valor diferente de zero (pode ser positivo ou negativo).',
    }
  }

  // Usar cliente com sessão do usuário para auth.uid() na RPC (eh_admin_usuario)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('executar_migracao_saldo', { p_itens: payload })
  if (error) {
    console.error('[confirmarMigracao]', error)
    return { ok: false, erro: error.message }
  }
  const result = data as { ok?: boolean; total_alunos?: number; valor_total?: number; erro?: string }
  if (result?.ok) {
    return {
      ok: true,
      total_alunos: result.total_alunos,
      valor_total: result.valor_total,
    }
  }
  return { ok: false, erro: (result?.erro as string) ?? 'Erro ao executar migração.' }
}

/** Listar histórico de migrações e total geral migrado */
export async function listarHistoricoMigracoes(): Promise<{
  lista: HistoricoMigracao[]
  total_geral: number
}> {
  const admin = createAdminClient()
  const [listRes, sumRes] = await Promise.all([
    admin
      .from('historico_migracoes')
      .select('id, total_alunos, valor_total, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('historico_migracoes').select('valor_total'),
  ])
  if (listRes.error) {
    console.error('[listarHistoricoMigracoes]', listRes.error)
    return { lista: [], total_geral: 0 }
  }
  const rows = (listRes.data ?? []) as HistoricoMigracao[]
  const total_geral = (sumRes.data ?? []).reduce((s, r) => s + Number((r as { valor_total: number }).valor_total ?? 0), 0)
  return { lista: rows, total_geral }
}

export interface ItemHistoricoMigracao {
  aluno_id: string
  aluno_nome: string
  valor: number
}

/** Itens (alunos e valor) de um lançamento de migração para exibir ao expandir */
export async function obterItensMigracao(
  historicoMigracaoId: string
): Promise<ItemHistoricoMigracao[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historico_migracao_itens')
    .select('aluno_id, valor, alunos:aluno_id(nome)')
    .eq('historico_migracao_id', historicoMigracaoId)
    .order('valor', { ascending: false })
  if (error) {
    console.error('[obterItensMigracao]', error)
    return []
  }
  return (data ?? []).map((row) => {
    const aluno = (row as { alunos?: { nome: string } | { nome: string }[] | null }).alunos
    const nome = aluno == null ? null : Array.isArray(aluno) ? aluno[0]?.nome : aluno.nome
    return {
      aluno_id: row.aluno_id,
      aluno_nome: nome ?? '—',
      valor: Number(row.valor),
    }
  })
}
