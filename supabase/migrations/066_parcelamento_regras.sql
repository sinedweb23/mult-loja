-- Regras de parcelamento para checkout (cartão)
CREATE TABLE IF NOT EXISTS public.parcelamento_regras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  valor_min NUMERIC(12,2) NOT NULL CHECK (valor_min >= 0),
  valor_max NUMERIC(12,2) NULL,
  max_parcelas INTEGER NOT NULL CHECK (max_parcelas >= 1 AND max_parcelas <= 10),
  tipo TEXT NOT NULL CHECK (tipo IN ('SEM_JUROS', 'COM_JUROS')),
  taxa_juros_pct NUMERIC(5,2) NULL CHECK (taxa_juros_pct IS NULL OR (taxa_juros_pct >= 0 AND taxa_juros_pct <= 100)),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_taxa_se_com_juros CHECK (
    (tipo = 'SEM_JUROS' AND taxa_juros_pct IS NULL) OR
    (tipo = 'COM_JUROS')
  ),
  CONSTRAINT chk_valor_max CHECK (valor_max IS NULL OR valor_max >= valor_min)
);

CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_ordem ON public.parcelamento_regras(ordem);
CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_valor ON public.parcelamento_regras(valor_min, valor_max);

COMMENT ON TABLE public.parcelamento_regras IS 'Regras de parcelamento por faixa de valor (admin > Configurações > Pagamento).';

ALTER TABLE public.parcelamento_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler regras de parcelamento"
  ON public.parcelamento_regras FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar regras de parcelamento"
  ON public.parcelamento_regras FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );
