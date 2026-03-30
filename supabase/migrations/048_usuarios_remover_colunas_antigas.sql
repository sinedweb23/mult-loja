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
-- usuarios
DROP POLICY IF EXISTS "Usuários veem apenas seus próprios dados" ON public.usuarios;
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;
CREATE POLICY "Usuários veem apenas seus próprios dados" ON public.usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id
    AND NOT public.eh_admin_usuario(auth.uid())
  );
CREATE POLICY "Admins veem todos os usuários" ON public.usuarios FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins podem gerenciar usuários" ON public.usuarios FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- audit_logs
DROP POLICY IF EXISTS "Admins veem audit logs" ON public.audit_logs;
CREATE POLICY "Admins veem audit logs" ON public.audit_logs FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- configuracoes
DROP POLICY IF EXISTS "Admins podem ver configurações" ON public.configuracoes;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public.configuracoes;
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON public.configuracoes;
CREATE POLICY "Admins podem ver configurações" ON public.configuracoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins podem atualizar configurações" ON public.configuracoes FOR UPDATE
  USING (public.eh_admin_usuario(auth.uid()));
CREATE POLICY "Admins podem inserir configurações" ON public.configuracoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

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
DO $$
BEGIN
  IF to_regclass('public.dias_uteis_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config';
    EXECUTE 'CREATE POLICY "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config FOR ALL
      USING (public.eh_admin_ou_operador())
      WITH CHECK (public.eh_admin_ou_operador())';
  END IF;
END
$$;

-- dias_uteis_mes
DO $$
BEGIN
  IF to_regclass('public.dias_uteis_mes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes';
    EXECUTE 'CREATE POLICY "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes FOR ALL
      USING (public.eh_admin_ou_operador())
      WITH CHECK (public.eh_admin_ou_operador())';
  END IF;
END
$$;

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

-- 8.1. Segurança: remover quaisquer políticas remanescentes que ainda dependam de usuarios.eh_admin
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schemaname, c.relname AS tablename, pol.polname AS policyname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE n.nspname = 'public'
      AND d.refobjid = 'public.usuarios'::regclass
      AND a.attname = 'eh_admin'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;
END
$$;

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
