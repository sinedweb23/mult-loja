-- Atualizar RLS policies para usar usuarios ao invés de responsaveis e admins

-- Remover políticas antigas
DROP POLICY IF EXISTS "Responsáveis veem apenas seus próprios dados" ON usuarios;
DROP POLICY IF EXISTS "Admins podem ver todos os responsáveis" ON usuarios;
DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON usuarios;

-- RLS: Usuários veem apenas seus próprios dados (se não for admin)
CREATE POLICY "Usuários veem apenas seus próprios dados"
  ON usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id AND eh_admin = FALSE
  );

-- RLS: Admins veem todos os usuários
CREATE POLICY "Admins veem todos os usuários"
  ON usuarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- RLS: Admins podem gerenciar usuários
CREATE POLICY "Admins podem gerenciar usuários"
  ON usuarios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de usuario_aluno (antigo responsavel_aluno)
DROP POLICY IF EXISTS "Responsáveis veem apenas seus vínculos com alunos" ON usuario_aluno;
DROP POLICY IF EXISTS "Admins podem ver todos os vínculos responsável-aluno" ON usuario_aluno;

CREATE POLICY "Usuários veem apenas seus vínculos com alunos"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os vínculos usuario-aluno"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de alunos
DROP POLICY IF EXISTS "Responsáveis veem apenas alunos vinculados" ON alunos;
DROP POLICY IF EXISTS "Admins podem ver todos os alunos" ON alunos;

CREATE POLICY "Usuários veem apenas alunos vinculados"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os alunos"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de pedidos
DROP POLICY IF EXISTS "Responsáveis veem apenas seus pedidos" ON pedidos;
DROP POLICY IF EXISTS "Responsáveis criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários veem apenas seus pedidos"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = pedidos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Usuários criam pedidos para seus alunos"
  ON pedidos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = pedidos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = pedidos.aluno_id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins veem todos os pedidos"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de endereços
DROP POLICY IF EXISTS "Responsáveis veem seus endereços" ON enderecos;

CREATE POLICY "Usuários veem seus endereços"
  ON enderecos FOR SELECT
  USING (
    usuario_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = enderecos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os endereços"
  ON enderecos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de turmas
DROP POLICY IF EXISTS "Responsáveis veem turmas de seus alunos" ON turmas;
DROP POLICY IF EXISTS "Admins podem ver todas as turmas" ON turmas;

CREATE POLICY "Usuários veem turmas de seus alunos"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alunos
      JOIN usuario_aluno ON usuario_aluno.aluno_id = alunos.id
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE alunos.turma_id = turmas.id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todas as turmas"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de pagamentos, notas fiscais, etc (usando usuario_id indiretamente via pedidos)
-- Essas já devem funcionar via pedidos, mas vamos garantir

-- Atualizar políticas de audit_logs
DROP POLICY IF EXISTS "Admins veem audit logs" ON audit_logs;

CREATE POLICY "Admins veem audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );
