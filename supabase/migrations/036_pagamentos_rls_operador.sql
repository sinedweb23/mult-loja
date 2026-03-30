-- Operador pode ver e inserir pagamentos do seu caixa (PDV)
CREATE POLICY "Operador ve e insere pagamentos do seu caixa"
  ON pagamentos FOR ALL
  USING (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );
