-- Policy removida: causava recursão infinita em RLS (policy em usuarios referenciando usuarios).
-- Nome do colaborador no relatório PDV é obtido via admin client em app/actions/pdv-vendas.ts (listarVendasDiaCaixa).
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;
