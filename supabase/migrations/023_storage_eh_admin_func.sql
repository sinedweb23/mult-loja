-- Função para verificar se usuário é admin (usada nas políticas de storage)
CREATE OR REPLACE FUNCTION public.eh_admin_upload()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_user_id = auth.uid()
    AND eh_admin = true
    AND ativo = true
  );
$$;

-- Dropar políticas antigas de INSERT e recriar usando a função
DROP POLICY IF EXISTS "Produtos: Admins podem fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "Loja: Admins podem fazer upload" ON storage.objects;

CREATE POLICY "Produtos: Admins podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND public.eh_admin_upload()
);

CREATE POLICY "Loja: Admins podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'loja' AND public.eh_admin_upload()
);
