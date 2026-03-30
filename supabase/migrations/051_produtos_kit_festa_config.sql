-- Configurações para produto tipo Kit Festa: antecedência de compra e horários por período
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_min INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_max INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_horarios JSONB NULL;

COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_min IS 'Kit Festa: mínimo de dias de antecedência para compra (ex: 10)';
COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_max IS 'Kit Festa: máximo de dias de antecedência para compra (ex: 60)';
COMMENT ON COLUMN public.produtos.kit_festa_horarios IS 'Kit Festa: [{ "periodo": "MANHA"|"TARDE", "inicio": "HH:mm", "fim": "HH:mm" }, ...]';
