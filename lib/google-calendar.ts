/**
 * Integração com Google Calendar para verificar conflitos de horários (ex.: Kit Festa).
 * Requer GOOGLE_CALENDAR_ID e uma das opções de credenciais:
 * - GOOGLE_SERVICE_ACCOUNT_JSON: na Vercel = conteúdo do JSON em uma linha; no local = conteúdo JSON ou caminho do arquivo (ex.: credencials/loja-eat-81b87bafe0b8.json)
 * - GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_FILE: caminho do arquivo (apenas local)
 */

import { readFileSync } from 'fs'
import path from 'path'
import { google } from 'googleapis'

export interface SlotHorario {
  inicio: string // "HH:mm"
  fim: string
}

function carregarCredenciaisGoogle(): object {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) {
    throw new Error('Google Agenda não configurada. Defina GOOGLE_CALENDAR_ID no .env.')
  }

  const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const isVercel =
    process.env.VERCEL === '1' ||
    !!process.env.VERCEL_URL ||
    (typeof process.cwd === 'function' && process.cwd().startsWith('/var/task'))

  if (jsonEnv) {
    const trimmed = jsonEnv.trim()
    // Conteúdo JSON (Vercel ou local com variável em linha)
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(jsonEnv) as object
      } catch {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido (deve ser um JSON válido).')
      }
    }
    // Local: valor é caminho do arquivo (ex.: credencials/loja-eat-81b87bafe0b8.json)
    if (!isVercel && (trimmed.endsWith('.json') || trimmed.includes('/') || trimmed.includes('\\'))) {
      const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), trimmed)
      try {
        const content = readFileSync(absolutePath, 'utf-8')
        return JSON.parse(content) as object
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('ENOENT') || (err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          throw new Error(
            `Arquivo de credenciais não encontrado (${trimmed}). Use GOOGLE_APPLICATION_CREDENTIALS com o caminho ou GOOGLE_SERVICE_ACCOUNT_JSON com o conteúdo do JSON.`
          )
        }
        throw new Error(`Erro ao ler arquivo de credenciais Google (${trimmed}): ${msg}`)
      }
    }
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido (deve ser um JSON válido ou, no local, o caminho do arquivo .json).')
  }

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_FILE

  // Na Vercel (ou ambiente serverless) não existe arquivo local — obrigar GOOGLE_SERVICE_ACCOUNT_JSON
  if (filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
    if (isVercel || absolutePath.includes('/var/task/')) {
      throw new Error(
        'Google Agenda: em produção (Vercel) use GOOGLE_SERVICE_ACCOUNT_JSON com o conteúdo do JSON. Remova GOOGLE_APPLICATION_CREDENTIALS. Veja DEPLOY_VERCEL.md.'
      )
    }
    try {
      const content = readFileSync(absolutePath, 'utf-8')
      return JSON.parse(content) as object
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ENOENT') || (err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new Error(
          `Arquivo não encontrado (${filePath}). Em produção defina GOOGLE_SERVICE_ACCOUNT_JSON.`
        )
      }
      throw new Error(`Erro ao ler arquivo de credenciais Google (${filePath}): ${msg}`)
    }
  }

  if (isVercel) {
    throw new Error(
      'Google Agenda: defina GOOGLE_SERVICE_ACCOUNT_JSON (conteúdo do JSON em uma linha). Veja DEPLOY_VERCEL.md.'
    )
  }

  throw new Error(
    'Google Agenda não configurada. Defina GOOGLE_CALENDAR_ID e GOOGLE_SERVICE_ACCOUNT_JSON (ou GOOGLE_APPLICATION_CREDENTIALS com o caminho do arquivo) no .env.'
  )
}

/**
 * Retorna eventos do calendário em um intervalo (para verificar conflitos).
 * timeMin/timeMax em ISO 8601 (ex.: 2026-03-10T00:00:00-03:00).
 */
export async function listarEventosNoPeriodo(
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) {
    throw new Error('Google Agenda não configurada. Defina GOOGLE_CALENDAR_ID no .env.')
  }

  const credentials = carregarCredenciaisGoogle()

  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar'],
  })
  const calendar = google.calendar({ version: 'v3', auth })

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  })
  const data = res.data

  const events = (data?.items || []).map((ev) => ({
    start: (ev.start?.dateTime || ev.start?.date || '').toString(),
    end: (ev.end?.dateTime || ev.end?.date || '').toString(),
  }))
  return events
}

/**
 * Versão detalhada de `listarEventosNoPeriodo` (inclui id) para permitir ignorar
 * um evento específico ao checar conflitos (ex.: remarcação).
 */
export async function listarEventosNoPeriodoDetalhado(
  timeMin: string,
  timeMax: string
): Promise<{ id: string; start: string; end: string }[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) {
    throw new Error('Google Agenda não configurada. Defina GOOGLE_CALENDAR_ID no .env.')
  }

  const credentials = carregarCredenciaisGoogle()
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar'],
  })
  const calendar = google.calendar({ version: 'v3', auth })

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  })
  const data = res.data
  return (data?.items || [])
    .map((ev) => ({
      id: String(ev.id || ''),
      start: (ev.start?.dateTime || ev.start?.date || '').toString(),
      end: (ev.end?.dateTime || ev.end?.date || '').toString(),
    }))
    .filter((e) => !!e.id && !!e.start && !!e.end)
}

/** Offset ISO para o timezone (evita depender do fuso do servidor). Brasil = -03:00. */
function offsetParaTimezone(tz: string): string {
  if (tz === 'America/Sao_Paulo' || tz.includes('America')) return '-03:00'
  return '-03:00'
}

/**
 * Dada uma data (YYYY-MM-DD), timezone (ex.: America/Sao_Paulo) e uma lista de slots (HH:mm - HH:mm),
 * retorna apenas os slots que NÃO têm conflito com eventos na agenda.
 * Um slot só fica disponível se NÃO existir nenhum evento que toque no intervalo [inicio, fim] do slot
 * (qualquer sobreposição = conflito).
 */
export async function filtrarSlotsDisponiveis(
  dataStr: string,
  slots: SlotHorario[],
  timezone: string = 'America/Sao_Paulo',
  ignoreEventId?: string
): Promise<SlotHorario[]> {
  if (slots.length === 0) return []

  const offset = offsetParaTimezone(timezone)
  const timeMinISO = `${dataStr}T00:00:00${offset}`
  const timeMaxISO = `${dataStr}T23:59:59.999${offset}`

  const eventos = ignoreEventId
    ? await listarEventosNoPeriodoDetalhado(timeMinISO, timeMaxISO)
    : await listarEventosNoPeriodo(timeMinISO, timeMaxISO)

  const disponiveis: SlotHorario[] = []
  for (const slot of slots) {
    const slotStart = new Date(`${dataStr}T${slot.inicio}:00${offset}`).getTime()
    const slotEnd = new Date(`${dataStr}T${slot.fim}:59.999${offset}`).getTime()
    const temConflito = eventos.some((ev) => {
      if (ignoreEventId && 'id' in ev && (ev as any).id === ignoreEventId) return false
      const evStart = new Date((ev as any).start).getTime()
      const evEnd = new Date((ev as any).end).getTime()
      return slotStart < evEnd && slotEnd > evStart
    })
    if (!temConflito) disponiveis.push(slot)
  }
  return disponiveis
}

export interface EventoKitFestaCriado {
  id: string
  htmlLink: string
}

/**
 * Cria um evento na Google Agenda para Kit Festa (após pagamento aprovado).
 * Validação dupla: verifica conflito antes de criar.
 * dataStr: YYYY-MM-DD, horarioInicio/horarioFim: HH:mm.
 */
export async function criarEventoKitFesta(
  dataStr: string,
  horarioInicio: string,
  horarioFim: string,
  titulo: string,
  descricao: string,
  timezone: string = 'America/Sao_Paulo'
): Promise<EventoKitFestaCriado> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID não configurado')
  const credentials = carregarCredenciaisGoogle()
  const offset = offsetParaTimezone(timezone)
  const startISO = `${dataStr}T${horarioInicio}:00${offset}`
  const endISO = `${dataStr}T${horarioFim}:59.999${offset}`

  const eventos = await listarEventosNoPeriodo(startISO, endISO)
  const slotStart = new Date(startISO).getTime()
  const slotEnd = new Date(endISO).getTime()
  const temConflito = eventos.some((ev) => {
    const evStart = new Date(ev.start).getTime()
    const evEnd = new Date(ev.end).getTime()
    return slotStart < evEnd && slotEnd > evStart
  })
  if (temConflito) {
    throw new Error('Horário já ocupado na agenda. Não foi possível criar o evento.')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: titulo,
      description: descricao,
      start: { dateTime: startISO, timeZone: timezone },
      end: { dateTime: endISO, timeZone: timezone },
    },
  })
  const event = res.data
  if (!event?.id) {
    throw new Error('Erro ao criar evento na Google Agenda')
  }
  return { id: event.id, htmlLink: event.htmlLink || '' }
}

/**
 * Atualiza um evento existente na Google Agenda (remarcação).
 * Faz verificação de conflito ignorando o próprio evento.
 */
export async function atualizarEventoKitFesta(
  eventId: string,
  dataStr: string,
  horarioInicio: string,
  horarioFim: string,
  titulo: string,
  descricao: string,
  timezone: string = 'America/Sao_Paulo'
): Promise<EventoKitFestaCriado> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID não configurado')
  if (!eventId) throw new Error('Evento inválido')

  const credentials = carregarCredenciaisGoogle()
  const offset = offsetParaTimezone(timezone)
  const startISO = `${dataStr}T${horarioInicio}:00${offset}`
  const endISO = `${dataStr}T${horarioFim}:59.999${offset}`

  const eventos = await listarEventosNoPeriodoDetalhado(startISO, endISO)
  const slotStart = new Date(startISO).getTime()
  const slotEnd = new Date(endISO).getTime()
  const temConflito = eventos.some((ev) => {
    if (ev.id === eventId) return false
    const evStart = new Date(ev.start).getTime()
    const evEnd = new Date(ev.end).getTime()
    return slotStart < evEnd && slotEnd > evStart
  })
  if (temConflito) {
    throw new Error('Horário já ocupado na agenda. Não foi possível atualizar o evento.')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
  const calendar = google.calendar({ version: 'v3', auth })

  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      summary: titulo,
      description: descricao,
      start: { dateTime: startISO, timeZone: timezone },
      end: { dateTime: endISO, timeZone: timezone },
    },
  })
  const event = res.data
  if (!event?.id) throw new Error('Erro ao atualizar evento na Google Agenda')
  return { id: event.id, htmlLink: event.htmlLink || '' }
}
