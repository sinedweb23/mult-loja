-- Permitir saldo negativo em aluno_saldos (regras aplicadas na aplicação: admin, responsável, limite).
-- Remove a CHECK que impedia saldo < 0 e causava "violates check constraint" ao debitar no PDV.
ALTER TABLE public.aluno_saldos
  DROP CONSTRAINT IF EXISTS aluno_saldos_saldo_check;

COMMENT ON TABLE public.aluno_saldos IS 'Saldo por aluno. Pode ser negativo quando admin permite e responsável não bloqueou (regras em configuracoes e aluno_config).';
