-- Reverte a migration 088: remove a policy que permitia operador PDV ver nome de colaborador.
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;
