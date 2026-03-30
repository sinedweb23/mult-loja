-- Módulo Consumo Interno no PDV: cabecalho e itens com custo histórico.

CREATE TABLE IF NOT EXISTS public.consumo_interno (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  withdrawn_by TEXT NOT NULL,
  departamento_id UUID NOT NULL REFERENCES public.departamentos(id) ON DELETE RESTRICT,
  segmento_id UUID NOT NULL REFERENCES public.segmentos(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_empresa ON public.consumo_interno(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consumo_interno_created ON public.consumo_interno(created_at DESC);

COMMENT ON TABLE public.consumo_interno IS 'Lançamentos de consumo interno no PDV (operador, quem retirou, departamento/segmento).';

CREATE TABLE IF NOT EXISTS public.consumo_interno_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumo_interno_id UUID NOT NULL REFERENCES public.consumo_interno(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario NUMERIC(12,2) NOT NULL,
  total_custo NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_itens_consumo ON public.consumo_interno_itens(consumo_interno_id);

COMMENT ON TABLE public.consumo_interno_itens IS 'Itens do consumo interno com custo histórico no momento do lançamento.';

-- movimento_estoque: tipo (entrada vs consumo interno) e referência ao consumo
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS consumo_interno_id UUID REFERENCES public.consumo_interno(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.movimento_estoque.tipo IS 'entrada | internal_consumption. Para internal_consumption a quantidade é negativa.';

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_consumo ON public.movimento_estoque(consumo_interno_id) WHERE consumo_interno_id IS NOT NULL;

-- RLS consumo_interno
ALTER TABLE public.consumo_interno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados veem consumo interno da empresa"
  ON public.consumo_interno FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Usuários autenticados inserem consumo interno"
  ON public.consumo_interno FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- RLS consumo_interno_itens
ALTER TABLE public.consumo_interno_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados veem itens de consumo interno"
  ON public.consumo_interno_itens FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

CREATE POLICY "Usuários autenticados inserem itens de consumo interno"
  ON public.consumo_interno_itens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

-- Operador pode inserir movimento de estoque do tipo consumo interno
CREATE POLICY "Operador insere movimento consumo interno"
  ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    tipo = 'internal_consumption'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- Operador pode ver movimentos da própria empresa (para consistência)
CREATE POLICY "Usuários veem movimentos da empresa"
  ON public.movimento_estoque FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- PDV: listar departamentos e segmentos (SELECT para usuários da empresa)
CREATE POLICY "Usuários autenticados veem departamentos"
  ON public.departamentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Usuários autenticados veem segmentos"
  ON public.segmentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );
