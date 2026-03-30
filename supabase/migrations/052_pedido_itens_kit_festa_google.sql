-- Kit Festa: campos no pedido_item (tema, idade, data/horário, evento Google)
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS tema_festa TEXT,
  ADD COLUMN IF NOT EXISTS idade_festa INTEGER,
  ADD COLUMN IF NOT EXISTS kit_festa_data DATE,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_inicio TEXT,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_fim TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_link TEXT;

COMMENT ON COLUMN pedido_itens.tema_festa IS 'Kit Festa: tema informado pelo responsável';
COMMENT ON COLUMN pedido_itens.idade_festa IS 'Kit Festa: idade que a criança fará (1-15)';
COMMENT ON COLUMN pedido_itens.kit_festa_data IS 'Kit Festa: data de retirada (YYYY-MM-DD)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_inicio IS 'Kit Festa: início do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_fim IS 'Kit Festa: fim do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.google_event_id IS 'Kit Festa: ID do evento criado na Google Agenda após pagamento';
COMMENT ON COLUMN pedido_itens.google_event_link IS 'Kit Festa: link para o evento na Google Agenda';
