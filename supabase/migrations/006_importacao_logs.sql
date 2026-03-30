-- Tabela de logs de importação
CREATE TABLE IF NOT EXISTS importacao_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, -- 'MANUAL', 'AGENDADA', 'API'
  status TEXT NOT NULL DEFAULT 'EM_PROGRESSO', -- 'EM_PROGRESSO', 'SUCESSO', 'ERRO', 'PARCIAL'
  total_registros INTEGER DEFAULT 0,
  registros_processados INTEGER DEFAULT 0,
  registros_criados INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  registros_com_erro INTEGER DEFAULT 0,
  erros JSONB, -- Array de erros detalhados
  payload_inicial JSONB, -- Payload recebido (para debug)
  iniciado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_importacao_logs_empresa ON importacao_logs(empresa_id);
CREATE INDEX idx_importacao_logs_admin ON importacao_logs(admin_id);
CREATE INDEX idx_importacao_logs_status ON importacao_logs(status);
CREATE INDEX idx_importacao_logs_iniciado ON importacao_logs(iniciado_em DESC);
