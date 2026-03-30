-- Política RLS para admins verem todas as empresas
CREATE POLICY "Admins podem ver todas as empresas"
  ON empresas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem empresas
CREATE POLICY "Admins podem gerenciar empresas"
  ON empresas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as unidades
CREATE POLICY "Admins podem ver todas as unidades"
  ON unidades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem unidades
CREATE POLICY "Admins podem gerenciar unidades"
  ON unidades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem turmas (já existe ver, adicionar gerenciar)
CREATE POLICY "Admins podem gerenciar turmas"
  ON turmas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os admins
CREATE POLICY "Admins podem ver todos os admins"
  ON admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem admins
CREATE POLICY "Admins podem gerenciar admins"
  ON admins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );
