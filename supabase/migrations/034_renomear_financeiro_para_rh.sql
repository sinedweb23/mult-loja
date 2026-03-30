-- Migration para renomear FINANCEIRO para RH no enum papel_usuario

-- 1. Atualizar todos os registros existentes de FINANCEIRO para RH
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel = 'FINANCEIRO'::papel_usuario;

-- 2. Adicionar 'RH' ao enum (se ainda não existir)
-- Como não podemos remover valores de enum diretamente, vamos adicionar RH
DO $$ 
BEGIN
    -- Verificar se 'RH' já existe no enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'RH' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'papel_usuario')
    ) THEN
        -- Adicionar 'RH' ao enum
        ALTER TYPE papel_usuario ADD VALUE IF NOT EXISTS 'RH';
    END IF;
END $$;

-- 3. Atualizar novamente os registros (caso ainda existam FINANCEIRO)
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel::text = 'FINANCEIRO';

-- Nota: O valor 'FINANCEIRO' permanecerá no enum, mas não será mais usado.
-- Para remover completamente, seria necessário recriar o enum, o que é mais complexo.
-- Por enquanto, mantemos ambos para compatibilidade, mas o código usa apenas 'RH'.
