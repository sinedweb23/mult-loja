-- Política RLS para admins verem todos os alunos
CREATE POLICY "Admins podem ver todos os alunos"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os responsáveis
CREATE POLICY "Admins podem ver todos os responsáveis"
  ON responsaveis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os vínculos responsável-aluno
CREATE POLICY "Admins podem ver todos os vínculos responsável-aluno"
  ON responsavel_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as turmas
CREATE POLICY "Admins podem ver todas as turmas"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );
