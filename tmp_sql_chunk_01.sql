-- =====================================================================
-- supabase/migrations/001_initial_schema.sql
-- =====================================================================
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (opcional, para multi-escola)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Empresas
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unidades (opcional)
CREATE TABLE IF NOT EXISTS unidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segmentos (ex: Educação Infantil, Fundamental, etc.)
CREATE TYPE segmento_tipo AS ENUM ('EDUCACAO_INFANTIL', 'FUNDAMENTAL', 'MEDIO', 'OUTRO');

-- Turmas
CREATE TABLE IF NOT EXISTS turmas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  segmento segmento_tipo,
  tipo_curso TEXT,
  situacao TEXT DEFAULT 'ATIVA',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alunos
CREATE TABLE IF NOT EXISTS alunos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL,
  prontuario TEXT NOT NULL,
  nome TEXT NOT NULL,
  situacao TEXT DEFAULT 'ATIVO',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, prontuario)
);

-- Responsáveis (vinculado ao auth.users do Supabase)
CREATE TYPE responsavel_tipo AS ENUM ('FINANCEIRO', 'PEDAGOGICO', 'AMBOS');

CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo responsavel_tipo NOT NULL DEFAULT 'AMBOS',
  nome_financeiro TEXT,
  cpf_financeiro TEXT,
  email_financeiro TEXT,
  celular_financeiro TEXT,
  nome_pedagogico TEXT,
  cpf_pedagogico TEXT,
  email_pedagogico TEXT,
  celular_pedagogico TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vínculo responsável-aluno
CREATE TABLE IF NOT EXISTS responsavel_aluno (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  responsavel_id UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(responsavel_id, aluno_id)
);

-- Endereços (para responsável e/ou aluno)
CREATE TABLE IF NOT EXISTS enderecos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  responsavel_id UUID REFERENCES responsaveis(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'RESIDENCIAL', -- RESIDENCIAL, COMERCIAL, etc.
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (responsavel_id IS NOT NULL AND aluno_id IS NULL) OR
    (responsavel_id IS NULL AND aluno_id IS NOT NULL)
  )
);

-- Tipos de produto
CREATE TYPE produto_tipo AS ENUM ('PRODUTO', 'SERVICO', 'KIT');
CREATE TYPE disponibilidade_tipo AS ENUM ('TODOS', 'SEGMENTO', 'TURMA', 'ALUNO');

-- Produtos
CREATE TABLE IF NOT EXISTS produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  tipo produto_tipo NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2) NOT NULL,
  estoque INTEGER DEFAULT 0,
  compra_unica BOOLEAN DEFAULT FALSE,
  limite_max_compra_unica INTEGER DEFAULT 1,
  permitir_pix BOOLEAN DEFAULT TRUE,
  permitir_cartao BOOLEAN DEFAULT TRUE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disponibilidade de produtos
CREATE TABLE IF NOT EXISTS produto_disponibilidade (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo disponibilidade_tipo NOT NULL,
  segmento segmento_tipo, -- se tipo = SEGMENTO
  turma_id UUID REFERENCES turmas(id) ON DELETE CASCADE, -- se tipo = TURMA
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE, -- se tipo = ALUNO
  disponivel_de TIMESTAMPTZ,
  disponivel_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (tipo = 'TODOS') OR
    (tipo = 'SEGMENTO' AND segmento IS NOT NULL) OR
    (tipo = 'TURMA' AND turma_id IS NOT NULL) OR
    (tipo = 'ALUNO' AND aluno_id IS NOT NULL)
  )
);

-- Itens de kit
CREATE TABLE IF NOT EXISTS kits_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (kit_produto_id != produto_id)
);

-- Pedidos
CREATE TYPE pedido_status AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO', 'ENTREGUE');

CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  responsavel_id UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  status pedido_status DEFAULT 'PENDENTE',
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itens do pedido (kits expandidos)
CREATE TABLE IF NOT EXISTS pedido_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  kit_produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL, -- se veio de um kit
  quantidade INTEGER NOT NULL,
  preco_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos
CREATE TYPE pagamento_status AS ENUM ('PENDENTE', 'PROCESSANDO', 'APROVADO', 'RECUSADO', 'ESTORNADO');
CREATE TYPE pagamento_metodo AS ENUM ('PIX', 'CARTAO');

CREATE TABLE IF NOT EXISTS pagamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  metodo pagamento_metodo NOT NULL,
  status pagamento_status DEFAULT 'PENDENTE',
  valor DECIMAL(10,2) NOT NULL,
  provider_id TEXT, -- ID do provider externo
  provider_data JSONB,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notas fiscais
CREATE TYPE nota_tipo AS ENUM ('NFE', 'NFSE');
CREATE TYPE nota_status AS ENUM ('PENDENTE', 'EMITIDA', 'CANCELADA', 'ERRO');

CREATE TABLE IF NOT EXISTS notas_fiscais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo nota_tipo NOT NULL,
  status nota_status DEFAULT 'PENDENTE',
  chave_acesso TEXT,
  numero TEXT,
  serie TEXT,
  payload_envio JSONB,
  payload_resposta JSONB,
  link_pdf TEXT,
  link_xml TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admins e RBAC
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_roles (
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, role_id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  tabela TEXT,
  registro_id UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_alunos_empresa ON alunos(empresa_id);
CREATE INDEX idx_alunos_turma ON alunos(turma_id);
CREATE INDEX idx_responsavel_aluno_responsavel ON responsavel_aluno(responsavel_id);
CREATE INDEX idx_responsavel_aluno_aluno ON responsavel_aluno(aluno_id);
CREATE INDEX idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX idx_produtos_unidade ON produtos(unidade_id);
CREATE INDEX idx_produto_disponibilidade_produto ON produto_disponibilidade(produto_id);
CREATE INDEX idx_produto_disponibilidade_turma ON produto_disponibilidade(turma_id);
CREATE INDEX idx_produto_disponibilidade_aluno ON produto_disponibilidade(aluno_id);
CREATE INDEX idx_pedidos_responsavel ON pedidos(responsavel_id);
CREATE INDEX idx_pedidos_aluno ON pedidos(aluno_id);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pagamentos_pedido ON pagamentos(pedido_id);
CREATE INDEX idx_notas_fiscais_pedido ON notas_fiscais(pedido_id);

-- =====================================================================
-- supabase/migrations/002_rls_policies.sql
-- =====================================================================
-- RLS: Responsáveis só veem seus próprios dados
ALTER TABLE responsaveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem apenas seus próprios dados"
  ON responsaveis
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- RLS: Responsáveis só veem alunos vinculados
ALTER TABLE responsavel_aluno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem apenas seus vínculos com alunos"
  ON responsavel_aluno
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = responsavel_aluno.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Responsáveis só veem alunos vinculados
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem apenas alunos vinculados"
  ON alunos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM responsavel_aluno
      JOIN responsaveis ON responsaveis.id = responsavel_aluno.responsavel_id
      WHERE responsavel_aluno.aluno_id = alunos.id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Produtos - responsáveis só veem produtos ativos e disponíveis
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem produtos ativos"
  ON produtos
  FOR SELECT
  USING (ativo = TRUE);

-- RLS: Disponibilidade de produtos
ALTER TABLE produto_disponibilidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem disponibilidade de produtos"
  ON produto_disponibilidade
  FOR SELECT
  USING (TRUE);

-- RLS: Pedidos - responsáveis só veem seus próprios pedidos
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem apenas seus pedidos"
  ON pedidos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = pedidos.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Responsáveis criam pedidos para seus alunos"
  ON pedidos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = pedidos.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM responsavel_aluno
      JOIN responsaveis ON responsaveis.id = responsavel_aluno.responsavel_id
      WHERE responsavel_aluno.aluno_id = pedidos.aluno_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Itens de pedido
ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem itens de seus pedidos"
  ON pedido_itens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos
      JOIN responsaveis ON responsaveis.id = pedidos.responsavel_id
      WHERE pedidos.id = pedido_itens.pedido_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Pagamentos
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem pagamentos de seus pedidos"
  ON pagamentos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos
      JOIN responsaveis ON responsaveis.id = pedidos.responsavel_id
      WHERE pedidos.id = pagamentos.pedido_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Notas fiscais
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem notas de seus pedidos"
  ON notas_fiscais
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos
      JOIN responsaveis ON responsaveis.id = pedidos.responsavel_id
      WHERE pedidos.id = notas_fiscais.pedido_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Endereços
ALTER TABLE enderecos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem seus endereços"
  ON enderecos
  FOR SELECT
  USING (
    responsavel_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = enderecos.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Turmas (responsáveis veem turmas dos seus alunos)
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsáveis veem turmas de seus alunos"
  ON turmas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alunos
      JOIN responsavel_aluno ON responsavel_aluno.aluno_id = alunos.id
      JOIN responsaveis ON responsaveis.id = responsavel_aluno.responsavel_id
      WHERE alunos.turma_id = turmas.id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Empresas e Unidades (público para leitura)
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos veem empresas"
  ON empresas
  FOR SELECT
  USING (TRUE);

CREATE POLICY "Todos veem unidades"
  ON unidades
  FOR SELECT
  USING (TRUE);

-- =====================================================================
-- supabase/migrations/004_produtos_estrutura_completa.sql
-- =====================================================================
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

-- =====================================================================
-- supabase/migrations/005_rls_admin_produtos.sql
-- =====================================================================
-- RLS: Permitir que admins gerenciem produtos, categorias, grupos, etc.

-- Produtos: Admins podem fazer tudo
CREATE POLICY "Admins podem gerenciar produtos"
  ON produtos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Categorias: Admins podem fazer tudo
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar categorias"
  ON categorias
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = categorias.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = categorias.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Grupos de produtos: Admins podem fazer tudo
ALTER TABLE grupos_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar grupos_produtos"
  ON grupos_produtos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = grupos_produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
      AND (admins.empresa_id = grupos_produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Variações: Admins podem fazer tudo
ALTER TABLE variacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar variacoes"
  ON variacoes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = variacoes.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = variacoes.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Valores de variações: Admins podem fazer tudo
ALTER TABLE variacao_valores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar variacao_valores"
  ON variacao_valores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM variacoes
      JOIN produtos ON produtos.id = variacoes.produto_id
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE variacoes.id = variacao_valores.variacao_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variacoes
      JOIN produtos ON produtos.id = variacoes.produto_id
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE variacoes.id = variacao_valores.variacao_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Grupos de opcionais: Admins podem fazer tudo
ALTER TABLE grupos_opcionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar grupos_opcionais"
  ON grupos_opcionais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = grupos_opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = grupos_opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Opcionais: Admins podem fazer tudo
ALTER TABLE opcionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar opcionais"
  ON opcionais
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = opcionais.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- Disponibilidade: Admins podem fazer tudo
CREATE POLICY "Admins podem gerenciar disponibilidade"
  ON produto_disponibilidade
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = produto_disponibilidade.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN admins ON admins.auth_user_id = auth.uid()
      WHERE produtos.id = produto_disponibilidade.produto_id
      AND admins.ativo = true
      AND (admins.empresa_id = produtos.empresa_id OR admins.empresa_id IS NULL)
    )
  );

-- =====================================================================
-- supabase/migrations/006_importacao_logs.sql
-- =====================================================================
-- Tabela de logs de importação
CREATE TABLE IF NOT EXISTS importacao_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, -- 'MANUAL', 'AGENDADA', 'API'
  status TEXT NOT NULL DEFAULT 'EM_PROGRESSO', -- 'EM_PROGRESSO', 'SUCESSO', 'ERRO', 'PARCIAL'
  total_registros INTEGER DEFAULT 0,
  registros_processados INTEGER DEFAULT 0,
  registros_criados INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  registros_com_erro INTEGER DEFAULT 0,
  erros JSONB, -- Array de erros detalhados
  payload_inicial JSONB, -- Payload recebido (para debug)
  iniciado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_importacao_logs_empresa ON importacao_logs(empresa_id);
CREATE INDEX idx_importacao_logs_admin ON importacao_logs(admin_id);
CREATE INDEX idx_importacao_logs_status ON importacao_logs(status);
CREATE INDEX idx_importacao_logs_iniciado ON importacao_logs(iniciado_em DESC);

-- =====================================================================
-- supabase/migrations/007_auth_user_id_nullable.sql
-- =====================================================================
-- Tornar auth_user_id nullable em responsaveis
-- Isso permite criar responsáveis na importação antes de terem usuário no auth
ALTER TABLE responsaveis 
  ALTER COLUMN auth_user_id DROP NOT NULL;

-- Remover constraint UNIQUE de auth_user_id (já que pode ser NULL)
-- Mas manter UNIQUE apenas para valores não-nulos
ALTER TABLE responsaveis 
  DROP CONSTRAINT IF EXISTS responsaveis_auth_user_id_key;

-- Criar constraint UNIQUE parcial (apenas para valores não-nulos)
CREATE UNIQUE INDEX IF NOT EXISTS responsaveis_auth_user_id_unique 
  ON responsaveis(auth_user_id) 
  WHERE auth_user_id IS NOT NULL;

-- =====================================================================
-- supabase/migrations/008_responsaveis_ativo.sql
-- =====================================================================
-- Adicionar campo ativo em responsaveis
ALTER TABLE responsaveis 
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Criar índice para busca por email e status ativo
CREATE INDEX IF NOT EXISTS idx_responsaveis_email_financeiro_ativo 
  ON responsaveis(email_financeiro) WHERE ativo = TRUE AND email_financeiro IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_responsaveis_email_pedagogico_ativo 
  ON responsaveis(email_pedagogico) WHERE ativo = TRUE AND email_pedagogico IS NOT NULL;

-- =====================================================================
-- supabase/migrations/009_configuracoes_smtp.sql
-- =====================================================================
-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  descricao TEXT,
  tipo TEXT DEFAULT 'TEXTO', -- 'TEXTO', 'JSON', 'BOOLEAN', 'NUMERO'
  sensivel BOOLEAN DEFAULT FALSE, -- Se true, não mostrar valor na listagem
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_configuracoes_chave ON configuracoes(chave);

-- Inserir configurações SMTP padrão (vazias)
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('smtp_enabled', 'false', 'Habilitar SMTP customizado', 'BOOLEAN', false),
  ('smtp_host', '', 'Servidor SMTP (ex: smtp.gmail.com)', 'TEXTO', false),
  ('smtp_port', '587', 'Porta SMTP (ex: 587 ou 465)', 'NUMERO', false),
  ('smtp_user', '', 'Email/usuário SMTP', 'TEXTO', true),
  ('smtp_password', '', 'Senha SMTP (App Password)', 'TEXTO', true),
  ('smtp_sender_email', '', 'Email remetente', 'TEXTO', false),
  ('smtp_sender_name', '', 'Nome do remetente', 'TEXTO', false)
ON CONFLICT (chave) DO NOTHING;

-- RLS para configurações (apenas admins podem ver/editar)
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Política: admins podem ver todas as configurações
CREATE POLICY "Admins podem ver configurações"
  ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem atualizar configurações
CREATE POLICY "Admins podem atualizar configurações"
  ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem inserir configurações
CREATE POLICY "Admins podem inserir configurações"
  ON configuracoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- =====================================================================
-- supabase/migrations/010_rls_admin_alunos.sql
-- =====================================================================
-- Política RLS para admins verem todos os alunos
CREATE POLICY "Admins podem ver todos os alunos"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os responsáveis
CREATE POLICY "Admins podem ver todos os responsáveis"
  ON responsaveis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os vínculos responsável-aluno
CREATE POLICY "Admins podem ver todos os vínculos responsável-aluno"
  ON responsavel_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as turmas
CREATE POLICY "Admins podem ver todas as turmas"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- =====================================================================
-- supabase/migrations/011_rls_admin_empresas_turmas.sql
-- =====================================================================
-- Política RLS para admins verem todas as empresas
CREATE POLICY "Admins podem ver todas as empresas"
  ON empresas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem empresas
CREATE POLICY "Admins podem gerenciar empresas"
  ON empresas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as unidades
CREATE POLICY "Admins podem ver todas as unidades"
  ON unidades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem unidades
CREATE POLICY "Admins podem gerenciar unidades"
  ON unidades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem turmas (já existe ver, adicionar gerenciar)
CREATE POLICY "Admins podem gerenciar turmas"
  ON turmas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os admins
CREATE POLICY "Admins podem ver todos os admins"
  ON admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem admins
CREATE POLICY "Admins podem gerenciar admins"
  ON admins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- =====================================================================
-- supabase/migrations/012_unificar_usuarios.sql
-- =====================================================================
-- Migration para unificar responsaveis e admins em uma única tabela usuarios

-- 1. Adicionar campos de admin na tabela responsaveis ANTES de renomear
ALTER TABLE responsaveis 
  ADD COLUMN IF NOT EXISTS eh_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nome TEXT;

-- 2. Migrar dados de admins para responsaveis (antes de renomear)
-- Primeiro, inserir admins que não existem em responsaveis
INSERT INTO responsaveis (
  auth_user_id,
  nome,
  eh_admin,
  empresa_id,
  unidade_id,
  ativo,
  tipo,
  created_at,
  updated_at
)
SELECT 
  a.auth_user_id,
  a.nome,
  TRUE as eh_admin,
  a.empresa_id,
  a.unidade_id,
  a.ativo,
  'AMBOS'::responsavel_tipo as tipo,
  a.created_at,
  a.updated_at
FROM admins a
WHERE NOT EXISTS (
  SELECT 1 FROM responsaveis r WHERE r.auth_user_id = a.auth_user_id
);

-- Depois, atualizar responsaveis existentes que também são admins
UPDATE responsaveis r
SET 
  eh_admin = TRUE,
  nome = COALESCE(a.nome, r.nome_financeiro, r.nome_pedagogico),
  empresa_id = COALESCE(a.empresa_id, r.empresa_id),
  unidade_id = COALESCE(a.unidade_id, r.unidade_id),
  ativo = COALESCE(a.ativo, r.ativo),
  updated_at = NOW()
FROM admins a
WHERE r.auth_user_id = a.auth_user_id;

-- 3. Atualizar nome dos responsáveis existentes (se não tiver nome)
UPDATE responsaveis 
SET nome = COALESCE(nome_financeiro, nome_pedagogico, 'Usuário')
WHERE nome IS NULL;

-- 4. Renomear tabela responsaveis para usuarios
ALTER TABLE responsaveis RENAME TO usuarios;

-- 5. Renomear tabela responsavel_aluno para usuario_aluno
ALTER TABLE responsavel_aluno RENAME TO usuario_aluno;
ALTER TABLE usuario_aluno RENAME COLUMN responsavel_id TO usuario_id;

-- 6. Atualizar foreign keys em outras tabelas
-- Pedidos
ALTER TABLE pedidos RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_responsavel_id_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Endereços
ALTER TABLE enderecos RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE enderecos DROP CONSTRAINT IF EXISTS enderecos_responsavel_id_fkey;
ALTER TABLE enderecos ADD CONSTRAINT enderecos_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Audit logs
ALTER TABLE audit_logs RENAME COLUMN responsavel_id TO usuario_id;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_responsavel_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- Importação logs
ALTER TABLE importacao_logs RENAME COLUMN admin_id TO usuario_id;
ALTER TABLE importacao_logs DROP CONSTRAINT IF EXISTS importacao_logs_admin_id_fkey;
ALTER TABLE importacao_logs ADD CONSTRAINT importacao_logs_usuario_id_fkey 
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

-- 7. Atualizar constraint de enderecos para usar usuario_id
ALTER TABLE enderecos DROP CONSTRAINT IF EXISTS enderecos_check;
ALTER TABLE enderecos ADD CONSTRAINT enderecos_check CHECK (
  (usuario_id IS NOT NULL AND aluno_id IS NULL) OR
  (usuario_id IS NULL AND aluno_id IS NOT NULL)
);

-- 8. Criar índices
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_eh_admin ON usuarios(eh_admin) WHERE eh_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios(ativo) WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_usuarios_email_financeiro_ativo ON usuarios(email_financeiro) WHERE ativo = TRUE AND email_financeiro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_email_pedagogico_ativo ON usuarios(email_pedagogico) WHERE ativo = TRUE AND email_pedagogico IS NOT NULL;

-- 9. Comentários
COMMENT ON COLUMN usuarios.eh_admin IS 'Indica se o usuário é administrador';
COMMENT ON COLUMN usuarios.empresa_id IS 'Empresa do usuário (opcional, usado principalmente para admins)';
COMMENT ON COLUMN usuarios.unidade_id IS 'Unidade do usuário (opcional, usado principalmente para admins)';
COMMENT ON COLUMN usuarios.nome IS 'Nome do usuário (usado para admins e como fallback para responsáveis)';

-- =====================================================================
-- supabase/migrations/013_rls_usuarios_unificado.sql
-- =====================================================================
-- Atualizar RLS policies para usar usuarios ao invés de responsaveis e admins

-- Remover políticas antigas
DROP POLICY IF EXISTS "Responsáveis veem apenas seus próprios dados" ON usuarios;
DROP POLICY IF EXISTS "Admins podem ver todos os responsáveis" ON usuarios;
DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON usuarios;

-- RLS: Usuários veem apenas seus próprios dados (se não for admin)
CREATE POLICY "Usuários veem apenas seus próprios dados"
  ON usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id AND eh_admin = FALSE
  );

-- RLS: Admins veem todos os usuários
CREATE POLICY "Admins veem todos os usuários"
  ON usuarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- RLS: Admins podem gerenciar usuários
CREATE POLICY "Admins podem gerenciar usuários"
  ON usuarios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de usuario_aluno (antigo responsavel_aluno)
DROP POLICY IF EXISTS "Responsáveis veem apenas seus vínculos com alunos" ON usuario_aluno;
DROP POLICY IF EXISTS "Admins podem ver todos os vínculos responsável-aluno" ON usuario_aluno;

CREATE POLICY "Usuários veem apenas seus vínculos com alunos"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os vínculos usuario-aluno"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de alunos
DROP POLICY IF EXISTS "Responsáveis veem apenas alunos vinculados" ON alunos;
DROP POLICY IF EXISTS "Admins podem ver todos os alunos" ON alunos;

CREATE POLICY "Usuários veem apenas alunos vinculados"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os alunos"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de pedidos
DROP POLICY IF EXISTS "Responsáveis veem apenas seus pedidos" ON pedidos;
DROP POLICY IF EXISTS "Responsáveis criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários veem apenas seus pedidos"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = pedidos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Usuários criam pedidos para seus alunos"
  ON pedidos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = pedidos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = pedidos.aluno_id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins veem todos os pedidos"
  ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de endereços
DROP POLICY IF EXISTS "Responsáveis veem seus endereços" ON enderecos;

CREATE POLICY "Usuários veem seus endereços"
  ON enderecos FOR SELECT
  USING (
    usuario_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = enderecos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todos os endereços"
  ON enderecos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de turmas
DROP POLICY IF EXISTS "Responsáveis veem turmas de seus alunos" ON turmas;
DROP POLICY IF EXISTS "Admins podem ver todas as turmas" ON turmas;

CREATE POLICY "Usuários veem turmas de seus alunos"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM alunos
      JOIN usuario_aluno ON usuario_aluno.aluno_id = alunos.id
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE alunos.turma_id = turmas.id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

CREATE POLICY "Admins veem todas as turmas"
  ON turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Atualizar políticas de pagamentos, notas fiscais, etc (usando usuario_id indiretamente via pedidos)
-- Essas já devem funcionar via pedidos, mas vamos garantir

-- Atualizar políticas de audit_logs
DROP POLICY IF EXISTS "Admins veem audit logs" ON audit_logs;

CREATE POLICY "Admins veem audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/014_super_admin_permissions.sql
-- =====================================================================
-- Adicionar campo super_admin na tabela usuarios
ALTER TABLE usuarios 
  ADD COLUMN IF NOT EXISTS super_admin BOOLEAN DEFAULT FALSE;

-- Criar índice para super_admin
CREATE INDEX IF NOT EXISTS idx_usuarios_super_admin ON usuarios(super_admin) WHERE super_admin = TRUE;

-- Atualizar usuário específico como super admin
UPDATE usuarios
SET 
  eh_admin = TRUE,
  super_admin = TRUE,
  ativo = TRUE
WHERE email_financeiro = 'denis.souza@morumbisul.com.br'
   OR email_pedagogico = 'denis.souza@morumbisul.com.br';

-- Se não encontrou por email na tabela usuarios, buscar no auth.users e atualizar
DO $$
DECLARE
  auth_user_id_var UUID;
BEGIN
  -- Buscar auth_user_id pelo email
  SELECT id INTO auth_user_id_var
  FROM auth.users
  WHERE email = 'denis.souza@morumbisul.com.br'
  LIMIT 1;

  IF auth_user_id_var IS NOT NULL THEN
    -- Atualizar registro existente em usuarios
    UPDATE usuarios
    SET 
      eh_admin = TRUE,
      super_admin = TRUE,
      ativo = TRUE,
      email_financeiro = COALESCE(usuarios.email_financeiro, 'denis.souza@morumbisul.com.br'),
      nome = COALESCE(usuarios.nome, 'Denis Souza')
    WHERE auth_user_id = auth_user_id_var;
  END IF;
END $$;

-- Comentário
COMMENT ON COLUMN usuarios.super_admin IS 'Indica se o usuário é super administrador com permissões totais';

-- =====================================================================
-- supabase/migrations/015_configuracoes_aparencia.sql
-- =====================================================================
-- Adicionar configurações de aparência
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('loja_nome', '', 'Nome da loja (exibido no header e emails)', 'TEXTO', false),
  ('loja_logo_url', '', 'URL do logo da loja', 'TEXTO', false),
  ('loja_favicon_url', '', 'URL do favicon da loja', 'TEXTO', false)
ON CONFLICT (chave) DO NOTHING;

-- Atualizar políticas RLS de configuracoes para usar usuarios ao invés de admins
DROP POLICY IF EXISTS "Admins podem ver configurações" ON configuracoes;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON configuracoes;
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON configuracoes;

-- Política: admins podem ver todas as configurações
CREATE POLICY "Admins podem ver configurações"
  ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem atualizar configurações
CREATE POLICY "Admins podem atualizar configurações"
  ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem inserir configurações
CREATE POLICY "Admins podem inserir configurações"
  ON configuracoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/016_fix_rls_usuario_aluno_admin.sql
-- =====================================================================
-- Corrigir RLS para permitir que admins vejam seus próprios vínculos com alunos
-- Quando um admin acessa a loja, ele precisa ver seus próprios filhos

-- Remover política antiga que bloqueava admins
DROP POLICY IF EXISTS "Usuários veem apenas seus vínculos com alunos" ON usuario_aluno;

-- Criar nova política que permite qualquer usuário (admin ou não) ver seus próprios vínculos
CREATE POLICY "Usuários veem seus próprios vínculos com alunos"
  ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

-- A política de admins verem todos os vínculos continua existindo para o painel admin
-- Mas agora admins também podem ver seus próprios vínculos através da política acima

-- Corrigir também a política de alunos para permitir que admins vejam seus próprios filhos
DROP POLICY IF EXISTS "Usuários veem apenas alunos vinculados" ON alunos;

CREATE POLICY "Usuários veem seus próprios alunos vinculados"
  ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
    )
  );

-- =====================================================================
-- supabase/migrations/017_adicionar_segmentos_efaf_efai.sql
-- =====================================================================
-- Adicionar novos tipos de segmento: EFAF e EFAI
-- EFAF = Ensino Fundamental Anos Finais
-- EFAI = Ensino Fundamental Anos Iniciais

-- Adicionar novos valores ao enum
ALTER TYPE segmento_tipo ADD VALUE IF NOT EXISTS 'EFAF';
ALTER TYPE segmento_tipo ADD VALUE IF NOT EXISTS 'EFAI';

-- =====================================================================
-- supabase/migrations/018_rls_kits_itens.sql
-- =====================================================================
-- RLS: Permitir que admins gerenciem itens de kits

ALTER TABLE kits_itens ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: Responsáveis veem itens de kits de produtos disponíveis (já existe)
-- Vamos manter a política existente e adicionar políticas para admins

-- Política para admins: podem fazer tudo com kits_itens
CREATE POLICY "Admins podem gerenciar kits_itens"
  ON kits_itens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN usuarios ON usuarios.auth_user_id = auth.uid()
      WHERE produtos.id = kits_itens.kit_produto_id
      AND usuarios.eh_admin = true
      AND usuarios.ativo = true
      AND (usuarios.empresa_id = produtos.empresa_id OR usuarios.empresa_id IS NULL OR usuarios.super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM produtos
      JOIN usuarios ON usuarios.auth_user_id = auth.uid()
      WHERE produtos.id = kits_itens.kit_produto_id
      AND usuarios.eh_admin = true
      AND usuarios.ativo = true
      AND (usuarios.empresa_id = produtos.empresa_id OR usuarios.empresa_id IS NULL OR usuarios.super_admin = true)
    )
  );

-- =====================================================================
-- supabase/migrations/019_campos_fiscais_produtos.sql
-- =====================================================================
-- Adicionar campos fiscais para emissão de NF-e

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ncm TEXT, -- Código NCM (obrigatório para NF-e)
  ADD COLUMN IF NOT EXISTS cfop TEXT, -- Código Fiscal de Operações (obrigatório para NF-e, padrão: 5102)
  ADD COLUMN IF NOT EXISTS unidade_comercial TEXT DEFAULT 'UN', -- Unidade de medida (obrigatório para NF-e, padrão: UN)
  ADD COLUMN IF NOT EXISTS cst_icms TEXT, -- Código de Situação Tributária do ICMS (Regime Normal)
  ADD COLUMN IF NOT EXISTS csosn TEXT, -- Código de Situação da Operação no Simples Nacional
  ADD COLUMN IF NOT EXISTS icms_origem TEXT DEFAULT '0', -- Origem da mercadoria (0 = Nacional)
  ADD COLUMN IF NOT EXISTS aliq_icms DECIMAL(5,2) DEFAULT 0, -- Alíquota do ICMS (%)
  ADD COLUMN IF NOT EXISTS cst_pis TEXT, -- Código de Situação Tributária do PIS
  ADD COLUMN IF NOT EXISTS aliq_pis DECIMAL(5,2) DEFAULT 0, -- Alíquota do PIS (%)
  ADD COLUMN IF NOT EXISTS cst_cofins TEXT, -- Código de Situação Tributária do COFINS
  ADD COLUMN IF NOT EXISTS aliq_cofins DECIMAL(5,2) DEFAULT 0, -- Alíquota do COFINS (%)
  ADD COLUMN IF NOT EXISTS cbenef TEXT; -- Código de Benefício Fiscal (obrigatório para algumas situações)

-- Comentários para documentação
COMMENT ON COLUMN produtos.ncm IS 'Código NCM - Classificação fiscal do produto (obrigatório para NF-e)';
COMMENT ON COLUMN produtos.cfop IS 'Código Fiscal de Operações - Padrão: 5102 (venda no mesmo estado)';
COMMENT ON COLUMN produtos.unidade_comercial IS 'Unidade de medida para NFe - Padrão: UN';
COMMENT ON COLUMN produtos.cst_icms IS 'Código de Situação Tributária do ICMS (Regime Normal)';
COMMENT ON COLUMN produtos.csosn IS 'Código de Situação da Operação no Simples Nacional';
COMMENT ON COLUMN produtos.icms_origem IS 'Origem da mercadoria (0 = Nacional, 1 = Estrangeira, etc.)';
COMMENT ON COLUMN produtos.aliq_icms IS 'Alíquota do ICMS (%)';
COMMENT ON COLUMN produtos.cst_pis IS 'Código de Situação Tributária do PIS';
COMMENT ON COLUMN produtos.aliq_pis IS 'Alíquota do PIS (%)';
COMMENT ON COLUMN produtos.cst_cofins IS 'Código de Situação Tributária do COFINS';
COMMENT ON COLUMN produtos.aliq_cofins IS 'Alíquota do COFINS (%)';
COMMENT ON COLUMN produtos.cbenef IS 'Código de Benefício Fiscal - Obrigatório quando ICMS situação tributária for 400, 40 ou 41';

-- =====================================================================
-- supabase/migrations/020_fix_rls_usuarios_recursion.sql
-- =====================================================================
-- Fix: recursão infinita nas políticas de usuarios
-- Solução: tabela auxiliar usuario_admin_cache (usuário só lê sua própria linha)

-- 1. Criar tabela de cache (sem FK para evitar dependência circular)
CREATE TABLE IF NOT EXISTS public.usuario_admin_cache (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. Habilitar RLS - usuário só pode ler sua própria linha
ALTER TABLE public.usuario_admin_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio status admin"
  ON public.usuario_admin_cache FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 3. Popular a tabela a partir de usuarios
INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
SELECT auth_user_id, COALESCE(eh_admin, false)
FROM public.usuarios
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

-- 4. Trigger para manter sincronizado
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    RETURN OLD;
  END IF;
  
  INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
  VALUES (
    COALESCE(NEW.auth_user_id, OLD.auth_user_id),
    COALESCE(NEW.eh_admin, false)
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_usuario_admin_cache ON public.usuarios;
CREATE TRIGGER trg_sync_usuario_admin_cache
  AFTER INSERT OR UPDATE OF auth_user_id, eh_admin OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_usuario_admin_cache();

-- 5. Remover políticas antigas de usuarios que causam recursão
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;

-- 6. Criar novas políticas que usam a tabela de cache (sem recursão)
CREATE POLICY "Admins veem todos os usuários"
  ON public.usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Admins podem gerenciar usuários"
  ON public.usuarios FOR ALL
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/021_storage_buckets_imagens.sql
-- =====================================================================
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

-- =====================================================================
-- supabase/migrations/022_storage_buckets_criar.sql
-- =====================================================================
-- Criar buckets produtos e loja
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('produtos', 'produtos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'image/x-icon']),
  ('loja', 'loja', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'image/x-icon'])
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- supabase/migrations/023_storage_eh_admin_func.sql
-- =====================================================================
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

-- =====================================================================
-- supabase/migrations/024_produto_tipos_kit_festa_lanche.sql
-- =====================================================================
-- Adicionar novos valores ao enum produto_tipo
ALTER TYPE produto_tipo ADD VALUE IF NOT EXISTS 'KIT_FESTA';
ALTER TYPE produto_tipo ADD VALUE IF NOT EXISTS 'KIT_LANCHE';

-- Coluna tipo_kit: MENSAL ou AVULSO (apenas para tipo KIT_LANCHE)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS tipo_kit TEXT CHECK (tipo_kit IS NULL OR tipo_kit IN ('MENSAL', 'AVULSO'));

-- =====================================================================
-- supabase/migrations/025_perfis_permissoes.sql
-- =====================================================================
-- Perfis de acesso: define quais páginas/funcionalidades cada perfil pode acessar
CREATE TABLE IF NOT EXISTS public.perfis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.perfis IS 'Perfis de acesso ao painel admin; cada perfil define quais páginas o usuário pode acessar';

-- Permissões por perfil: um registro por (perfil, recurso). recurso = identificador da página (ex: admin.pedidos, admin.produtos)
CREATE TABLE IF NOT EXISTS public.perfil_permissoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  recurso TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, recurso)
);

CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_perfil ON public.perfil_permissoes(perfil_id);
CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_recurso ON public.perfil_permissoes(recurso);

COMMENT ON TABLE public.perfil_permissoes IS 'Lista de recursos (páginas) que cada perfil pode acessar';
COMMENT ON COLUMN public.perfil_permissoes.recurso IS 'Identificador da página/funcionalidade, ex: admin, admin.pedidos, admin.produtos';

-- Vincular usuário ao perfil (apenas para admins; se null, eh_admin com perfil null = acesso total legado)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS perfil_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON public.usuarios(perfil_id);
COMMENT ON COLUMN public.usuarios.perfil_id IS 'Perfil de acesso ao admin; se null e eh_admin=true, acesso total (legado ou super_admin)';

-- RLS: perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver perfis"
  ON public.perfis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Super admins podem inserir/atualizar/deletar perfis"
  ON public.perfis FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  );

-- RLS: perfil_permissoes
ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver perfil_permissoes"
  ON public.perfil_permissoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

CREATE POLICY "Super admins podem gerenciar perfil_permissoes"
  ON public.perfil_permissoes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true AND u.super_admin = true
    )
  );

-- Perfil padrão "Acesso total" (opcional: para atribuir a quem não usa perfil por recurso)
INSERT INTO public.perfis (id, nome, descricao, ativo)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Acesso total',
  'Acesso a todas as páginas do painel administrativo',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Inserir todos os recursos para o perfil "Acesso total" (usando o id fixo)
INSERT INTO public.perfil_permissoes (perfil_id, recurso)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, unnest(ARRAY[
  'admin', 'admin.pedidos', 'admin.produtos', 'admin.alunos', 'admin.empresas',
  'admin.turmas', 'admin.usuarios', 'admin.perfis', 'admin.importacao', 'admin.configuracoes'
])
ON CONFLICT (perfil_id, recurso) DO NOTHING;

-- =====================================================================
-- supabase/migrations/026_cantina_escolar_schema.sql
-- =====================================================================
-- Cantina escolar: papéis, saldo aluno, caixa, data retirada, limites e bloqueios

-- 1. Papéis do usuário (qual interface pode acessar)
CREATE TYPE papel_usuario AS ENUM ('RESPONSAVEL', 'ADMIN', 'OPERADOR', 'COLABORADOR', 'FINANCEIRO');

CREATE TABLE IF NOT EXISTS usuario_papeis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel papel_usuario NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_usuario_papeis_usuario ON usuario_papeis(usuario_id);

COMMENT ON TABLE usuario_papeis IS 'Papéis que o usuário pode assumir (escolhe um após login)';

-- 2. Saldo por aluno
CREATE TABLE IF NOT EXISTS aluno_saldos (
  aluno_id UUID PRIMARY KEY REFERENCES alunos(id) ON DELETE CASCADE,
  saldo DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Movimentações de saldo (recarga, compra, estorno)
CREATE TYPE movimento_saldo_tipo AS ENUM ('RECARGA', 'COMPRA', 'ESTORNO', 'DESCONTO', 'RECARGA_PRESENCIAL');

CREATE TABLE IF NOT EXISTS aluno_movimentacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  tipo movimento_saldo_tipo NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  caixa_id UUID NULL,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_aluno ON aluno_movimentacoes(aluno_id);
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_created ON aluno_movimentacoes(created_at);

-- 4. Configuração responsável x aluno (limite diário)
CREATE TABLE IF NOT EXISTS aluno_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  limite_gasto_diario DECIMAL(10,2) NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS idx_aluno_config_aluno ON aluno_config(aluno_id);

-- 5. Produtos bloqueados pelo responsável para o aluno
CREATE TABLE IF NOT EXISTS aluno_produto_bloqueado (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, aluno_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_aluno_produto_bloqueado_aluno ON aluno_produto_bloqueado(aluno_id);

-- 6. Caixa (PDV)
CREATE TYPE caixa_status AS ENUM ('ABERTO', 'FECHADO');

CREATE TABLE IF NOT EXISTS caixas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  operador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  aberto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fechado_em TIMESTAMPTZ,
  fundo_troco DECIMAL(12,2) NOT NULL DEFAULT 0,
  status caixa_status NOT NULL DEFAULT 'ABERTO'
);

CREATE INDEX IF NOT EXISTS idx_caixas_operador ON caixas(operador_id);
CREATE INDEX IF NOT EXISTS idx_caixas_aberto_em ON caixas(aberto_em);

-- 7. Pedidos: data retirada, origem, caixa, tipo beneficiário
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_retirada DATE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'ONLINE';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS caixa_id UUID REFERENCES caixas(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_beneficiario TEXT DEFAULT 'ALUNO';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS colaborador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- 8. Pagamento: métodos DINHEIRO e SALDO
ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'DINHEIRO';
ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'SALDO';

-- 9. FK caixa em movimentações
ALTER TABLE aluno_movimentacoes
  DROP CONSTRAINT IF EXISTS aluno_movimentacoes_caixa_id_fkey;
ALTER TABLE aluno_movimentacoes
  ADD CONSTRAINT aluno_movimentacoes_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES caixas(id) ON DELETE SET NULL;

-- =====================================================================
-- supabase/migrations/027_cantina_escolar_rls_e_consumo.sql
-- =====================================================================
-- RLS e tabelas adicionais cantina

-- Consumo mensal colaborador (para financeiro apurar e abater)
CREATE TABLE IF NOT EXISTS consumo_colaborador_mensal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  valor_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_abatido DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, empresa_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_consumo_colaborador_usuario ON consumo_colaborador_mensal(usuario_id);

-- RLS: usuario_papeis
ALTER TABLE usuario_papeis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve seus proprios papeis"
  ON usuario_papeis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = usuario_papeis.usuario_id AND u.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins veem todos usuario_papeis"
  ON usuario_papeis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

CREATE POLICY "Admins gerenciam usuario_papeis"
  ON usuario_papeis FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_saldos
ALTER TABLE aluno_saldos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem aluno_saldos"
  ON aluno_saldos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

CREATE POLICY "Responsaveis veem saldo dos seus alunos"
  ON aluno_saldos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno ua
      JOIN usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = aluno_saldos.aluno_id
    )
  );

CREATE POLICY "Admins atualizam aluno_saldos"
  ON aluno_saldos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_movimentacoes
ALTER TABLE aluno_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem aluno_movimentacoes"
  ON aluno_movimentacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

CREATE POLICY "Responsaveis veem movimentacoes dos seus alunos"
  ON aluno_movimentacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno ua
      JOIN usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = aluno_movimentacoes.aluno_id
    )
  );

CREATE POLICY "Admins inserem aluno_movimentacoes"
  ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_config
ALTER TABLE aluno_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsavel ve e gerencia seu aluno_config"
  ON aluno_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = aluno_config.usuario_id AND u.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = aluno_config.usuario_id AND u.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins veem aluno_config"
  ON aluno_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_produto_bloqueado
ALTER TABLE aluno_produto_bloqueado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responsavel ve e gerencia bloqueios"
  ON aluno_produto_bloqueado FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = aluno_produto_bloqueado.usuario_id AND u.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = aluno_produto_bloqueado.usuario_id AND u.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins veem aluno_produto_bloqueado"
  ON aluno_produto_bloqueado FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: caixas
ALTER TABLE caixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operador ve seus caixas"
  ON caixas FOR SELECT
  USING (operador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid()));

CREATE POLICY "Admins veem todos caixas"
  ON caixas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

CREATE POLICY "Operador ou admin abre fecha caixa"
  ON caixas FOR ALL
  USING (
    operador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    operador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: consumo_colaborador_mensal
ALTER TABLE consumo_colaborador_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador ve proprio consumo"
  ON consumo_colaborador_mensal FOR SELECT
  USING (
    usuario_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Financeiro admin veem e gerenciam consumo"
  ON consumo_colaborador_mensal FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/028_cantina_operador_movimentacoes_saldos.sql
