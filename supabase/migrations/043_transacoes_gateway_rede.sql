-- Transações do gateway de pagamento (Rede): checkout loja e recarga de saldo
-- Permite criar a intenção de pagamento antes de ter pedido; ao aprovar, cria pedido ou credita saldo.

CREATE TYPE transacao_tipo AS ENUM ('PEDIDO_LOJA', 'RECARGA_SALDO');
CREATE TYPE transacao_status AS ENUM ('PENDENTE', 'PROCESSANDO', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'CANCELADO');
CREATE TYPE transacao_metodo AS ENUM ('PIX', 'CARTAO');

CREATE TABLE transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo transacao_tipo NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  metodo transacao_metodo NOT NULL,
  status transacao_status NOT NULL DEFAULT 'PENDENTE',
  gateway_id TEXT,
  gateway_tid TEXT,
  gateway_nsu TEXT,
  gateway_data JSONB DEFAULT '{}'::jsonb,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_transacao_aluno_tipo CHECK (
    (tipo = 'PEDIDO_LOJA' AND aluno_id IS NOT NULL) OR
    (tipo = 'RECARGA_SALDO' AND aluno_id IS NOT NULL)
  )
);

COMMENT ON TABLE transacoes IS 'Intenções de pagamento via gateway Rede (loja e recarga). Pedido/saldo só é confirmado após APROVADO.';
COMMENT ON COLUMN transacoes.payload IS 'PEDIDO_LOJA: { itens, dataRetirada, agrupadoPorAluno }. RECARGA_SALDO: {}';
COMMENT ON COLUMN transacoes.gateway_id IS 'ID da transação no gateway Rede';
COMMENT ON COLUMN transacoes.gateway_tid IS 'TID retornado pelo gateway';
COMMENT ON COLUMN transacoes.gateway_nsu IS 'NSU retornado pelo gateway';

CREATE INDEX idx_transacoes_usuario ON transacoes(usuario_id);
CREATE INDEX idx_transacoes_aluno ON transacoes(aluno_id);
CREATE INDEX idx_transacoes_pedido ON transacoes(pedido_id);
CREATE INDEX idx_transacoes_status ON transacoes(status);
CREATE INDEX idx_transacoes_gateway_id ON transacoes(gateway_id);
CREATE INDEX idx_transacoes_created ON transacoes(created_at);
CREATE INDEX idx_transacoes_tipo ON transacoes(tipo);

-- Vincular pagamentos ao gateway (transação) quando gerados a partir do checkout online
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_transacao ON pagamentos(transacao_id);

-- Vincular movimentação de saldo à transação (recarga online)
ALTER TABLE aluno_movimentacoes ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_transacao ON aluno_movimentacoes(transacao_id);

-- RLS: responsável vê apenas suas transações
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve proprias transacoes"
  ON transacoes FOR SELECT
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Usuario insere transacoes para si"
  ON transacoes FOR INSERT
  WITH CHECK (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

-- UPDATE só pelo servidor (webhook/API com service role); cliente não atualiza transação.
