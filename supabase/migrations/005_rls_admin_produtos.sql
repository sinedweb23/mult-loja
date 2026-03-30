-- RLS: Permitir que admins gerenciem produtos, categorias, grupos, etc.

-- Produtos: Admins podem fazer tudo
CREATE POLICY "Admins podem gerenciar produtos"
  ON produtos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Categorias: Admins podem fazer tudo
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar categorias"
  ON categorias
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = categorias.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = categorias.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Grupos de produtos: Admins podem fazer tudo
ALTER TABLE grupos_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar grupos_produtos"
  ON grupos_produtos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = grupos_produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = grupos_produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Variações: Admins podem fazer tudo
ALTER TABLE variacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar variacoes"
  ON variacoes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = variacoes.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = variacoes.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Valores de variações: Admins podem fazer tudo
ALTER TABLE variacao_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar variacao_valores"
  ON variacao_valores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM variacoes
      JOIN produtos ON produtos.id = variacoes.produto_id
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE variacoes.id = variacao_valores.variacao_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variacoes
      JOIN produtos ON produtos.id = variacoes.produto_id
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE variacoes.id = variacao_valores.variacao_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Grupos de opcionais: Admins podem fazer tudo
ALTER TABLE grupos_opcionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar grupos_opcionais"
  ON grupos_opcionais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = grupos_opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = grupos_opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Opcionais: Admins podem fazer tudo
ALTER TABLE opcionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar opcionais"
  ON opcionais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Disponibilidade: Admins podem fazer tudo
CREATE POLICY "Admins podem gerenciar disponibilidade"
  ON produto_disponibilidade
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = produto_disponibilidade.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = produto_disponibilidade.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );
