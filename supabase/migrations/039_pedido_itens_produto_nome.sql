-- Nome do produto no momento da venda (histórico para relatórios mesmo se produto for renomeado)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS produto_nome TEXT;
COMMENT ON COLUMN pedido_itens.produto_nome IS 'Nome do produto no momento da venda (PDV/relatórios)';
