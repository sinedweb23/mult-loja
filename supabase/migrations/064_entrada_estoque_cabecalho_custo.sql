-- Cabeçalho da entrada (número da entrada, número da nota, valor total) e custo unitário nos itens.

CREATE TABLE IF NOT EXISTS public.entrada_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_entrada INTEGER NOT NULL,
  numero_nota TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  valor_total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entrada_estoque_empresa_numero ON public.entrada_estoque(empresa_id, numero_entrada);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_empresa ON public.entrada_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_created ON public.entrada_estoque(created_at DESC);

COMMENT ON TABLE public.entrada_estoque IS 'Cabeçalho de cada entrada de estoque (número da entrada, nota, usuário, valor total).';

ALTER TABLE public.entrada_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem entradas de estoque"
  ON public.entrada_estoque FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

CREATE POLICY "Admins inserem entradas de estoque"
  ON public.entrada_estoque FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

CREATE POLICY "Admins atualizam entradas de estoque"
  ON public.entrada_estoque FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

-- Adicionar colunas em movimento_estoque
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS entrada_id UUID REFERENCES public.entrada_estoque(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_entrada ON public.movimento_estoque(entrada_id);
