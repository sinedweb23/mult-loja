-- =====================================================================
-- Módulo Consumo Interno no PDV: cabecalho e itens com custo histórico.

CREATE TABLE IF NOT EXISTS public.consumo_interno (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  withdrawn_by TEXT NOT NULL,
  departamento_id UUID NOT NULL REFERENCES public.departamentos(id) ON DELETE RESTRICT,
  segmento_id UUID NOT NULL REFERENCES public.segmentos(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_empresa ON public.consumo_interno(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consumo_interno_created ON public.consumo_interno(created_at DESC);

COMMENT ON TABLE public.consumo_interno IS 'Lançamentos de consumo interno no PDV (operador, quem retirou, departamento/segmento).';

CREATE TABLE IF NOT EXISTS public.consumo_interno_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumo_interno_id UUID NOT NULL REFERENCES public.consumo_interno(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario NUMERIC(12,2) NOT NULL,
  total_custo NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_itens_consumo ON public.consumo_interno_itens(consumo_interno_id);

COMMENT ON TABLE public.consumo_interno_itens IS 'Itens do consumo interno com custo histórico no momento do lançamento.';

-- movimento_estoque: tipo (entrada vs consumo interno) e referência ao consumo
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS consumo_interno_id UUID REFERENCES public.consumo_interno(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.movimento_estoque.tipo IS 'entrada | internal_consumption. Para internal_consumption a quantidade é negativa.';

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_consumo ON public.movimento_estoque(consumo_interno_id) WHERE consumo_interno_id IS NOT NULL;

-- RLS consumo_interno
ALTER TABLE public.consumo_interno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados veem consumo interno da empresa"
  ON public.consumo_interno FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Usuários autenticados inserem consumo interno"
  ON public.consumo_interno FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- RLS consumo_interno_itens
ALTER TABLE public.consumo_interno_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados veem itens de consumo interno"
  ON public.consumo_interno_itens FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

CREATE POLICY "Usuários autenticados inserem itens de consumo interno"
  ON public.consumo_interno_itens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

-- Operador pode inserir movimento de estoque do tipo consumo interno
CREATE POLICY "Operador insere movimento consumo interno"
  ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    tipo = 'internal_consumption'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- Operador pode ver movimentos da própria empresa (para consistência)
CREATE POLICY "Usuários veem movimentos da empresa"
  ON public.movimento_estoque FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- PDV: listar departamentos e segmentos (SELECT para usuários da empresa)
CREATE POLICY "Usuários autenticados veem departamentos"
  ON public.departamentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Usuários autenticados veem segmentos"
  ON public.segmentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );

-- =====================================================================
-- supabase/migrations/070_variacao_valores_label_igual_valor.sql
-- =====================================================================
-- Garantir que label seja exibido na loja/PDV: preencher label com valor quando estiver vazio.
-- Assim a loja e o PDV exibem o mesmo texto (label ou valor) sem quebrar.
UPDATE public.variacao_valores
SET label = valor
WHERE label IS NULL OR TRIM(label) = '';

-- =====================================================================
-- supabase/migrations/071_produtos_termo_aceite.sql
-- =====================================================================
-- Termo de aceite no produto: exibir na loja e exigir checkbox antes de adicionar ao carrinho.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS exigir_termo_aceite BOOLEAN DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS texto_termo_aceite TEXT;

COMMENT ON COLUMN public.produtos.exigir_termo_aceite IS 'Se true, na loja exige aceite do termo antes de adicionar ao carrinho';
COMMENT ON COLUMN public.produtos.texto_termo_aceite IS 'Texto do termo de aceite (quebras de linha preservadas)';

-- =====================================================================
-- supabase/migrations/072_rh_acesso_consumo_empresas.sql
-- =====================================================================
-- Permite que usuários com perfil RH (recurso admin.rh) vejam e gerenciem consumo_colaborador_mensal
-- e vejam empresas, para que a página /admin/rh funcione sem depender apenas do service role.

-- Função: true se o usuário tem perfil com recurso admin.rh
CREATE OR REPLACE FUNCTION public.eh_rh_usuario(user_id UUID)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_perfis up ON up.usuario_id = u.id
    JOIN public.perfil_permissoes pp ON pp.perfil_id = up.perfil_id
    WHERE u.auth_user_id = user_id AND u.ativo = TRUE
      AND pp.recurso = 'admin.rh'
  );
END;
$$;

-- consumo_colaborador_mensal: permitir RH além de admin
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal
  FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  );

-- empresas: em 002 já existe "Todos veem empresas" (SELECT USING true). Se em algum
-- projeto essa política tiver sido removida, descomente e aplique:
-- CREATE POLICY "RH podem ver empresas" ON public.empresas FOR SELECT USING (public.eh_rh_usuario(auth.uid()));

-- =====================================================================
-- supabase/migrations/073_perfil_permissoes_usuario_ve_proprios_perfis.sql
-- =====================================================================
-- Usuários com perfil (ex.: RH) precisam poder LER as permissões dos perfis que têm atribuídos,
-- para obterRecursosDoUsuario() e podeAcessarRH() funcionarem. Sem isso, RLS bloqueia e o menu
-- fica cheio (recursos = []) e o RH não vê colaboradores (podeAcessarRH = false).

CREATE POLICY "Usuário vê permissões dos próprios perfis"
  ON public.perfil_permissoes FOR SELECT
  USING (
    perfil_id IN (
      SELECT up.perfil_id
      FROM public.usuario_perfis up
      JOIN public.usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid() AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/074_rh_perfil_permissoes_definer.sql
-- =====================================================================
-- Garante que usuário (ex.: RH) consiga ler permissões dos próprios perfis.
-- Usa função SECURITY DEFINER para não depender de RLS em usuario_perfis/usuarios na hora de avaliar a política.

-- Função: retorna os perfil_id que o usuário atual tem em usuario_perfis
CREATE OR REPLACE FUNCTION public.perfis_do_usuario_atual()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT up.perfil_id
  FROM public.usuario_perfis up
  JOIN public.usuarios u ON u.id = up.usuario_id AND u.ativo = TRUE
  WHERE u.auth_user_id = auth.uid();
$$;

-- Remove política anterior se existir (evita duplicata)
DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;

-- Política usando a função: usuário vê apenas perfil_permissoes dos perfis que ele tem
CREATE POLICY "Usuário vê permissões dos próprios perfis"
  ON public.perfil_permissoes FOR SELECT
  USING (perfil_id IN (SELECT public.perfis_do_usuario_atual()));

-- =====================================================================
-- supabase/migrations/075_perfil_rh_recurso_admin_rh.sql
-- =====================================================================
-- Garante que o perfil "RH" exista e tenha o recurso admin.rh em perfil_permissoes.
-- Assim usuários atribuídos ao perfil RH (usuario_perfis) passam a ver o módulo RH.
-- O código também aceita papel RH em usuario_papeis (legado).

INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'RH', 'Recursos Humanos – colaboradores, consumo e abatimento', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'RH');

INSERT INTO public.perfil_permissoes (perfil_id, recurso)
SELECT p.id, 'admin.rh'
FROM public.perfis p
WHERE p.nome = 'RH'
  AND NOT EXISTS (
    SELECT 1 FROM public.perfil_permissoes pp
    WHERE pp.perfil_id = p.id AND pp.recurso = 'admin.rh'
  );

-- =====================================================================
-- supabase/migrations/076_migracao_saldo_historico.sql
-- =====================================================================
-- Migração de saldo do sistema antigo: tipo de movimentação e tabela de histórico
-- Projeto: loja-sup (jznhaioobvjwjdmigxja) – aplicar via MCP Supabase ou Supabase CLI/Dashboard

-- Novo valor no enum de movimentação de saldo (compatível com PG < 15)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'movimento_saldo_tipo' AND e.enumlabel = 'MIGRACAO_SALDO'
  ) THEN
    ALTER TYPE movimento_saldo_tipo ADD VALUE 'MIGRACAO_SALDO';
  END IF;
END
$$;

-- Tabela de histórico de migrações (cada execução do "Confirmar Migração")
CREATE TABLE IF NOT EXISTS historico_migracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_alunos INT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE historico_migracoes IS 'Registro de cada lote de migração de saldo do sistema antigo.';

-- RLS: apenas admins
ALTER TABLE historico_migracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem historico_migracoes"
  ON historico_migracoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

CREATE POLICY "Admins inserem historico_migracoes"
  ON historico_migracoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_historico_migracoes_created ON historico_migracoes(created_at DESC);

-- RPC: executar migração de saldo em uma única transação
CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Valor inválido para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (v_total_alunos, v_valor_total)
  RETURNING id INTO v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

COMMENT ON FUNCTION public.executar_migracao_saldo IS 'Migração de saldo: atualiza aluno_saldos, insere aluno_movimentacoes (MIGRACAO_SALDO) e historico_migracoes em uma transação.';

-- Recurso "Migrar Saldo" no perfil Acesso total
INSERT INTO public.perfil_permissoes (perfil_id, recurso)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'admin.migrarSaldo')
ON CONFLICT (perfil_id, recurso) DO NOTHING;

-- =====================================================================
-- supabase/migrations/077_historico_migracao_itens.sql
-- =====================================================================
-- Detalhe por aluno em cada lançamento de migração (para expandir no histórico)

CREATE TABLE IF NOT EXISTS historico_migracao_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  historico_migracao_id UUID NOT NULL REFERENCES historico_migracoes(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  valor DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_migracao_itens_historico ON historico_migracao_itens(historico_migracao_id);

COMMENT ON TABLE historico_migracao_itens IS 'Cada aluno e valor de um lote de migração de saldo (para exibir no histórico expandido).';

ALTER TABLE historico_migracao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem historico_migracao_itens"
  ON historico_migracao_itens FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

CREATE POLICY "Admins inserem historico_migracao_itens"
  ON historico_migracao_itens FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- RPC atualizada: cria historico primeiro, insere itens no loop, atualiza totais no final
CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  -- Criar registro do histórico (totais atualizados no final)
  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (0, 0)
  RETURNING id INTO v_historico_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Valor inválido para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    INSERT INTO historico_migracao_itens (historico_migracao_id, aluno_id, valor)
    VALUES (v_historico_id, v_aluno_id, v_valor);

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  UPDATE historico_migracoes
  SET total_alunos = v_total_alunos, valor_total = v_valor_total
  WHERE id = v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/078_pdv_perfil_rls.sql
-- =====================================================================
-- Permite que usuários com perfil PDV (recurso 'pdv' em perfil_permissoes) tenham as mesmas
-- permissões de operador (usuario_papeis OPERADOR): ver pedidos do dia, listar alunos, produtos, turmas.

-- 1. Estender eh_admin_ou_operador para incluir quem tem recurso 'pdv' no perfil
CREATE OR REPLACE FUNCTION public.eh_admin_ou_operador()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.eh_admin_usuario(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_papeis up ON up.usuario_id = u.id
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_perfis up ON up.usuario_id = u.id
    JOIN public.perfil_permissoes pp ON pp.perfil_id = up.perfil_id AND pp.recurso = 'pdv'
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
  );
$$;

COMMENT ON FUNCTION public.eh_admin_ou_operador IS 'True se usuário é admin, operador (usuario_papeis) ou tem perfil com recurso pdv (perfil_permissoes).';

-- 2. Pedidos: operador/pdv deve ver pedidos (para pdv/pedidos e retirada)
DROP POLICY IF EXISTS "Operador ve pedidos para retirada" ON public.pedidos;
CREATE POLICY "Operador e PDV veem pedidos para retirada"
  ON public.pedidos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Produtos: operador/pdv deve ler produtos (para listar itens no PDV)
DROP POLICY IF EXISTS "Operador le produtos" ON public.produtos;
CREATE POLICY "Operador e PDV leem produtos"
  ON public.produtos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 4. Alunos: operador/pdv deve ver todos os alunos (para venda aluno em pdv/vendas)
CREATE POLICY "Operador e PDV veem alunos"
  ON public.alunos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 5. Turmas: operador/pdv deve ver turmas (join em listagem de alunos)
CREATE POLICY "Operador e PDV veem turmas"
  ON public.turmas FOR SELECT
  USING (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/079_rpc_produtos_disponiveis_responsavel.sql
-- =====================================================================
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
      AND (p.visibilidade = 'APP' OR p.visibilidade = 'AMBOS')
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

-- =====================================================================
-- supabase/migrations/080_pdv_saldo_alunos_rls.sql
-- =====================================================================
-- Permite que usuários com perfil PDV (recurso 'pdv') vejam e atualizem saldo dos alunos
-- em PDV/vendas. A migration 078 já estendeu eh_admin_ou_operador() para pedidos, alunos,
-- produtos e turmas, mas aluno_saldos e aluno_movimentacoes ainda só permitiam OPERADOR
-- (usuario_papeis), não quem tem apenas perfil com recurso 'pdv'.

-- 1. aluno_saldos: SELECT para operador/PDV ver saldo dos alunos no PDV
CREATE POLICY "Operador e PDV veem aluno_saldos"
  ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 2. aluno_movimentacoes: SELECT para operador/PDV ver histórico (ex.: tela de vendas)
CREATE POLICY "Operador e PDV veem aluno_movimentacoes"
  ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Substituir políticas que hoje só permitem OPERADOR (usuario_papeis) por eh_admin_ou_operador(),
--    para que perfil PDV também possa inserir movimentações e atualizar saldos ao vender.

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV inserem aluno_movimentacoes"
  ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV atualizam aluno_saldos"
  ON public.aluno_saldos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV inserem aluno_saldos"
  ON public.aluno_saldos FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/081_aluno_config_saldo_negativo.sql
-- =====================================================================
-- Controle do responsável: bloquear compra na cantina com saldo negativo
ALTER TABLE public.aluno_config
  ADD COLUMN IF NOT EXISTS bloquear_compra_saldo_negativo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.aluno_config.bloquear_compra_saldo_negativo IS
  'Se true, o responsável bloqueia compras no PDV com saldo negativo para este aluno.';

-- =====================================================================
-- supabase/migrations/082_indices_performance_concorrencia.sql
-- =====================================================================
-- Índices para alta concorrência e performance (PDV, loja, admin)
-- Reduz 504/Statement Timeout e bloqueios em pedidos, saldo e caixas.

-- ========== PEDIDOS (vendas, relatórios, listagens) ==========
-- Filtros comuns: status, created_at (período), empresa_id, caixa_id, aluno_id
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status_created ON public.pedidos(status, created_at DESC)
  WHERE status IN ('PAGO', 'ENTREGUE');
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_created ON public.pedidos(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_caixa ON public.pedidos(caixa_id) WHERE caixa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_aluno ON public.pedidos(aluno_id) WHERE aluno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_origem ON public.pedidos(origem) WHERE origem IS NOT NULL;

-- ========== PEDIDO_ITENS (JOINs, listagens por pedido) ==========
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id ON public.pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_produto_id ON public.pedido_itens(produto_id);

-- ========== CAIXAS (abertura/fechamento, resumo por operador) ==========
CREATE INDEX IF NOT EXISTS idx_caixas_empresa_status ON public.caixas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_caixas_operador_status ON public.caixas(operador_id, status);

-- ========== ALUNO_MOVIMENTACOES (extrato, gasto hoje, relatórios) ==========
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_pedido_id ON public.aluno_movimentacoes(pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_aluno_tipo_created ON public.aluno_movimentacoes(aluno_id, tipo, created_at DESC);

-- ========== CONSUMO COLABORADOR (financeiro mensal) ==========
CREATE INDEX IF NOT EXISTS idx_consumo_colaborador_empresa_ano_mes ON public.consumo_colaborador_mensal(empresa_id, ano, mes DESC);

-- ========== PAGAMENTOS (por caixa, por pedido) ==========
-- idx_pagamentos_caixa (035) e idx_pagamentos_pedido (001) já existem

-- ========== CONFIGURAÇÕES (leitura frequente) ==========
-- idx_configuracoes_chave já existe em 009

-- =====================================================================
-- supabase/migrations/083_aluno_saldos_permitir_negativo.sql
-- =====================================================================
-- Permitir saldo negativo em aluno_saldos (regras aplicadas na aplicação: admin, responsável, limite).
-- Remove a CHECK que impedia saldo < 0 e causava "violates check constraint" ao debitar no PDV.
ALTER TABLE public.aluno_saldos
  DROP CONSTRAINT IF EXISTS aluno_saldos_saldo_check;

COMMENT ON TABLE public.aluno_saldos IS 'Saldo por aluno. Pode ser negativo quando admin permite e responsável não bloqueou (regras em configuracoes e aluno_config).';

-- =====================================================================
-- supabase/migrations/084_migracao_saldo_permitir_negativo.sql
-- =====================================================================
-- Permitir valores negativos na migração de saldo (débitos do sistema antigo).
-- Ajusta a RPC executar_migracao_saldo para aceitar valor < 0 e recusar apenas 0.

CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    -- Agora permite valores negativos (débito), apenas recusa zero.
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'Valor inválido (zero) para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (v_total_alunos, v_valor_total)
  RETURNING id INTO v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/085_migracao_saldo_restaurar_itens.sql
-- =====================================================================
-- Restaurar gravação de itens no histórico de migração
-- (ajuste anterior de 084 removeu, sem querer, o INSERT em historico_migracao_itens).
-- Esta versão permite valores negativos (débito) e volta a registrar todos os alunos/valores.

CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  -- Criar registro do histórico (totais atualizados no final)
  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (0, 0)
  RETURNING id INTO v_historico_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    -- Permite valores negativos (débito), apenas recusa zero.
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'Valor inválido (zero) para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    INSERT INTO historico_migracao_itens (historico_migracao_id, aluno_id, valor)
    VALUES (v_historico_id, v_aluno_id, v_valor);

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  UPDATE historico_migracoes
  SET total_alunos = v_total_alunos, valor_total = v_valor_total
  WHERE id = v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/086_consumo_interno_solicitante_retirado.sql
-- =====================================================================
-- Consumo interno: quem solicitou e quem retirou (colaboradores por usuario_id)
-- Mantém withdrawn_by para compatibilidade; novos lançamentos usam solicitante_id e retirado_por_id.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS solicitante_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retirado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.solicitante_id IS 'Colaborador que solicitou o consumo (perfil COLABORADOR).';
COMMENT ON COLUMN public.consumo_interno.retirado_por_id IS 'Colaborador que retirou os itens (perfil COLABORADOR).';

-- withdrawn_by permanece para registros antigos e exibição; novos registros podem preencher com o nome do retirado_por.

CREATE INDEX IF NOT EXISTS idx_consumo_interno_solicitante ON public.consumo_interno(solicitante_id) WHERE solicitante_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumo_interno_retirado_por ON public.consumo_interno(retirado_por_id) WHERE retirado_por_id IS NOT NULL;

-- =====================================================================
-- supabase/migrations/087_consumo_interno_cancelamento.sql
-- =====================================================================
-- Cancelamento de consumo interno: status, auditoria e referência ao usuário que cancelou.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.status IS 'ATIVO | CANCELADO';
COMMENT ON COLUMN public.consumo_interno.cancelado_em IS 'Data/hora do cancelamento do lançamento de consumo interno.';
COMMENT ON COLUMN public.consumo_interno.cancelado_por_id IS 'Usuário que realizou o cancelamento do lançamento de consumo interno.';

-- =====================================================================
-- supabase/migrations/087_fix_rls_importacao_logs_transacao_confirmacao.sql
-- =====================================================================
-- Habilitar RLS em tabelas internas expostas ao PostgREST
-- Objetivo: impedir acesso público (anon) a logs e locks internos.

-- importacao_logs: usada apenas por rotinas internas/admin.
ALTER TABLE public.importacao_logs ENABLE ROW LEVEL SECURITY;

-- Ninguém acessa via PostgREST/anon; apenas service_role (admin client) ignora RLS.
CREATE POLICY "negado_todos_importacao_logs"
  ON public.importacao_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- transacao_confirmacao: tabela de lock interna para confirmação de transações.
ALTER TABLE public.transacao_confirmacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negado_todos_transacao_confirmacao"
  ON public.transacao_confirmacao
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- supabase/migrations/088_pdv_operador_ve_nome_colaborador_pedidos.sql
-- =====================================================================
-- Policy removida: causava recursão infinita em RLS (policy em usuarios referenciando usuarios).
-- Nome do colaborador no relatório PDV é obtido via admin client em app/actions/pdv-vendas.ts (listarVendasDiaCaixa).
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;

-- =====================================================================
-- supabase/migrations/089_reverter_pdv_ve_nome_colaborador.sql
-- =====================================================================
-- Reverte a migration 088: remove a policy que permitia operador PDV ver nome de colaborador.
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;

COMMIT;
