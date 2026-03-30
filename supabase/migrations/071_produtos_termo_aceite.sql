-- Termo de aceite no produto: exibir na loja e exigir checkbox antes de adicionar ao carrinho.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS exigir_termo_aceite BOOLEAN DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS texto_termo_aceite TEXT;

COMMENT ON COLUMN public.produtos.exigir_termo_aceite IS 'Se true, na loja exige aceite do termo antes de adicionar ao carrinho';
COMMENT ON COLUMN public.produtos.texto_termo_aceite IS 'Texto do termo de aceite (quebras de linha preservadas)';
