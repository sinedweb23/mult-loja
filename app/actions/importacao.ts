'use server'

import { createClient } from '@/lib/supabase/server'
import { verificarSeEhAdmin } from './admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function listarLogsImportacao(empresaId: string) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('importacao_logs')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('iniciado_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function obterLogImportacao(logId: string) {
  const ehAdmin = await verificarSeEhAdmin()
  if (!ehAdmin) throw new Error('Não autorizado')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('importacao_logs')
    .select('*')
    .eq('id', logId)
    .single()
  if (error) throw error
  return data
}

// ---- Fetch compartilhado (igual para teste e importação) ----
const FETCH_OPTIONS = {
  method: 'GET' as const,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'CantinaEat-Import/1.0',
  },
  cache: 'no-store' as const,
}

async function fetchAPIExterna(apiUrl: string, apiKey: string): Promise<{
  ok: boolean
  status: number
  statusText: string
  bodyLength: number
  text: string
  data: any
  error?: string
}> {
  const res = await fetch(apiUrl, {
    ...FETCH_OPTIONS,
    headers: { ...FETCH_OPTIONS.headers, Authorization: `Bearer ${apiKey}` },
  })
  const rawText = await res.text()
  const text = rawText.replace(/^\uFEFF/, '').trim()
  const bodyLength = text.length

  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        bodyLength,
        text,
        data: null,
        error: res.ok ? 'Resposta não é JSON válido' : undefined,
      }
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      bodyLength,
      text,
      data,
      error: `HTTP ${res.status}: ${res.statusText}`,
    }
  }

  return { ok: true, status: res.status, statusText: res.statusText, bodyLength, text, data }
}

function extrairRegistrosDaResposta(data: any): any[] {
  let registros: any[] = []
  if (Array.isArray(data)) registros = data
  else if (Array.isArray(data?.registros)) registros = data.registros
  else if (Array.isArray(data?.alunos)) registros = data.alunos

  if (registros.length === 0 && data && typeof data === 'object') {
    const extra = [data.novos_alunos, data.alunos_novos, data.lista_alunos, data.dados].filter(Array.isArray) as any[][]
    if (extra.length > 0) registros = extra.flat()
  }

  if (Array.isArray(data?.registros) && Array.isArray(data?.alunos) && data.registros !== data.alunos) {
    const idsReg = new Set((data.registros as any[]).map((x: any) => x?.prontuario ?? x?.prontuario_aluno ?? x?.id_aluno))
    const doAlunos = (data.alunos as any[]).filter((a: any) => !idsReg.has(a?.prontuario ?? a?.prontuario_aluno ?? a?.id_aluno))
    if (doAlunos.length > 0) registros = [...(registros || []), ...doAlunos]
  }

  return Array.isArray(registros) ? registros : []
}

function extrairPaginacao(data: any): {
  temPaginacao: boolean
  paginaAtual: number | null
  totalPaginas: number | null
  proximaUrl: string | null
  pageParam: 'page' | 'pagina'
} {
  const paginaAtual = Number(
    data?.pagina_atual ?? data?.pagina ?? data?.current_page ?? data?.meta?.current_page ?? data?.paginacao?.pagina_atual
  )
  const totalPaginas = Number(
    data?.total_paginas ?? data?.paginas ?? data?.last_page ?? data?.meta?.last_page ?? data?.paginacao?.total_paginas
  )
  const proximaUrl =
    data?.next_page_url ??
    data?.proxima_pagina_url ??
    data?.links?.next ??
    data?.paginacao?.proxima_url ??
    null

  const pageParam: 'page' | 'pagina' =
    data?.pagina_atual != null || data?.pagina != null || data?.total_paginas != null || data?.paginas != null
      ? 'pagina'
      : 'page'

  const temPaginacao = !!proximaUrl || (Number.isFinite(paginaAtual) && Number.isFinite(totalPaginas) && totalPaginas > 1)
  return {
    temPaginacao,
    paginaAtual: Number.isFinite(paginaAtual) ? paginaAtual : null,
    totalPaginas: Number.isFinite(totalPaginas) ? totalPaginas : null,
    proximaUrl: proximaUrl ? String(proximaUrl) : null,
    pageParam,
  }
}

// ---- Teste de conexão (mesmo fetch, só devolve diagnóstico) ----
export type ResultadoTesteConexao = {
  ok: boolean
  status?: number
  statusText?: string
  bodyLength: number
  detalhe: string
  snippet?: string
}

export async function testarConexaoAPIExterna(
  apiUrl: string,
  apiKey: string
): Promise<ResultadoTesteConexao> {
  if (!(await verificarSeEhAdmin())) {
    return { ok: false, bodyLength: 0, detalhe: 'Não autorizado' }
  }

  try {
    const r = await fetchAPIExterna(apiUrl, apiKey)

    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        statusText: r.statusText,
        bodyLength: r.bodyLength,
        detalhe: r.error || `HTTP ${r.status}`,
        snippet: r.text?.slice(0, 300),
      }
    }

    const data = r.data
    if (data == null) {
      return {
        ok: true,
        status: r.status,
        bodyLength: r.bodyLength,
        detalhe: 'JSON é null ou undefined',
        snippet: r.text?.slice(0, 300),
      }
    }

    if (Array.isArray(data)) {
      return {
        ok: true,
        status: r.status,
        bodyLength: r.bodyLength,
        detalhe: `Array com ${data.length} itens`,
        snippet: JSON.stringify(data[0]).slice(0, 300),
      }
    }

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data).join(', ')
      const reg = data.registros
      const alunos = data.alunos
      let detalhe = `Chaves: ${keys}`
      if (Array.isArray(reg)) detalhe += ` | registros: ${reg.length} itens`
      if (Array.isArray(alunos)) detalhe += ` | alunos: ${alunos.length} itens`
      const arr = reg ?? alunos ?? data
      const snippet = Array.isArray(arr) && arr[0]
        ? JSON.stringify(arr[0]).slice(0, 300)
        : r.text?.slice(0, 300)
      return {
        ok: true,
        status: r.status,
        bodyLength: r.bodyLength,
        detalhe,
        snippet,
      }
    }

    return {
      ok: true,
      status: r.status,
      bodyLength: r.bodyLength,
      detalhe: `Tipo: ${typeof data}`,
      snippet: r.text?.slice(0, 300),
    }
  } catch (err: any) {
    return {
      ok: false,
      bodyLength: 0,
      detalhe: err?.message || err?.toString() || 'Erro desconhecido',
    }
  }
}

// ---- Importação: fase 1 = baixar e gravar; fase 2 = processar em lotes ----
export type ResultadoImportacao =
  | {
      success: true
      log_id: string | null
      total_registros: number
      total_alunos?: number
      registros_processados?: number
      registros_criados?: number
      registros_atualizados?: number
      registros_com_erro?: number
      message?: string
      /** true = dados gravados, processamento em andamento (polling) */
      em_andamento?: boolean
      /** true = lote concluído (parar polling) */
      done?: boolean
    }
  | { success: false; error: string }

/** Alunos por lote; menor = menos carga no banco por request (evita travar). */
const TAMANHO_LOTE = 18

/** Fase 1: baixa o JSON da API e grava no log. Retorna logo (sem timeout). */
export async function importarDaAPIExterna(
  apiUrl: string,
  apiKey: string,
  empresaId: string,
  options?: { skipAuth?: boolean }
): Promise<ResultadoImportacao> {
  const fail = (error: string): ResultadoImportacao => {
    console.error('[importarDaAPIExterna]', error)
    return { success: false, error }
  }

  if (!options?.skipAuth && !(await verificarSeEhAdmin())) return fail('Não autorizado')
  if (!empresaId || typeof empresaId !== 'string') return fail('Nenhuma empresa selecionada')

  try {
    const r = await fetchAPIExterna(apiUrl, apiKey)
    if (!r.ok) return fail(r.error || `HTTP ${r.status}: ${r.statusText}`)
    if (!r.data) return fail('Resposta da API sem dados')

    const data = r.data
    let registros: any[] = extrairRegistrosDaResposta(data)

    const temArray = registros.length > 0
    if (!temArray) {
      const keys = typeof data === 'object' && data ? Object.keys(data).join(', ') : '—'
      return fail(`Resposta sem array de alunos/registros. Chaves: ${keys}`)
    }
    if (data && typeof data === 'object' && data.success === false) {
      return fail(data.message || data.error || 'API retornou erro')
    }

    // Buscar páginas adicionais quando a API externa estiver paginada.
    const pag = extrairPaginacao(data)
    if (pag.temPaginacao) {
      const limitePaginas = 200
      let paginaAtual = pag.paginaAtual ?? 1
      let totalPaginas = pag.totalPaginas
      let proximaUrl = pag.proximaUrl
      let loops = 0

      while (loops < limitePaginas) {
        loops++
        let urlPagina: string | null = null

        if (proximaUrl) {
          urlPagina = new URL(proximaUrl, apiUrl).toString()
        } else if (totalPaginas && paginaAtual < totalPaginas) {
          const proxPagina = paginaAtual + 1
          const u = new URL(apiUrl)
          u.searchParams.set(pag.pageParam, String(proxPagina))
          urlPagina = u.toString()
        }

        if (!urlPagina) break

        const rp = await fetchAPIExterna(urlPagina, apiKey)
        if (!rp.ok || !rp.data) break
        if (rp.data && typeof rp.data === 'object' && rp.data.success === false) break

        const regsPagina = extrairRegistrosDaResposta(rp.data)
        if (regsPagina.length === 0) break
        registros = [...registros, ...regsPagina]

        const pagAtual = extrairPaginacao(rp.data)
        const proxPaginaNum = pagAtual.paginaAtual
        if (proxPaginaNum != null && proxPaginaNum <= paginaAtual && !pagAtual.proximaUrl) break

        paginaAtual = proxPaginaNum ?? (paginaAtual + 1)
        totalPaginas = pagAtual.totalPaginas ?? totalPaginas
        proximaUrl = pagAtual.proximaUrl
      }
    }

    const prontuariosUnicos = new Set<string>()
    for (const reg of registros) {
      const p = reg?.prontuario?.trim()
      if (p) prontuariosUnicos.add(p)
    }
    const total_alunos = prontuariosUnicos.size

    const supabaseAdmin = createAdminClient()
    const { data: log, error: insertError } = await supabaseAdmin
      .from('importacao_logs')
      .insert({
        empresa_id: empresaId,
        tipo: 'API',
        status: 'EM_PROGRESSO',
        total_registros: registros.length,
        registros_processados: 0,
        registros_criados: 0,
        registros_atualizados: 0,
        registros_com_erro: 0,
        payload_inicial: { registros, total_alunos },
      })
      .select('id')
      .single()

    if (insertError || !log?.id) {
      return fail(insertError?.message || 'Erro ao gravar log de importação')
    }

    return {
      success: true,
      log_id: log.id,
      total_registros: registros.length,
      total_alunos,
      registros_processados: 0,
      registros_criados: 0,
      registros_atualizados: 0,
      registros_com_erro: 0,
      em_andamento: true,
      message: `${registros.length} registros baixados. Sincronizando em lotes...`,
    }
  } catch (err: any) {
    return fail(err?.message || err?.toString() || 'Erro ao importar')
  }
}

/** Fase 2: processa o próximo lote do log. Chamar em polling até done === true. */
export async function processarProximoLoteImportacao(
  logId: string,
  options?: { skipAuth?: boolean }
): Promise<ResultadoImportacao> {
  const fail = (error: string): ResultadoImportacao => ({ success: false, error })

  if (!options?.skipAuth && !(await verificarSeEhAdmin())) return fail('Não autorizado')
  if (!logId) return fail('Log não informado')

  try {
    const supabase = createAdminClient()
    const { data: log, error: fetchError } = await supabase
      .from('importacao_logs')
      .select('id, empresa_id, status, registros_processados, payload_inicial, total_registros')
      .eq('id', logId)
      .single()

    if (fetchError || !log) return fail('Log de importação não encontrado')
    if (log.status !== 'EM_PROGRESSO') {
      return {
        success: true,
        log_id: logId,
        total_registros: log.total_registros ?? 0,
        done: true,
        registros_processados: log.registros_processados ?? 0,
      }
    }

    const payload = log.payload_inicial
    const registros: any[] = Array.isArray(payload?.registros) ? payload.registros : Array.isArray(payload) ? payload : []
    const totalRegistros = log.total_registros ?? 0
    if (registros.length === 0) return fail('Nenhum registro no log')
    if (totalRegistros > 0 && registros.length < totalRegistros) {
      console.warn(`[importação] Payload com menos registros (${registros.length}) que total_registros (${totalRegistros}). Possível truncamento do JSON no banco.`)
    }

    const ordemProntuarios: string[] = []
    const vistos = new Set<string>()
    for (const reg of registros) {
      const p = reg?.prontuario?.trim()
      if (p && !vistos.has(p)) {
        vistos.add(p)
        ordemProntuarios.push(p)
      }
    }
    // total_alunos = prontuários únicos (evita progresso errado quando payload não tem total_alunos)
    const total_alunos = payload?.total_alunos ?? ordemProntuarios.length

    const offset = (log.registros_processados as number) ?? 0
    const batchProntuarios = ordemProntuarios.slice(offset, offset + TAMANHO_LOTE)
    if (batchProntuarios.length === 0) {
      return {
        success: true,
        log_id: logId,
        total_registros: log.total_registros ?? 0,
        done: true,
        registros_processados: total_alunos,
      }
    }

    const batchRegistros = registros.filter((r: any) =>
      batchProntuarios.includes(r?.prontuario?.trim())
    )

    const apiKeyInterna = process.env.IMPORTACAO_API_KEY || 'default-api-key-change-me'
    const { processarImportacao } = await import('@/app/api/importacao/processar')
    const result = await processarImportacao({
      empresa_id: log.empresa_id,
      api_key: apiKeyInterna,
      registros: batchRegistros,
      existing_log_id: logId,
    })

    if (!result || typeof result !== 'object') {
      return fail('Erro ao processar lote')
    }
    if (result.success !== true) {
      return fail((result as any).error || 'Erro no processamento')
    }

    const done = !!(result as any).done
    return {
      success: true,
      log_id: logId,
      total_registros: result.total_registros ?? log.total_registros ?? 0,
      registros_processados: result.registros_processados,
      registros_criados: result.registros_criados,
      registros_atualizados: result.registros_atualizados,
      registros_com_erro: result.registros_com_erro,
      em_andamento: !done,
      done,
      message: done ? 'Sincronização concluída.' : undefined,
    }
  } catch (err: any) {
    return fail(err?.message || err?.toString() || 'Erro ao processar lote')
  }
}

/** Timeout por invocação do cron (evita estourar limite da Vercel). */
const CRON_RUN_MS = 50_000

/**
 * Executa sincronização de importação via cron (sem login de admin).
 * Variáveis de ambiente: IMPORTACAO_CRON_SECRET, IMPORTACAO_CRON_URL, IMPORTACAO_CRON_API_KEY, IMPORTACAO_CRON_EMPRESA_ID.
 */
export async function runImportacaoCron(cronSecret: string): Promise<{
  ok: boolean
  error?: string
  started?: boolean
  done?: boolean
  registros_processados?: number
  total_alunos?: number
  message?: string
}> {
  const secret = process.env.IMPORTACAO_CRON_SECRET || process.env.CRON_SECRET
  if (secret && cronSecret !== secret) {
    return { ok: false, error: 'Cron secret inválido' }
  }
  const url = process.env.IMPORTACAO_CRON_URL
  const apiKey = process.env.IMPORTACAO_CRON_API_KEY
  const empresaId = process.env.IMPORTACAO_CRON_EMPRESA_ID
  if (!url || !apiKey || !empresaId) {
    return {
      ok: false,
      error: 'Configure IMPORTACAO_CRON_URL, IMPORTACAO_CRON_API_KEY e IMPORTACAO_CRON_EMPRESA_ID',
    }
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    let logId: string | null = null
    const { data: logEmProgresso } = await supabase
      .from('importacao_logs')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('status', 'EM_PROGRESSO')
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logEmProgresso?.id) {
      logId = logEmProgresso.id
    } else {
      const res = await importarDaAPIExterna(url, apiKey, empresaId, { skipAuth: true })
      if (!res.success) {
        return { ok: false, error: res.error || 'Falha ao baixar dados da API' }
      }
      if (!res.log_id) {
        return { ok: false, error: 'Falha ao baixar dados da API' }
      }
      logId = res.log_id
    }

    let done = false
    let registrosProcessados = 0
    let totalAlunos = 0

    while (Date.now() - startTime < CRON_RUN_MS && logId) {
      const lote = await processarProximoLoteImportacao(logId, { skipAuth: true })
      if (!lote.success) {
        return { ok: false, error: lote.error }
      }
      registrosProcessados = lote.registros_processados ?? 0
      totalAlunos = (lote as any).total_registros ?? 0
      done = !!(lote as any).done
      if (done) break
      await new Promise((r) => setTimeout(r, 2000))
    }

    return {
      ok: true,
      started: !logEmProgresso?.id,
      done,
      registros_processados: registrosProcessados,
      total_alunos: totalAlunos,
      message: done ? 'Sincronização concluída.' : 'Limite de tempo; próximo cron continuará.',
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}
