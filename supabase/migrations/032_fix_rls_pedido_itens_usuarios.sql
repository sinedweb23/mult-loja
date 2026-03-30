-- Corrigir RLS de pedido_itens: a política antiga referencia responsaveis e responsavel_id,
-- que foram renomeados para usuarios e usuario_id na migration 012. Usuários não conseguiam
-- ver itens em "Meus Pedidos" nem no PDV (quando aplicável).

DROP POLICY IF EXISTS "Responsáveis veem itens de seus pedidos" ON pedido_itens;

CREATE POLICY "Usuários veem itens de seus pedidos"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );
