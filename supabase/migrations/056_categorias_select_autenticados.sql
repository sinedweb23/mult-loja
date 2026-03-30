-- Permite que usuários autenticados leiam categorias (para a loja agrupar produtos por categoria).
-- Admins continuam com FOR ALL; esta política adiciona SELECT para qualquer auth.uid() não nulo.
CREATE POLICY "Autenticados podem ler categorias"
  ON public.categorias FOR SELECT
  USING (auth.uid() IS NOT NULL);
