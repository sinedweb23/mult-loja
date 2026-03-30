-- Usuários com perfil (ex.: RH) precisam poder LER as permissões dos perfis que têm atribuídos,
-- para obterRecursosDoUsuario() e podeAcessarRH() funcionarem. Sem isso, RLS bloqueia e o menu
-- fica cheio (recursos = []) e o RH não vê colaboradores (podeAcessarRH = false).

CREATE POLICY "Usuário vê permissões dos próprios perfis"
  ON public.perfil_permissoes FOR SELECT
  USING (
    perfil_id IN (
      SELECT up.perfil_id
      FROM public.usuario_perfis up
      JOIN public.usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid() AND u.ativo = TRUE
    )
  );
