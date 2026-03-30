-- Operador (PDV) pode ver pedidos e itens para tela de retirada

CREATE POLICY "Operador ve pedidos para retirada"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador e admin veem itens de pedidos"
  ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );

-- Operador pode ler produtos (para exibir nome dos itens no PDV)
CREATE POLICY "Operador le produtos"
  ON produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );
