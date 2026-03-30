-- Loja: usuário autenticado (ex.: responsável) pode ler variações e opcionais de produtos ativos
-- para exibir na página do produto ao adicionar ao carrinho (sem ser admin).

-- variacoes: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le variacoes de produtos ativos"
  ON public.variacoes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = variacoes.produto_id AND p.ativo = TRUE
    )
  );

-- variacao_valores: SELECT para qualquer autenticado (produto ativo via variacao)
CREATE POLICY "Loja: autenticado le variacao_valores de produtos ativos"
  ON public.variacao_valores FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id AND p.ativo = TRUE
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- grupos_opcionais: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le grupos_opcionais de produtos ativos"
  ON public.grupos_opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = grupos_opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- opcionais: SELECT para qualquer autenticado em produtos ativos
CREATE POLICY "Loja: autenticado le opcionais de produtos ativos"
  ON public.opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = opcionais.produto_id AND p.ativo = TRUE
    )
  );
