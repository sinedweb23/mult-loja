-- Cancelamento de consumo interno: status, auditoria e referência ao usuário que cancelou.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.status IS 'ATIVO | CANCELADO';
COMMENT ON COLUMN public.consumo_interno.cancelado_em IS 'Data/hora do cancelamento do lançamento de consumo interno.';
COMMENT ON COLUMN public.consumo_interno.cancelado_por_id IS 'Usuário que realizou o cancelamento do lançamento de consumo interno.';

