-- Migration para unificar responsaveis e admins em uma única tabela usuarios

-- 1. Adicionar campos de admin na tabela responsaveis ANTES de renomear
ALTER TABLE responsaveis 
  ADD COLUMN IF NOT EXISTS eh_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nome TEXT;

-- 2. Migrar dados de admins para responsaveis (antes de renomear)
-- Primeiro, inserir admins que não existem em responsaveis
INSERT INTO responsaveis (
  auth_user_id,
  nome,
  eh_admin,
  empresa_id,
  unidade_id,
  ativo,
  tipo,
  created_at,
  updated_at
)
SELECT 
  a.auth_user_id,
  a.nome,
  TRUE as eh_admin,
  a.empresa_id,
  a.unidade_id,
  a.ativo,
  'AMBOS'::responsavel_tipo as tipo,
  a.created_at,
  a.updated_at
FROM admins a
WHERE NOT EXISTS (
  SELECT 1 FROM responsaveis r WHERE r.auth_user_id = a.auth_user_id
);

-- Depois, atualizar responsaveis existentes que também são admins
UPDATE responsaveis r
SET 
  eh_admin = TRUE,
  nome = COALESCE(a.nome, r.nome_financeiro, r.nome_pedagogico),
  empresa_id = COALESCE(a.empresa_id, r.empresa_id),
  unidade_id = COALESCE(a.unidade_id, r.unidade_id),
  ativo = COALESCE(a.ativo, r.ativo),
  updated_at = NOW()
FROM admins a
WHERE r.auth_user_id = a.auth_user_id;

-- 3. Atualizar nome dos responsáveis existentes (se não tiver nome)
UPDATE responsaveis 
SET nome = COALESCE(nome_financeiro, nome_pedagogico, 'Usuário')
WHERE nome IS NULL;

-- 4. Renomear tabela responsaveis para usuarios
ALTER TABLE responsaveis RENAME TO usuarios;

-- 5. Renomear tabela responsavel_aluno para usuario_aluno
ALTER TABLE responsavel_aluno RENAME TO usuario_aluno;
ALTER TABLE usuario_aluno RENAME COLUMN responsavel_id TO usuario_id;

-- 6. Atualizar foreign keys em outras tabelas
-- Pedidos
ALTER TABLE pedidos RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_responsavel_id_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Endereços
ALTER TABLE enderecos RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE enderecos DROP CONSTRAINT IF EXISTS enderecos_responsavel_id_fkey;
ALTER TABLE enderecos ADD CONSTRAINT enderecos_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Audit logs
ALTER TABLE audit_logs RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_responsavel_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Importação logs
ALTER TABLE importacao_logs RENAME COLUMN admin_id TO usuario_id;
ALTER TABLE importacao_logs DROP CONSTRAINT IF EXISTS importacao_logs_admin_id_fkey;
ALTER TABLE importacao_logs ADD CONSTRAINT importacao_logs_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- 7. Atualizar constraint de enderecos para usar usuario_id
ALTER TABLE enderecos DROP CONSTRAINT IF EXISTS enderecos_check;
ALTER TABLE enderecos ADD CONSTRAINT enderecos_check CHECK (
  (usuario_id IS NOT NULL AND aluno_id IS NULL) OR
  (usuario_id IS NULL AND aluno_id IS NOT NULL)
);

-- 8. Criar índices
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_eh_admin ON usuarios(eh_admin) WHERE eh_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios(ativo) WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_usuarios_email_financeiro_ativo ON usuarios(email_financeiro) WHERE ativo = TRUE AND email_financeiro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_email_pedagogico_ativo ON usuarios(email_pedagogico) WHERE ativo = TRUE AND email_pedagogico IS NOT NULL;

-- 9. Comentários
COMMENT ON COLUMN usuarios.eh_admin IS 'Indica se o usuário é administrador';
COMMENT ON COLUMN usuarios.empresa_id IS 'Empresa do usuário (opcional, usado principalmente para admins)';
COMMENT ON COLUMN usuarios.unidade_id IS 'Unidade do usuário (opcional, usado principalmente para admins)';
COMMENT ON COLUMN usuarios.nome IS 'Nome do usuário (usado para admins e como fallback para responsáveis)';
