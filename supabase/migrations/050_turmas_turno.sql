-- Turno da turma: Manhã ou Tarde (opcional)
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS turno TEXT;

COMMENT ON COLUMN public.turmas.turno IS 'Turno da turma: MANHA, TARDE ou null (não informado)';
