-- Garantir que label seja exibido na loja/PDV: preencher label com valor quando estiver vazio.
-- Assim a loja e o PDV exibem o mesmo texto (label ou valor) sem quebrar.
UPDATE public.variacao_valores
SET label = valor
WHERE label IS NULL OR TRIM(label) = '';
