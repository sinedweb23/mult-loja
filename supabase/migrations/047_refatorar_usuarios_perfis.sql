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
