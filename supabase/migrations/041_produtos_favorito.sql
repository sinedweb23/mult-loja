-- Favoritar produto: usado no PDV para destacar na tela de vendas
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS favorito BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN produtos.favorito IS 'Produto favorito: destacado no PDV (tela de vendas).';
