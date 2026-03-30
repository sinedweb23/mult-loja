-- RLS: Permitir que admins gerenciem itens de kits

ALTER TABLE kits_itens ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: Responsáveis veem itens de kits de produtos disponíveis (já existe)
-- Vamos manter a política existente e adicionar políticas para admins

-- Política para admins: podem fazer tudo com kits_itens
CREATE POLICY "Admins podem gerenciar kits_itens"
  ON kits_itens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN usuarios ON usuarios.auth_user_id = auth.uid()
      WHERE produtos.id = kits_itens.kit_produto_id
      AND usuarios.eh_admin = true
      AND usuarios.ativo = true
      AND (usuarios.empresa_id = produtos.empresa_id OR usuarios.empresa_id IS NULL OR usuarios.super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN usuarios ON usuarios.auth_user_id = auth.uid()
      WHERE produtos.id = kits_itens.kit_produto_id
      AND usuarios.eh_admin = true
      AND usuarios.ativo = true
      AND (usuarios.empresa_id = produtos.empresa_id OR usuarios.empresa_id IS NULL OR usuarios.super_admin = true)
    )
  );
