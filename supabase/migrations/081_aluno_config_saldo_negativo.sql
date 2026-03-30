-- Controle do responsável: bloquear compra na cantina com saldo negativo
ALTER TABLE public.aluno_config
  ADD COLUMN IF NOT EXISTS bloquear_compra_saldo_negativo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.aluno_config.bloquear_compra_saldo_negativo IS
  'Se true, o responsável bloqueia compras no PDV com saldo negativo para este aluno.';
