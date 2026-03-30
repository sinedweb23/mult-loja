-- Lançamentos de abatimento (baixas) feitas pelo RH para relatório com data/hora
CREATE TABLE IF NOT EXISTS abatimento_colaborador_lancamento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  operador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_usuario ON abatimento_colaborador_lancamento(usuario_id);
CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_created ON abatimento_colaborador_lancamento(created_at);

ALTER TABLE abatimento_colaborador_lancamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento;
CREATE POLICY "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento
  FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));
