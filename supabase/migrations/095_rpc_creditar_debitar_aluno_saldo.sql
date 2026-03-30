-- RPC atômica para crédito/débito de saldo.
-- Necessária para checkout com saldo e cancelamento de pedidos online.

CREATE OR REPLACE FUNCTION public.creditar_debitar_aluno_saldo(
  p_aluno_id UUID,
  p_valor DECIMAL,
  p_tipo movimento_saldo_tipo,
  p_pedido_id UUID DEFAULT NULL,
  p_transacao_id UUID DEFAULT NULL,
  p_caixa_id UUID DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL
)
RETURNS TABLE(novo_saldo DECIMAL, erro TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_atual DECIMAL;
  v_novo_saldo DECIMAL;
  v_valor_abs DECIMAL;
BEGIN
  v_valor_abs := ABS(p_valor);
  IF v_valor_abs <= 0 THEN
    RETURN QUERY SELECT NULL::DECIMAL, 'Valor inválido'::TEXT;
    RETURN;
  END IF;

  -- Garante linha de saldo e aplica lock para evitar corrida
  INSERT INTO public.aluno_saldos (aluno_id, saldo, updated_at)
  VALUES (p_aluno_id, 0, NOW())
  ON CONFLICT (aluno_id) DO NOTHING;

  SELECT saldo
    INTO v_saldo_atual
  FROM public.aluno_saldos
  WHERE aluno_id = p_aluno_id
  FOR UPDATE;

  -- Débito (COMPRA, DESCONTO)
  IF p_tipo IN ('COMPRA', 'DESCONTO') THEN
    v_novo_saldo := v_saldo_atual - v_valor_abs;
    IF v_novo_saldo < 0 THEN
      RETURN QUERY SELECT v_saldo_atual, 'Saldo insuficiente'::TEXT;
      RETURN;
    END IF;
  -- Crédito (RECARGA, RECARGA_PRESENCIAL, ESTORNO)
  ELSIF p_tipo IN ('RECARGA', 'RECARGA_PRESENCIAL', 'ESTORNO') THEN
    v_novo_saldo := v_saldo_atual + v_valor_abs;
  ELSE
    RETURN QUERY SELECT NULL::DECIMAL, ('Tipo não suportado: ' || p_tipo)::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.aluno_movimentacoes (
    aluno_id,
    tipo,
    valor,
    pedido_id,
    transacao_id,
    caixa_id,
    usuario_id,
    observacao
  )
  VALUES (
    p_aluno_id,
    p_tipo,
    v_valor_abs,
    p_pedido_id,
    p_transacao_id,
    p_caixa_id,
    p_usuario_id,
    p_observacao
  );

  UPDATE public.aluno_saldos
  SET saldo = v_novo_saldo, updated_at = NOW()
  WHERE aluno_id = p_aluno_id;

  RETURN QUERY SELECT v_novo_saldo, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.creditar_debitar_aluno_saldo IS
  'Operação atômica: insere movimentação e atualiza saldo com lock. Usar para checkout com saldo e estornos.';
