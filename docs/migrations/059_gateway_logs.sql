-- Log de todas as interações com o gateway e.Rede (request/response) para diagnóstico
-- Nunca armazenar número completo de cartão ou CVV

CREATE TABLE IF NOT EXISTS gateway_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL,
  referencia TEXT,
  gateway_tid TEXT,
  gateway_nsu TEXT,
  direcao TEXT NOT NULL CHECK (direcao IN ('request', 'webhook')),
  http_status INT,
  return_code TEXT,
  return_message TEXT,
  request_sanitizado JSONB DEFAULT '{}'::jsonb,
  response_raw JSONB DEFAULT '{}'::jsonb,
  erro TEXT
);

COMMENT ON TABLE gateway_logs IS 'Request/response do gateway Rede (sem dados sensíveis de cartão). Para TID/NSU e diagnóstico.';
CREATE INDEX IF NOT EXISTS idx_gateway_logs_transacao ON gateway_logs(transacao_id);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_created ON gateway_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_tid ON gateway_logs(gateway_tid);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_nsu ON gateway_logs(gateway_nsu);
CREATE INDEX IF NOT EXISTS idx_gateway_logs_referencia ON gateway_logs(referencia);

ALTER TABLE gateway_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin le gateway_logs" ON gateway_logs;
CREATE POLICY "Admin le gateway_logs" ON gateway_logs FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
