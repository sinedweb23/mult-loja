-- Criar buckets produtos e loja
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('produtos', 'produtos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'image/x-icon']),
  ('loja', 'loja', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'image/x-icon'])
ON CONFLICT (id) DO NOTHING;
