-- Permite que usuários com perfil PDV (recurso 'pdv') vejam e atualizem saldo dos alunos
-- em PDV/vendas. A migration 078 já estendeu eh_admin_ou_operador() para pedidos, alunos,
-- produtos e turmas, mas aluno_saldos e aluno_movimentacoes ainda só permitiam OPERADOR
-- (usuario_papeis), não quem tem apenas perfil com recurso 'pdv'.

-- 1. aluno_saldos: SELECT para operador/PDV ver saldo dos alunos no PDV
CREATE POLICY "Operador e PDV veem aluno_saldos"
  ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 2. aluno_movimentacoes: SELECT para operador/PDV ver histórico (ex.: tela de vendas)
CREATE POLICY "Operador e PDV veem aluno_movimentacoes"
  ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Substituir políticas que hoje só permitem OPERADOR (usuario_papeis) por eh_admin_ou_operador(),
--    para que perfil PDV também possa inserir movimentações e atualizar saldos ao vender.

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV inserem aluno_movimentacoes"
  ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV atualizam aluno_saldos"
  ON public.aluno_saldos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV inserem aluno_saldos"
  ON public.aluno_saldos FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());
