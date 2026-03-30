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
CREATE POLICY "Usuário vê permissões dos próprios perfis"
  ON public.perfil_permissoes FOR SELECT
  USING (perfil_id IN (SELECT public.perfis_do_usuario_atual()));
