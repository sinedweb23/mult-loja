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
