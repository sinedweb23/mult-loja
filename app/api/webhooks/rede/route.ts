import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmarTransacaoAprovada } from '@/app/actions/transacoes'

export const dynamic = 'force-dynamic'

/** Webhook chamado pela Rede ao atualizar status do pagamento (ex.: Pix pago). */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 })
    }
    const gatewayId = (body.id ?? body.tid ?? body.transactionId) as string | undefined
    const auth = body.authorization as { status?: string } | undefined
    const status = (body.status ?? auth?.status) as string | undefined
    if (!gatewayId) {
      return NextResponse.json({ erro: 'id/tid da transação não informado' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: transacao, error: err } = await admin
      .from('transacoes')
      .select('id, status, webhook_events')
      .eq('gateway_id', gatewayId)
      .maybeSingle()
    if (err || !transacao) {
      console.warn('[webhooks/rede] Transação não encontrada para gatewayId:', gatewayId)
      return NextResponse.json({ recebido: true, mensagem: 'Transação não encontrada' }, { status: 200 })
    }
    if (transacao.status === 'APROVADO') {
      return NextResponse.json({ recebido: true, mensagem: 'Já processado' }, { status: 200 })
    }

    const statusNorm = String(status ?? '').toUpperCase()
    const aprovado = statusNorm === 'APPROVED' || statusNorm === 'APROVADO' || statusNorm === 'PAID' || statusNorm === 'PAGO' || (body as { returnCode?: string }).returnCode === '00'
    const recusado = statusNorm === 'DECLINED' || statusNorm === 'RECUSADO' || statusNorm === 'DENIED'

    const now = new Date().toISOString()
    const webhookEvents = Array.isArray(transacao.webhook_events) ? [...transacao.webhook_events] : []
    webhookEvents.push({ at: now, body })

    if (aprovado) {
      await admin
        .from('transacoes')
        .update({
          status: 'APROVADO',
          gateway_data: body,
          webhook_events: webhookEvents,
          updated_at: now,
        })
        .eq('id', transacao.id)
      await confirmarTransacaoAprovada(transacao.id)
    } else if (recusado) {
      await admin
        .from('transacoes')
        .update({
          status: 'RECUSADO',
          gateway_data: body,
          webhook_events: webhookEvents,
          updated_at: now,
        })
        .eq('id', transacao.id)
    } else {
      await admin
        .from('transacoes')
        .update({
          status: 'PROCESSANDO',
          gateway_data: body,
          webhook_events: webhookEvents,
          updated_at: now,
        })
        .eq('id', transacao.id)
    }

    return NextResponse.json({ recebido: true }, { status: 200 })
  } catch (e) {
    console.error('[webhooks/rede]', e)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
