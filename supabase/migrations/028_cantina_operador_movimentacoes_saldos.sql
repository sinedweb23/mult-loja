-- Operador pode inserir movimentacoes e atualizar saldos

CREATE POLICY "Operador insere aluno_movimentacoes"
  ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador atualiza aluno_saldos"
  ON aluno_saldos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador insere aluno_saldos"
  ON aluno_saldos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );
