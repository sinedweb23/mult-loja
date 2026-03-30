-- Adicionar campo ativo em responsaveis
ALTER TABLE responsaveis 
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Criar índice para busca por email e status ativo
CREATE INDEX IF NOT EXISTS idx_responsaveis_email_financeiro_ativo 
  ON responsaveis(email_financeiro) WHERE ativo = TRUE AND email_financeiro IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_responsaveis_email_pedagogico_ativo 
  ON responsaveis(email_pedagogico) WHERE ativo = TRUE AND email_pedagogico IS NOT NULL;
