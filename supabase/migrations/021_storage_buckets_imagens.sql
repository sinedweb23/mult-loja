-- Políticas RLS para os buckets de imagens (produtos e loja)
-- Os buckets são criados automaticamente no primeiro upload

-- Políticas para bucket 'produtos' (imagens de produtos)
CREATE POLICY "Produtos: Admins podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

CREATE POLICY "Produtos: Todos podem ler"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'produtos');

CREATE POLICY "Produtos: Admins podem atualizar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

CREATE POLICY "Produtos: Admins podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

-- Políticas para bucket 'loja' (logo e favicon)
CREATE POLICY "Loja: Admins podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'loja' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

CREATE POLICY "Loja: Todos podem ler"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'loja');

CREATE POLICY "Loja: Admins podem atualizar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'loja' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

CREATE POLICY "Loja: Admins podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'loja' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);
