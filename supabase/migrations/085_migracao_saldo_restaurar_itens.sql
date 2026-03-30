-- Restaurar gravação de itens no histórico de migração
-- (ajuste anterior de 084 removeu, sem querer, o INSERT em historico_migracao_itens).
-- Esta versão permite valores negativos (débito) e volta a registrar todos os alunos/valores.

CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  -- Criar registro do histórico (totais atualizados no final)
  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (0, 0)
  RETURNING id INTO v_historico_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    -- Permite valores negativos (débito), apenas recusa zero.
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'Valor inválido (zero) para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    INSERT INTO historico_migracao_itens (historico_migracao_id, aluno_id, valor)
    VALUES (v_historico_id, v_aluno_id, v_valor);

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  UPDATE historico_migracoes
  SET total_alunos = v_total_alunos, valor_total = v_valor_total
  WHERE id = v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

