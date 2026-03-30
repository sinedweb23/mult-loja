-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  descricao TEXT,
  tipo TEXT DEFAULT 'TEXTO', -- 'TEXTO', 'JSON', 'BOOLEAN', 'NUMERO'
  sensivel BOOLEAN DEFAULT FALSE, -- Se true, não mostrar valor na listagem
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_configuracoes_chave ON configuracoes(chave);

-- Inserir configurações SMTP padrão (vazias)
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('smtp_enabled', 'false', 'Habilitar SMTP customizado', 'BOOLEAN', false),
  ('smtp_host', '', 'Servidor SMTP (ex: smtp.gmail.com)', 'TEXTO', false),
  ('smtp_port', '587', 'Porta SMTP (ex: 587 ou 465)', 'NUMERO', false),
  ('smtp_user', '', 'Email/usuário SMTP', 'TEXTO', true),
  ('smtp_password', '', 'Senha SMTP (App Password)', 'TEXTO', true),
  ('smtp_sender_email', '', 'Email remetente', 'TEXTO', false),
  ('smtp_sender_name', '', 'Nome do remetente', 'TEXTO', false)
ON CONFLICT (chave) DO NOTHING;

-- RLS para configurações (apenas admins podem ver/editar)
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Política: admins podem ver todas as configurações
CREATE POLICY "Admins podem ver configurações"
  ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem atualizar configurações
CREATE POLICY "Admins podem atualizar configurações"
  ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem inserir configurações
CREATE POLICY "Admins podem inserir configurações"
  ON configuracoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );
