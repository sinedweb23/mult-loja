-- Tornar auth_user_id nullable em responsaveis
-- Isso permite criar responsáveis na importação antes de terem usuário no auth
ALTER TABLE responsaveis 
  ALTER COLUMN auth_user_id DROP NOT NULL;

-- Remover constraint UNIQUE de auth_user_id (já que pode ser NULL)
-- Mas manter UNIQUE apenas para valores não-nulos
ALTER TABLE responsaveis 
  DROP CONSTRAINT IF EXISTS responsaveis_auth_user_id_key;

-- Criar constraint UNIQUE parcial (apenas para valores não-nulos)
CREATE UNIQUE INDEX IF NOT EXISTS responsaveis_auth_user_id_unique 
  ON responsaveis(auth_user_id) 
  WHERE auth_user_id IS NOT NULL;
