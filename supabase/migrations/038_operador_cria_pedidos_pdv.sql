-- Permitir que operador do PDV crie pedidos com origem PDV vinculados ao seu caixa
CREATE POLICY "Operador cria pedidos PDV"
  ON pedidos FOR INSERT
  WITH CHECK (
    origem = 'PDV'
    AND caixa_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pedidos.caixa_id
    )
  );

