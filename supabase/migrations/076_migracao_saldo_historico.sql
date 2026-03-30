-- Migração de saldo do sistema antigo: tipo de movimentação e tabela de histórico
-- Projeto: loja-sup (jznhaioobvjwjdmigxja) – aplicar via MCP Supabase ou Supabase CLI/Dashboard

-- Novo valor no enum de movimentação de saldo (compatível com PG < 15)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'movimento_saldo_tipo' AND e.enumlabel = 'MIGRACAO_SALDO'
  ) THEN
    ALTER TYPE movimento_saldo_tipo ADD VALUE 'MIGRACAO_SALDO';
  END IF;
END
$$;

-- Tabela de histórico de migrações (cada execução do "Confirmar Migração")
CREATE TABLE IF NOT EXISTS historico_migracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_alunos INT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE historico_migracoes IS 'Registro de cada lote de migração de saldo do sistema antigo.';

-- RLS: apenas admins
ALTER TABLE historico_migracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem historico_migracoes"
  ON historico_migracoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

CREATE POLICY "Admins inserem historico_migracoes"
  ON historico_migracoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_historico_migracoes_created ON historico_migracoes(created_at DESC);

-- RPC: executar migração de saldo em uma única transação
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

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Valor inválido para aluno %', v_aluno_id;
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

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (v_total_alunos, v_valor_total)
  RETURNING id INTO v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

COMMENT ON FUNCTION public.executar_migracao_saldo IS 'Migração de saldo: atualiza aluno_saldos, insere aluno_movimentacoes (MIGRACAO_SALDO) e historico_migracoes em uma transação.';

-- Recurso "Migrar Saldo" no perfil Acesso total
INSERT INTO public.perfil_permissoes (perfil_id, recurso)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'admin.migrarSaldo')
ON CONFLICT (perfil_id, recurso) DO NOTHING;
