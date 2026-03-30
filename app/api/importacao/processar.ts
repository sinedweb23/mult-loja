import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

// Schema de validação do payload da API externa
const registroImportacaoSchema = z.object({
  nomealuno: z.string().min(1),
  prontuario: z.string().min(1),
  emailaluno: z.string().optional(),
  descricaoturma: z.string().min(1),
  tipocurso: z.string().optional(),
  situacao: z.string().default('ATIVO'),
  
  // Responsável Financeiro
  nomerespfin: z.string().optional(),
  cpfrespfin: z.string().optional(),
  emailrespfin: z.union([z.string().email(), z.literal('')]).optional(),
  logradourorespfin: z.string().optional(),
  ceprespfin: z.string().optional(),
  numerorespfin: z.string().optional(),
  complementorespfin: z.string().optional(),
  bairrorespfin: z.string().optional(),
  cidaderespfin: z.string().optional(),
  estadorespfin: z.string().optional(),
  celularrespfin: z.string().optional(),
  
  // Responsável Pedagógico
  nomerespped: z.string().optional(),
  cpfrespped: z.string().optional(),
  emailrespped: z.union([z.string().email(), z.literal('')]).optional(),
  logradourorespped: z.string().optional(),
  ceprespped: z.string().optional(),
  numerorespped: z.string().optional(),
  complementorespped: z.string().optional(),
  bairrorespped: z.string().optional(),
  cidaderespped: z.string().optional(),
  estadorespped: z.string().optional(),
  celularrespped: z.string().optional(),
})

const importacaoRequestSchema = z.object({
  empresa_id: z.string().uuid(),
  api_key: z.string().min(1),
  registros: z.array(registroImportacaoSchema).min(1),
  /** Quando presente: não cria log, atualiza o log existente (processamento em lote) */
  existing_log_id: z.string().uuid().optional(),
})

/** Normaliza nomes de campos que a API externa pode enviar com variações (ex.: nome_aluno, nomeAluno). */
function normalizarRegistro(raw: Record<string, unknown>): Record<string, unknown> {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k]
      if (v != null && String(v).trim() !== '') return v
    }
    return undefined
  }
  return {
    nomealuno: get('nomealuno', 'nome_aluno', 'nomeAluno', 'nome') ?? raw.nomealuno,
    prontuario: get('prontuario', 'prontuario_aluno', 'id_aluno') ?? raw.prontuario,
    emailaluno: get('emailaluno', 'email_aluno', 'emailAluno') ?? raw.emailaluno,
    descricaoturma: get('descricaoturma', 'descricao_turma', 'turma', 'turma_descricao') ?? raw.descricaoturma,
    tipocurso: get('tipocurso', 'tipo_curso', 'segmento') ?? raw.tipocurso,
    situacao: get('situacao', 'situacao_aluno') ?? raw.situacao,
    nomerespfin: get('nomerespfin', 'nome_resp_fin', 'nomeresponsavelfin') ?? raw.nomerespfin,
    cpfrespfin: get('cpfrespfin', 'cpf_resp_fin') ?? raw.cpfrespfin,
    emailrespfin: get('emailrespfin', 'email_resp_fin') ?? raw.emailrespfin,
    logradourorespfin: get('logradourorespfin', 'logradouro_resp_fin') ?? raw.logradourorespfin,
    ceprespfin: raw.ceprespfin, numerorespfin: raw.numerorespfin, complementorespfin: raw.complementorespfin,
    bairrorespfin: raw.bairrorespfin, cidaderespfin: raw.cidaderespfin, estadorespfin: raw.estadorespfin,
    celularrespfin: raw.celularrespfin,
    nomerespped: get('nomerespped', 'nome_resp_ped') ?? raw.nomerespped, cpfrespped: raw.cpfrespped, emailrespped: raw.emailrespped,
    logradourorespped: raw.logradourorespped, ceprespped: raw.ceprespped, numerorespped: raw.numerorespped,
    complementorespped: raw.complementorespped, bairrorespped: raw.bairrorespped,
    cidaderespped: raw.cidaderespped, estadorespped: raw.estadorespped, celularrespped: raw.celularrespped,
  }
}

// Segmento da turma vem como tipocurso na API (ex.: EFAF, EFAI, MEDIO). Prioridade: tipocurso depois descricaoturma.
function mapearSegmento(descricaoturma?: string, tipocurso?: string): 'EDUCACAO_INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'EFAF' | 'EFAI' | 'OUTRO' {
  // PRIORIDADE 1: tipocurso (segmento vem nesse campo na API)
  if (tipocurso) {
    const curso = tipocurso.toUpperCase().trim()
    if (curso === 'EFAF') return 'EFAF'
    if (curso === 'EFAI') return 'EFAI'
    if (curso === 'MEDIO' || curso === 'EM' || curso.includes('MÉDIO')) return 'MEDIO'
    if (curso.includes('INFANTIL') || curso.includes('EDUCAÇÃO INFANTIL')) return 'EDUCACAO_INFANTIL'
    if (curso.includes('FUNDAMENTAL')) return 'FUNDAMENTAL'
  }

  // PRIORIDADE 2: inferir pela descrição da turma
  if (descricaoturma) {
    const descricao = descricaoturma.toUpperCase()
    if (descricao.includes('EM') && !descricao.includes('EFAF') && !descricao.includes('EFAI')) return 'MEDIO'
    if (descricao.includes('EFAF')) return 'EFAF'
    if (descricao.includes('EFAI')) return 'EFAI'
  }

  return 'OUTRO'
}

// Responsabilidade: 1 = financeiro, 2 = pedagógico, 3 = ambos (coluna unificada em usuarios)
function responsabilidadeFromTipo(tipo: 'FINANCEIRO' | 'PEDAGOGICO' | 'AMBOS'): 1 | 2 | 3 {
  if (tipo === 'AMBOS') return 3
  if (tipo === 'PEDAGOGICO') return 2
  return 1
}

function mergeResponsabilidade(atual: number | null | undefined, novo: 1 | 2 | 3): 1 | 2 | 3 {
  if (atual === 3 || novo === 3) return 3
  if (atual === 1 && novo === 2) return 3
  if (atual === 2 && novo === 1) return 3
  return (novo ?? (atual as 1 | 2) ?? 1)
}

// Garantir que o usuário tenha o perfil Responsável em usuario_perfis
async function garantirPerfilResponsavel(supabase: any, usuarioId: string | null, perfilResponsavelId: string | null): Promise<void> {
  if (!usuarioId || !perfilResponsavelId) return
  const { data: jaTem } = await supabase
    .from('usuario_perfis')
    .select('usuario_id')
    .eq('usuario_id', usuarioId)
    .eq('perfil_id', perfilResponsavelId)
    .maybeSingle()
  if (jaTem) return
  await supabase
    .from('usuario_perfis')
    .insert({ usuario_id: usuarioId, perfil_id: perfilResponsavelId })
}

// Garantir que o usuário tenha o papel RESPONSAVEL em usuario_papeis (adiciona sem remover outros, ex.: COLABORADOR)
async function garantirPapelResponsavel(supabase: any, usuarioId: string | null): Promise<void> {
  if (!usuarioId) return
  const { data: jaTem } = await supabase
    .from('usuario_papeis')
    .select('usuario_id')
    .eq('usuario_id', usuarioId)
    .eq('papel', 'RESPONSAVEL')
    .maybeSingle()
  if (jaTem) return
  await supabase
    .from('usuario_papeis')
    .insert({ usuario_id: usuarioId, papel: 'RESPONSAVEL' })
}

// Função auxiliar para criar ou atualizar responsável (usa colunas unificadas: nome, cpf, email, celular, responsabilidade)
async function upsertResponsavel(
  supabase: any,
  dados: z.infer<typeof registroImportacaoSchema>,
  tipo: 'FINANCEIRO' | 'PEDAGOGICO',
  perfilResponsavelId: string | null = null
): Promise<string | null> {
  const nome = tipo === 'FINANCEIRO' ? dados.nomerespfin : dados.nomerespped
  const cpf = tipo === 'FINANCEIRO' ? dados.cpfrespfin : dados.cpfrespped
  const email = tipo === 'FINANCEIRO' ? dados.emailrespfin : dados.emailrespped
  const celular = tipo === 'FINANCEIRO' ? dados.celularrespfin : dados.celularrespped

  if (!nome && !email && !cpf) {
    console.log(`[upsertResponsavel] ${tipo}: Sem nome, email ou CPF, pulando...`)
    return null
  }

  const emailNormalizado = email?.trim().toLowerCase() || null
  const cpfLimpo = cpf?.replace(/[^0-9]/g, '') || null
  if (cpfLimpo && cpfLimpo.length < 11) return null

  let existente: any = null
  if (emailNormalizado) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, responsabilidade')
      .eq('email', emailNormalizado)
      .maybeSingle()
    existente = data
  }
  if (!existente && cpfLimpo) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, responsabilidade')
      .eq('cpf', cpfLimpo)
      .maybeSingle()
    existente = data
  }

  const responsabilidadeNovo = responsabilidadeFromTipo(tipo)
  let responsavelId: string | null = null

  if (existente) {
    responsavelId = existente.id
    const responsabilidadeFinal = mergeResponsabilidade(existente.responsabilidade, responsabilidadeNovo)
    const updateData: any = {
      nome: nome?.trim() || existente.nome,
      cpf: cpfLimpo || undefined,
      email: emailNormalizado || undefined,
      celular: celular?.trim() || undefined,
      responsabilidade: responsabilidadeFinal,
      updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', responsavelId)
    if (updateError) throw new Error(`Erro ao atualizar responsável ${tipo}: ${updateError.message}`)
    await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
  } else {
    const insertData: any = {
      nome: nome?.trim() || null,
      cpf: cpfLimpo || null,
      email: emailNormalizado || null,
      celular: celular?.trim() || null,
      responsabilidade: responsabilidadeNovo,
    }
    const { data: novo, error: insertError } = await supabase
      .from('usuarios')
      .insert(insertData)
      .select('id')
      .single()
    if (insertError) throw new Error(`Erro ao criar responsável ${tipo}: ${insertError.message}`)
    if (novo) {
      responsavelId = novo.id
      await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
    }
  }

  // Criar/atualizar endereço se houver dados
  if (responsavelId) {
    const logradouro = tipo === 'FINANCEIRO' ? dados.logradourorespfin : dados.logradourorespped
    const numero = tipo === 'FINANCEIRO' ? dados.numerorespfin : dados.numerorespped
    const complemento = tipo === 'FINANCEIRO' ? dados.complementorespfin : dados.complementorespped
    const bairro = tipo === 'FINANCEIRO' ? dados.bairrorespfin : dados.bairrorespped
    const cidade = tipo === 'FINANCEIRO' ? dados.cidaderespfin : dados.cidaderespped
    const estado = tipo === 'FINANCEIRO' ? dados.estadorespfin : dados.estadorespped
    const cep = tipo === 'FINANCEIRO' ? dados.ceprespfin : dados.ceprespped
    if (logradouro || cidade) {
      const { data: enderecoExistente } = await supabase
        .from('enderecos')
        .select('id')
        .eq('usuario_id', responsavelId)
        .eq('tipo', 'RESIDENCIAL')
        .maybeSingle()

      const enderecoData: any = {
            usuario_id: responsavelId,
        tipo: 'RESIDENCIAL',
        logradouro: logradouro || null,
        numero: numero || null,
        complemento: complemento || null,
        bairro: bairro || null,
        cidade: cidade || null,
        estado: estado || null,
        cep: cep || null,
      }

      if (enderecoExistente) {
        await supabase
          .from('enderecos')
          .update(enderecoData)
          .eq('id', enderecoExistente.id)
      } else {
        await supabase
          .from('enderecos')
          .insert(enderecoData)
      }
    }
  }

  return responsavelId
}

// Função auxiliar para criar responsável como AMBOS quando só tem dados pedagógicos (usa colunas unificadas)
async function upsertResponsavelComoAmbos(
  supabase: any,
  dados: z.infer<typeof registroImportacaoSchema>,
  perfilResponsavelId: string | null = null
): Promise<string | null> {
  const nome = dados.nomerespped?.trim()
  const cpf = dados.cpfrespped
  const email = dados.emailrespped?.trim().toLowerCase()
  const celular = dados.celularrespped?.trim()

  if (!nome && !email) {
    console.log(`[upsertResponsavelComoAmbos] Sem nome e email, pulando...`)
    return null
  }

  const emailNormalizado = email || null
  const cpfLimpo = cpf?.replace(/[^0-9]/g, '')
  const cpfValido = cpfLimpo && cpfLimpo.length >= 11 ? cpfLimpo : null

  let existente: any = null
  if (emailNormalizado) {
    const { data } = await supabase.from('usuarios').select('id, responsabilidade').eq('email', emailNormalizado).maybeSingle()
    existente = data
  }
  if (!existente && cpfValido) {
    const { data } = await supabase.from('usuarios').select('id, responsabilidade').eq('cpf', cpfValido).maybeSingle()
    existente = data
  }

  let responsavelId: string | null = null
  if (existente) {
    responsavelId = existente.id
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        nome: nome || undefined,
        cpf: cpfValido || undefined,
        email: emailNormalizado || undefined,
        celular: celular || undefined,
        responsabilidade: 3,
        updated_at: new Date().toISOString(),
      })
      .eq('id', responsavelId)
    if (updateError) throw new Error(`Erro ao atualizar responsável: ${updateError.message}`)
    await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
  } else {
    const { data: novo, error: insertError } = await supabase
      .from('usuarios')
      .insert({
        nome: nome || null,
        cpf: cpfValido || null,
        email: emailNormalizado || null,
        celular: celular || null,
        responsabilidade: 3,
      })
      .select('id')
      .single()
    if (insertError) throw new Error(`Erro ao criar responsável: ${insertError.message}`)
    if (novo) {
      responsavelId = novo.id
      await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
    }
  }

  // Criar/atualizar endereço se houver dados
  if (responsavelId && (dados.logradourorespped || dados.cidaderespped)) {
    const { data: enderecoExistente } = await supabase
      .from('enderecos')
      .select('id')
      .eq('usuario_id', responsavelId)
      .eq('tipo', 'RESIDENCIAL')
      .maybeSingle()

    const enderecoData: any = {
            usuario_id: responsavelId,
      tipo: 'RESIDENCIAL',
      logradouro: dados.logradourorespped || null,
      numero: dados.numerorespped || null,
      complemento: dados.complementorespped || null,
      bairro: dados.bairrorespped || null,
      cidade: dados.cidaderespped || null,
      estado: dados.estadorespped || null,
      cep: dados.ceprespped || null,
    }

    if (enderecoExistente) {
      await supabase
        .from('enderecos')
        .update(enderecoData)
        .eq('id', enderecoExistente.id)
    } else {
      await supabase
        .from('enderecos')
        .insert(enderecoData)
    }
  }

  return responsavelId
}

export async function processarImportacao(body: any) {
  const normalized = (body?.registros || []).map((r: Record<string, unknown>) => normalizarRegistro(r))
  const validatedBase = importacaoRequestSchema.pick({ empresa_id: true, api_key: true, existing_log_id: true }).parse({
    empresa_id: body.empresa_id,
    api_key: body.api_key,
    existing_log_id: body.existing_log_id,
  })
  const validRegistros: z.infer<typeof registroImportacaoSchema>[] = []
  const errosValidacao: { registro: string; erro: string }[] = []
  for (let i = 0; i < normalized.length; i++) {
    const r = registroImportacaoSchema.safeParse(normalized[i])
    if (r.success) validRegistros.push(r.data)
    else {
      const pront = (normalized[i] as Record<string, unknown>)?.prontuario ?? `índice ${i}`
      errosValidacao.push({ registro: String(pront), erro: r.error.message || 'Campo inválido ou faltando (nomealuno, prontuario, descricaoturma)' })
    }
  }
  if (validRegistros.length === 0) {
    throw new Error(
      normalized.length > 0
        ? `Nenhum registro válido (${normalized.length} ignorados). Verifique nomealuno, prontuario e descricaoturma. Primeiro erro: ${errosValidacao[0]?.erro ?? ''}`
        : 'Nenhum registro no lote.'
    )
  }
  const validated = { ...validatedBase, registros: validRegistros }

  // Verificar API key
  const expectedApiKey = process.env.IMPORTACAO_API_KEY || 'default-api-key-change-me'
  if (validated.api_key !== expectedApiKey) {
    throw new Error('API key inválida')
  }

  const supabase = createAdminClient()

  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('id', validated.empresa_id)
    .single()
  if (!empresa) throw new Error('Empresa não encontrada')

  let logId: string | null = null
  let logAtual: { registros_processados: number; registros_criados: number; registros_atualizados: number; registros_com_erro: number; erros: any[]; total_registros: number; payload_inicial?: any } | null = null

  if (validated.existing_log_id) {
    const { data: logExistente } = await supabase
      .from('importacao_logs')
      .select('id, registros_processados, registros_criados, registros_atualizados, registros_com_erro, erros, total_registros, payload_inicial')
      .eq('id', validated.existing_log_id)
      .single()
    if (!logExistente) throw new Error('Log de importação não encontrado')
    logId = logExistente.id
    const payload = logExistente.payload_inicial
    logAtual = {
      registros_processados: logExistente.registros_processados ?? 0,
      registros_criados: logExistente.registros_criados ?? 0,
      registros_atualizados: logExistente.registros_atualizados ?? 0,
      registros_com_erro: logExistente.registros_com_erro ?? 0,
      erros: Array.isArray(logExistente.erros) ? logExistente.erros : [],
      total_registros: logExistente.total_registros ?? 0,
      payload_inicial: payload,
    }
  } else {
    const { data: log } = await supabase
      .from('importacao_logs')
      .insert({
        empresa_id: validated.empresa_id,
        tipo: 'API',
        status: 'EM_PROGRESSO',
        total_registros: validated.registros.length,
        payload_inicial: { total: validated.registros.length },
      })
      .select('id')
      .single()
    logId = log?.id ?? null
  }

  const totalAlunosParaLog = logAtual?.payload_inicial?.total_alunos ?? validated.registros.length

  const atualizarLogFinal = async (
    status: 'SUCESSO' | 'PARCIAL' | 'ERRO',
    opts: { registros_processados: number; registros_criados: number; registros_atualizados: number; registros_com_erro: number; erros?: any[] }
  ) => {
    if (!logId) return
    await supabase
      .from('importacao_logs')
      .update({
        status,
        registros_processados: opts.registros_processados,
        registros_criados: opts.registros_criados,
        registros_atualizados: opts.registros_atualizados,
        registros_com_erro: opts.registros_com_erro,
        erros: opts.erros ?? null,
        finalizado_em: new Date().toISOString(),
      })
      .eq('id', logId)
  }

  try {
  const erros: any[] = [...errosValidacao]
  let registrosProcessados = 0
  let registrosCriados = 0
  let registrosAtualizados = 0

  // IMPORTANTE: Agrupar registros por prontuário (como no sistema PHP)
  // Isso garante que todos os responsáveis de um aluno sejam processados juntos
  const alunosAgrupados: Map<string, typeof validated.registros> = new Map()
  
  for (const registro of validated.registros) {
    const prontuario = registro.prontuario?.trim()
    if (!prontuario) {
      console.warn(`[processarImportacao] Registro sem prontuário, pulando...`)
      continue
    }
    
    if (!alunosAgrupados.has(prontuario)) {
      alunosAgrupados.set(prontuario, [])
    }
    alunosAgrupados.get(prontuario)!.push(registro)
  }

  console.log(`[processarImportacao] Total de alunos únicos: ${alunosAgrupados.size}, Total de registros: ${validated.registros.length}`)

  // Usuários da importação são APENAS responsáveis por alunos (nunca Admin).
  // Vínculo com aluno: (1) usuario_aluno (usuario_id, aluno_id) = quem é responsável por qual aluno;
  // (2) usuario_perfis com perfil "Responsável" = papel no sistema para acesso à loja.
  // Obter ou criar perfil "Responsável" para atribuir a todos os responsáveis da importação
  let perfilResponsavelId: string | null = null
  try {
    const { data: perfilResp } = await supabase
      .from('perfis')
      .select('id')
      .eq('nome', 'Responsável')
      .maybeSingle()
    if (perfilResp) {
      perfilResponsavelId = perfilResp.id
      console.log(`[processarImportacao] Perfil "Responsável" encontrado: ${perfilResponsavelId}`)
    } else {
      const { data: novoPerfilResp, error: errPerfil } = await supabase
        .from('perfis')
        .insert({
          nome: 'Responsável',
          descricao: 'Perfil padrão para responsáveis (acesso à loja)',
          ativo: true,
        })
        .select('id')
        .single()
      if (!errPerfil && novoPerfilResp) {
        perfilResponsavelId = novoPerfilResp.id
        console.log(`[processarImportacao] Perfil "Responsável" criado: ${perfilResponsavelId}`)
      }
    }
  } catch (e) {
    console.warn('[processarImportacao] Tabela perfis não disponível; responsáveis serão importados sem perfil padrão.')
  }

  // Processar cada aluno (agrupado por prontuário)
  for (const [prontuario, registros] of alunosAgrupados.entries()) {
    try {
      // Pegar o primeiro registro para dados básicos do aluno
      const primeiroRegistro = registros[0]
      const nomeAluno = primeiroRegistro.nomealuno?.trim()
      const descricaoTurma = primeiroRegistro.descricaoturma?.trim()
      // Se a API enviar situacao diferente de ATIVO, inativar o aluno aqui
      const situacaoRaw = primeiroRegistro.situacao || 'ATIVO'
      const situacao = String(situacaoRaw).toUpperCase().trim() === 'ATIVO' ? 'ATIVO' : 'INATIVO'
      
      if (!nomeAluno || !descricaoTurma) {
        console.warn(`[processarImportacao] Aluno ${prontuario} sem nome ou turma, pulando...`)
        continue
      }

      // 1. Criar/atualizar turma
      let turmaId: string | null = null
      let turmaUnidadeId: string | null = null
      // Busca case-insensitive para bater com API (ex.: "K5 T - KINDERGARTEN" vs "K5 T - Kindergarten")
      const { data: turmaExistente } = await supabase
        .from('turmas')
        .select('id, unidade_id')
        .eq('empresa_id', validated.empresa_id)
        .ilike('descricao', descricaoTurma)
        .maybeSingle()

      if (turmaExistente) {
        turmaId = turmaExistente.id
        turmaUnidadeId = turmaExistente.unidade_id ?? null
        const { error: errTurma } = await supabase
          .from('turmas')
          .update({
            segmento: mapearSegmento(descricaoTurma, primeiroRegistro.tipocurso),
            tipo_curso: primeiroRegistro.tipocurso || null,
            situacao: situacao === 'ATIVO' ? 'ATIVA' : 'INATIVA',
            updated_at: new Date().toISOString(),
          })
          .eq('id', turmaId)
        if (errTurma) {
          console.error(`[processarImportacao] Erro ao atualizar turma ${turmaId}:`, errTurma)
        }
      } else {
        const { data: novaTurma } = await supabase
          .from('turmas')
          .insert({
            empresa_id: validated.empresa_id,
            descricao: descricaoTurma,
            segmento: mapearSegmento(descricaoTurma, primeiroRegistro.tipocurso),
            tipo_curso: primeiroRegistro.tipocurso || null,
            situacao: situacao === 'ATIVO' ? 'ATIVA' : 'INATIVA',
          })
          .select('id')
          .single()

        if (novaTurma) {
          turmaId = novaTurma.id
        }
      }

      if (!turmaId) {
        throw new Error('Erro ao criar/atualizar turma')
      }

      // 2. Criar/atualizar aluno
      const { data: alunoExistente } = await supabase
        .from('alunos')
        .select('id')
        .eq('empresa_id', validated.empresa_id)
        .eq('prontuario', prontuario)
        .maybeSingle()

      let alunoId: string
      if (alunoExistente) {
        alunoId = alunoExistente.id
        const { error: errAluno } = await supabase
          .from('alunos')
          .update({
            nome: nomeAluno,
            turma_id: turmaId,
            unidade_id: turmaUnidadeId ?? null,
            situacao: situacao,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alunoId)
        if (errAluno) {
          console.error(`[processarImportacao] Erro ao atualizar aluno ${alunoId} (turma_id/unidade_id):`, errAluno)
          throw new Error(`Erro ao atualizar turma do aluno: ${errAluno.message}`)
        }
        registrosAtualizados++
      } else {
        const { data: novoAluno, error: errNovoAluno } = await supabase
          .from('alunos')
          .insert({
            empresa_id: validated.empresa_id,
            unidade_id: turmaUnidadeId ?? null,
            prontuario: prontuario,
            nome: nomeAluno,
            turma_id: turmaId,
            situacao: situacao,
          })
          .select('id')
          .single()
        if (errNovoAluno) {
          console.error(`[processarImportacao] Erro ao criar aluno:`, errNovoAluno)
          throw new Error(`Erro ao criar aluno: ${errNovoAluno.message}`)
        }

        if (!novoAluno) {
          throw new Error('Erro ao criar aluno')
        }
        alunoId = novoAluno.id
        registrosCriados++
      }

      // 3. Processar TODOS os responsáveis únicos de TODOS os registros do mesmo aluno
      // IMPORTANTE: Como no sistema PHP, coletar todos os responsáveis únicos primeiro
      console.log(`[processarImportacao] Processando responsáveis para aluno ${alunoId} (prontuario: ${prontuario}) - ${registros.length} registro(s)`)
      
      // Função auxiliar para verificar se há dados válidos (não vazios)
      const temDadoValido = (valor: string | undefined | null): boolean => {
        return !!(valor && valor.trim() && valor.trim() !== '' && valor.trim() !== 'null' && valor.trim() !== 'undefined')
      }
      
      // Função auxiliar para normalizar CPF (usar como chave única, como no PHP)
      const normalizarCPF = (cpf: string | undefined | null): string | null => {
        if (!cpf) return null
        const cpfLimpo = cpf.replace(/[^0-9]/g, '')
        return cpfLimpo.length >= 11 ? cpfLimpo : null
      }
      
      // Chave única: CPF quando existir, senão "email:xxx" (permite responsável sem CPF na API)
      const chaveResponsavel = (cpf: string | null, email: string | null): string =>
        (cpf && cpf.length >= 11) ? cpf : (email ? `email:${email}` : '')
      
      // Coletar todos os responsáveis únicos (CPF ou email como chave)
      const responsaveisUnicos: Map<string, {
        id: string | null
        nome: string
        cpf: string
        email: string | null
        tipos: Set<'FINANCEIRO' | 'PEDAGOGICO'>
        endereco?: any
      }> = new Map()
      
      // Processar TODOS os registros do mesmo aluno
      for (const registro of registros) {
        // Processar responsável financeiro (aceita nome + CPF ou nome + email)
        const nomeFin = registro.nomerespfin?.trim()
        const cpfFin = normalizarCPF(registro.cpfrespfin)
        const emailFin = registro.emailrespfin?.trim().toLowerCase() || null
        const chaveFin = chaveResponsavel(cpfFin, emailFin)
        
        if (nomeFin && chaveFin) {
          if (!responsaveisUnicos.has(chaveFin)) {
            responsaveisUnicos.set(chaveFin, {
              id: null,
              nome: nomeFin,
              cpf: cpfFin || '',
              email: emailFin,
              tipos: new Set(['FINANCEIRO']),
              endereco: {
                logradouro: registro.logradourorespfin?.trim() || null,
                numero: registro.numerorespfin?.trim() || null,
                complemento: registro.complementorespfin?.trim() || null,
                bairro: registro.bairrorespfin?.trim() || null,
                cidade: registro.cidaderespfin?.trim() || null,
                estado: registro.estadorespfin?.trim() || null,
                cep: registro.ceprespfin?.trim() || null,
                celular: registro.celularrespfin?.trim() || null,
              }
            })
          } else {
            responsaveisUnicos.get(chaveFin)!.tipos.add('FINANCEIRO')
          }
        }
        
        // Processar responsável pedagógico (aceita nome + CPF ou nome + email)
        const nomePed = registro.nomerespped?.trim()
        const cpfPed = normalizarCPF(registro.cpfrespped)
        const emailPed = registro.emailrespped?.trim().toLowerCase() || null
        const chavePed = chaveResponsavel(cpfPed, emailPed)
        
        if (nomePed && chavePed) {
          if (!responsaveisUnicos.has(chavePed)) {
            responsaveisUnicos.set(chavePed, {
              id: null,
              nome: nomePed,
              cpf: cpfPed || '',
              email: emailPed,
              tipos: new Set(['PEDAGOGICO']),
              endereco: {
                logradouro: registro.logradourorespped?.trim() || null,
                numero: registro.numerorespped?.trim() || null,
                complemento: registro.complementorespped?.trim() || null,
                bairro: registro.bairrorespped?.trim() || null,
                cidade: registro.cidaderespped?.trim() || null,
                estado: registro.estadorespped?.trim() || null,
                cep: registro.ceprespped?.trim() || null,
                celular: registro.celularrespped?.trim() || null,
              }
            })
          } else {
            responsaveisUnicos.get(chavePed)!.tipos.add('PEDAGOGICO')
          }
        }
      }
      
      console.log(`[processarImportacao] Responsáveis únicos encontrados: ${responsaveisUnicos.size}`)
      
      // IMPORTANTE: Garantir que só haja 1 responsável financeiro
      // Se houver múltiplos responsáveis com tipo FINANCEIRO, manter apenas o primeiro
      let responsavelFinanceiroUnico: { cpf: string, responsavel: typeof responsaveisUnicos extends Map<string, infer V> ? V : never } | null = null
      const responsaveisPedagogicos: Array<{ cpf: string, responsavel: typeof responsaveisUnicos extends Map<string, infer V> ? V : never }> = []
      
      for (const [cpf, responsavel] of responsaveisUnicos.entries()) {
        const tipos = Array.from(responsavel.tipos)
        
        if (tipos.includes('FINANCEIRO')) {
          // Se já não temos um financeiro, este é o primeiro
          if (!responsavelFinanceiroUnico) {
            responsavelFinanceiroUnico = { cpf, responsavel }
          } else {
            // Se já temos um financeiro, remover o tipo FINANCEIRO deste responsável
            // e manter apenas como PEDAGOGICO (se tiver)
            console.warn(`[processarImportacao] ⚠️ Múltiplos responsáveis financeiros encontrados para aluno ${prontuario}. Mantendo apenas o primeiro (${responsavelFinanceiroUnico.cpf}) e convertendo ${cpf} para apenas pedagógico.`)
            responsavel.tipos.delete('FINANCEIRO')
            if (responsavel.tipos.size > 0) {
              responsaveisPedagogicos.push({ cpf, responsavel })
            }
          }
        }
        
        // Se não é financeiro (ou foi convertido), adicionar aos pedagógicos
        if (!tipos.includes('FINANCEIRO') || (responsavelFinanceiroUnico && responsavelFinanceiroUnico.cpf !== cpf)) {
          if (tipos.includes('PEDAGOGICO')) {
            responsaveisPedagogicos.push({ cpf, responsavel })
          }
        }
      }
      
      // Se não encontrou nenhum financeiro, mas tem pedagógicos, usar o primeiro pedagógico como financeiro também
      if (!responsavelFinanceiroUnico && responsaveisPedagogicos.length > 0) {
        console.log(`[processarImportacao] Nenhum responsável financeiro encontrado, usando o primeiro pedagógico como financeiro também`)
        responsavelFinanceiroUnico = responsaveisPedagogicos[0]
        responsavelFinanceiroUnico.responsavel.tipos.add('FINANCEIRO')
      }
      
      if (!responsavelFinanceiroUnico) {
        console.error(`[processarImportacao] ❌ ERRO CRÍTICO: Nenhum responsável financeiro foi encontrado para o aluno ${alunoId} (prontuario: ${prontuario})`)
        throw new Error(`Não foi possível identificar responsável financeiro para o aluno ${prontuario}. Alunos devem ter pelo menos um responsável financeiro.`)
      }
      
      // Processar cada responsável único e criar/atualizar no banco
      const responsaveisProcessados: Map<string, string> = new Map() // CPF -> ID do usuário
      
      // Função auxiliar para processar um responsável (chave = CPF ou "email:xxx" para Map; DB usa responsavel.cpf só se válido)
      const processarResponsavel = async (chave: string, responsavel: typeof responsaveisUnicos extends Map<string, infer V> ? V : never): Promise<string | null> => {
        const tipos = Array.from(responsavel.tipos)
        const tipoFinal = tipos.includes('FINANCEIRO') && tipos.includes('PEDAGOGICO') 
          ? 'AMBOS' 
          : tipos.includes('FINANCEIRO') 
            ? 'FINANCEIRO' 
            : 'PEDAGOGICO'
        const cpfParaDb = responsavel.cpf && responsavel.cpf.length >= 11 ? responsavel.cpf : null
        
        console.log(`[processarImportacao] Processando responsável ${responsavel.nome} (chave: ${chave}, tipos: ${tipos.join(', ')}, tipo final: ${tipoFinal})`)
        
        // Buscar responsável existente por email ou CPF (colunas unificadas)
        let existente: any = null
        if (responsavel.email) {
          const { data: emailData } = await supabase
            .from('usuarios')
            .select('id, responsabilidade')
            .eq('email', responsavel.email)
            .maybeSingle()
          existente = emailData
        }
        if (!existente && cpfParaDb) {
          const { data: cpfData } = await supabase
            .from('usuarios')
            .select('id, responsabilidade')
            .eq('cpf', cpfParaDb)
            .maybeSingle()
          existente = cpfData
        }

        const responsabilidadeNum = tipoFinal === 'AMBOS' ? 3 : tipoFinal === 'PEDAGOGICO' ? 2 : 1
        let responsavelId: string | null = null

        if (existente) {
          responsavelId = existente.id
          const responsabilidadeFinal = mergeResponsabilidade(existente.responsabilidade, responsabilidadeNum as 1 | 2 | 3)
          await supabase
            .from('usuarios')
            .update({
              nome: responsavel.nome,
              cpf: cpfParaDb || undefined,
              email: responsavel.email || undefined,
              celular: responsavel.endereco?.celular || undefined,
              responsabilidade: responsabilidadeFinal,
              empresa_id: validated.empresa_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', responsavelId)
          await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
          await garantirPapelResponsavel(supabase, responsavelId)
          console.log(`[processarImportacao] ✅ Responsável ${responsavel.nome} atualizado: ${responsavelId}`)
        } else {
          const { data: novo, error: insertError } = await supabase
            .from('usuarios')
            .insert({
              nome: responsavel.nome,
              cpf: cpfParaDb || null,
              email: responsavel.email || null,
              celular: responsavel.endereco?.celular || null,
              responsabilidade: responsabilidadeNum,
              empresa_id: validated.empresa_id,
            })
            .select('id')
            .single()
          if (insertError) {
            console.error(`[processarImportacao] Erro ao criar responsável ${responsavel.nome}:`, insertError)
            return null
          }
          if (novo) {
            responsavelId = novo.id
            await garantirPerfilResponsavel(supabase, responsavelId, perfilResponsavelId)
            await garantirPapelResponsavel(supabase, responsavelId)
            console.log(`[processarImportacao] ✅ Responsável ${responsavel.nome} criado: ${responsavelId}`)
          }
        }
        
        if (responsavelId) {
          // Atualizar endereço se houver dados
          if (responsavel.endereco && (responsavel.endereco.logradouro || responsavel.endereco.cidade)) {
            const { data: enderecoExistente } = await supabase
              .from('enderecos')
              .select('id')
              .eq('usuario_id', responsavelId)
              .eq('tipo', 'RESIDENCIAL')
              .maybeSingle()
            
            const enderecoData: any = {
              usuario_id: responsavelId,
              tipo: 'RESIDENCIAL',
              logradouro: responsavel.endereco.logradouro || null,
              numero: responsavel.endereco.numero || null,
              complemento: responsavel.endereco.complemento || null,
              bairro: responsavel.endereco.bairro || null,
              cidade: responsavel.endereco.cidade || null,
              estado: responsavel.endereco.estado || null,
              cep: responsavel.endereco.cep || null,
            }
            
            if (enderecoExistente) {
              await supabase
                .from('enderecos')
                .update(enderecoData)
                .eq('id', enderecoExistente.id)
            } else {
              await supabase
                .from('enderecos')
                .insert(enderecoData)
            }
          }
        }
        
        return responsavelId
      }
      
      // Processar responsável financeiro primeiro
      const responsavelFinId = await processarResponsavel(responsavelFinanceiroUnico.cpf, responsavelFinanceiroUnico.responsavel)
      if (responsavelFinId) {
        responsaveisProcessados.set(responsavelFinanceiroUnico.cpf, responsavelFinId)
      }
      
      // Processar todos os responsáveis pedagógicos
      for (const { cpf, responsavel } of responsaveisPedagogicos) {
        const responsavelPedId = await processarResponsavel(cpf, responsavel)
        if (responsavelPedId) {
          responsaveisProcessados.set(cpf, responsavelPedId)
        }
      }
      
      if (!responsavelFinId) {
        console.error(`[processarImportacao] ❌ ERRO CRÍTICO: Não foi possível criar/atualizar responsável financeiro para o aluno ${alunoId} (prontuario: ${prontuario})`)
        throw new Error(`Não foi possível criar responsável financeiro para o aluno ${prontuario}. Alunos devem ter pelo menos um responsável financeiro.`)
      }

      console.log(`[processarImportacao] Responsáveis processados - Fin: ${responsavelFinId || 'N/A'}, Total pedagógicos: ${responsaveisPedagogicos.length}, Total único: ${responsaveisProcessados.size}`)

      // IMPORTANTE: Antes de criar novos vínculos, remover vínculos antigos que não devem mais existir
      // Isso garante que a sincronização atualize corretamente os vínculos
      console.log(`[processarImportacao] Removendo vínculos antigos do aluno ${alunoId} antes de criar novos...`)
      const { error: deleteError } = await supabase
        .from('usuario_aluno')
        .delete()
        .eq('aluno_id', alunoId)
      
      if (deleteError) {
        console.error(`[processarImportacao] Erro ao remover vínculos antigos:`, deleteError)
      } else {
        console.log(`[processarImportacao] Vínculos antigos removidos com sucesso`)
      }

      // Vincular TODOS os responsáveis únicos ao aluno (como no PHP: limpar e recriar)
      console.log(`[processarImportacao] Vinculando ${responsaveisProcessados.size} responsável(is) ao aluno ${alunoId}`)
      
      for (const [cpf, usuarioId] of responsaveisProcessados.entries()) {
        const { error: vinculoError } = await supabase
          .from('usuario_aluno')
          .insert({
            usuario_id: usuarioId,
            aluno_id: alunoId,
          })
        
        if (vinculoError) {
          console.error(`[processarImportacao] Erro ao vincular responsável ${cpf}:`, vinculoError)
        } else {
          console.log(`[processarImportacao] ✅ Responsável ${cpf} (${usuarioId}) vinculado ao aluno ${alunoId}`)
        }
      }

      registrosProcessados++
    } catch (error: any) {
      erros.push({
        registro: prontuario,
        erro: error.message || 'Erro desconhecido',
      })
    }
  }

  if (logAtual) {
    // Modo lote: somar contagens ao log existente
    const novosProcessados = (logAtual.registros_processados ?? 0) + registrosProcessados
    const novosCriados = (logAtual.registros_criados ?? 0) + registrosCriados
    const novosAtualizados = (logAtual.registros_atualizados ?? 0) + registrosAtualizados
    const novosErros = (logAtual.registros_com_erro ?? 0) + erros.length
    const errosMerged = [...(logAtual.erros || []), ...erros]
    // total_alunos = prontuários únicos (payload antigo pode não ter total_alunos)
    let totalAlunos = logAtual.payload_inicial?.total_alunos ?? 0
    if (totalAlunos === 0 && logAtual.payload_inicial) {
      const regs = logAtual.payload_inicial?.registros ?? logAtual.payload_inicial
      const arr = Array.isArray(regs) ? regs : []
      const unicos = new Set<string>()
      for (const r of arr) {
        const p = r?.prontuario?.trim()
        if (p) unicos.add(p)
      }
      totalAlunos = unicos.size || logAtual.total_registros || 0
    }
    if (totalAlunos === 0) totalAlunos = logAtual.total_registros ?? 0
    const done = totalAlunos > 0 && novosProcessados >= totalAlunos
    const status = done
      ? (errosMerged.length === 0 ? 'SUCESSO' : (novosProcessados > 0 ? 'PARCIAL' : 'ERRO'))
      : 'EM_PROGRESSO'
    await supabase
      .from('importacao_logs')
      .update({
        status,
        registros_processados: novosProcessados,
        registros_criados: novosCriados,
        registros_atualizados: novosAtualizados,
        registros_com_erro: novosErros,
        erros: errosMerged.length > 0 ? errosMerged : null,
        ...(done ? { finalizado_em: new Date().toISOString() } : {}),
      })
      .eq('id', logId)

    // Ao concluir: inativar alunos da empresa que NÃO estão na lista da API (cancelados/removidos lá).
    // Só inativar se tivermos certeza de que a lista está completa (evita inativar por payload truncado ou sync incompleto).
    const totalAlunosEsperado = logAtual.payload_inicial?.total_alunos ?? totalAlunos
    const payloadPareceCompleto = totalAlunosEsperado > 0 && novosProcessados >= totalAlunosEsperado
    if (done && logAtual?.payload_inicial && payloadPareceCompleto) {
      const registrosCompletos = logAtual.payload_inicial?.registros ?? logAtual.payload_inicial
      const arr = Array.isArray(registrosCompletos) ? registrosCompletos : []
      const prontuariosNaApi = new Set<string>()
      for (const r of arr) {
        const p = r?.prontuario?.trim()
        if (p) prontuariosNaApi.add(p)
      }
      if (prontuariosNaApi.size < totalAlunosEsperado) {
        console.warn(`[processarImportacao] Payload tem ${prontuariosNaApi.size} prontuários únicos, esperado ${totalAlunosEsperado}. Não inativando alunos (possível truncamento).`)
      } else if (prontuariosNaApi.size > 0) {
        const { data: alunosFora } = await supabase
          .from('alunos')
          .select('id, prontuario')
          .eq('empresa_id', validated.empresa_id)
          .eq('situacao', 'ATIVO')
        const idsInativar = (alunosFora ?? []).filter((a: any) => !prontuariosNaApi.has((a.prontuario || '').trim())).map((a: any) => a.id)
        if (idsInativar.length > 0) {
          await supabase
            .from('alunos')
            .update({ situacao: 'INATIVO', updated_at: new Date().toISOString() })
            .in('id', idsInativar)
          console.log(`[processarImportacao] ${idsInativar.length} aluno(s) inativado(s) (não estão na API)`)
        }
      }
    }

    return {
      success: true,
      log_id: logId,
      total_registros: logAtual.total_registros,
      registros_processados: novosProcessados,
      registros_criados: novosCriados,
      registros_atualizados: novosAtualizados,
      registros_com_erro: novosErros,
      done,
    }
  }

  const status = erros.length === 0 ? 'SUCESSO' : (registrosProcessados > 0 ? 'PARCIAL' : 'ERRO')
  await atualizarLogFinal(status, {
    registros_processados: registrosProcessados,
    registros_criados: registrosCriados,
    registros_atualizados: registrosAtualizados,
    registros_com_erro: erros.length,
    erros: erros.length > 0 ? erros : undefined,
  })

  // Inativar alunos da empresa que não estão na lista importada (fluxo não-lote)
  const prontuariosImportados = new Set(alunosAgrupados.keys())
  if (prontuariosImportados.size > 0) {
    const { data: alunosAtivos } = await supabase
      .from('alunos')
      .select('id, prontuario')
      .eq('empresa_id', validated.empresa_id)
      .eq('situacao', 'ATIVO')
    const idsInativar = (alunosAtivos ?? []).filter((a: any) => !prontuariosImportados.has((a.prontuario || '').trim())).map((a: any) => a.id)
    if (idsInativar.length > 0) {
      await supabase
        .from('alunos')
        .update({ situacao: 'INATIVO', updated_at: new Date().toISOString() })
        .in('id', idsInativar)
      console.log(`[processarImportacao] ${idsInativar.length} aluno(s) inativado(s) (fora da lista da API)`)
    }
  }

  return {
    success: true,
    log_id: logId,
    total_registros: validated.registros.length,
    registros_processados: registrosProcessados,
    registros_criados: registrosCriados,
    registros_atualizados: registrosAtualizados,
    registros_com_erro: erros.length,
  }
  } catch (err: any) {
    const msg = err?.message || err?.toString() || 'Erro desconhecido'
    console.error('[processarImportacao] Erro durante processamento:', err)
    if (logId) {
      if (logAtual) {
        await supabase
          .from('importacao_logs')
          .update({
            status: 'ERRO',
            finalizado_em: new Date().toISOString(),
            erros: [...(logAtual.erros || []), { registro: '-', erro: msg }],
          })
          .eq('id', logId)
      } else {
        await atualizarLogFinal('ERRO', {
          registros_processados: 0,
          registros_criados: 0,
          registros_atualizados: 0,
          registros_com_erro: 1,
          erros: [{ registro: '-', erro: msg }],
        })
      }
    }
    throw err
  }
}
