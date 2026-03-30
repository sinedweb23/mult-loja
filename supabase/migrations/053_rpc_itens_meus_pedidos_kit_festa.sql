-- Estende get_itens_meus_pedidos para retornar campos Kit Festa e opcionais.
DROP FUNCTION IF EXISTS public.get_itens_meus_pedidos(uuid[]);

CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text,
  tema_festa text,
  idade_festa integer,
  kit_festa_data date,
  kit_festa_horario_inicio text,
  kit_festa_horario_fim text,
  google_event_id text,
  google_event_link text,
  opcionais_selecionados jsonb
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
    COALESCE(pi.produto_nome, pr.nome, 'Produto'),
    pi.tema_festa,
    pi.idade_festa,
    pi.kit_festa_data,
    pi.kit_festa_horario_inicio,
    pi.kit_festa_horario_fim,
    pi.google_event_id,
    pi.google_event_link,
    COALESCE(pi.opcionais_selecionados, '[]'::jsonb)
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (inclui Kit Festa e opcionais).';
