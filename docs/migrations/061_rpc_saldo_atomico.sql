-- RPC para operação atômica de crédito/débito de saldo do aluno
-- Evita race condition: INSERT movimentação + UPDATE saldo na mesma transação com lock

CREATE OR REPLACE FUNCTION creditar_debitar_aluno_saldo(
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

  -- Lock da linha do aluno em aluno_saldos (ou inserir se não existir)
  INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
  VALUES (p_aluno_id, 0, NOW())
  ON CONFLICT (aluno_id) DO NOTHING;

  SELECT saldo INTO v_saldo_atual
  FROM aluno_saldos
  WHERE aluno_id = p_aluno_id
  FOR UPDATE;

  -- Débito (saída): COMPRA, DESCONTO
  IF p_tipo IN ('COMPRA', 'DESCONTO') THEN
    v_novo_saldo := v_saldo_atual - v_valor_abs;
    IF v_novo_saldo < 0 THEN
      RETURN QUERY SELECT v_saldo_atual, 'Saldo insuficiente'::TEXT;
      RETURN;
    END IF;
  -- Crédito (entrada): RECARGA, RECARGA_PRESENCIAL, ESTORNO (de compra)
  ELSIF p_tipo IN ('RECARGA', 'RECARGA_PRESENCIAL', 'ESTORNO') THEN
    v_novo_saldo := v_saldo_atual + v_valor_abs;
  ELSE
    RETURN QUERY SELECT NULL::DECIMAL, ('Tipo não suportado: ' || p_tipo)::TEXT;
    RETURN;
  END IF;

  -- Movimentação: valor sempre positivo (conforme convenção atual: COMPRA=valor positivo, RECARGA=valor positivo)
  INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, pedido_id, transacao_id, caixa_id, usuario_id, observacao)
  VALUES (p_aluno_id, p_tipo, v_valor_abs, p_pedido_id, p_transacao_id, p_caixa_id, p_usuario_id, p_observacao);

  UPDATE aluno_saldos
  SET saldo = v_novo_saldo, updated_at = NOW()
  WHERE aluno_id = p_aluno_id;

  RETURN QUERY SELECT v_novo_saldo, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION creditar_debitar_aluno_saldo IS 'Operação atômica: insere movimentação e atualiza saldo com lock. Usar para PDV e confirmação de recarga.';

-- Exemplo de uso (recarga):
-- SELECT * FROM creditar_debitar_aluno_saldo(
--   'aluno-uuid', 100.00, 'RECARGA', NULL, 'transacao-uuid', NULL, 'usuario-uuid', 'Recarga online'
-- );

-- Exemplo (compra PDV - débito):
-- SELECT * FROM creditar_debitar_aluno_saldo(
--   'aluno-uuid', 25.50, 'COMPRA', 'pedido-uuid', NULL, 'caixa-uuid', 'usuario-uuid', NULL
-- );
