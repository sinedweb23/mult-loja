-- Função para listar itens dos pedidos do usuário logado (contorna RLS no join com produtos).
-- Só retorna itens de pedidos que pertencem ao auth.uid().
CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.pedido_id,
    pi.produto_id,
    pi.quantidade,
    pi.preco_unitario,
    pi.subtotal,
    COALESCE(pi.variacoes_selecionadas, '{}'::jsonb),
    COALESCE(pr.nome, 'Produto')
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (para Meus Pedidos).';
