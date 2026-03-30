-- Unidade de venda do produto: Unitário (un) ou Kilograma (kg)
-- Se KG, o preço do produto é o preço por kg; no PDV o operador informa as gramas.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'UN' CHECK (unidade IN ('UN', 'KG'));

COMMENT ON COLUMN produtos.unidade IS 'UN = unitário (preço por unidade). KG = preço por kg; no PDV informar gramas.';
