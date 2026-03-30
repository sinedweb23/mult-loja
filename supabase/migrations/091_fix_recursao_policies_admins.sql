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
      CREATE POLICY "Admins podem ver todos os admins"
      ON public.admins FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )';

    EXECUTE '
      CREATE POLICY "Admins podem gerenciar admins"
      ON public.admins FOR ALL
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
