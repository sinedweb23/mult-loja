-- Corrigir RLS para permitir que admins vejam seus próprios vínculos com alunos
-- Quando um admin acessa a loja, ele precisa ver seus próprios filhos

-- Remover política antiga que bloqueava admins
DROP POLICY IF EXISTS "Usuários veem apenas seus vínculos com alunos" ON usuario_aluno;

-- Criar nova política que permite qualquer usuário (admin ou não) ver seus próprios vínculos
DROP POLICY IF EXISTS "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno;
CREATE POLICY "Usuários veem seus próprios vínculos com alunos"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

-- A política de admins verem todos os vínculos continua existindo para o painel admin
-- Mas agora admins também podem ver seus próprios vínculos através da política acima

-- Corrigir também a política de alunos para permitir que admins vejam seus próprios filhos
DROP POLICY IF EXISTS "Usuários veem apenas alunos vinculados" ON alunos;
DROP POLICY IF EXISTS "Usuários veem seus próprios alunos vinculados" ON alunos;

CREATE POLICY "Usuários veem seus próprios alunos vinculados"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
    )
  );
