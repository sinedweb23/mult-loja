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
CREATE POLICY "Operador e PDV veem pedidos para retirada"
  ON public.pedidos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Produtos: operador/pdv deve ler produtos (para listar itens no PDV)
DROP POLICY IF EXISTS "Operador le produtos" ON public.produtos;
CREATE POLICY "Operador e PDV leem produtos"
  ON public.produtos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 4. Alunos: operador/pdv deve ver todos os alunos (para venda aluno em pdv/vendas)
CREATE POLICY "Operador e PDV veem alunos"
  ON public.alunos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 5. Turmas: operador/pdv deve ver turmas (join em listagem de alunos)
CREATE POLICY "Operador e PDV veem turmas"
  ON public.turmas FOR SELECT
  USING (public.eh_admin_ou_operador());
