/**
 * Cliente do gateway de pagamento Rede (e.Rede).
 * Autenticação: Basic Auth com PV + Token.
 *
 * ✅ Troca automática sandbox/produção por UMA variável:
 *    EREDE_ENV=sandbox | production
 *
 * ✅ Variáveis esperadas (RECOMENDADO - sem mistura):
 * - EREDE_ENV=sandbox|production
 * - EREDE_PV_SANDBOX, EREDE_TOKEN_SANDBOX
 * - EREDE_PV_PRODUCTION, EREDE_TOKEN_PRODUCTION
 *
 * (opcional) URLs custom:
 * - EREDE_URL_SANDBOX=https://sandbox-erede.useredecloud.com.br/v1/transactions  (ou /v2/transactions)
 * - EREDE_URL_PRODUCTION=https://api.userede.com.br/erede/v1/transactions      (ou /v2/transactions)
 *
 * (opcional) debug:
 * - REDE_LOG_HEADERS=true
 *
 * ✅ Ajustes anti-403/CloudFront:
 * - Sempre manda User-Agent e Accept
 * - PIX usa kind: "Pix"
 * - Valida se alguém passou /oauth2/token por engano
 *
 * ✅ Cartão (para ficar IGUAL ao seu PHP que aprova):
 * - Endpoint: MESMO do PIX (POST /v1/transactions ou /v2/transactions conforme env)
 * - Payload "flat" com: capture, kind='credit', reference, amount, installments,
 *   cardholderName, cardNumber, expirationMonth, expirationYear, securityCode, payer {name,email,cpf}
 * - expirationYear sempre '20' + AA (quando validade é MM/AA)
 */

import https from 'https'
import http from 'http'

const REDE_DOC_URL = 'https://developer.userede.com.br/e-rede'

// Bases padrão (se não setar EREDE_URL_*)
const REDE_PROD_BASE = 'https://api.userede.com.br/erede'
const REDE_SANDBOX_BASE = 'https://sandbox-erede.useredecloud.com.br'

// você pode trocar para 'v1' se quiser forçar padrão (mas não recomendo misturar):
// - se EREDE_URL_* estiver setado, ele manda exatamente para lá
// - se NÃO estiver setado, ele usa REDE_API_VERSION abaixo
const REDE_API_VERSION = 'v2'

export interface RedeConfig {
  pv: string
  token: string
}

type RedeEnv = 'sandbox' | 'production'

function getEnv(): RedeEnv {
  const raw = (process.env.EREDE_ENV || process.env.REDE_ENV || '').toLowerCase().trim()
  if (raw === 'sandbox') return 'sandbox'
  if (raw === 'production') return 'production'

  // Blindagem: local/dev => sandbox (pra não cair em produção sem querer)
  if (process.env.NODE_ENV !== 'production') return 'sandbox'
  return 'production'
}

/**
 * Normaliza URLs customizadas:
 * - Se vier já com /v1/transactions ou /v2/transactions, usa como está
 * - Se vier base, anexa /v2/transactions (ou REDE_API_VERSION)
 * - Se passar endpoint do OAuth (/oauth2/token), lança erro claro
 */
function normalizeTransactionsUrl(custom: string): string {
  const clean = custom.trim().replace(/\?.*$/, '').replace(/\/+$/, '')

  if (clean.includes('/oauth2/token')) {
    throw new Error(
      `EREDE_URL_* está apontando para /oauth2/token. Aqui precisa ser o endpoint de TRANSAÇÕES. ` +
        `Use: ${REDE_SANDBOX_BASE}/v1/transactions (sandbox) ou ${REDE_PROD_BASE}/v1/transactions (produção) ` +
        `(ou v2). Docs: ${REDE_DOC_URL}`
    )
  }

  // já veio apontando para transactions
  if (/\/v[12]\/transactions$/.test(clean) || /\/transactions$/.test(clean)) return clean

  // veio base: anexa /vX/transactions
  return `${clean}/${REDE_API_VERSION}/transactions`
}

/** URL para /vX/transactions conforme ambiente (sandbox/prod). */
function getTransactionsUrl(): string {
  const env = getEnv()

  const custom =
    env === 'sandbox'
      ? (process.env.EREDE_URL_SANDBOX?.trim() || '')
      : (process.env.EREDE_URL_PRODUCTION?.trim() || '')

  if (custom) return normalizeTransactionsUrl(custom)

  if (env === 'sandbox') return `${REDE_SANDBOX_BASE}/${REDE_API_VERSION}/transactions`
  return `${REDE_PROD_BASE}/${REDE_API_VERSION}/transactions`
}

/** Retorna Authorization: Basic base64(PV:TOKEN) */
function getRedeBasicAuth(config: RedeConfig): string {
  const credentials = Buffer.from(`${config.pv.trim()}:${config.token.trim()}`, 'utf8').toString('base64')
  return `Basic ${credentials}`
}

/** reference para a API e.Rede: alfanumérico, máx. 16 caracteres (API rejeita HTTP 400 acima disso). */
function normalizeRedeReference(ref: string): string {
  const alfanum = String(ref ?? '').replace(/\W/g, '')
  if (alfanum.length <= 16) return alfanum
  return alfanum.slice(-16)
}

/** Log opcional (não vaza Authorization). */
function logRedeRequest(method: string, url: string, headers: Record<string, string>, body?: string): void {
  if (process.env.REDE_LOG_HEADERS !== 'true' && process.env.REDE_LOG_HEADERS !== '1') return
  const safeHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization' && v) safeHeaders[k] = 'Basic ***'
    else safeHeaders[k] = v
  }
  console.log(
    '[Rede – log]',
    JSON.stringify(
      {
        env: getEnv(),
        method,
        url,
        headers: safeHeaders,
        bodyPreview: body ? body.slice(0, 600) : undefined,
      },
      null,
      2
    )
  )
}

function redeErroMsg(status: number, rawBody: string, fallback: string): string {
  const bodyLower = (rawBody || '').toLowerCase()
  if (status === 403 && (bodyLower.includes('cloudfront') || bodyLower.includes('request blocked'))) {
    return (
      `Rede (CloudFront) bloqueou a requisição. ` +
      `Confirme: (1) URL do ambiente correta, (2) chamada só no backend, (3) PV/Token do mesmo ambiente. ` +
      `Docs: ${REDE_DOC_URL}`
    )
  }
  return fallback
}

/** Requisição HTTP com http/https nativo (parecido com cURL). */
function redeRequest(
  urlStr: string,
  method: 'GET' | 'POST',
  authHeader: string,
  body?: string
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  const u = new URL(urlStr)
  const isHttps = u.protocol === 'https:'

  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: 'application/json',
    'User-Agent': 'rede-node/1.0',
    ...(body
      ? {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body, 'utf8')),
        }
      : {}),
  }

  const options: https.RequestOptions = {
    hostname: u.hostname,
    port: u.port ? Number(u.port) : isHttps ? 443 : 80,
    path: u.pathname + u.search,
    method,
    headers,
  }

  const transport = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        })
      })
    })

    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Timeout'))
    })
    if (body) req.write(body, 'utf8')
    req.end()
  })
}

/**
 * ✅ Config automática por ambiente (UMA variável: EREDE_ENV)
 * (modo estrito — recomendado)
 *
 * Usa:
 * - sandbox: EREDE_PV_SANDBOX + EREDE_TOKEN_SANDBOX
 * - production: EREDE_PV_PRODUCTION + EREDE_TOKEN_PRODUCTION
 *
 * ⚠️ Sem fallback para EREDE_PV/EREDE_TOKEN para evitar "mistura" de ambiente.
 */
export function getRedeConfig(): RedeConfig | null {
  const env = getEnv()

  if (env === 'sandbox') {
    const pv = process.env.EREDE_PV_SANDBOX?.trim()
    const token = process.env.EREDE_TOKEN_SANDBOX?.trim()
    if (!pv || !token) return null
    return { pv, token }
  }

  const pv = process.env.EREDE_PV_PRODUCTION?.trim()
  const token = process.env.EREDE_TOKEN_PRODUCTION?.trim()
  if (!pv || !token) return null
  return { pv, token }
}

export interface RedeCriarTransacaoPixInput {
  valorCentavos: number
  referencia: string
  orderId?: string
  /** Expiração do QR em ISO (YYYY-MM-DDTHH:mm:ss). Default: 15 min a partir de agora. */
  dateTimeExpiration?: string
  payer?: { name: string; email?: string; cpf?: string }
}

export interface RedeCriarTransacaoPixResult {
  ok: boolean
  gatewayId?: string
  tid?: string
  nsu?: string
  qrCodeImage?: string
  qrCodeData?: string
  qrCodeBase64?: string
  copyPaste?: string
  erro?: string
  debug?: { statusCode: number; url: string; bodyPreview: string }
}

/** Cria transação Pix e retorna QRCode (base64 + copia e cola). */
export async function criarTransacaoPix(
  config: RedeConfig,
  input: RedeCriarTransacaoPixInput
): Promise<RedeCriarTransacaoPixResult> {
  const url = getTransactionsUrl()

  const now = new Date()
  const expiraEm = input.dateTimeExpiration ? new Date(input.dateTimeExpiration) : new Date(now.getTime() + 15 * 60 * 1000)
  const dateTimeExpiration = expiraEm.toISOString().slice(0, 19) // YYYY-MM-DDTHH:mm:ss

  const refRede = normalizeRedeReference(input.referencia)
  const payload: Record<string, unknown> = {
    kind: 'Pix',
    reference: refRede,
    orderId: refRede,
    amount: Math.floor(Number(input.valorCentavos)),
    qrCode: { dateTimeExpiration },
  }

  if (input.payer?.name) {
    payload.payer = {
      name: input.payer.name,
      email: input.payer.email ?? '',
      cpf: input.payer.cpf ?? '',
    }
  }

  const authHeader = getRedeBasicAuth(config)
  const bodyStr = JSON.stringify(payload)

  logRedeRequest(
    'POST',
    url,
    {
      Authorization: 'Basic ***',
      Accept: 'application/json',
      'User-Agent': 'rede-node/1.0',
      'Content-Type': 'application/json',
    },
    bodyStr
  )

  const { statusCode, body: rawBody } = await redeRequest(url, 'POST', authHeader, bodyStr)

  let data: Record<string, unknown> = {}
  try {
    if (rawBody) data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    data = {}
  }

  if (statusCode < 200 || statusCode >= 300) {
    const fallback =
      (data as any).message ??
      (data as any).returnMessage ??
      (data as any).erro ??
      (data as any).error ??
      (rawBody || `HTTP ${statusCode}`)
    const msg = redeErroMsg(statusCode, rawBody, String(fallback))

    return { ok: false, erro: msg, debug: { statusCode, url, bodyPreview: (rawBody || '').slice(0, 600) } }
  }

  const qrCodeResponse = (data as any).qrCodeResponse as Record<string, unknown> | undefined
  const qrCodeImage =
    (qrCodeResponse?.qrCodeImage as string) ?? ((data as any).qrCodeImage as string) ?? ((data as any).qrCodeBase64 as string)
  const qrCodeData =
    (qrCodeResponse?.qrCodeData as string) ?? ((data as any).qrCodeData as string) ?? ((data as any).copyPaste as string)

  return {
    ok: true,
    gatewayId: ((data as any).id ?? (data as any).tid) as string,
    tid: (data as any).tid as string,
    nsu: (data as any).nsu as string,
    qrCodeImage,
    qrCodeData,
    qrCodeBase64: qrCodeImage,
    copyPaste: qrCodeData,
  }
}

export interface RedeCriarTransacaoCartaoInput {
  valorCentavos: number
  referencia: string
  numero: string
  validade: string // MM/AA (preferido, igual seu PHP) ou MM/AAAA
  cvv: string
  nomePortador: string
  parcelas?: number
  payer?: { name: string; email?: string; cpf?: string }
}

export interface RedeCriarTransacaoCartaoResult {
  ok: boolean
  gatewayId?: string
  tid?: string
  nsu?: string
  status?: string
  erro?: string
  returnCode?: string
  returnMessage?: string
  debug?: { statusCode: number; url: string; bodyPreview: string }
}

/** Nome portador/payer: primeiro + último, CAIXA ALTA, máx. 25 chars (e.Rede recusa se muito longo). Igual PHP. */
function normalizarNomeCartaoPhp(nome: string): string {
  const s = String(nome || '').trim().replace(/\s+/g, ' ')
  const partes = s.split(' ').filter(Boolean)
  const primeiro = partes[0] ?? ''
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : ''
  let out = (primeiro && ultimo ? `${primeiro} ${ultimo}` : primeiro || ultimo || 'Cliente').toUpperCase()
  if (out.length > 25) out = out.slice(0, 25)
  return out
}

/** Expiration year igual seu PHP: se MM/AA => '20' + AA; se MM/AAAA => AAAA */
function getExpirationFromValidade(validade: string): { expirationMonth: string; expirationYear: string } {
  const v = String(validade || '').trim().replace(/\s/g, '')
  // aceita "MM/AA" ou "MM/AAAA"
  const parts = v.includes('/') ? v.split('/') : [v.slice(0, 2), v.slice(2)]
  const mm = (parts[0] || '').padStart(2, '0')
  const yy = parts[1] || ''
  if (yy.length === 4) return { expirationMonth: mm, expirationYear: yy }
  // padrão PHP: 20 + AA
  return { expirationMonth: mm, expirationYear: `20${yy}` }
}

/**
 * ✅ Cartão no MESMO endpoint do Pix (POST /vX/transactions)
 * ✅ Payload "flat" IGUAL ao seu PHP que aprova em sandbox
 */
export async function criarTransacaoCartao(
  config: RedeConfig,
  input: RedeCriarTransacaoCartaoInput
): Promise<RedeCriarTransacaoCartaoResult> {
  const url = getTransactionsUrl()

  const cardholderName = normalizarNomeCartaoPhp(input.nomePortador)
  const { expirationMonth, expirationYear } = getExpirationFromValidade(input.validade)

  // no PHP você remove só espaços do número
  const cardNumber = String(input.numero || '').replace(/\s/g, '')

  const refRede = normalizeRedeReference(input.referencia)
  const payer: Record<string, string> = {
    name: cardholderName,
    email: (input.payer?.email ?? '').trim() || '',
  }
  const cpfDigits = (input.payer?.cpf ?? '').replace(/\D/g, '')
  if (cpfDigits.length === 11) payer.cpf = cpfDigits

  const payload: Record<string, unknown> = {
    capture: true,
    kind: 'credit',
    reference: refRede,
    amount: Math.floor(Number(input.valorCentavos)),
    installments: Math.floor(Number(input.parcelas ?? 1)),
    cardholderName,
    cardNumber,
    expirationMonth,
    expirationYear,
    securityCode: String(input.cvv || ''),
    payer,
  }

  const authHeader = getRedeBasicAuth(config)
  const bodyStr = JSON.stringify(payload)

  logRedeRequest(
    'POST',
    url,
    {
      Authorization: 'Basic ***',
      Accept: 'application/json',
      'User-Agent': 'rede-node/1.0',
      'Content-Type': 'application/json',
    },
    bodyStr
  )

  const { statusCode, body: rawBody } = await redeRequest(url, 'POST', authHeader, bodyStr)

  let data: any = {}
  try {
    if (rawBody) data = JSON.parse(rawBody)
  } catch {
    data = {}
  }

  if (statusCode < 200 || statusCode >= 300) {
    const fallback =
      data.message ??
      data.returnMessage ??
      data.erro ??
      data.error ??
      (rawBody || `HTTP ${statusCode}`)
    const msg = redeErroMsg(statusCode, rawBody, String(fallback))

    return { ok: false, erro: msg, debug: { statusCode, url, bodyPreview: (rawBody || '').slice(0, 600) } }
  }

  // Seu PHP valida returnCode/returnMessage no root
  const returnCode = data.returnCode ?? data.authorization?.returnCode ?? ''
  const returnMessage = data.returnMessage ?? data.authorization?.returnMessage ?? ''
  const status = String(data.status ?? data.authorization?.status ?? '')

  return {
    ok: returnCode === '00' || returnCode === '0' || returnCode === 0,
    gatewayId: String(data.id ?? data.tid ?? ''),
    tid: String(data.tid ?? ''),
    nsu: String(data.nsu ?? ''),
    status,
    returnCode: String(returnCode),
    returnMessage: String(returnMessage),
  }
}

/** Consulta transação (Pix/Cartão) por gatewayId (tid/id). Usa a mesma URL base da criação (incl. custom). */
export async function consultarTransacao(
  config: RedeConfig,
  gatewayId: string
): Promise<{ status: string; tid?: string; nsu?: string; erro?: string; debug?: { statusCode: number; url: string; bodyPreview: string } }> {
  // Mesma base da criação (getTransactionsUrl = .../v2/transactions); GET = .../v2/transactions/:id
  const baseUrl = getTransactionsUrl()
  const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(gatewayId)}`

  const authHeader = getRedeBasicAuth(config)

  logRedeRequest('GET', url, { Authorization: 'Basic ***', Accept: 'application/json', 'User-Agent': 'rede-node/1.0' })

  const { statusCode, body: rawBody } = await redeRequest(url, 'GET', authHeader)

  if (statusCode < 200 || statusCode >= 300) {
    return {
      status: 'ERRO',
      erro: redeErroMsg(statusCode, rawBody, `HTTP ${statusCode}`),
      debug: { statusCode, url, bodyPreview: (rawBody || '').slice(0, 600) },
    }
  }

  let data: Record<string, unknown> = {}
  try {
    if (rawBody) data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    data = {}
  }

  const auth = data.authorization as Record<string, unknown> | undefined
  const payment = data.payment as Record<string, unknown> | undefined
  const statusRoot = (data as any).status
  const statusAuth = auth?.status
  const statusPayment = payment?.status
  const returnCode = (data as any).returnCode ?? auth?.returnCode
  const statusRaw = String(statusRoot ?? statusAuth ?? statusPayment ?? returnCode ?? '').trim()
  const statusNorm = statusRaw.toUpperCase()

  // Rede pode retornar status em data.status, data.authorization.status ou returnCode "00" = pago
  const paid =
    statusNorm === 'PAID' ||
    statusNorm === 'PAGO' ||
    statusNorm === 'APPROVED' ||
    statusNorm === 'APROVADO' ||
    statusNorm === 'CONFIRMED' ||
    statusNorm === '00' ||
    statusNorm === '0' ||
    returnCode === '00' ||
    returnCode === '0'
  const statusFinal = statusRaw || (paid ? 'PAID' : 'UNKNOWN')

  const statusRes = paid ? 'PAID' : statusFinal || 'UNKNOWN'
  const out: {
    status: string
    tid?: string
    nsu?: string
    erro?: string
    debug?: { statusCode: number; url: string; bodyPreview: string }
  } = {
    status: statusRes,
    tid: (data as any).tid ?? (data as any).id as string,
    nsu: (data as any).nsu as string,
  }
  if (statusRes === 'UNKNOWN' && rawBody) {
    out.debug = { statusCode, url, bodyPreview: (rawBody || '').slice(0, 800) }
  }
  return out
}
