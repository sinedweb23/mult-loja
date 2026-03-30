-- Valor de custo do produto (moeda) para controle interno
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

COMMENT ON COLUMN public.produtos.valor_custo IS 'Custo unitário do produto em R$ (uso interno/admin).';
