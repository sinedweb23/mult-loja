-- Garantir que pagamentos tenha caixa_id para vincular ao caixa do PDV (fechamento e movimentação)
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS caixa_id UUID REFERENCES caixas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_caixa ON pagamentos(caixa_id);
