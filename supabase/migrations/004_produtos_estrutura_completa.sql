-- Categorias de produtos
CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, nome)
);

-- Grupos de produtos (agrupa produtos relacionados)
CREATE TABLE IF NOT EXISTS grupos_produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar categoria_id e grupo_id na tabela produtos
ALTER TABLE produtos 
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES grupos_produtos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS imagem_url TEXT,
  ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;

-- Variações de produtos (ex: Tamanho P, M, G ou Cor Vermelha, Azul)
CREATE TABLE IF NOT EXISTS variacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, -- ex: "Tamanho", "Cor"
  tipo TEXT NOT NULL, -- 'TEXTO', 'NUMERO', 'COR'
  obrigatorio BOOLEAN DEFAULT FALSE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valores das variações (ex: P, M, G ou Vermelho, Azul)
CREATE TABLE IF NOT EXISTS variacao_valores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variacao_id UUID NOT NULL REFERENCES variacoes(id) ON DELETE CASCADE,
  valor TEXT NOT NULL, -- ex: "P", "M", "G" ou "#FF0000"
  label TEXT, -- ex: "Pequeno", "Médio", "Grande" ou "Vermelho"
  preco_adicional DECIMAL(10,2) DEFAULT 0, -- preço adicional para esta variação
  estoque INTEGER, -- estoque específico para esta variação (NULL = usa estoque do produto)
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variacao_id, valor)
);

-- Opcionais/Adicionais de produtos (ex: Queijo extra, Bacon)
CREATE TABLE IF NOT EXISTS opcionais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2) NOT NULL DEFAULT 0,
  estoque INTEGER, -- NULL = ilimitado
  obrigatorio BOOLEAN DEFAULT FALSE,
  max_selecoes INTEGER, -- NULL = ilimitado
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grupos de opcionais (ex: "Adicionais", "Bebidas", "Sobremesas")
CREATE TABLE IF NOT EXISTS grupos_opcionais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  obrigatorio BOOLEAN DEFAULT FALSE, -- pelo menos um opcional deste grupo deve ser selecionado
  min_selecoes INTEGER DEFAULT 0,
  max_selecoes INTEGER, -- NULL = ilimitado
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relação opcionais com grupos
ALTER TABLE opcionais 
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES grupos_opcionais(id) ON DELETE SET NULL;

-- Atualizar pedido_itens para incluir variações e opcionais selecionados
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS variacoes_selecionadas JSONB DEFAULT '{}'::jsonb, -- { "Tamanho": "M", "Cor": "Vermelho" }
  ADD COLUMN IF NOT EXISTS opcionais_selecionados JSONB DEFAULT '[]'::jsonb; -- [{ "opcional_id": "...", "quantidade": 1 }]

-- Índices
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupos_produtos_empresa ON grupos_produtos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_grupo ON produtos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_variacoes_produto ON variacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_variacao_valores_variacao ON variacao_valores(variacao_id);
CREATE INDEX IF NOT EXISTS idx_opcionais_produto ON opcionais(produto_id);
CREATE INDEX IF NOT EXISTS idx_opcionais_grupo ON opcionais(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupos_opcionais_produto ON grupos_opcionais(produto_id);
