-- Novos estados de transação e chave de idempotência para checkout

-- Novos valores no enum transacao_status
ALTER TYPE transacao_status ADD VALUE IF NOT EXISTS 'APROVADO_PENDENTE_CONFIRMACAO';
ALTER TYPE transacao_status ADD VALUE IF NOT EXISTS 'ERRO_TECNICO';
ALTER TYPE transacao_status ADD VALUE IF NOT EXISTS 'CONFIRMADO';

-- Chave de idempotência (máx 16 chars para usar como reference na Rede quando possível)
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_idempotency_key ON transacoes(idempotency_key) WHERE idempotency_key IS NOT NULL;
COMMENT ON COLUMN transacoes.idempotency_key IS 'Chave enviada pelo cliente para evitar duplicar transação (idempotência).';
