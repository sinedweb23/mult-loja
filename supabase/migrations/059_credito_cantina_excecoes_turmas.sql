-- Lista de exceção: turmas que NÃO têm acesso ao Crédito Cantina (por padrão todas têm acesso).
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('credito_cantina_excecoes_turma_ids', '[]', 'IDs das turmas sem acesso à rota /loja/credito-cantina (exceção)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;
