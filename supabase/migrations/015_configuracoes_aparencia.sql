-- Adicionar configurações de aparência
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('loja_nome', '', 'Nome da loja (exibido no header e emails)', 'TEXTO', false),
  ('loja_logo_url', '', 'URL do logo da loja', 'TEXTO', false),
  ('loja_favicon_url', '', 'URL do favicon da loja', 'TEXTO', false)
ON CONFLICT (chave) DO NOTHING;

-- Atualizar políticas RLS de configuracoes para usar usuarios ao invés de admins
DROP POLICY IF EXISTS "Admins podem ver configurações" ON configuracoes;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON configuracoes;
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON configuracoes;

-- Política: admins podem ver todas as configurações
CREATE POLICY "Admins podem ver configurações"
  ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem atualizar configurações
CREATE POLICY "Admins podem atualizar configurações"
  ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem inserir configurações
CREATE POLICY "Admins podem inserir configurações"
  ON configuracoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );
