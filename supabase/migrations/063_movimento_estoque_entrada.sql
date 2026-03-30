-- Registro de entradas de estoque (e futuras saídas) para rastreabilidade.
-- Cada linha é um movimento: produto (e opcionalmente variacao_valor) + quantidade.
CREATE TABLE IF NOT EXISTS public.movimento_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_empresa ON public.movimento_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_produto ON public.movimento_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_created ON public.movimento_estoque(created_at DESC);

COMMENT ON TABLE public.movimento_estoque IS 'Entradas (e futuras saídas) de estoque; quantidade > 0 = entrada.';

ALTER TABLE public.movimento_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem movimentos de estoque da empresa"
  ON public.movimento_estoque FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Admins inserem movimentos de estoque"
  ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );
