-- criar_admin_padrao.sql
-- Cria (ou atualiza) um usuário administrador padrão para login no sistema.
-- Execute após `criar_projeto_monolitico.sql`.
--
-- IMPORTANTE:
-- 1) Troque email/senha antes de usar em produção.
-- 2) Este script é idempotente (pode rodar mais de uma vez).

DO $$
DECLARE
  v_email TEXT := 'admin@suaempresa.com';
  v_senha TEXT := 'Admin@123456';
  v_nome  TEXT := 'Administrador';
  v_empresa_nome TEXT := 'Empresa Padrão';
  v_empresa_cnpj TEXT := NULL; -- opcional (somente números)
  v_unidade_nome TEXT := 'Unidade 1'; -- opcional: deixe NULL para não criar unidade

  v_auth_user_id UUID;
  v_usuario_id UUID;
  v_perfil_admin_id UUID;
  v_empresa_id UUID;
  v_unidade_id UUID;
BEGIN
  IF v_email = 'admin@suaempresa.com' THEN
    v_email := 'admin@lojas-mult.local';
    RAISE NOTICE 'v_email padrao detectado; usando fallback: %', v_email;
  END IF;

  IF length(v_senha) < 8 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 8 caracteres.';
  END IF;

  IF COALESCE(trim(v_empresa_nome), '') = '' THEN
    RAISE EXCEPTION 'Informe v_empresa_nome no arquivo criar_admin_padrao.sql.';
  END IF;

  -- 1) auth.users (login Supabase)
  SELECT u.id
  INTO v_auth_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_auth_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('nome', v_nome),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', v_email),
      'email',
      v_auth_user_id::text,
      now(),
      now()
    );
  END IF;

  -- 2) public.usuarios (perfil de aplicação)
  SELECT u.id
  INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.auth_user_id = v_auth_user_id
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    INSERT INTO public.usuarios (
      id,
      auth_user_id,
      nome,
      email,
      ativo,
      super_admin,
      created_at,
      updated_at
    )
    VALUES (
      uuid_generate_v4(),
      v_auth_user_id,
      v_nome,
      v_email,
      TRUE,
      TRUE,
      now(),
      now()
    )
    RETURNING id INTO v_usuario_id;
  ELSE
    UPDATE public.usuarios
    SET
      nome = COALESCE(NULLIF(nome, ''), v_nome),
      email = COALESCE(NULLIF(email, ''), v_email),
      ativo = TRUE,
      super_admin = TRUE,
      updated_at = now()
    WHERE id = v_usuario_id;
  END IF;

  -- 2.1) Empresa inicial
  IF NULLIF(trim(v_empresa_cnpj), '') IS NOT NULL THEN
    SELECT e.id INTO v_empresa_id
    FROM public.empresas e
    WHERE regexp_replace(COALESCE(e.cnpj, ''), '[^0-9]', '', 'g') = regexp_replace(v_empresa_cnpj, '[^0-9]', '', 'g')
    LIMIT 1;
  END IF;

  IF v_empresa_id IS NULL THEN
    SELECT e.id INTO v_empresa_id
    FROM public.empresas e
    WHERE lower(trim(e.nome)) = lower(trim(v_empresa_nome))
    LIMIT 1;
  END IF;

  IF v_empresa_id IS NULL THEN
    INSERT INTO public.empresas (id, nome, cnpj, created_at, updated_at)
    VALUES (uuid_generate_v4(), v_empresa_nome, NULLIF(trim(v_empresa_cnpj), ''), now(), now())
    RETURNING id INTO v_empresa_id;
  ELSE
    UPDATE public.empresas
    SET
      nome = COALESCE(NULLIF(trim(nome), ''), v_empresa_nome),
      cnpj = COALESCE(NULLIF(trim(cnpj), ''), NULLIF(trim(v_empresa_cnpj), '')),
      updated_at = now()
    WHERE id = v_empresa_id;
  END IF;

  -- 2.2) Unidade inicial (opcional)
  IF NULLIF(trim(v_unidade_nome), '') IS NOT NULL THEN
    SELECT un.id INTO v_unidade_id
    FROM public.unidades un
    WHERE un.empresa_id = v_empresa_id
      AND lower(trim(un.nome)) = lower(trim(v_unidade_nome))
    LIMIT 1;

    IF v_unidade_id IS NULL THEN
      INSERT INTO public.unidades (id, empresa_id, nome, created_at, updated_at)
      VALUES (uuid_generate_v4(), v_empresa_id, v_unidade_nome, now(), now())
      RETURNING id INTO v_unidade_id;
    END IF;
  END IF;

  -- 2.3) Vincular admin à empresa/unidade criadas
  UPDATE public.usuarios
  SET
    empresa_id = COALESCE(v_empresa_id, empresa_id),
    unidade_id = COALESCE(v_unidade_id, unidade_id),
    updated_at = now()
  WHERE id = v_usuario_id;

  -- 3) Papel ADMIN (fluxo legado usado por partes do sistema)
  IF to_regclass('public.usuario_papeis') IS NOT NULL THEN
    INSERT INTO public.usuario_papeis (usuario_id, papel)
    VALUES (v_usuario_id, 'ADMIN'::papel_usuario)
    ON CONFLICT (usuario_id, papel) DO NOTHING;
  END IF;

  -- 4) Perfil Admin/Acesso total (fluxo novo via usuario_perfis)
  IF to_regclass('public.perfis') IS NOT NULL THEN
    SELECT p.id
    INTO v_perfil_admin_id
    FROM public.perfis p
    WHERE p.nome IN ('Admin', 'Acesso total')
    ORDER BY CASE WHEN p.nome = 'Admin' THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF v_perfil_admin_id IS NOT NULL AND to_regclass('public.usuario_perfis') IS NOT NULL THEN
    INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
    VALUES (v_usuario_id, v_perfil_admin_id)
    ON CONFLICT (usuario_id, perfil_id) DO NOTHING;
  END IF;

  -- 5) Cache de admin (evita depender de trigger)
  IF to_regclass('public.usuario_admin_cache') IS NOT NULL THEN
    INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
    VALUES (v_auth_user_id, TRUE)
    ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  END IF;
END
$$;
