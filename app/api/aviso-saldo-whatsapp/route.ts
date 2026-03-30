import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterConfiguracaoAparencia } from '@/app/actions/configuracoes'
import twilio from 'twilio'

export const dynamic = 'force-dynamic'

const ALUNO_ID_TESTE = '408d0682-741e-49d4-be2a-2bd696859367'
const LIMITE_SALDO_REAIS = 10

/**
 * Normaliza celular brasileiro para E.164 (whatsapp:+5511999999999).
 * Aceita (11) 99999-9999, 11999999999, 11 96468-7900, etc.
 */
function normalizarCelularE164(celular: string): string | null {
  const apenasDigitos = celular.replace(/\D/g, '')
  // 11 dígitos: DDD (2) + 9 + 8 dígitos → +55 + número
  if (apenasDigitos.length === 11) {
    return `+55${apenasDigitos}`
  }
  // 10 dígitos: DDD (2) + 8 dígitos (formato antigo)
  if (apenasDigitos.length === 10) {
    return `+55${apenasDigitos}`
  }
  // Já com 55 na frente (12 ou 13 dígitos)
  if ((apenasDigitos.length === 12 || apenasDigitos.length === 13) && apenasDigitos.startsWith('55')) {
    return `+${apenasDigitos}`
  }
  return null
}

/**
 * POST /api/aviso-saldo-whatsapp
 * Envia aviso de saldo baixo por WhatsApp aos responsáveis da aluna.
 *
 * Teste: envia apenas para a aluna ANA CLARA MENDES DO NASCIMENTO (alunoId fixo).
 * Body opcional: { "alunoId": "uuid" } — se não enviado, usa o ID da aluna de teste.
 *
 * Requer header: Authorization: Bearer <AVISO_SALDO_WHATSAPP_API_KEY>
 * ou x-api-key: <AVISO_SALDO_WHATSAPP_API_KEY>
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.AVISO_SALDO_WHATSAPP_API_KEY
  const authHeader = request.headers.get('authorization')
  const keyHeader = request.headers.get('x-api-key')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : keyHeader
  if (!apiKey || token !== apiKey) {
    return NextResponse.json({ ok: false, erro: 'Não autorizado' }, { status: 401 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER
  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json(
      { ok: false, erro: 'Twilio não configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)' },
      { status: 500 }
    )
  }

  let alunoId = ALUNO_ID_TESTE
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.alunoId && typeof body.alunoId === 'string') {
      alunoId = body.alunoId
    }
  } catch {
    // mantém ALUNO_ID_TESTE
  }

  const admin = createAdminClient()

  // 1. Buscar aluno (nome)
  const { data: aluno, error: errAluno } = await admin
    .from('alunos')
    .select('id, nome')
    .eq('id', alunoId)
    .maybeSingle()

  if (errAluno) {
    console.error('[aviso-saldo-whatsapp] Erro ao buscar aluno:', errAluno)
    return NextResponse.json({ ok: false, erro: 'Erro ao buscar aluno' }, { status: 500 })
  }
  if (!aluno) {
    return NextResponse.json({ ok: false, erro: 'Aluno não encontrado' }, { status: 404 })
  }

  const nomeAluna = (aluno.nome || 'Aluno(a)').trim().toUpperCase()

  // Saldo atual do aluno (para a mensagem)
  const { data: saldoRow } = await admin
    .from('aluno_saldos')
    .select('saldo')
    .eq('aluno_id', alunoId)
    .maybeSingle()
  const saldoAtual = Number(saldoRow?.saldo ?? 0)
  const saldoFormatado = saldoAtual.toFixed(2).replace('.', ',')

  const { loja_nome } = await obterConfiguracaoAparencia()
  const nomeEmpresa = (loja_nome || 'Cantina').trim()
  const site = (process.env.NEXT_PUBLIC_APP_URL || 'eatsimple.com.br').replace(/^https?:\/\//i, '').replace(/\/$/, '')

  // 2. Buscar responsáveis vinculados (usuario_aluno -> usuarios) e obter celular
  const { data: vinculos, error: errVinculos } = await admin
    .from('usuario_aluno')
    .select(`
      usuario_id,
      usuarios:usuario_id (
        id,
        nome,
        celular,
        ativo
      )
    `)
    .eq('aluno_id', alunoId)

  if (errVinculos) {
    console.error('[aviso-saldo-whatsapp] Erro ao buscar responsáveis:', errVinculos)
    return NextResponse.json({ ok: false, erro: 'Erro ao buscar responsáveis' }, { status: 500 })
  }

  type UsuarioRow = { id: string; nome: string | null; celular: string | null; ativo: boolean | null }
  const responsaveis = (vinculos || [])
    .map((v: { usuarios?: UsuarioRow | UsuarioRow[] }) => {
      const u = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      return u
    })
    .filter((u): u is UsuarioRow & { celular: string } => u != null && !!u.ativo && !!u.celular && u.celular.trim() !== '')

  if (responsaveis.length === 0) {
    return NextResponse.json({
      ok: true,
      mensagem: 'Nenhum responsável com celular cadastrado para esta aluna.',
      enviados: 0,
    })
  }

  const texto = `Aviso ${nomeEmpresa}: O saldo da aluna ${nomeAluna} está baixo, saldo atual R$ ${saldoFormatado}. Realize uma recarga e evite bloqueios. ${site}`
  const client = twilio(accountSid, authToken)
  const fromSemPrefixo = fromNumber.replace(/^whatsapp:/i, '').trim()
  const fromE164 = fromSemPrefixo.startsWith('+') ? fromSemPrefixo : `+${fromSemPrefixo}`
  const resultados: { usuario_id: string; celular: string; sucesso: boolean; erro?: string }[] = []

  for (const resp of responsaveis) {
    const celularE164 = normalizarCelularE164(resp.celular!.trim())
    if (!celularE164) {
      resultados.push({
        usuario_id: resp.id,
        celular: resp.celular!,
        sucesso: false,
        erro: 'Celular em formato inválido para WhatsApp',
      })
      continue
    }
    // Twilio não permite To = From (mesmo número)
    if (celularE164 === fromE164) {
      resultados.push({
        usuario_id: resp.id,
        celular: resp.celular!,
        sucesso: false,
        erro: 'Não é possível enviar para o mesmo número configurado como remetente (From)',
      })
      continue
    }
    const toWhatsApp = `whatsapp:${celularE164}`
    try {
      await client.messages.create({
        body: texto,
        from: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
        to: toWhatsApp,
      })
      resultados.push({ usuario_id: resp.id, celular: resp.celular!, sucesso: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[aviso-saldo-whatsapp] Erro Twilio para', toWhatsApp, msg)
      resultados.push({ usuario_id: resp.id, celular: resp.celular!, sucesso: false, erro: msg })
    }
  }

  const enviados = resultados.filter((r) => r.sucesso).length
  return NextResponse.json({
    ok: true,
    aluno_id: alunoId,
    nome_aluna: nomeAluna,
    enviados,
    total_responsaveis: responsaveis.length,
    resultados,
  })
}
