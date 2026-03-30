-- Perfis de acesso: define quais páginas/funcionalidades cada perfil pode acessar
CREATE TABLE IF NOT EXISTS public.perfis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.perfis IS 'Perfis de acesso ao painel admin; cada perfil define quais páginas o usuário pode acessar';

-- Permissões por perfil: um registro por (perfil, recurso). recurso = identificador da página (ex: admin.pedidos, admin.produtos)
CREATE TABLE IF NOT EXISTS public.perfil_permissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  recurso TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, recurso)
);

CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_perfil ON public.perfil_permissoes(perfil_id);
CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_recurso ON public.perfil_permissoes(recurso);

COMMENT ON TABLE public.perfil_permissoes IS 'Lista de recursos (páginas) que cada perfil pode acessar';
COMMENT ON COLUMN public.perfil_permissoes.recurso IS 'Identificador da página/funcionalidade, ex: admin, admin.pedidos, admin.produtos';

-- Vincular usuário ao perfil (apenas para admins; se null, eh_admin com perfil null = acesso total legado)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS perfil_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON public.usuarios(perfil_id);
COMMENT ON COLUMN public.usuarios.perfil_id IS 'Perfil de acesso ao admin; se null e eh_admin=true, acesso total (legado ou super_admin)';

-- RLS: perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver perfis" ON public.perfis;
CREATE POLICY "Admins podem ver perfis"
  ON public.perfis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis;
CREATE POLICY "Super admins podem inserir/atualizar/deletar perfis"
  ON public.perfis FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  );

-- RLS: perfil_permissoes
ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Admins podem ver perfil_permissoes"
  ON public.perfil_permissoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Super admins podem gerenciar perfil_permissoes"
  ON public.perfil_permissoes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  );

-- Perfil padrão "Acesso total" (opcional: para atribuir a quem não usa perfil por recurso)
INSERT INTO public.perfis (id, nome, descricao, ativo)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Acesso total',
  'Acesso a todas as páginas do painel administrativo',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Inserir todos os recursos para o perfil "Acesso total" (usando o id fixo)
INSERT INTO public.perfil_permissoes (perfil_id, recurso)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, unnest(ARRAY[
  'admin', 'admin.pedidos', 'admin.produtos', 'admin.alunos', 'admin.empresas',
  'admin.turmas', 'admin.usuarios', 'admin.perfis', 'admin.importacao', 'admin.configuracoes'
])
ON CONFLICT (perfil_id, recurso) DO NOTHING;
