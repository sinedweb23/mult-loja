-- Campo usado no kit lanche mensal para aplicar desconto percentual.
-- Idempotente para projetos novos e bases já existentes.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS desconto_kit_mensal_pct NUMERIC(5,2);

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_desconto_kit_mensal_pct_check;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_desconto_kit_mensal_pct_check
  CHECK (
    desconto_kit_mensal_pct IS NULL
    OR (desconto_kit_mensal_pct >= 0 AND desconto_kit_mensal_pct <= 100)
  );
