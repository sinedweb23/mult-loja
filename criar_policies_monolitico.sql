-- criar_policies_monolitico.sql
-- Gerado automaticamente a partir de criar_policies.sql
-- Este arquivo NAO usa comandos do psql (sem \i).
-- Pode ser executado no SQL Editor do Supabase.

BEGIN;

-- =====================================================================
-- supabase/migrations/016_fix_rls_usuario_aluno_admin.sql
-- =====================================================================
-- Corrigir RLS para permitir que admins vejam seus próprios vínculos com alunos
-- Quando um admin acessa a loja, ele precisa ver seus próprios filhos

-- Remover política antiga que bloqueava admins
DROP POLICY IF EXISTS "Usuários veem apenas seus vínculos com alunos" ON usuario_aluno;

-- Criar nova política que permite qualquer usuário (admin ou não) ver seus próprios vínculos
DROP POLICY IF EXISTS "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno;
DROP POLICY IF EXISTS "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno;
CREATE POLICY "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

-- A política de admins verem todos os vínculos continua existindo para o painel admin
-- Mas agora admins também podem ver seus próprios vínculos através da política acima

-- Corrigir também a política de alunos para permitir que admins vejam seus próprios filhos
DROP POLICY IF EXISTS "Usuários veem apenas alunos vinculados" ON alunos;
DROP POLICY IF EXISTS "Usuários veem seus próprios alunos vinculados" ON alunos;

DROP POLICY IF EXISTS "Usuários veem seus próprios alunos vinculados" ON alunos;

CREATE POLICY "Usuários veem seus próprios alunos vinculados" ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

-- =====================================================================
-- supabase/migrations/025_perfis_permissoes.sql
-- =====================================================================
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
DROP POLICY IF EXISTS "Admins podem ver perfis" ON public.perfis;
CREATE POLICY "Admins podem ver perfis" ON public.perfis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis;
DROP POLICY IF EXISTS "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis;
CREATE POLICY "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis FOR ALL
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
DROP POLICY IF EXISTS "Admins podem ver perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Admins podem ver perfil_permissoes" ON public.perfil_permissoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes;
DROP POLICY IF EXISTS "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes FOR ALL
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

-- =====================================================================
-- supabase/migrations/028_cantina_operador_movimentacoes_saldos.sql
-- =====================================================================
-- Operador pode inserir movimentacoes e atualizar saldos

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON aluno_movimentacoes;

CREATE POLICY "Operador insere aluno_movimentacoes" ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON aluno_saldos;

CREATE POLICY "Operador atualiza aluno_saldos" ON aluno_saldos FOR UPDATE
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

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON aluno_saldos;

CREATE POLICY "Operador insere aluno_saldos" ON aluno_saldos FOR INSERT
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

DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários criam pedidos para seus alunos" ON pedidos FOR INSERT
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
DROP POLICY IF EXISTS "Usuários inserem itens em seus pedidos" ON pedido_itens;
CREATE POLICY "Usuários inserem itens em seus pedidos" ON pedido_itens FOR INSERT
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
DROP POLICY IF EXISTS "Colaborador ve pedidos em que e beneficiario" ON pedidos;
CREATE POLICY "Colaborador ve pedidos em que e beneficiario" ON pedidos FOR SELECT
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

-- Colaborador pode ver itens dos pedidos em que é o beneficiário
DROP POLICY IF EXISTS "Colaborador ve itens de pedidos em que e beneficiario" ON pedido_itens;
CREATE POLICY "Colaborador ve itens de pedidos em que e beneficiario" ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND p.colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    )
  );

-- =====================================================================
-- supabase/migrations/032_fix_rls_pedido_itens_usuarios.sql
-- =====================================================================
-- Corrigir RLS de pedido_itens: a política antiga referencia responsaveis e responsavel_id,
-- que foram renomeados para usuarios e usuario_id na migration 012. Usuários não conseguiam
-- ver itens em "Meus Pedidos" nem no PDV (quando aplicável).

DROP POLICY IF EXISTS "Responsáveis veem itens de seus pedidos" ON pedido_itens;

DROP POLICY IF EXISTS "Usuários veem itens de seus pedidos" ON pedido_itens;

CREATE POLICY "Usuários veem itens de seus pedidos" ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/038_operador_cria_pedidos_pdv.sql
-- =====================================================================
-- Permitir que operador do PDV crie pedidos com origem PDV vinculados ao seu caixa
DROP POLICY IF EXISTS "Operador cria pedidos PDV" ON pedidos;
CREATE POLICY "Operador cria pedidos PDV" ON pedidos FOR INSERT
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
-- supabase/migrations/054_loja_variacoes_opcionais_select_autenticado.sql
-- =====================================================================
-- Loja: usuário autenticado (ex.: responsável) pode ler variações e opcionais de produtos ativos
-- para exibir na página do produto ao adicionar ao carrinho (sem ser admin).

-- variacoes: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le variacoes de produtos ativos" ON public.variacoes;
CREATE POLICY "Loja: autenticado le variacoes de produtos ativos" ON public.variacoes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = variacoes.produto_id AND p.ativo = TRUE
    )
  );

-- variacao_valores: SELECT para qualquer autenticado (produto ativo via variacao)
DROP POLICY IF EXISTS "Loja: autenticado le variacao_valores de produtos ativos" ON public.variacao_valores;
CREATE POLICY "Loja: autenticado le variacao_valores de produtos ativos" ON public.variacao_valores FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id AND p.ativo = TRUE
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- grupos_opcionais: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le grupos_opcionais de produtos ativos" ON public.grupos_opcionais;
CREATE POLICY "Loja: autenticado le grupos_opcionais de produtos ativos" ON public.grupos_opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = grupos_opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- opcionais: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le opcionais de produtos ativos" ON public.opcionais;
CREATE POLICY "Loja: autenticado le opcionais de produtos ativos" ON public.opcionais FOR SELECT
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
DROP POLICY IF EXISTS "Responsáveis veem itens de pedidos dos seus alunos" ON public.pedido_itens;
CREATE POLICY "Responsáveis veem itens de pedidos dos seus alunos" ON public.pedido_itens FOR SELECT
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
DROP POLICY IF EXISTS "Autenticados podem ler categorias" ON public.categorias;
CREATE POLICY "Autenticados podem ler categorias" ON public.categorias FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================================
-- supabase/migrations/061_responsavel_ve_pedidos_dos_alunos.sql
-- =====================================================================
-- Responsável pode ver pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para a política "Responsáveis veem itens de pedidos dos seus alunos" em pedido_itens
-- funcionar: o subquery dessa política lê de pedidos; sem isso, responsáveis não-admin não
-- conseguiam ver itens das compras no extrato (pedidos PDV têm usuario_id = operador).
DROP POLICY IF EXISTS "Responsáveis veem pedidos dos seus alunos" ON public.pedidos;
CREATE POLICY "Responsáveis veem pedidos dos seus alunos" ON public.pedidos FOR SELECT
  USING (
    NOT public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuario_aluno ua
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = pedidos.aluno_id
    )
  );

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
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal FOR ALL
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

DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;

CREATE POLICY "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes FOR SELECT
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
DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;
CREATE POLICY "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes FOR SELECT
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
DROP POLICY IF EXISTS "Operador e PDV veem pedidos para retirada" ON public.pedidos;
CREATE POLICY "Operador e PDV veem pedidos para retirada" ON public.pedidos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Produtos: operador/pdv deve ler produtos (para listar itens no PDV)
DROP POLICY IF EXISTS "Operador le produtos" ON public.produtos;
DROP POLICY IF EXISTS "Operador e PDV leem produtos" ON public.produtos;
CREATE POLICY "Operador e PDV leem produtos" ON public.produtos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 4. Alunos: operador/pdv deve ver todos os alunos (para venda aluno em pdv/vendas)
DROP POLICY IF EXISTS "Operador e PDV veem alunos" ON public.alunos;
CREATE POLICY "Operador e PDV veem alunos" ON public.alunos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 5. Turmas: operador/pdv deve ver turmas (join em listagem de alunos)
DROP POLICY IF EXISTS "Operador e PDV veem turmas" ON public.turmas;
CREATE POLICY "Operador e PDV veem turmas" ON public.turmas FOR SELECT
  USING (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/080_pdv_saldo_alunos_rls.sql
-- =====================================================================
-- Permite que usuários com perfil PDV (recurso 'pdv') vejam e atualizem saldo dos alunos
-- em PDV/vendas. A migration 078 já estendeu eh_admin_ou_operador() para pedidos, alunos,
-- produtos e turmas, mas aluno_saldos e aluno_movimentacoes ainda só permitiam OPERADOR
-- (usuario_papeis), não quem tem apenas perfil com recurso 'pdv'.

-- 1. aluno_saldos: SELECT para operador/PDV ver saldo dos alunos no PDV
DROP POLICY IF EXISTS "Operador e PDV veem aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV veem aluno_saldos" ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 2. aluno_movimentacoes: SELECT para operador/PDV ver histórico (ex.: tela de vendas)
DROP POLICY IF EXISTS "Operador e PDV veem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV veem aluno_movimentacoes" ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Substituir políticas que hoje só permitem OPERADOR (usuario_papeis) por eh_admin_ou_operador(),
--    para que perfil PDV também possa inserir movimentações e atualizar saldos ao vender.

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON public.aluno_movimentacoes;
DROP POLICY IF EXISTS "Operador e PDV inserem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV inserem aluno_movimentacoes" ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Operador e PDV atualizam aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV atualizam aluno_saldos" ON public.aluno_saldos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Operador e PDV inserem aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV inserem aluno_saldos" ON public.aluno_saldos FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/087_fix_rls_importacao_logs_transacao_confirmacao.sql
-- =====================================================================
-- Habilitar RLS em tabelas internas expostas ao PostgREST
-- Objetivo: impedir acesso público (anon) a logs e locks internos.

-- importacao_logs: usada apenas por rotinas internas/admin.
ALTER TABLE public.importacao_logs ENABLE ROW LEVEL SECURITY;

-- Ninguém acessa via PostgREST/anon; apenas service_role (admin client) ignora RLS.
DROP POLICY IF EXISTS "negado_todos_importacao_logs" ON public.importacao_logs;
CREATE POLICY "negado_todos_importacao_logs" ON public.importacao_logs FOR ALL
  USING (false)
  WITH CHECK (false);

-- transacao_confirmacao: tabela de lock interna para confirmação de transações.
ALTER TABLE public.transacao_confirmacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "negado_todos_transacao_confirmacao" ON public.transacao_confirmacao;

CREATE POLICY "negado_todos_transacao_confirmacao" ON public.transacao_confirmacao FOR ALL
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

-- =====================================================================
-- supabase/migrations/090_hardening_rls_unrestricted_tables.sql
-- =====================================================================
-- Hardening: habilitar RLS em tabelas sensíveis que podem ficar UNRESTRICTED
-- em projetos novos após import/execução parcial de migrations.
-- Mantém idempotente e seguro para reexecução.

DO $$
BEGIN
  -- Tabelas legadas de administração/autorização
  IF to_regclass('public.admins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.admin_roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.tenants') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY';
  END IF;

  -- Log sensível
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;

-- =====================================================================
-- supabase/migrations/091_fix_recursao_policies_admins.sql
-- =====================================================================
-- Corrige recursão infinita em policies da tabela legada public.admins.
-- Causa: policies antigas consultam a própria tabela admins no USING.
-- Solução: recriar policies usando usuario_admin_cache (sem autorreferência).

DO $$
BEGIN
  IF to_regclass('public.admins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON public.admins';
    EXECUTE 'DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON public.admins';

    EXECUTE '
      DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON public.admins;
      CREATE POLICY "Admins podem ver todos os admins" ON public.admins FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )';

    EXECUTE '
      DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON public.admins;
      CREATE POLICY "Admins podem gerenciar admins" ON public.admins FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )';
  END IF;
END
$$;

COMMIT;
