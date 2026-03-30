import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedeConfig, criarTransacaoPix, criarTransacaoCartao } from '@/lib/rede'
import { confirmarTransacaoAprovada } from '@/app/actions/transacoes'
import type { PayloadPedidoLoja } from '@/app/actions/transacoes'

export const dynamic = 'force-dynamic'

type Body = {
  tipo: 'PEDIDO_LOJA' | 'RECARGA_SALDO'
  metodo: 'PIX' | 'CARTAO'
  /** Para PEDIDO_LOJA: { pedidos: [{ alunoId, dataRetirada, itens }] } */
  payload?: PayloadPedidoLoja
  /** Para RECARGA_SALDO */
  alunoId?: string
  valor?: number
  /** Para CARTAO */
  card?: { number: string; validity: string; cvv: string; nomePortador: string; parcelas?: number }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, erro: 'Não autenticado' }, { status: 401 })
    }
    const admin = createAdminClient()
    const { data: usuario, error: usuarioError } = await admin
      .from('usuarios')
      .select('id, nome, cpf')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (usuarioError) {
      console.error('[checkout/criar] Erro ao buscar usuario:', usuarioError)
      return NextResponse.json({ ok: false, erro: 'Erro ao verificar usuário. Tente novamente.' }, { status: 500 })
    }
    if (!usuario) {
      return NextResponse.json({
        ok: false,
        erro: 'Usuário não encontrado. Sua conta não está vinculada a um responsável no sistema. Entre em contato com o suporte.',
      }, { status: 403 })
    }

    const body = (await request.json()) as Body
    const { tipo, metodo } = body
    if (!tipo || !metodo || !['PEDIDO_LOJA', 'RECARGA_SALDO'].includes(tipo) || !['PIX', 'CARTAO'].includes(metodo)) {
      return NextResponse.json({ ok: false, erro: 'tipo e metodo obrigatórios (PEDIDO_LOJA|RECARGA_SALDO, PIX|CARTAO)' }, { status: 400 })
    }

    let valor = 0
    let alunoId: string | null = null
    let payload: PayloadPedidoLoja | Record<string, unknown> = {}

    if (tipo === 'RECARGA_SALDO') {
      const v = Number(body.valor)
      const a = body.alunoId
      if (!a || !(v > 0)) {
        return NextResponse.json({ ok: false, erro: 'Recarga: alunoId e valor positivo obrigatórios' }, { status: 400 })
      }
      valor = v
      alunoId = a
    } else {
      const pedidosPayload = body.payload?.pedidos
      if (!Array.isArray(pedidosPayload) || pedidosPayload.length === 0) {
        return NextResponse.json({ ok: false, erro: 'Pedido: payload.pedidos obrigatório' }, { status: 400 })
      }
      payload = body.payload as PayloadPedidoLoja
      valor = pedidosPayload.reduce((s, p) => s + p.itens.reduce((s2, i) => s2 + i.subtotal, 0), 0)
      alunoId = pedidosPayload[0].alunoId
    }

    const config = getRedeConfig()
    if (!config) {
      return NextResponse.json({ ok: false, erro: 'Gateway de pagamento não configurado' }, { status: 503 })
    }

    const referencia = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const { data: transacao, error: errInsert } = await admin
      .from('transacoes')
      .insert({
        tipo,
        usuario_id: usuario.id,
        aluno_id: alunoId,
        valor,
        metodo,
        status: 'PENDENTE',
        payload: tipo === 'PEDIDO_LOJA' ? payload : {},
      })
      .select('id')
      .single()
    if (errInsert || !transacao) {
      return NextResponse.json({ ok: false, erro: errInsert?.message ?? 'Erro ao criar transação' }, { status: 500 })
    }

    const valorCentavos = Math.round(valor * 100)
    const returnUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/loja/checkout/sucesso?transacaoId=${transacao.id}`
      : undefined

    if (metodo === 'PIX') {
      const payerName = (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? user.email ?? 'Cliente'
      const result = await criarTransacaoPix(config, {
        valorCentavos,
        referencia,
        payer: { name: payerName, email: user.email ?? '' },
      })
      if (!result.ok) {
        await admin.from('transacoes').update({ status: 'RECUSADO', updated_at: new Date().toISOString() }).eq('id', transacao.id)
        return NextResponse.json({ ok: false, erro: result.erro ?? 'Falha ao gerar Pix' }, { status: 502 })
      }
      await admin
        .from('transacoes')
        .update({
          status: 'PROCESSANDO',
          gateway_id: result.gatewayId ?? undefined,
          gateway_tid: result.tid,
          gateway_nsu: result.nsu,
          gateway_data: {
            qrCodeImage: result.qrCodeImage,
            qrCodeData: result.qrCodeData,
            copyPaste: result.copyPaste,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', transacao.id)
      return NextResponse.json({
        ok: true,
        transacaoId: transacao.id,
        pix: {
          qrCodeImage: result.qrCodeImage,
          qrCodeData: result.qrCodeData,
          qrCodeBase64: result.qrCodeBase64,
          copyPaste: result.copyPaste,
        },
      })
    }

    const card = body.card
    if (!card?.number || !card.validity || !card.cvv || !card.nomePortador) {
      return NextResponse.json({ ok: false, erro: 'Cartão: number, validity, cvv e nomePortador obrigatórios' }, { status: 400 })
    }
    const nomeCliente =
      usuario.nome?.trim() ||
      (user.user_metadata?.full_name as string)?.trim() ||
      (user.user_metadata?.name as string)?.trim() ||
      card.nomePortador.trim() ||
      'Cliente'
    const cpfUsuario = (usuario.cpf ?? '').replace(/\D/g, '')
    const result = await criarTransacaoCartao(config, {
      valorCentavos,
      referencia,
      numero: card.number,
      validade: card.validity,
      cvv: card.cvv,
      nomePortador: card.nomePortador,
      parcelas: card.parcelas ?? 1,
      payer: {
        name: nomeCliente,
        email: user.email ?? '',
        cpf: cpfUsuario.length === 11 ? cpfUsuario : undefined,
      },
    })
    const now = new Date().toISOString()
    if (result.ok) {
      await admin
        .from('transacoes')
        .update({
          status: 'APROVADO',
          gateway_id: result.gatewayId,
          gateway_tid: result.tid,
          gateway_nsu: result.nsu,
          gateway_data: {
            returnCode: result.returnCode,
            returnMessage: result.returnMessage,
            parcelas: card.parcelas ?? 1,
          },
          updated_at: now,
        })
        .eq('id', transacao.id)
      const conf = await confirmarTransacaoAprovada(transacao.id)
      if (!conf.ok) {
        return NextResponse.json({ ok: false, erro: conf.erro ?? 'Pagamento aprovado mas falha ao confirmar pedido/recarga' }, { status: 502 })
      }
      return NextResponse.json({
        ok: true,
        transacaoId: transacao.id,
        pedidoIds: conf.pedidoIds,
      })
    }

    // Resposta da Rede com returnCode (58, 116, 00, etc.) = sempre HTTP 200 (não é erro técnico)
    const hasReturnCode = result.returnCode != null && String(result.returnCode) !== ''
    await admin
      .from('transacoes')
      .update({
        status: 'RECUSADO',
        gateway_id: result.gatewayId ?? undefined,
        gateway_tid: result.tid ?? undefined,
        gateway_nsu: result.nsu ?? undefined,
        gateway_data: {
          returnCode: result.returnCode,
          returnMessage: result.returnMessage ?? result.erro,
          parcelas: card.parcelas ?? 1,
        },
        updated_at: now,
      })
      .eq('id', transacao.id)

    if (hasReturnCode) {
      const ok = result.returnCode === '00' || result.returnCode === '0'
      return NextResponse.json(
        {
          ok,
          returnCode: result.returnCode,
          returnMessage: result.returnMessage ?? result.erro ?? 'Pagamento recusado',
          tid: result.tid,
          nsu: result.nsu,
        },
        { status: 200 }
      )
    }

    // Erro técnico (timeout, 401/403, JSON inválido) → 502
    return NextResponse.json({ ok: false, erro: result.erro ?? 'Falha no gateway' }, { status: 502 })
  } catch (e) {
    console.error('[checkout/criar]', e)
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
