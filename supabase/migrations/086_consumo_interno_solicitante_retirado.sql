-- Consumo interno: quem solicitou e quem retirou (colaboradores por usuario_id)
-- Mantém withdrawn_by para compatibilidade; novos lançamentos usam solicitante_id e retirado_por_id.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS solicitante_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retirado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.solicitante_id IS 'Colaborador que solicitou o consumo (perfil COLABORADOR).';
COMMENT ON COLUMN public.consumo_interno.retirado_por_id IS 'Colaborador que retirou os itens (perfil COLABORADOR).';

-- withdrawn_by permanece para registros antigos e exibição; novos registros podem preencher com o nome do retirado_por.

CREATE INDEX IF NOT EXISTS idx_consumo_interno_solicitante ON public.consumo_interno(solicitante_id) WHERE solicitante_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumo_interno_retirado_por ON public.consumo_interno(retirado_por_id) WHERE retirado_por_id IS NOT NULL;
