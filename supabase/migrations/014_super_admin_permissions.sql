-- Adicionar campo super_admin na tabela usuarios
ALTER TABLE usuarios 
  ADD COLUMN IF NOT EXISTS super_admin BOOLEAN DEFAULT FALSE;

-- Criar índice para super_admin
CREATE INDEX IF NOT EXISTS idx_usuarios_super_admin ON usuarios(super_admin) WHERE super_admin = TRUE;

-- Atualizar usuário específico como super admin
UPDATE usuarios
SET 
  eh_admin = TRUE,
  super_admin = TRUE,
  ativo = TRUE
WHERE email_financeiro = 'denis.souza@morumbisul.com.br'
   OR email_pedagogico = 'denis.souza@morumbisul.com.br';

-- Se não encontrou por email na tabela usuarios, buscar no auth.users e atualizar
DO $$
DECLARE
  auth_user_id_var UUID;
BEGIN
  -- Buscar auth_user_id pelo email
  SELECT id INTO auth_user_id_var
  FROM auth.users
  WHERE email = 'denis.souza@morumbisul.com.br'
  LIMIT 1;

  IF auth_user_id_var IS NOT NULL THEN
    -- Atualizar registro existente em usuarios
    UPDATE usuarios
    SET 
      eh_admin = TRUE,
      super_admin = TRUE,
      ativo = TRUE,
      email_financeiro = COALESCE(usuarios.email_financeiro, 'denis.souza@morumbisul.com.br'),
      nome = COALESCE(usuarios.nome, 'Denis Souza')
    WHERE auth_user_id = auth_user_id_var;
  END IF;
END $$;

-- Comentário
COMMENT ON COLUMN usuarios.super_admin IS 'Indica se o usuário é super administrador com permissões totais';
