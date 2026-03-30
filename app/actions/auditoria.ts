'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verificarSeEhSuperAdmin } from '@/app/actions/admin'
import { getRedeConfig, consultarTransacao } from '@/lib/rede'
import { confirmarTransacaoAprovada } from '@/app/actions/transacoes'

export interface FiltroTransacoes {
  transacaoId?: string
  gatewayTid?: string
  gatewayNsu?: string
  referencia?: string
  usuarioId?: string
  alunoId?: string
  dataIni?: string
  dataFim?: string
  status?: string
}

export interface TransacaoAuditoria {
  id: string
  tipo: string
  status: string
  valor: number
  metodo: string
  usuario_id: string
  aluno_id: string | null
  pedido_id: string | null
  gateway_id: string | null
  gateway_tid: string | null
  gateway_nsu: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
  usuario_nome?: string | null
  aluno_nome?: string | null
}

export interface FiltroEventos {
  entidade?: string
  entidadeId?: string
  actorType?: string
  dataIni?: string
  dataFim?: string
  correlationId?: string
  requestId?: string
  limit?: number
}

export interface EventoAuditoria {
  id: string
  created_at: string
  actor_type: string
  actor_id: string | null
  ip: string | null
  route: string | null
  action: string
  entidade: string
  entidade_id: string | null
  payload_reduzido: Record<string, unknown>
  correlation_id: string | null
  request_id: string | null
}

export interface FiltroGatewayLogs {
  transacaoId?: string
  gatewayTid?: string
  gatewayNsu?: string
  referencia?: string
  dataIni?: string
  dataFim?: string
  limit?: number
}

export interface GatewayLogAuditoria {
  id: string
  created_at: string
  transacao_id: string | null
  referencia: string | null
  gateway_tid: string | null
  gateway_nsu: string | null
  direcao: string
  http_status: number | null
  return_code: string | null
  return_message: string | null
  erro: string | null
}

async function soSuperAdmin() {
  const ok = await verificarSeEhSuperAdmin()
  if (!ok) throw new Error('Acesso negado. Apenas super admin.')
}

export async function buscarTransacoesAuditoria(filtro: FiltroTransacoes): Promise<TransacaoAuditoria[]> {
  await soSuperAdmin()
  const admin = createAdminClient()
  let q = admin
    .from('transacoes')
    .select(`
      id, tipo, status, valor, metodo, usuario_id, aluno_id, pedido_id,
      gateway_id, gateway_tid, gateway_nsu, idempotency_key, created_at, updated_at,
      usuarios!usuario_id(nome),
      alunos!aluno_id(nome)
    `)
    .order('created_at', { ascending: false })
    .limit(200)
  if (filtro.transacaoId?.trim()) q = q.eq('id', filtro.transacaoId.trim())
  if (filtro.gatewayTid?.trim()) q = q.eq('gateway_tid', filtro.gatewayTid.trim())
  if (filtro.gatewayNsu?.trim()) q = q.eq('gateway_nsu', filtro.gatewayNsu.trim())
  if (filtro.referencia?.trim()) q = q.eq('idempotency_key', filtro.referencia.trim())
  if (filtro.usuarioId?.trim()) q = q.eq('usuario_id', filtro.usuarioId.trim())
  if (filtro.alunoId?.trim()) q = q.eq('aluno_id', filtro.alunoId.trim())
  if (filtro.status?.trim()) q = q.eq('status', filtro.status.trim())
  if (filtro.dataIni) q = q.gte('created_at', filtro.dataIni + 'T00:00:00')
  if (filtro.dataFim) q = q.lte('created_at', filtro.dataFim + 'T23:59:59.999')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    status: r.status,
    valor: Number(r.valor),
    metodo: r.metodo,
    usuario_id: r.usuario_id,
    aluno_id: r.aluno_id,
    pedido_id: r.pedido_id,
    gateway_id: r.gateway_id,
    gateway_tid: r.gateway_tid,
    gateway_nsu: r.gateway_nsu,
    idempotency_key: r.idempotency_key ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    usuario_nome: r.usuarios?.nome ?? null,
    aluno_nome: r.alunos?.nome ?? null,
  }))
}

export async function buscarEventosAuditoria(filtro: FiltroEventos): Promise<EventoAuditoria[]> {
  await soSuperAdmin()
  const admin = createAdminClient()
  let q = admin
    .from('eventos_auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(filtro.limit ?? 100, 500))
  if (filtro.entidade?.trim()) q = q.eq('entidade', filtro.entidade.trim())
  if (filtro.entidadeId?.trim()) q = q.eq('entidade_id', filtro.entidadeId.trim())
  if (filtro.actorType?.trim()) q = q.eq('actor_type', filtro.actorType.trim())
  if (filtro.correlationId?.trim()) q = q.eq('correlation_id', filtro.correlationId.trim())
  if (filtro.requestId?.trim()) q = q.eq('request_id', filtro.requestId.trim())
  if (filtro.dataIni) q = q.gte('created_at', filtro.dataIni + 'T00:00:00')
  if (filtro.dataFim) q = q.lte('created_at', filtro.dataFim + 'T23:59:59.999')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    actor_type: r.actor_type,
    actor_id: r.actor_id,
    ip: r.ip,
    route: r.route,
    action: r.action,
    entidade: r.entidade,
    entidade_id: r.entidade_id,
    payload_reduzido: r.payload_reduzido ?? {},
    correlation_id: r.correlation_id,
    request_id: r.request_id,
  }))
}

export async function buscarGatewayLogsAuditoria(filtro: FiltroGatewayLogs): Promise<GatewayLogAuditoria[]> {
  await soSuperAdmin()
  const admin = createAdminClient()
  let q = admin
    .from('gateway_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(filtro.limit ?? 100, 500))
  if (filtro.transacaoId?.trim()) q = q.eq('transacao_id', filtro.transacaoId.trim())
  if (filtro.gatewayTid?.trim()) q = q.eq('gateway_tid', filtro.gatewayTid.trim())
  if (filtro.gatewayNsu?.trim()) q = q.eq('gateway_nsu', filtro.gatewayNsu.trim())
  if (filtro.referencia?.trim()) q = q.ilike('referencia', '%' + filtro.referencia.trim() + '%')
  if (filtro.dataIni) q = q.gte('created_at', filtro.dataIni + 'T00:00:00')
  if (filtro.dataFim) q = q.lte('created_at', filtro.dataFim + 'T23:59:59.999')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    transacao_id: r.transacao_id,
    referencia: r.referencia,
    gateway_tid: r.gateway_tid,
    gateway_nsu: r.gateway_nsu,
    direcao: r.direcao,
    http_status: r.http_status,
    return_code: r.return_code,
    return_message: r.return_message,
    erro: r.erro,
  }))
}

export async function podeAcessarAuditoria(): Promise<boolean> {
  return verificarSeEhSuperAdmin()
}

export interface DetalheTransacao {
  id: string
  status: string
  gateway_id: string | null
  gateway_tid: string | null
  webhook_events: unknown[]
  gateway_data: Record<string, unknown> | null
}

/** Retorna detalhes de uma transação (webhook_events, gateway_data) para diagnóstico. */
export async function buscarDetalheTransacao(transacaoId: string): Promise<DetalheTransacao | null> {
  await soSuperAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('transacoes')
    .select('id, status, gateway_id, gateway_tid, webhook_events, gateway_data')
    .eq('id', transacaoId)
    .single()
  if (error || !data) return null
  return {
    id: data.id,
    status: data.status,
    gateway_id: data.gateway_id ?? null,
    gateway_tid: data.gateway_tid ?? null,
    webhook_events: Array.isArray(data.webhook_events) ? data.webhook_events : [],
    gateway_data: data.gateway_data && typeof data.gateway_data === 'object' ? (data.gateway_data as Record<string, unknown>) : null,
  }
}

/** Reconsulta o status na Rede e, se pago, atualiza a transação para APROVADO e confirma. */
export async function reconsultarTransacaoRede(transacaoId: string): Promise<{ ok: boolean; mensagem: string }> {
  await soSuperAdmin()
  const admin = createAdminClient()
  const { data: tx, error: errTx } = await admin
    .from('transacoes')
    .select('id, status, gateway_id, gateway_tid')
    .eq('id', transacaoId)
    .single()
  if (errTx || !tx) return { ok: false, mensagem: 'Transação não encontrada' }
  if (tx.status === 'APROVADO') return { ok: true, mensagem: 'Transação já está aprovada.' }
  const gatewayId = tx.gateway_id ?? tx.gateway_tid
  if (!gatewayId) return { ok: false, mensagem: 'Transação sem gateway_id/tid (não é possível reconsultar).' }
  const config = getRedeConfig()
  if (!config) return { ok: false, mensagem: 'Configuração da Rede não disponível.' }
  const resultado = await consultarTransacao(config, gatewayId)
  if (resultado.erro) {
    const msg = resultado.erro
    const dica =
      msg.includes('401')
        ? ' (401 = credenciais recusadas na CONSULTA; não é o webhook. Confira PV/Token e se a Rede exige OAuth para GET.)'
        : ''
    return { ok: false, mensagem: `Rede: ${resultado.erro}${dica}` }
  }
  const statusNorm = String(resultado.status ?? '').toUpperCase()
  const aprovado = statusNorm === 'PAID' || statusNorm === 'PAGO' || statusNorm === 'APPROVED' || statusNorm === 'APROVADO' || statusNorm === 'CONFIRMED'
  if (!aprovado) {
    let mensagem = `Status na Rede: ${resultado.status}. Não está pago.`
    if (resultado.debug?.bodyPreview) {
      mensagem += ` Resposta da Rede (trecho): ${resultado.debug.bodyPreview}`
    }
    return { ok: false, mensagem }
  }
  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from('transacoes')
    .update({ status: 'APROVADO', updated_at: now })
    .eq('id', transacaoId)
  if (updErr) return { ok: false, mensagem: updErr.message }
  const conf = await confirmarTransacaoAprovada(transacaoId)
  if (!conf.ok) return { ok: false, mensagem: `Status atualizado, mas falha ao confirmar: ${conf.erro}` }
  return { ok: true, mensagem: 'Status atualizado para APROVADO e pedido/recarga confirmado.' }
}
