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
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal
  FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  );

-- empresas: em 002 já existe "Todos veem empresas" (SELECT USING true). Se em algum
-- projeto essa política tiver sido removida, descomente e aplique:
-- CREATE POLICY "RH podem ver empresas" ON public.empresas FOR SELECT USING (public.eh_rh_usuario(auth.uid()));
