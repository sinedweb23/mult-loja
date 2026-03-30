-- Compatibilidade PDV: métodos de cartão separados.
-- O fluxo de vendas usa CREDITO e DEBITO em pagamentos do caixa.

ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'CREDITO';
ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'DEBITO';
