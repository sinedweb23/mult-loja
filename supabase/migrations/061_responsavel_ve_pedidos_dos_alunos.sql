-- Responsável pode ver pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para a política "Responsáveis veem itens de pedidos dos seus alunos" em pedido_itens
-- funcionar: o subquery dessa política lê de pedidos; sem isso, responsáveis não-admin não
-- conseguiam ver itens das compras no extrato (pedidos PDV têm usuario_id = operador).
CREATE POLICY "Responsáveis veem pedidos dos seus alunos"
  ON public.pedidos FOR SELECT
  USING (
    NOT public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuario_aluno ua
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = pedidos.aluno_id
    )
  );
