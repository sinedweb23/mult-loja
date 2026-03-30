# Configuração do Supabase Storage

As imagens (produtos, logo e favicon) são armazenadas no Supabase Storage. Os buckets são criados **automaticamente** no primeiro upload. As políticas RLS são aplicadas pela migration `021_storage_buckets_imagens.sql`.

## Buckets

- **produtos**: imagens dos produtos (estrutura: `empresa-{id}/{arquivo}`)
- **loja**: logo e favicon da loja (estrutura: `logo/` e `favicon/`)

## Configuração Manual (se necessário)

Se os buckets não forem criados automaticamente, crie manualmente:

### Passo a Passo

1. Acesse o Supabase Dashboard: https://supabase.com/dashboard/project/jznhaioobvjwjdmigxja/storage

2. Clique em "New bucket"

3. Configure o bucket:
   - **Name**: `produtos`
   - **Public bucket**: ✅ Marque como público (para que as imagens sejam acessíveis)
   - **File size limit**: 5242880 (5MB)
   - **Allowed MIME types**: 
     - `image/jpeg`
     - `image/png`
     - `image/webp`
     - `image/gif`

4. Clique em "Create bucket"

### Políticas RLS (Row Level Security)

Após criar o bucket, configure as políticas RLS:

1. Vá em "Storage" > "Policies" > "produtos"

2. Adicione a política:

**Policy Name**: "Admins podem fazer upload"
- **Allowed operation**: INSERT
- **Policy definition**:
```sql
(EXISTS (
  SELECT 1 FROM usuarios
  WHERE usuarios.auth_user_id = auth.uid()
  AND usuarios.eh_admin = TRUE
  AND usuarios.ativo = TRUE
))
```

**Policy Name**: "Todos podem ler imagens públicas"
- **Allowed operation**: SELECT
- **Policy definition**:
```sql
true
```

**Policy Name**: "Admins podem deletar"
- **Allowed operation**: DELETE
- **Policy definition**:
```sql
(EXISTS (
  SELECT 1 FROM usuarios
  WHERE usuarios.auth_user_id = auth.uid()
  AND usuarios.eh_admin = TRUE
  AND usuarios.ativo = TRUE
))
```

### Alternativa: Via SQL

Você também pode criar o bucket via SQL Editor:

```sql
-- Criar bucket (requer service_role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produtos',
  'produtos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Política para admins fazerem upload
CREATE POLICY "Admins podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.eh_admin = TRUE
    AND usuarios.ativo = TRUE
  )
);

-- Política para todos lerem (público)
CREATE POLICY "Todos podem ler imagens públicas"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'produtos');

-- Política para admins deletarem
CREATE POLICY "Admins podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.eh_admin = TRUE
    AND usuarios.ativo = TRUE
  )
);
```

### Estrutura de Pastas

As imagens serão organizadas por empresa:
- `produtos/empresa-{empresa_id}/{timestamp}-{random}.{ext}`

### Limites

- Tamanho máximo por arquivo: 5MB
- Formatos aceitos: JPG, PNG, WebP, GIF
- O sistema automaticamente cria o bucket se não existir (requer permissões de admin)
