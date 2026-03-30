-- Adicionar novos tipos de segmento: EFAF e EFAI
-- EFAF = Ensino Fundamental Anos Finais
-- EFAI = Ensino Fundamental Anos Iniciais

-- Adicionar novos valores ao enum
ALTER TYPE segmento_tipo ADD VALUE IF NOT EXISTS 'EFAF';
ALTER TYPE segmento_tipo ADD VALUE IF NOT EXISTS 'EFAI';
