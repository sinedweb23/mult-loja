-- Permite que produto_disponibilidade.segmento armazene valores da coluna tipo_curso da tabela turmas (texto livre)
ALTER TABLE produto_disponibilidade
  ALTER COLUMN segmento TYPE TEXT USING segmento::text;
