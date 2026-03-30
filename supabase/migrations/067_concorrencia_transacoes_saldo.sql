-- Garantir idempotência na confirmação de transação (evitar dupla criação de pedidos/recarga)
-- e incremento atômico de saldo para recargas concorrentes.

-- Tabela de “lock”: quem inserir primeiro confirma a transação; demais retornam sem duplicar.
CREATE TABLE IF NOT EXISTS transacao_confirmacao (
  transacao_id UUID PRIMARY KEY REFERENCES transacoes(id) ON DELETE CASCADE
);
COMMENT ON TABLE transacao_confirmacao IS 'Uma linha por transação já confirmada; evita dupla execução de confirmarTransacaoAprovada.';

-- Função atômica: incrementa saldo do aluno (INSERT ou UPDATE) sem race condition.
CREATE OR REPLACE FUNCTION public.incrementar_saldo_aluno(p_aluno_id UUID, p_valor DECIMAL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO aluno_saldos (aluno_id, saldo)
  VALUES (p_aluno_id, GREATEST(0, p_valor))
  ON CONFLICT (aluno_id)
  DO UPDATE SET
    saldo = aluno_saldos.saldo + EXCLUDED.saldo,
    updated_at = now();
$$;
COMMENT ON FUNCTION public.incrementar_saldo_aluno IS 'Incrementa saldo do aluno de forma atômica (recarga online concorrente).';

-- Abate atômico de estoque (variacao_valores): evita estoque negativo com PDV e online concorrentes.
CREATE OR REPLACE FUNCTION public.decrementar_estoque_variacao_valor(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE variacao_valores
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;

-- Abate atômico de estoque (produtos).
CREATE OR REPLACE FUNCTION public.decrementar_estoque_produto(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE produtos
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;
