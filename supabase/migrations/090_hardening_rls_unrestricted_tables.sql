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
