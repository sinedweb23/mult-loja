-- Adicionar novos valores ao enum produto_tipo
ALTER TYPE produto_tipo ADD VALUE IF NOT EXISTS 'KIT_FESTA';
ALTER TYPE produto_tipo ADD VALUE IF NOT EXISTS 'KIT_LANCHE';

-- Coluna tipo_kit: MENSAL ou AVULSO (apenas para tipo KIT_LANCHE)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_kit TEXT CHECK (tipo_kit IS NULL OR tipo_kit IN ('MENSAL', 'AVULSO'));
