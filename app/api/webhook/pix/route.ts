import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmarTransacaoAprovada } from '@/app/actions/transacoes'

export const dynamic = 'force-dynamic'

const EVENT_UPDATE_PIX = 'PV.UPDATE_TRANSACTION_PIX'
const EVENT_REFUND_PIX = 'PV.REFUND_PIX'

/** Se "false", o webhook aceita chamadas sem token (útil se a Rede não envia token). Default: true. */
const webhookRequerToken = () => process.env.REDE_WEBHOOK_REQUIRE_TOKEN !== 'false'

type WebhookBody = {
  companyNumber?: string
  events?: string[]
  data?: { id?: string }
}

function isWebhookBody(body: unknown): body is WebhookBody {
  if (typeof body !== 'object' || body === null) return false
  const b = body as WebhookBody
  const data = b.data
  return (
    Array.isArray(b.events) &&
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as { id?: string }).id === 'string'
  )
}

async function logWebhookAuditoria(payload: {
  action: string
  request_id: string
  route: string
  payload_reduzido: Record<string, unknown>
}) {
  try {
    const admin = createAdminClient()
    await admin.from('eventos_auditoria').insert({
      actor_type: 'webhook',
      actor_id: null,
      route: payload.route,
      action: payload.action,
      entidade: 'webhook_pix',
      entidade_id: null,
      payload_reduzido: payload.payload_reduzido,
      request_id: payload.request_id,
    })
  } catch (e) {
    console.error('[webhook/pix] Falha ao gravar evento_auditoria', e)
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('request-id') ?? 'sem request-id'
  const route = '/api/webhook/pix'

  try {
    const bodyText = await request.text()
    if (!bodyText.trim()) {
      return NextResponse.json({ recebido: true }, { status: 200 })
    }

    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch {
      console.warn('[webhook/pix] Corpo não é JSON válido, request-id:', requestId)
      return NextResponse.json({ recebido: true }, { status: 200 })
    }

    if (!isWebhookBody(body)) {
      return NextResponse.json({ recebido: true }, { status: 200 })
    }

    console.log('[webhook/pix] Evento recebido, request-id:', requestId)
    await logWebhookAuditoria({
      action: 'webhook_pix_chamada_recebida',
      request_id: requestId,
      route,
      payload_reduzido: { etapa: 'Rede chamou a URL' },
    }).catch(() => {})

    const tid = body.data!.id
    const events = body.events!

    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.REDE_WEBHOOK_TOKEN?.trim()
    const requerToken = webhookRequerToken()

    if (requerToken && !expectedToken) {
      console.error('[webhook/pix] REDE_WEBHOOK_TOKEN não configurado (REDE_WEBHOOK_REQUIRE_TOKEN não é false)')
      await logWebhookAuditoria({
        action: 'webhook_pix_rejeitado',
        request_id: requestId,
        route,
        payload_reduzido: { tid, events, motivo: 'Webhook não configurado (token ausente no servidor)' },
      })
      return NextResponse.json({ erro: 'Webhook não configurado' }, { status: 500 })
    }
    if (requerToken && expectedToken) {
      const receivedToken = authHeader?.replace(/^Bearer\s+/i, '').trim()
      if (receivedToken !== expectedToken) {
        console.warn('[webhook/pix] Token inválido, request-id:', requestId)
        await logWebhookAuditoria({
          action: 'webhook_pix_rejeitado',
          request_id: requestId,
          route,
          payload_reduzido: { tid, events, motivo: 'Token inválido ou ausente' },
        })
        return NextResponse.json({ erro: 'Unauthorized' }, { status: 401 })
      }
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const resultados: string[] = []
    let transacaoIdLog: string | null = null

    for (const event of events) {
      if (event === EVENT_UPDATE_PIX) {
        let transacao = (await admin.from('transacoes').select('id, status').eq('gateway_tid', tid).maybeSingle()).data
        if (!transacao) {
          transacao = (await admin.from('transacoes').select('id, status').eq('gateway_id', tid).maybeSingle()).data
        }
        if (!transacao) {
          console.log('[webhook/pix] Transação não encontrada para TID:', tid)
          resultados.push(`UPDATE: transação não encontrada (TID: ${tid})`)
          continue
        }
        transacaoIdLog = transacao.id
        if (transacao.status === 'APROVADO') {
          console.log('[webhook/pix] Transação já aprovada, TID:', tid)
          resultados.push('UPDATE: já aprovado')
          continue
        }

        await admin
          .from('transacoes')
          .update({ status: 'APROVADO', updated_at: now })
          .eq('id', transacao.id)
        await confirmarTransacaoAprovada(transacao.id)
        console.log('[webhook/pix] Status atualizado: paid, TID:', tid, 'transacaoId:', transacao.id)
        resultados.push('UPDATE: aprovado')
      } else if (event === EVENT_REFUND_PIX) {
        let transacao = (await admin.from('transacoes').select('id, status').eq('gateway_tid', tid).maybeSingle()).data
        if (!transacao) {
          transacao = (await admin.from('transacoes').select('id, status').eq('gateway_id', tid).maybeSingle()).data
        }
        if (!transacao) {
          console.log('[webhook/pix] Transação não encontrada para estorno, TID:', tid)
          resultados.push('REFUND: transação não encontrada')
          continue
        }
        transacaoIdLog = transacao.id
        await admin
          .from('transacoes')
          .update({ status: 'ESTORNADO', updated_at: now })
          .eq('id', transacao.id)
        console.log('[webhook/pix] Status atualizado: refunded, TID:', tid, 'transacaoId:', transacao.id)
        resultados.push('REFUND: estornado')
      }
    }

    await logWebhookAuditoria({
      action: 'webhook_pix_recebido',
      request_id: requestId,
      route,
      payload_reduzido: { tid, events, resultados, transacao_id: transacaoIdLog },
    })
    return NextResponse.json({ recebido: true }, { status: 200 })
  } catch (e) {
    console.error('[webhook/pix] Erro ao processar webhook, request-id:', requestId, e)
    await logWebhookAuditoria({
      action: 'webhook_pix_erro',
      request_id: requestId,
      route,
      payload_reduzido: { erro: e instanceof Error ? e.message : String(e) },
    }).catch(() => {})
    return NextResponse.json({ recebido: true }, { status: 200 })
  }
}

/** Rede ou validador pode chamar a URL com GET (ex.: ao cadastrar o webhook). Aceitar e retornar 200 para não gerar 405. */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get('request-id') ?? 'sem request-id'
  const route = '/api/webhook/pix'
  const url = request.nextUrl
  const queryObj: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { queryObj[k] = v })
  await logWebhookAuditoria({
    action: 'webhook_pix_get_recebido',
    request_id: requestId,
    route,
    payload_reduzido: { metodo: 'GET', aviso: 'Notificação PIX deve ser POST. Query:', ...queryObj },
  }).catch(() => {})
  return NextResponse.json({ ok: true, mensagem: 'Webhook PIX aceita POST. Use POST para notificações.' }, { status: 200 })
}

export async function PUT() {
  return NextResponse.json({ erro: 'Method Not Allowed' }, { status: 405 })
}

export async function PATCH() {
  return NextResponse.json({ erro: 'Method Not Allowed' }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ erro: 'Method Not Allowed' }, { status: 405 })
}
