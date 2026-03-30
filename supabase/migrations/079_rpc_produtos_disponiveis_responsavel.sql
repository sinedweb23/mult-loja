-- RPC: retorna IDs dos produtos disponíveis para o responsável logado (auth.uid()).
-- Resolve truncamento do PostgREST (limite 1000 linhas) e evita trazer milhares de linhas de produto_disponibilidade.
-- Uma única chamada; a lógica de disponibilidade (TODOS, TURMA, SEGMENTO, ALUNO) e filtros (empresa, unidade, visibilidade) fica no banco.

CREATE OR REPLACE FUNCTION public.produtos_disponiveis_ids_responsavel()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH responsavel AS (
    SELECT u.id AS usuario_id
    FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
    LIMIT 1
  ),
  filhos AS (
    SELECT ua.aluno_id
    FROM usuario_aluno ua
    JOIN responsavel r ON r.usuario_id = ua.usuario_id
  ),
  alunos_ativos AS (
    SELECT a.id, a.turma_id, a.empresa_id, a.unidade_id
    FROM alunos a
    JOIN filhos f ON f.aluno_id = a.id
    WHERE a.situacao = 'ATIVO'
  ),
  turmas_filhos AS (
    SELECT t.id AS turma_id, lower(trim(coalesce(nullif(trim(t.tipo_curso), ''), t.segmento::text, ''))) AS segmento_norm
    FROM alunos_ativos aa
    JOIN turmas t ON t.id = aa.turma_id
    WHERE aa.turma_id IS NOT NULL
  ),
  empresas_filhos AS (
    SELECT DISTINCT empresa_id FROM alunos_ativos
  ),
  unidades_filhos AS (
    SELECT DISTINCT unidade_id FROM alunos_ativos WHERE unidade_id IS NOT NULL
  ),
  tem_aluno_sem_unidade AS (
    SELECT EXISTS (SELECT 1 FROM alunos_ativos WHERE unidade_id IS NULL) AS v
  ),
  produtos_candidatos AS (
    SELECT p.id
    FROM produtos p
    CROSS JOIN responsavel r
    JOIN usuarios u ON u.id = r.usuario_id
    JOIN empresas_filhos ef ON ef.empresa_id = p.empresa_id
    WHERE p.ativo = true
      AND (
        p.unidade_id IS NULL
        OR p.unidade_id IN (SELECT unidade_id FROM unidades_filhos)
        OR ((SELECT v FROM tem_aluno_sem_unidade) AND (SELECT count(*) FROM unidades_filhos) = 0)
      )
  ),
  segmentos_norm AS (
    SELECT DISTINCT segmento_norm FROM turmas_filhos WHERE segmento_norm <> ''
  ),
  turma_ids_arr AS (
    SELECT array_agg(DISTINCT turma_id) AS arr FROM turmas_filhos
  ),
  aluno_ids_arr AS (
    SELECT array_agg(DISTINCT id) AS arr FROM alunos_ativos
  )
  SELECT DISTINCT pc.id
  FROM produtos_candidatos pc
  WHERE (
    -- Sem nenhuma regra de disponibilidade: produto visível para todos (comportamento do app)
    NOT EXISTS (SELECT 1 FROM produto_disponibilidade pd0 WHERE pd0.produto_id = pc.id)
    OR
    EXISTS (
      SELECT 1
      FROM produto_disponibilidade pd
      WHERE pd.produto_id = pc.id
        AND (pd.disponivel_de IS NULL OR pd.disponivel_de <= now())
        AND (pd.disponivel_ate IS NULL OR pd.disponivel_ate >= now())
        AND (
          pd.tipo = 'TODOS'
          OR (pd.tipo = 'TURMA' AND pd.turma_id IS NOT NULL AND pd.turma_id IN (SELECT unnest(COALESCE((SELECT arr FROM turma_ids_arr), ARRAY[]::uuid[]))))
          OR (pd.tipo = 'SEGMENTO' AND pd.segmento IS NOT NULL AND trim(pd.segmento) <> '' AND lower(trim(pd.segmento)) IN (SELECT segmento_norm FROM segmentos_norm))
          OR (pd.tipo = 'ALUNO' AND pd.aluno_id IS NOT NULL AND pd.aluno_id IN (SELECT unnest(COALESCE((SELECT arr FROM aluno_ids_arr), ARRAY[]::uuid[]))))
        )
    )
  );
$$;

COMMENT ON FUNCTION public.produtos_disponiveis_ids_responsavel() IS 'Retorna os IDs dos produtos que estão disponíveis para o responsável logado (loja), conforme regras de disponibilidade e filtros de empresa/unidade/visibilidade.';
