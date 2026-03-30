-- Fix: recursão infinita nas políticas de usuarios
-- Solução: tabela auxiliar usuario_admin_cache (usuário só lê sua própria linha)

-- 1. Criar tabela de cache (sem FK para evitar dependência circular)
CREATE TABLE IF NOT EXISTS public.usuario_admin_cache (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. Habilitar RLS - usuário só pode ler sua própria linha
ALTER TABLE public.usuario_admin_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio status admin"
  ON public.usuario_admin_cache FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 3. Popular a tabela a partir de usuarios
INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
SELECT auth_user_id, COALESCE(eh_admin, false)
FROM public.usuarios
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

-- 4. Trigger para manter sincronizado
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    RETURN OLD;
  END IF;
  
  INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
  VALUES (
    COALESCE(NEW.auth_user_id, OLD.auth_user_id),
    COALESCE(NEW.eh_admin, false)
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_usuario_admin_cache ON public.usuarios;
CREATE TRIGGER trg_sync_usuario_admin_cache
  AFTER INSERT OR UPDATE OF auth_user_id, eh_admin OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_usuario_admin_cache();

-- 5. Remover políticas antigas de usuarios que causam recursão
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;

-- 6. Criar novas políticas que usam a tabela de cache (sem recursão)
CREATE POLICY "Admins veem todos os usuários"
  ON public.usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Admins podem gerenciar usuários"
  ON public.usuarios FOR ALL
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );
