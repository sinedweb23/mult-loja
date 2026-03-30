-- Operador (PDV) e admin podem marcar pedido como entregue na tela de retirada
CREATE POLICY "Operador e admin atualizam pedido (marcar entregue)"
  ON pedidos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );
