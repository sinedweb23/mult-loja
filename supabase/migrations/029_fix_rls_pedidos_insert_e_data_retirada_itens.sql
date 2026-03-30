-- 1. Corrigir RLS: permitir que usuário crie pedidos para seus alunos mesmo quando eh_admin = true (cantina: mesmo usuário pode ser admin e responsável)
DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários criam pedidos para seus alunos"
  ON pedidos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = pedidos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM usuario_aluno ua
      WHERE ua.usuario_id = pedidos.usuario_id AND ua.aluno_id = pedidos.aluno_id
    )
  );

-- 2. data_retirada por item (kit lanche: um dia por linha)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS data_retirada DATE;

COMMENT ON COLUMN pedido_itens.data_retirada IS 'Para kit lanche: data de retirada deste item. Se null, usa pedidos.data_retirada';

-- 3. Permitir INSERT em pedido_itens quando o pedido pertence ao usuário
CREATE POLICY "Usuários inserem itens em seus pedidos"
  ON pedido_itens FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );
