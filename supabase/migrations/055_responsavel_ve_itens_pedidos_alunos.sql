-- Responsável pode ver itens de pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para o extrato na Gestão de Saldo mostrar produtos das compras no PDV (pedido tem usuario_id = operador).
CREATE POLICY "Responsáveis veem itens de pedidos dos seus alunos"
  ON public.pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      JOIN public.usuario_aluno ua ON ua.aluno_id = p.aluno_id
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );
