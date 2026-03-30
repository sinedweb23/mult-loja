-- =====================================================================
-- Operador pode inserir movimentacoes e atualizar saldos

CREATE POLICY "Operador insere aluno_movimentacoes"
  ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador atualiza aluno_saldos"
  ON aluno_saldos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador insere aluno_saldos"
  ON aluno_saldos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/029_fix_rls_pedidos_insert_e_data_retirada_itens.sql
-- =====================================================================
-- 1. Corrigir RLS: permitir que usuário crie pedidos para seus alunos mesmo quando eh_admin = true (cantina: mesmo usuário pode ser admin e responsável)
DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários criam pedidos para seus alunos"
  ON pedidos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = pedidos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM usuario_aluno ua
      WHERE ua.usuario_id = pedidos.usuario_id AND ua.aluno_id = pedidos.aluno_id
    )
  );

-- 2. data_retirada por item (kit lanche: um dia por linha)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS data_retirada DATE;

COMMENT ON COLUMN pedido_itens.data_retirada IS 'Para kit lanche: data de retirada deste item. Se null, usa pedidos.data_retirada';

-- 3. Permitir INSERT em pedido_itens quando o pedido pertence ao usuário
CREATE POLICY "Usuários inserem itens em seus pedidos"
  ON pedido_itens FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/030_colaborador_ve_pedidos_proprios.sql
-- =====================================================================
-- Colaborador pode ver pedidos em que ele é o beneficiário (colaborador_id)
CREATE POLICY "Colaborador ve pedidos em que e beneficiario"
  ON pedidos FOR SELECT
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

-- Colaborador pode ver itens dos pedidos em que é o beneficiário
CREATE POLICY "Colaborador ve itens de pedidos em que e beneficiario"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND p.colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    )
  );

-- =====================================================================
-- supabase/migrations/031_operador_ve_pedidos_e_itens.sql
-- =====================================================================
-- Operador (PDV) pode ver pedidos e itens para tela de retirada

CREATE POLICY "Operador ve pedidos para retirada"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador e admin veem itens de pedidos"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );

-- Operador pode ler produtos (para exibir nome dos itens no PDV)
CREATE POLICY "Operador le produtos"
  ON produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/032_fix_rls_pedido_itens_usuarios.sql
-- =====================================================================
-- Corrigir RLS de pedido_itens: a política antiga referencia responsaveis e responsavel_id,
-- que foram renomeados para usuarios e usuario_id na migration 012. Usuários não conseguiam
-- ver itens em "Meus Pedidos" nem no PDV (quando aplicável).

DROP POLICY IF EXISTS "Responsáveis veem itens de seus pedidos" ON pedido_itens;

CREATE POLICY "Usuários veem itens de seus pedidos"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/033_rpc_itens_meus_pedidos.sql
-- =====================================================================
-- Função para listar itens dos pedidos do usuário logado (contorna RLS no join com produtos).
-- Só retorna itens de pedidos que pertencem ao auth.uid().
CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.pedido_id,
    pi.produto_id,
    pi.quantidade,
    pi.preco_unitario,
    pi.subtotal,
    COALESCE(pi.variacoes_selecionadas, '{}'::jsonb),
    COALESCE(pr.nome, 'Produto')
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (para Meus Pedidos).';

-- =====================================================================
-- supabase/migrations/034_renomear_financeiro_para_rh.sql
-- =====================================================================
-- Migration para renomear FINANCEIRO para RH no enum papel_usuario

-- 1. Atualizar todos os registros existentes de FINANCEIRO para RH
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel = 'FINANCEIRO'::papel_usuario;

-- 2. Adicionar 'RH' ao enum (se ainda não existir)
-- Como não podemos remover valores de enum diretamente, vamos adicionar RH
DO $$ 
BEGIN
    -- Verificar se 'RH' já existe no enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'RH' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'papel_usuario')
    ) THEN
        -- Adicionar 'RH' ao enum
        ALTER TYPE papel_usuario ADD VALUE IF NOT EXISTS 'RH';
    END IF;
END $$;

-- 3. Atualizar novamente os registros (caso ainda existam FINANCEIRO)
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel::text = 'FINANCEIRO';

-- Nota: O valor 'FINANCEIRO' permanecerá no enum, mas não será mais usado.
-- Para remover completamente, seria necessário recriar o enum, o que é mais complexo.
-- Por enquanto, mantemos ambos para compatibilidade, mas o código usa apenas 'RH'.

-- =====================================================================
-- supabase/migrations/035_pagamentos_caixa_id.sql
-- =====================================================================
-- Garantir que pagamentos tenha caixa_id para vincular ao caixa do PDV (fechamento e movimentação)
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS caixa_id UUID REFERENCES caixas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_caixa ON pagamentos(caixa_id);

-- =====================================================================
-- supabase/migrations/036_pagamentos_rls_operador.sql
-- =====================================================================
-- Operador pode ver e inserir pagamentos do seu caixa (PDV)
CREATE POLICY "Operador ve e insere pagamentos do seu caixa"
  ON pagamentos FOR ALL
  USING (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/037_operador_aluno_venda_direta.sql
-- =====================================================================
-- Operador do PDV precisa inserir e ler o aluno fictício "Venda Direta" para vendas diretas
CREATE POLICY "Operador ve alunos venda direta"
  ON alunos FOR SELECT
  USING (
    prontuario = 'VENDA_DIRETA'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador insere aluno venda direta"
  ON alunos FOR INSERT
  WITH CHECK (
    prontuario = 'VENDA_DIRETA'
    AND nome = 'Venda Direta'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/038_operador_cria_pedidos_pdv.sql
-- =====================================================================
-- Permitir que operador do PDV crie pedidos com origem PDV vinculados ao seu caixa
CREATE POLICY "Operador cria pedidos PDV"
  ON pedidos FOR INSERT
  WITH CHECK (
    origem = 'PDV'
    AND caixa_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pedidos.caixa_id
    )
  );

-- =====================================================================
-- supabase/migrations/039_pedido_itens_produto_nome.sql
-- =====================================================================
-- Nome do produto no momento da venda (histórico para relatórios mesmo se produto for renomeado)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS produto_nome TEXT;
COMMENT ON COLUMN pedido_itens.produto_nome IS 'Nome do produto no momento da venda (PDV/relatórios)';

-- =====================================================================
-- supabase/migrations/040_operador_atualiza_estoque_variacao.sql
-- =====================================================================
-- Operador do PDV pode atualizar estoque em variacao_valores ao finalizar venda
CREATE POLICY IF NOT EXISTS "Operador PDV pode atualizar estoque variacao_valores"
  ON variacao_valores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- Usuário autenticado (responsável) pode consumir estoque em variacao_valores em compras online
CREATE POLICY IF NOT EXISTS "Responsavel pode consumir estoque variacao_valores"
  ON variacao_valores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/041_produtos_favorito.sql
-- =====================================================================
-- Favoritar produto: usado no PDV para destacar na tela de vendas
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS favorito BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN produtos.favorito IS 'Produto favorito: destacado no PDV (tela de vendas).';

-- =====================================================================
-- supabase/migrations/042_operador_atualiza_pedido_entregue.sql
-- =====================================================================
-- Operador (PDV) e admin podem marcar pedido como entregue na tela de retirada
CREATE POLICY "Operador e admin atualizam pedido (marcar entregue)"
  ON pedidos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );

-- =====================================================================
-- supabase/migrations/043_transacoes_gateway_rede.sql
-- =====================================================================
-- Transações do gateway de pagamento (Rede): checkout loja e recarga de saldo
-- Permite criar a intenção de pagamento antes de ter pedido; ao aprovar, cria pedido ou credita saldo.

CREATE TYPE transacao_tipo AS ENUM ('PEDIDO_LOJA', 'RECARGA_SALDO');
CREATE TYPE transacao_status AS ENUM ('PENDENTE', 'PROCESSANDO', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'CANCELADO');
CREATE TYPE transacao_metodo AS ENUM ('PIX', 'CARTAO');

CREATE TABLE transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo transacao_tipo NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  metodo transacao_metodo NOT NULL,
  status transacao_status NOT NULL DEFAULT 'PENDENTE',
  gateway_id TEXT,
  gateway_tid TEXT,
  gateway_nsu TEXT,
  gateway_data JSONB DEFAULT '{}'::jsonb,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_transacao_aluno_tipo CHECK (
    (tipo = 'PEDIDO_LOJA' AND aluno_id IS NOT NULL) OR
    (tipo = 'RECARGA_SALDO' AND aluno_id IS NOT NULL)
  )
);

COMMENT ON TABLE transacoes IS 'Intenções de pagamento via gateway Rede (loja e recarga). Pedido/saldo só é confirmado após APROVADO.';
COMMENT ON COLUMN transacoes.payload IS 'PEDIDO_LOJA: { itens, dataRetirada, agrupadoPorAluno }. RECARGA_SALDO: {}';
COMMENT ON COLUMN transacoes.gateway_id IS 'ID da transação no gateway Rede';
COMMENT ON COLUMN transacoes.gateway_tid IS 'TID retornado pelo gateway';
COMMENT ON COLUMN transacoes.gateway_nsu IS 'NSU retornado pelo gateway';

CREATE INDEX idx_transacoes_usuario ON transacoes(usuario_id);
CREATE INDEX idx_transacoes_aluno ON transacoes(aluno_id);
CREATE INDEX idx_transacoes_pedido ON transacoes(pedido_id);
CREATE INDEX idx_transacoes_status ON transacoes(status);
CREATE INDEX idx_transacoes_gateway_id ON transacoes(gateway_id);
CREATE INDEX idx_transacoes_created ON transacoes(created_at);
CREATE INDEX idx_transacoes_tipo ON transacoes(tipo);

-- Vincular pagamentos ao gateway (transação) quando gerados a partir do checkout online
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_transacao ON pagamentos(transacao_id);

-- Vincular movimentação de saldo à transação (recarga online)
ALTER TABLE aluno_movimentacoes ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_transacao ON aluno_movimentacoes(transacao_id);

-- RLS: responsável vê apenas suas transações
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve proprias transacoes"
  ON transacoes FOR SELECT
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Usuario insere transacoes para si"
  ON transacoes FOR INSERT
  WITH CHECK (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

-- UPDATE só pelo servidor (webhook/API com service role); cliente não atualiza transação.

-- =====================================================================
-- supabase/migrations/044_produtos_unidade.sql
-- =====================================================================
-- Unidade de venda do produto: Unitário (un) ou Kilograma (kg)
-- Se KG, o preço do produto é o preço por kg; no PDV o operador informa as gramas.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'UN' CHECK (unidade IN ('UN', 'KG'));

COMMENT ON COLUMN produtos.unidade IS 'UN = unitário (preço por unidade). KG = preço por kg; no PDV informar gramas.';

-- =====================================================================
-- supabase/migrations/045_usuarios_re_colaborador.sql
-- =====================================================================
-- RE (Registro do Empregado) para colaboradores importados pelo RH
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS re_colaborador TEXT;

COMMENT ON COLUMN usuarios.re_colaborador IS 'Registro do empregado (RE), preenchido na importação de colaboradores pelo RH';

-- =====================================================================
-- supabase/migrations/046_fix_sync_usuario_admin_cache_null.sql
-- =====================================================================
-- Colaboradores importados têm auth_user_id NULL; o cache só deve ter linhas com auth_user_id preenchido.
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
DECLARE
  uid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;

  uid := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  IF uid IS NOT NULL THEN
    INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
    VALUES (uid, COALESCE(NEW.eh_admin, false))
    ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================================
-- supabase/migrations/047_refatorar_usuarios_perfis.sql
-- =====================================================================
-- Refatoração: estrutura central em usuarios (nome, cpf, email, celular, responsabilidade),
-- perfis como tabela de dados (colaborador, responsável, admin, etc.) e usuario_perfis N:N.
-- Aluno passa a ter usuario_id (aluno também é usuário).
-- Colunas antigas são mantidas por enquanto para compatibilidade; podem ser removidas após atualizar o código.

-- 1. Novos campos em usuarios (unificando _financeiro e _pedagogico)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS celular TEXT,
  ADD COLUMN IF NOT EXISTS responsabilidade SMALLINT;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS chk_responsabilidade;

ALTER TABLE public.usuarios
  ADD CONSTRAINT chk_responsabilidade CHECK (responsabilidade IS NULL OR responsabilidade IN (1, 2, 3));

COMMENT ON COLUMN public.usuarios.cpf IS 'CPF do usuário (unificado)';
COMMENT ON COLUMN public.usuarios.responsabilidade IS '1=financeiro, 2=pedagógico, 3=ambos';

-- 2. Backfill: unificar dados em nome, cpf, email, celular, responsabilidade
UPDATE public.usuarios
SET
  nome = COALESCE(NULLIF(TRIM(nome), ''), nome_financeiro, nome_pedagogico),
  cpf = COALESCE(NULLIF(TRIM(cpf), ''), cpf_financeiro, cpf_pedagogico),
  email = COALESCE(NULLIF(TRIM(email), ''), email_financeiro, email_pedagogico),
  celular = COALESCE(NULLIF(TRIM(celular), ''), celular_financeiro, celular_pedagogico),
  responsabilidade = CASE
    WHEN tipo::text = 'FINANCEIRO' THEN 1
    WHEN tipo::text = 'PEDAGOGICO' THEN 2
    ELSE 3
  END
WHERE TRUE;

-- 3. Garantir perfis de “papel” (para usuario_perfis)
INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'Admin', 'Administrador do sistema', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'Admin');

INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'Diretor', 'Diretor', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'Diretor');

-- 4. Tabela N:N usuario_perfis (um usuário pode ter vários perfis)
CREATE TABLE IF NOT EXISTS public.usuario_perfis (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (usuario_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_perfis_usuario ON public.usuario_perfis(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_perfil ON public.usuario_perfis(perfil_id);

COMMENT ON TABLE public.usuario_perfis IS 'Perfis do usuário (N:N). Ex.: colaborador, responsável, admin. Substitui uso exclusivo de usuario_papeis.';

-- 5. Migrar usuario_papeis -> usuario_perfis (mapeamento papel -> perfil por nome)
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT up.usuario_id, p.id
FROM public.usuario_papeis up
CROSS JOIN LATERAL (
  SELECT id FROM public.perfis
  WHERE nome IN ('Responsável', 'Admin', 'Operador', 'Colaborador', 'RH')
  AND (
    (up.papel::text = 'RESPONSAVEL' AND nome = 'Responsável')
    OR (up.papel::text = 'ADMIN' AND nome = 'Admin')
    OR (up.papel::text = 'OPERADOR' AND nome = 'Operador')
    OR (up.papel::text = 'COLABORADOR' AND nome = 'Colaborador')
    OR (up.papel::text IN ('RH', 'FINANCEIRO') AND nome = 'RH')
  )
  LIMIT 1
) p
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- Admin: se não houver perfil "Admin", usar "Acesso total"
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT up.usuario_id, p.id
FROM public.usuario_papeis up
JOIN public.perfis p ON p.nome = 'Acesso total'
WHERE up.papel::text = 'ADMIN'
AND NOT EXISTS (
  SELECT 1 FROM public.usuario_perfis up2
  JOIN public.perfis p2 ON p2.id = up2.perfil_id AND p2.nome = 'Admin'
  WHERE up2.usuario_id = up.usuario_id
)
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- 6. Migrar usuarios.perfil_id -> usuario_perfis (quem já tem perfil de acesso admin)
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT id, perfil_id
FROM public.usuarios
WHERE perfil_id IS NOT NULL
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- 7. alunos.usuario_id (aluno também é usuário)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_usuario ON public.alunos(usuario_id);
COMMENT ON COLUMN public.alunos.usuario_id IS 'Usuário vinculado ao aluno (aluno também é usuário no sistema)';

-- RLS: usuario_perfis (mesmo padrão de usuario_papeis: usuário vê os próprios; admin vê todos)
ALTER TABLE public.usuario_perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê próprios usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Usuário vê próprios usuario_perfis"
  ON public.usuario_perfis FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = usuario_perfis.usuario_id AND u.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins veem todos usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Admins veem todos usuario_perfis"
  ON public.usuario_perfis FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

DROP POLICY IF EXISTS "Admins gerenciam usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Admins gerenciam usuario_perfis"
  ON public.usuario_perfis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

-- =====================================================================
-- supabase/migrations/048_usuarios_remover_colunas_antigas.sql
-- =====================================================================
-- Remove colunas antigas de usuarios e passa a usar apenas a estrutura refatorada.
-- eh_admin e perfil_id são removidos; "é admin?" vem de usuario_perfis (perfil Admin ou Acesso total).
-- Antes de dropar eh_admin, atualizamos funções e políticas RLS para usarem usuario_admin_cache.

-- 1. Função: atualizar cache de admin para um usuario_id (com base em usuario_perfis)
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache_by_id(p_usuario_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT auth_user_id INTO v_auth_id FROM public.usuarios WHERE id = p_usuario_id;
  IF v_auth_id IS NULL THEN RETURN; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis up
    JOIN public.perfis p ON p.id = up.perfil_id
    WHERE up.usuario_id = p_usuario_id AND p.nome IN ('Admin', 'Acesso total')
  ) INTO v_is_admin;
  INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
  VALUES (v_auth_id, COALESCE(v_is_admin, false))
  ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
END;
$$;

-- 2. Trigger em usuario_perfis
CREATE OR REPLACE FUNCTION public.trg_sync_cache_on_usuario_perfis()
RETURNS TRIGGER AS $$
DECLARE u_id UUID;
BEGIN
  u_id := COALESCE(NEW.usuario_id, OLD.usuario_id);
  IF u_id IS NOT NULL THEN PERFORM public.sync_usuario_admin_cache_by_id(u_id); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_cache_usuario_perfis ON public.usuario_perfis;
CREATE TRIGGER trg_sync_cache_usuario_perfis
  AFTER INSERT OR DELETE OR UPDATE OF perfil_id ON public.usuario_perfis
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_cache_on_usuario_perfis();

-- 3. sync_usuario_admin_cache (usuarios): is_admin vem de usuario_perfis
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
DECLARE uid UUID; v_is_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;
  uid := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  IF uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_perfis up
      JOIN public.perfis p ON p.id = up.perfil_id
      WHERE up.usuario_id = NEW.id AND p.nome IN ('Admin', 'Acesso total')
    ) INTO v_is_admin;
    INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
    VALUES (uid, COALESCE(v_is_admin, false))
    ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_usuario_admin_cache ON public.usuarios;
CREATE TRIGGER trg_sync_usuario_admin_cache
  AFTER INSERT OR UPDATE OF auth_user_id OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_usuario_admin_cache();

-- 4. Repopular cache a partir de usuario_perfis
INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
SELECT u.auth_user_id,
  EXISTS (
    SELECT 1 FROM public.usuario_perfis up
    JOIN public.perfis p ON p.id = up.perfil_id
    WHERE up.usuario_id = u.id AND p.nome IN ('Admin', 'Acesso total')
  )
FROM public.usuarios u
WHERE u.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

-- 5. eh_admin_usuario passa a usar apenas usuario_admin_cache + usuarios.ativo (sem coluna eh_admin)
CREATE OR REPLACE FUNCTION public.eh_admin_usuario(user_id UUID)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_admin_cache c ON c.auth_user_id = u.auth_user_id
    WHERE u.auth_user_id = user_id AND u.ativo = TRUE AND c.is_admin = TRUE
  );
END;
$$;

-- 6. Storage: eh_admin_upload usa a função (não lê coluna eh_admin)
CREATE OR REPLACE FUNCTION public.eh_admin_upload()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT public.eh_admin_usuario(auth.uid()); $$;

-- 7. Helper: usuário atual é admin OU operador (para políticas que misturam os dois)
CREATE OR REPLACE FUNCTION public.eh_admin_ou_operador()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.eh_admin_usuario(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_papeis up ON up.usuario_id = u.id
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
  );
$$;

-- 8. Dropar políticas que dependem de usuarios.eh_admin e recriar usando eh_admin_usuario/cache
-- aluno_config
DROP POLICY IF EXISTS "Admins veem aluno_config" ON public.aluno_config;
CREATE POLICY "Admins veem aluno_config" ON public.aluno_config FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- aluno_movimentacoes
DROP POLICY IF EXISTS "Admins veem aluno_movimentacoes" ON public.aluno_movimentacoes;
DROP POLICY IF EXISTS "Admins inserem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Admins veem aluno_movimentacoes" ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins inserem aluno_movimentacoes" ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- aluno_produto_bloqueado
DROP POLICY IF EXISTS "Admins veem aluno_produto_bloqueado" ON public.aluno_produto_bloqueado;
CREATE POLICY "Admins veem aluno_produto_bloqueado" ON public.aluno_produto_bloqueado FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- aluno_saldos
DROP POLICY IF EXISTS "Admins veem aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Admins atualizam aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Admins veem aluno_saldos" ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins atualizam aluno_saldos" ON public.aluno_saldos FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- alunos
DROP POLICY IF EXISTS "Admins veem todos os alunos" ON public.alunos;
CREATE POLICY "Admins veem todos os alunos" ON public.alunos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- caixas
DROP POLICY IF EXISTS "Admins veem todos caixas" ON public.caixas;
DROP POLICY IF EXISTS "Operador ou admin abre fecha caixa" ON public.caixas;
CREATE POLICY "Admins veem todos caixas" ON public.caixas FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Operador ou admin abre fecha caixa" ON public.caixas FOR ALL
  USING (
    (operador_id IN (SELECT id FROM public.usuarios WHERE auth_user_id = auth.uid()))
    OR public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    (operador_id IN (SELECT id FROM public.usuarios WHERE auth_user_id = auth.uid()))
    OR public.eh_admin_usuario(auth.uid())
  );

-- categorias
DROP POLICY IF EXISTS "Admins podem gerenciar categorias" ON public.categorias;
CREATE POLICY "Admins podem gerenciar categorias" ON public.categorias FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = categorias.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = categorias.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- consumo_colaborador_mensal
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- dias_uteis_config
DROP POLICY IF EXISTS "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config;
CREATE POLICY "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- dias_uteis_mes
DROP POLICY IF EXISTS "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes;
CREATE POLICY "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- enderecos
DROP POLICY IF EXISTS "Admins veem todos os endereços" ON public.enderecos;
DROP POLICY IF EXISTS "Usuários veem seus endereços" ON public.enderecos;
CREATE POLICY "Admins veem todos os endereços" ON public.enderecos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Usuários veem seus endereços" ON public.enderecos FOR SELECT
  USING (
    usuario_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = enderecos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );

-- grupos_opcionais
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_opcionais" ON public.grupos_opcionais;
CREATE POLICY "Admins podem gerenciar grupos_opcionais" ON public.grupos_opcionais FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = grupos_opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = grupos_opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- grupos_produtos
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_produtos" ON public.grupos_produtos;
CREATE POLICY "Admins podem gerenciar grupos_produtos" ON public.grupos_produtos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = grupos_produtos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = grupos_produtos.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- kits_itens
DROP POLICY IF EXISTS "Admins podem gerenciar kits_itens" ON public.kits_itens;
CREATE POLICY "Admins podem gerenciar kits_itens" ON public.kits_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = kits_itens.kit_produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL OR u.super_admin = TRUE)
    )
    AND public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = kits_itens.kit_produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL OR u.super_admin = TRUE)
    )
    AND public.eh_admin_usuario(auth.uid())
  );

-- opcionais
DROP POLICY IF EXISTS "Admins podem gerenciar opcionais" ON public.opcionais;
CREATE POLICY "Admins podem gerenciar opcionais" ON public.opcionais FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- pagamentos
DROP POLICY IF EXISTS "Operador ve e insere pagamentos do seu caixa" ON public.pagamentos;
CREATE POLICY "Operador ve e insere pagamentos do seu caixa" ON public.pagamentos FOR ALL
  USING (
    (caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    (caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR public.eh_admin_usuario(auth.uid())
  );

-- pedido_itens
DROP POLICY IF EXISTS "Operador e admin veem itens de pedidos" ON public.pedido_itens;
CREATE POLICY "Operador e admin veem itens de pedidos" ON public.pedido_itens FOR SELECT
  USING (public.eh_admin_ou_operador());

-- pedidos
DROP POLICY IF EXISTS "Admins veem todos os pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Usuários veem apenas seus pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Operador e admin atualizam pedido (marcar entregue)" ON public.pedidos;
CREATE POLICY "Admins veem todos os pedidos" ON public.pedidos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Usuários veem apenas seus pedidos" ON public.pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = pedidos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );
CREATE POLICY "Operador e admin atualizam pedido (marcar entregue)" ON public.pedidos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- produto_disponibilidade
DROP POLICY IF EXISTS "Admins podem gerenciar disponibilidade" ON public.produto_disponibilidade;
CREATE POLICY "Admins podem gerenciar disponibilidade" ON public.produto_disponibilidade FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = produto_disponibilidade.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = produto_disponibilidade.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- produtos
DROP POLICY IF EXISTS "Admins podem gerenciar produtos" ON public.produtos;
CREATE POLICY "Admins podem gerenciar produtos" ON public.produtos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = produtos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = produtos.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- turmas
DROP POLICY IF EXISTS "Admins veem todas as turmas" ON public.turmas;
DROP POLICY IF EXISTS "Usuários veem turmas de seus alunos" ON public.turmas;
CREATE POLICY "Admins veem todas as turmas" ON public.turmas FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Usuários veem turmas de seus alunos" ON public.turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      JOIN public.usuario_aluno ua ON ua.aluno_id = a.id
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE a.turma_id = turmas.id
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );

-- usuario_aluno
DROP POLICY IF EXISTS "Admins veem todos os vínculos usuario-aluno" ON public.usuario_aluno;
CREATE POLICY "Admins veem todos os vínculos usuario-aluno" ON public.usuario_aluno FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- usuario_papeis
DROP POLICY IF EXISTS "Admins veem todos usuario_papeis" ON public.usuario_papeis;
DROP POLICY IF EXISTS "Admins gerenciam usuario_papeis" ON public.usuario_papeis;
CREATE POLICY "Admins veem todos usuario_papeis" ON public.usuario_papeis FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins gerenciam usuario_papeis" ON public.usuario_papeis FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- variacao_valores
DROP POLICY IF EXISTS "Admins podem gerenciar variacao_valores" ON public.variacao_valores;
CREATE POLICY "Admins podem gerenciar variacao_valores" ON public.variacao_valores FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- variacoes
DROP POLICY IF EXISTS "Admins podem gerenciar variacoes" ON public.variacoes;
CREATE POLICY "Admins podem gerenciar variacoes" ON public.variacoes FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = variacoes.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = variacoes.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- 9. Remover colunas antigas de usuarios
ALTER TABLE public.usuarios
  DROP COLUMN IF EXISTS nome_financeiro,
  DROP COLUMN IF EXISTS nome_pedagogico,
  DROP COLUMN IF EXISTS cpf_financeiro,
  DROP COLUMN IF EXISTS cpf_pedagogico,
  DROP COLUMN IF EXISTS email_financeiro,
  DROP COLUMN IF EXISTS email_pedagogico,
  DROP COLUMN IF EXISTS celular_financeiro,
  DROP COLUMN IF EXISTS celular_pedagogico,
  DROP COLUMN IF EXISTS tipo,
  DROP COLUMN IF EXISTS eh_admin,
  DROP COLUMN IF EXISTS perfil_id;

-- =====================================================================
-- supabase/migrations/049_calendario_dias_uteis.sql
-- =====================================================================
-- Calendário: feriados fixos (todo ano), eventos específicos e configuração de fim de semana
-- Usado para definir dias úteis: um dia é não útil se for feriado fixo, evento ou sáb/dom conforme config.

-- Configuração de fim de semana por empresa (sábado e domingo são úteis?)
CREATE TABLE IF NOT EXISTS calendario_fim_semana (
  empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  sabado_util BOOLEAN NOT NULL DEFAULT FALSE,
  domingo_util BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feriados/datas fixas que se repetem todo ano (ex: 01/01, 25/12, 07/09)
CREATE TABLE IF NOT EXISTS calendario_feriados_fixos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes SMALLINT NOT NULL CHECK (mes >= 1 AND mes <= 12),
  dia SMALLINT NOT NULL CHECK (dia >= 1 AND dia <= 31),
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mes, dia)
);

-- Eventos/datas específicas (um ano ou recorrentes)
-- ano_especifico NULL = recorrente (todo ano nessa data); preenchido = só naquele ano
CREATE TABLE IF NOT EXISTS calendario_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  ano_especifico INTEGER NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_empresa ON calendario_eventos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_data ON calendario_eventos(data);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_ano ON calendario_eventos(ano_especifico);

COMMENT ON TABLE calendario_fim_semana IS 'Define se sábado e domingo são dias úteis por empresa';
COMMENT ON TABLE calendario_feriados_fixos IS 'Datas fixas não úteis que se repetem todo ano (mes/dia)';
COMMENT ON TABLE calendario_eventos IS 'Datas específicas não úteis: ano_especifico NULL = todo ano; preenchido = só naquele ano';

-- RLS
ALTER TABLE calendario_fim_semana ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_feriados_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana;
CREATE POLICY "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos;
CREATE POLICY "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos;
CREATE POLICY "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/050_turmas_turno.sql
-- =====================================================================
-- Turno da turma: Manhã ou Tarde (opcional)
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS turno TEXT;

COMMENT ON COLUMN public.turmas.turno IS 'Turno da turma: MANHA, TARDE ou null (não informado)';

-- =====================================================================
-- supabase/migrations/051_produtos_kit_festa_config.sql
-- =====================================================================
-- Configurações para produto tipo Kit Festa: antecedência de compra e horários por período
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_min INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_max INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_horarios JSONB NULL;

COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_min IS 'Kit Festa: mínimo de dias de antecedência para compra (ex: 10)';
COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_max IS 'Kit Festa: máximo de dias de antecedência para compra (ex: 60)';
COMMENT ON COLUMN public.produtos.kit_festa_horarios IS 'Kit Festa: [{ "periodo": "MANHA"|"TARDE", "inicio": "HH:mm", "fim": "HH:mm" }, ...]';

-- =====================================================================
-- supabase/migrations/052_pedido_itens_kit_festa_google.sql
-- =====================================================================
-- Kit Festa: campos no pedido_item (tema, idade, data/horário, evento Google)
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS tema_festa TEXT,
  ADD COLUMN IF NOT EXISTS idade_festa INTEGER,
  ADD COLUMN IF NOT EXISTS kit_festa_data DATE,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_inicio TEXT,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_fim TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_link TEXT;

COMMENT ON COLUMN pedido_itens.tema_festa IS 'Kit Festa: tema informado pelo responsável';
COMMENT ON COLUMN pedido_itens.idade_festa IS 'Kit Festa: idade que a criança fará (1-15)';
COMMENT ON COLUMN pedido_itens.kit_festa_data IS 'Kit Festa: data de retirada (YYYY-MM-DD)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_inicio IS 'Kit Festa: início do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_fim IS 'Kit Festa: fim do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.google_event_id IS 'Kit Festa: ID do evento criado na Google Agenda após pagamento';
COMMENT ON COLUMN pedido_itens.google_event_link IS 'Kit Festa: link para o evento na Google Agenda';

-- =====================================================================
-- supabase/migrations/053_rpc_itens_meus_pedidos_kit_festa.sql
-- =====================================================================
-- Estende get_itens_meus_pedidos para retornar campos Kit Festa e opcionais.
DROP FUNCTION IF EXISTS public.get_itens_meus_pedidos(uuid[]);

CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text,
  tema_festa text,
  idade_festa integer,
  kit_festa_data date,
  kit_festa_horario_inicio text,
  kit_festa_horario_fim text,
  google_event_id text,
  google_event_link text,
  opcionais_selecionados jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.pedido_id,
    pi.produto_id,
    pi.quantidade,
    pi.preco_unitario,
    pi.subtotal,
    COALESCE(pi.variacoes_selecionadas, '{}'::jsonb),
    COALESCE(pi.produto_nome, pr.nome, 'Produto'),
    pi.tema_festa,
    pi.idade_festa,
    pi.kit_festa_data,
    pi.kit_festa_horario_inicio,
    pi.kit_festa_horario_fim,
    pi.google_event_id,
    pi.google_event_link,
    COALESCE(pi.opcionais_selecionados, '[]'::jsonb)
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (inclui Kit Festa e opcionais).';

-- =====================================================================
-- supabase/migrations/054_loja_variacoes_opcionais_select_autenticado.sql
-- =====================================================================
-- Loja: usuário autenticado (ex.: responsável) pode ler variações e opcionais de produtos ativos
-- para exibir na página do produto ao adicionar ao carrinho (sem ser admin).

-- variacoes: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le variacoes de produtos ativos"
  ON public.variacoes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = variacoes.produto_id AND p.ativo = TRUE
    )
  );

-- variacao_valores: SELECT para qualquer autenticado (produto ativo via variacao)
CREATE POLICY "Loja: autenticado le variacao_valores de produtos ativos"
  ON public.variacao_valores FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id AND p.ativo = TRUE
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- grupos_opcionais: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le grupos_opcionais de produtos ativos"
  ON public.grupos_opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = grupos_opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- opcionais: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le opcionais de produtos ativos"
  ON public.opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/055_responsavel_ve_itens_pedidos_alunos.sql
-- =====================================================================
-- Responsável pode ver itens de pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para o extrato na Gestão de Saldo mostrar produtos das compras no PDV (pedido tem usuario_id = operador).
CREATE POLICY "Responsáveis veem itens de pedidos dos seus alunos"
  ON public.pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      JOIN public.usuario_aluno ua ON ua.aluno_id = p.aluno_id
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/056_categorias_select_autenticados.sql
-- =====================================================================
-- Permite que usuários autenticados leiam categorias (para a loja agrupar produtos por categoria).
-- Admins continuam com FOR ALL; esta política adiciona SELECT para qualquer auth.uid() não nulo.
CREATE POLICY "Autenticados podem ler categorias"
  ON public.categorias FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================================
-- supabase/migrations/057_abatimento_colaborador_lancamento.sql
-- =====================================================================
-- Lançamentos de abatimento (baixas) feitas pelo RH para relatório com data/hora
CREATE TABLE IF NOT EXISTS abatimento_colaborador_lancamento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  operador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_usuario ON abatimento_colaborador_lancamento(usuario_id);
CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_created ON abatimento_colaborador_lancamento(created_at);

ALTER TABLE abatimento_colaborador_lancamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento;
CREATE POLICY "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento
  FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- =====================================================================
-- supabase/migrations/058_config_lanche_do_dia_credito_cantina.sql
-- =====================================================================
-- Configurações: Lanche do Dia e segmentos com acesso ao Crédito Cantina
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('lanche_do_dia_produto_id', '', 'ID do produto exibido como Lanche do Dia na Loja', 'TEXTO', false),
  ('segmentos_credito_cantina', '[]', 'Segmentos (turmas) com acesso à rota /loja/credito-cantina (JSON array)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;

-- =====================================================================
-- supabase/migrations/059_credito_cantina_excecoes_turmas.sql
-- =====================================================================
-- Lista de exceção: turmas que NÃO têm acesso ao Crédito Cantina (por padrão todas têm acesso).
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('credito_cantina_excecoes_turma_ids', '[]', 'IDs das turmas sem acesso à rota /loja/credito-cantina (exceção)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;

-- =====================================================================
-- supabase/migrations/060_produto_disponibilidade_segmento_tipo_curso.sql
-- =====================================================================
-- Permite que produto_disponibilidade.segmento armazene valores da coluna tipo_curso da tabela turmas (texto livre)
ALTER TABLE produto_disponibilidade
  ALTER COLUMN segmento TYPE TEXT USING segmento::text;

-- =====================================================================
-- supabase/migrations/061_responsavel_ve_pedidos_dos_alunos.sql
-- =====================================================================
-- Responsável pode ver pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para a política "Responsáveis veem itens de pedidos dos seus alunos" em pedido_itens
-- funcionar: o subquery dessa política lê de pedidos; sem isso, responsáveis não-admin não
-- conseguiam ver itens das compras no extrato (pedidos PDV têm usuario_id = operador).
CREATE POLICY "Responsáveis veem pedidos dos seus alunos"
  ON public.pedidos FOR SELECT
  USING (
    NOT public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuario_aluno ua
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = pedidos.aluno_id
    )
  );

-- =====================================================================
-- supabase/migrations/062_deduplicar_colaboradores_por_cpf.sql
-- =====================================================================
-- Deduplicar colaboradores por CPF: manter um por CPF (o de menor id), reassignar referências e apagar os demais.
-- Rodar manualmente uma vez no SQL Editor do Supabase (ou via MCP).

DO $$
DECLARE
  r RECORD;
  kept_id UUID;
  dup_id UUID;
BEGIN
  FOR r IN (
    WITH
    raw_cpf AS (
      SELECT u.id, u.cpf,
             regexp_replace(COALESCE(TRIM(u.cpf::text), ''), '[^0-9]', '', 'g') AS digits
      FROM usuarios u
      WHERE EXISTS (
        SELECT 1 FROM usuario_papeis up
        WHERE up.usuario_id = u.id AND up.papel = 'COLABORADOR'
      )
    ),
    colab AS (
      SELECT r.id, r.cpf,
             CASE
               WHEN LENGTH(r.digits) = 11 THEN r.digits
               WHEN LENGTH(r.digits) = 10 THEN '0' || r.digits
               ELSE NULL
             END AS cpf_norm,
             EXISTS (
               SELECT 1 FROM public.usuario_perfis up
               JOIN public.perfis p ON p.id = up.perfil_id
               WHERE up.usuario_id = r.id AND p.nome IN ('Admin', 'Acesso total')
             ) AS tem_admin
      FROM raw_cpf r
      WHERE LENGTH(r.digits) IN (10, 11)
    ),
    ranked AS (
      -- Manter o que tem Admin (ou Acesso total); senão o de menor id (nunca apagar admin por engano)
      SELECT id, cpf_norm,
             ROW_NUMBER() OVER (PARTITION BY cpf_norm ORDER BY tem_admin DESC, id) AS rn
      FROM colab
    ),
    dups AS (
      SELECT rk.id AS duplicate_id,
             (SELECT r2.id FROM ranked r2 WHERE r2.cpf_norm = rk.cpf_norm AND r2.rn = 1 LIMIT 1) AS keep_id
      FROM ranked rk
      WHERE rk.rn > 1
    )
    SELECT duplicate_id, keep_id FROM dups
  )
  LOOP
    dup_id := r.duplicate_id;
    kept_id := r.keep_id;
    IF dup_id IS NULL OR kept_id IS NULL OR dup_id = kept_id THEN
      CONTINUE;
    END IF;

    -- Pedidos: apontar para o usuário que fica
    UPDATE pedidos SET colaborador_id = kept_id WHERE colaborador_id = dup_id;
    -- Transações (pagamentos) do duplicado passam para o kept (evita RESTRICT)
    UPDATE transacoes SET usuario_id = kept_id WHERE usuario_id = dup_id;
    -- Caixas: se o duplicado for operador de caixa, reassign para o kept (evita RESTRICT ao deletar)
    UPDATE caixas SET operador_id = kept_id WHERE operador_id = dup_id;

    -- Consumo mensal: linhas do duplicado que não conflitam com kept -> só trocar usuario_id
    UPDATE consumo_colaborador_mensal
    SET usuario_id = kept_id, updated_at = NOW()
    WHERE usuario_id = dup_id
      AND NOT EXISTS (
        SELECT 1 FROM consumo_colaborador_mensal c2
        WHERE c2.usuario_id = kept_id
          AND c2.empresa_id = consumo_colaborador_mensal.empresa_id
          AND c2.ano = consumo_colaborador_mensal.ano
          AND c2.mes = consumo_colaborador_mensal.mes
      );

    -- Conflitos: somar valor_total e valor_abatido na linha do kept
    UPDATE consumo_colaborador_mensal c
    SET valor_total = c.valor_total + sub.soma_total,
        valor_abatido = c.valor_abatido + sub.soma_abatido,
        updated_at = NOW()
    FROM (
      SELECT empresa_id, ano, mes,
             SUM(valor_total) AS soma_total,
             SUM(valor_abatido) AS soma_abatido
      FROM consumo_colaborador_mensal
      WHERE usuario_id = dup_id
      GROUP BY empresa_id, ano, mes
    ) sub
    WHERE c.usuario_id = kept_id
      AND c.empresa_id = sub.empresa_id AND c.ano = sub.ano AND c.mes = sub.mes;

    -- Remover todas as linhas de consumo do duplicado
    DELETE FROM consumo_colaborador_mensal WHERE usuario_id = dup_id;

    -- Abatimentos: apontar para o que fica (tabela pode não existir em todos os projetos)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abatimento_colaborador_lancamento') THEN
      UPDATE abatimento_colaborador_lancamento SET usuario_id = kept_id WHERE usuario_id = dup_id;
    END IF;

    -- Papéis e depois o usuário
    DELETE FROM usuario_papeis WHERE usuario_id = dup_id;
    DELETE FROM usuarios WHERE id = dup_id;
  END LOOP;
END $$;

-- =====================================================================
-- supabase/migrations/063_movimento_estoque_entrada.sql
-- =====================================================================
-- Registro de entradas de estoque (e futuras saídas) para rastreabilidade.
-- Cada linha é um movimento: produto (e opcionalmente variacao_valor) + quantidade.
CREATE TABLE IF NOT EXISTS public.movimento_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_empresa ON public.movimento_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_produto ON public.movimento_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_created ON public.movimento_estoque(created_at DESC);

COMMENT ON TABLE public.movimento_estoque IS 'Entradas (e futuras saídas) de estoque; quantidade > 0 = entrada.';

ALTER TABLE public.movimento_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem movimentos de estoque da empresa"
  ON public.movimento_estoque FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Admins inserem movimentos de estoque"
  ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/064_entrada_estoque_cabecalho_custo.sql
-- =====================================================================
-- Cabeçalho da entrada (número da entrada, número da nota, valor total) e custo unitário nos itens.

CREATE TABLE IF NOT EXISTS public.entrada_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_entrada INTEGER NOT NULL,
  numero_nota TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  valor_total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entrada_estoque_empresa_numero ON public.entrada_estoque(empresa_id, numero_entrada);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_empresa ON public.entrada_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_created ON public.entrada_estoque(created_at DESC);

COMMENT ON TABLE public.entrada_estoque IS 'Cabeçalho de cada entrada de estoque (número da entrada, nota, usuário, valor total).';

ALTER TABLE public.entrada_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem entradas de estoque"
  ON public.entrada_estoque FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

CREATE POLICY "Admins inserem entradas de estoque"
  ON public.entrada_estoque FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

CREATE POLICY "Admins atualizam entradas de estoque"
  ON public.entrada_estoque FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

-- Adicionar colunas em movimento_estoque
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS entrada_id UUID REFERENCES public.entrada_estoque(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_entrada ON public.movimento_estoque(entrada_id);

-- =====================================================================
-- supabase/migrations/065_produtos_valor_custo.sql
-- =====================================================================
-- Valor de custo do produto (moeda) para controle interno
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

COMMENT ON COLUMN public.produtos.valor_custo IS 'Custo unitário do produto em R$ (uso interno/admin).';

-- =====================================================================
-- supabase/migrations/066_parcelamento_regras.sql
-- =====================================================================
-- Regras de parcelamento para checkout (cartão)
CREATE TABLE IF NOT EXISTS public.parcelamento_regras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  valor_min NUMERIC(12,2) NOT NULL CHECK (valor_min >= 0),
  valor_max NUMERIC(12,2) NULL,
  max_parcelas INTEGER NOT NULL CHECK (max_parcelas >= 1 AND max_parcelas <= 10),
  tipo TEXT NOT NULL CHECK (tipo IN ('SEM_JUROS', 'COM_JUROS')),
  taxa_juros_pct NUMERIC(5,2) NULL CHECK (taxa_juros_pct IS NULL OR (taxa_juros_pct >= 0 AND taxa_juros_pct <= 100)),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_taxa_se_com_juros CHECK (
    (tipo = 'SEM_JUROS' AND taxa_juros_pct IS NULL) OR
    (tipo = 'COM_JUROS')
  ),
  CONSTRAINT chk_valor_max CHECK (valor_max IS NULL OR valor_max >= valor_min)
);

CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_ordem ON public.parcelamento_regras(ordem);
CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_valor ON public.parcelamento_regras(valor_min, valor_max);

COMMENT ON TABLE public.parcelamento_regras IS 'Regras de parcelamento por faixa de valor (admin > Configurações > Pagamento).';

ALTER TABLE public.parcelamento_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler regras de parcelamento"
  ON public.parcelamento_regras FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar regras de parcelamento"
  ON public.parcelamento_regras FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/067_concorrencia_transacoes_saldo.sql
-- =====================================================================
-- Garantir idempotência na confirmação de transação (evitar dupla criação de pedidos/recarga)
-- e incremento atômico de saldo para recargas concorrentes.

-- Tabela de “lock”: quem inserir primeiro confirma a transação; demais retornam sem duplicar.
CREATE TABLE IF NOT EXISTS transacao_confirmacao (
  transacao_id UUID PRIMARY KEY REFERENCES transacoes(id) ON DELETE CASCADE
);
COMMENT ON TABLE transacao_confirmacao IS 'Uma linha por transação já confirmada; evita dupla execução de confirmarTransacaoAprovada.';

-- Função atômica: incrementa saldo do aluno (INSERT ou UPDATE) sem race condition.
CREATE OR REPLACE FUNCTION public.incrementar_saldo_aluno(p_aluno_id UUID, p_valor DECIMAL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO aluno_saldos (aluno_id, saldo)
  VALUES (p_aluno_id, GREATEST(0, p_valor))
  ON CONFLICT (aluno_id)
  DO UPDATE SET
    saldo = aluno_saldos.saldo + EXCLUDED.saldo,
    updated_at = now();
$$;
COMMENT ON FUNCTION public.incrementar_saldo_aluno IS 'Incrementa saldo do aluno de forma atômica (recarga online concorrente).';

-- Abate atômico de estoque (variacao_valores): evita estoque negativo com PDV e online concorrentes.
CREATE OR REPLACE FUNCTION public.decrementar_estoque_variacao_valor(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE variacao_valores
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;

-- Abate atômico de estoque (produtos).
CREATE OR REPLACE FUNCTION public.decrementar_estoque_produto(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE produtos
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;

-- =====================================================================
-- supabase/migrations/068_departamentos_segmentos.sql
-- =====================================================================
-- Departamentos (ex.: Pedagógico, Administrativo) por empresa
CREATE TABLE IF NOT EXISTS departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departamentos_empresa ON departamentos(empresa_id);

-- Segmentos (ex.: EFAF, EFAI, Infantil) dentro de cada departamento
CREATE TABLE IF NOT EXISTS segmentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segmentos_departamento ON segmentos(departamento_id);

-- RLS
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar departamentos"
  ON departamentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Admins podem gerenciar segmentos"
  ON segmentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );

-- =====================================================================
-- supabase/migrations/069_consumo_interno.sql
