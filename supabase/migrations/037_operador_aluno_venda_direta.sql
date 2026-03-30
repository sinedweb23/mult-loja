-- Operador do PDV precisa inserir e ler o aluno fictício "Venda Direta" para vendas diretas
CREATE POLICY "Operador ve alunos venda direta"
  ON alunos FOR SELECT
  USING (
    prontuario = 'VENDA_DIRETA'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );

CREATE POLICY "Operador insere aluno venda direta"
  ON alunos FOR INSERT
  WITH CHECK (
    prontuario = 'VENDA_DIRETA'
    AND nome = 'Venda Direta'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );
