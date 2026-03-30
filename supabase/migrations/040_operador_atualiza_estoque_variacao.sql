-- Operador do PDV pode atualizar estoque em variacao_valores ao finalizar venda
DROP POLICY IF EXISTS "Operador PDV pode atualizar estoque variacao_valores" ON variacao_valores;
CREATE POLICY "Operador PDV pode atualizar estoque variacao_valores"
  ON variacao_valores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- Usuário autenticado (responsável) pode consumir estoque em variacao_valores em compras online
DROP POLICY IF EXISTS "Responsavel pode consumir estoque variacao_valores" ON variacao_valores;
CREATE POLICY "Responsavel pode consumir estoque variacao_valores"
  ON variacao_valores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  );
