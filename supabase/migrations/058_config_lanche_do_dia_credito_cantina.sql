-- Configurações: Lanche do Dia e segmentos com acesso ao Crédito Cantina
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('lanche_do_dia_produto_id', '', 'ID do produto exibido como Lanche do Dia na Loja', 'TEXTO', false),
  ('segmentos_credito_cantina', '[]', 'Segmentos (turmas) com acesso à rota /loja/credito-cantina (JSON array)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;
