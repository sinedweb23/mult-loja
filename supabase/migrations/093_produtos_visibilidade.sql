-- Campo de visibilidade do produto usado no admin/loja.
-- Idempotente para bases novas e existentes.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS visibilidade TEXT DEFAULT 'APP';

ALTER TABLE public.produtos
  ALTER COLUMN visibilidade SET DEFAULT 'APP';

UPDATE public.produtos
SET visibilidade = 'APP'
WHERE visibilidade IS NULL OR trim(visibilidade) = '';

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_visibilidade_check;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_visibilidade_check
  CHECK (visibilidade IN ('APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'));
