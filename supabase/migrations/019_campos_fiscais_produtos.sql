-- Adicionar campos fiscais para emissão de NF-e

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ncm TEXT, -- Código NCM (obrigatório para NF-e)
  ADD COLUMN IF NOT EXISTS cfop TEXT, -- Código Fiscal de Operações (obrigatório para NF-e, padrão: 5102)
  ADD COLUMN IF NOT EXISTS unidade_comercial TEXT DEFAULT 'UN', -- Unidade de medida (obrigatório para NF-e, padrão: UN)
  ADD COLUMN IF NOT EXISTS cst_icms TEXT, -- Código de Situação Tributária do ICMS (Regime Normal)
  ADD COLUMN IF NOT EXISTS csosn TEXT, -- Código de Situação da Operação no Simples Nacional
  ADD COLUMN IF NOT EXISTS icms_origem TEXT DEFAULT '0', -- Origem da mercadoria (0 = Nacional)
  ADD COLUMN IF NOT EXISTS aliq_icms DECIMAL(5,2) DEFAULT 0, -- Alíquota do ICMS (%)
  ADD COLUMN IF NOT EXISTS cst_pis TEXT, -- Código de Situação Tributária do PIS
  ADD COLUMN IF NOT EXISTS aliq_pis DECIMAL(5,2) DEFAULT 0, -- Alíquota do PIS (%)
  ADD COLUMN IF NOT EXISTS cst_cofins TEXT, -- Código de Situação Tributária do COFINS
  ADD COLUMN IF NOT EXISTS aliq_cofins DECIMAL(5,2) DEFAULT 0, -- Alíquota do COFINS (%)
  ADD COLUMN IF NOT EXISTS cbenef TEXT; -- Código de Benefício Fiscal (obrigatório para algumas situações)

-- Comentários para documentação
COMMENT ON COLUMN produtos.ncm IS 'Código NCM - Classificação fiscal do produto (obrigatório para NF-e)';
COMMENT ON COLUMN produtos.cfop IS 'Código Fiscal de Operações - Padrão: 5102 (venda no mesmo estado)';
COMMENT ON COLUMN produtos.unidade_comercial IS 'Unidade de medida para NFe - Padrão: UN';
COMMENT ON COLUMN produtos.cst_icms IS 'Código de Situação Tributária do ICMS (Regime Normal)';
COMMENT ON COLUMN produtos.csosn IS 'Código de Situação da Operação no Simples Nacional';
COMMENT ON COLUMN produtos.icms_origem IS 'Origem da mercadoria (0 = Nacional, 1 = Estrangeira, etc.)';
COMMENT ON COLUMN produtos.aliq_icms IS 'Alíquota do ICMS (%)';
COMMENT ON COLUMN produtos.cst_pis IS 'Código de Situação Tributária do PIS';
COMMENT ON COLUMN produtos.aliq_pis IS 'Alíquota do PIS (%)';
COMMENT ON COLUMN produtos.cst_cofins IS 'Código de Situação Tributária do COFINS';
COMMENT ON COLUMN produtos.aliq_cofins IS 'Alíquota do COFINS (%)';
COMMENT ON COLUMN produtos.cbenef IS 'Código de Benefício Fiscal - Obrigatório quando ICMS situação tributária for 400, 40 ou 41';
