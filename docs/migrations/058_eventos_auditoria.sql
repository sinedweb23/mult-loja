-- Auditoria central: eventos de ações críticas para rastreabilidade
-- Uso: transações, confirmações, webhooks, PDV, abertura/fechamento de caixa

CREATE TABLE IF NOT EXISTS eventos_auditoria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('pai', 'operador', 'admin', 'webhook', 'sistema')),
  actor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ip INET,
  user_agent TEXT,
  route TEXT,
  action TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  payload_reduzido JSONB DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  request_id TEXT
);

COMMENT ON TABLE eventos_auditoria IS 'Log de auditoria para investigação de reclamações e prova de eventos (quem, quando, o quê).';
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_created ON eventos_auditoria(created_at);
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_entidade_id ON eventos_auditoria(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_actor ON eventos_auditoria(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_correlation ON eventos_auditoria(correlation_id);
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_request_id ON eventos_auditoria(request_id);

ALTER TABLE eventos_auditoria ENABLE ROW LEVEL SECURITY;

-- Apenas admin pode ler auditoria
DROP POLICY IF EXISTS "Admin le eventos_auditoria" ON eventos_auditoria;
CREATE POLICY "Admin le eventos_auditoria" ON eventos_auditoria FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- Inserção apenas via service role (backend)
-- Não criar política INSERT para auth.uid(); o backend usa createAdminClient() e bypassa RLS com service role.
