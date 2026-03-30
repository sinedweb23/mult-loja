-- Colaborador pode ver pedidos em que ele é o beneficiário (colaborador_id)
CREATE POLICY "Colaborador ve pedidos em que e beneficiario"
  ON pedidos FOR SELECT
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

-- Colaborador pode ver itens dos pedidos em que é o beneficiário
CREATE POLICY "Colaborador ve itens de pedidos em que e beneficiario"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND p.colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    )
  );
