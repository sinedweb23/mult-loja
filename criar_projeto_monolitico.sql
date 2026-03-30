-- criar_projeto_monolitico.sql
-- Gerado automaticamente a partir de criar_projeto.sql
-- Este arquivo NAO usa comandos do psql (sem \i).
-- Pode ser executado no SQL Editor do Supabase.

BEGIN;

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

DROP POLICY IF EXISTS "Responsáveis veem apenas seus próprios dados" ON responsaveis;

CREATE POLICY "Responsáveis veem apenas seus próprios dados" ON responsaveis FOR SELECT
  USING (auth.uid() = auth_user_id);

-- RLS: Responsáveis só veem alunos vinculados
ALTER TABLE responsavel_aluno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsáveis veem apenas seus vínculos com alunos" ON responsavel_aluno;

CREATE POLICY "Responsáveis veem apenas seus vínculos com alunos" ON responsavel_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = responsavel_aluno.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

-- RLS: Responsáveis só veem alunos vinculados
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsáveis veem apenas alunos vinculados" ON alunos;

CREATE POLICY "Responsáveis veem apenas alunos vinculados" ON alunos FOR SELECT
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

DROP POLICY IF EXISTS "Responsáveis veem produtos ativos" ON produtos;

CREATE POLICY "Responsáveis veem produtos ativos" ON produtos FOR SELECT
  USING (ativo = TRUE);

-- RLS: Disponibilidade de produtos
ALTER TABLE produto_disponibilidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsáveis veem disponibilidade de produtos" ON produto_disponibilidade;

CREATE POLICY "Responsáveis veem disponibilidade de produtos" ON produto_disponibilidade FOR SELECT
  USING (TRUE);

-- RLS: Pedidos - responsáveis só veem seus próprios pedidos
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsáveis veem apenas seus pedidos" ON pedidos;

CREATE POLICY "Responsáveis veem apenas seus pedidos" ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM responsaveis
      WHERE responsaveis.id = pedidos.responsavel_id
      AND responsaveis.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Responsáveis criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Responsáveis criam pedidos para seus alunos" ON pedidos FOR INSERT
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

DROP POLICY IF EXISTS "Responsáveis veem itens de seus pedidos" ON pedido_itens;

CREATE POLICY "Responsáveis veem itens de seus pedidos" ON pedido_itens FOR SELECT
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

DROP POLICY IF EXISTS "Responsáveis veem pagamentos de seus pedidos" ON pagamentos;

CREATE POLICY "Responsáveis veem pagamentos de seus pedidos" ON pagamentos FOR SELECT
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

DROP POLICY IF EXISTS "Responsáveis veem notas de seus pedidos" ON notas_fiscais;

CREATE POLICY "Responsáveis veem notas de seus pedidos" ON notas_fiscais FOR SELECT
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

DROP POLICY IF EXISTS "Responsáveis veem seus endereços" ON enderecos;

CREATE POLICY "Responsáveis veem seus endereços" ON enderecos FOR SELECT
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

DROP POLICY IF EXISTS "Responsáveis veem turmas de seus alunos" ON turmas;

CREATE POLICY "Responsáveis veem turmas de seus alunos" ON turmas FOR SELECT
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

DROP POLICY IF EXISTS "Todos veem empresas" ON empresas;

CREATE POLICY "Todos veem empresas" ON empresas FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Todos veem unidades" ON unidades;

CREATE POLICY "Todos veem unidades" ON unidades FOR SELECT
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
DROP POLICY IF EXISTS "Admins podem gerenciar produtos" ON produtos;
CREATE POLICY "Admins podem gerenciar produtos" ON produtos FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar categorias" ON categorias;

CREATE POLICY "Admins podem gerenciar categorias" ON categorias FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar grupos_produtos" ON grupos_produtos;

CREATE POLICY "Admins podem gerenciar grupos_produtos" ON grupos_produtos FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar variacoes" ON variacoes;

CREATE POLICY "Admins podem gerenciar variacoes" ON variacoes FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar variacao_valores" ON variacao_valores;

CREATE POLICY "Admins podem gerenciar variacao_valores" ON variacao_valores FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar grupos_opcionais" ON grupos_opcionais;

CREATE POLICY "Admins podem gerenciar grupos_opcionais" ON grupos_opcionais FOR ALL
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

DROP POLICY IF EXISTS "Admins podem gerenciar opcionais" ON opcionais;

CREATE POLICY "Admins podem gerenciar opcionais" ON opcionais FOR ALL
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
DROP POLICY IF EXISTS "Admins podem gerenciar disponibilidade" ON produto_disponibilidade;
CREATE POLICY "Admins podem gerenciar disponibilidade" ON produto_disponibilidade FOR ALL
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
DROP POLICY IF EXISTS "Admins podem ver configurações" ON configuracoes;
CREATE POLICY "Admins podem ver configurações" ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem atualizar configurações
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON configuracoes;
CREATE POLICY "Admins podem atualizar configurações" ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política: admins podem inserir configurações
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON configuracoes;
CREATE POLICY "Admins podem inserir configurações" ON configuracoes FOR INSERT
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
DROP POLICY IF EXISTS "Admins podem ver todos os alunos" ON alunos;
CREATE POLICY "Admins podem ver todos os alunos" ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os responsáveis
DROP POLICY IF EXISTS "Admins podem ver todos os responsáveis" ON responsaveis;
CREATE POLICY "Admins podem ver todos os responsáveis" ON responsaveis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os vínculos responsável-aluno
DROP POLICY IF EXISTS "Admins podem ver todos os vínculos responsável-aluno" ON responsavel_aluno;
CREATE POLICY "Admins podem ver todos os vínculos responsável-aluno" ON responsavel_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as turmas
DROP POLICY IF EXISTS "Admins podem ver todas as turmas" ON turmas;
CREATE POLICY "Admins podem ver todas as turmas" ON turmas FOR SELECT
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
DROP POLICY IF EXISTS "Admins podem ver todas as empresas" ON empresas;
CREATE POLICY "Admins podem ver todas as empresas" ON empresas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem empresas
DROP POLICY IF EXISTS "Admins podem gerenciar empresas" ON empresas;
CREATE POLICY "Admins podem gerenciar empresas" ON empresas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todas as unidades
DROP POLICY IF EXISTS "Admins podem ver todas as unidades" ON unidades;
CREATE POLICY "Admins podem ver todas as unidades" ON unidades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem unidades
DROP POLICY IF EXISTS "Admins podem gerenciar unidades" ON unidades;
CREATE POLICY "Admins podem gerenciar unidades" ON unidades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem turmas (já existe ver, adicionar gerenciar)
DROP POLICY IF EXISTS "Admins podem gerenciar turmas" ON turmas;
CREATE POLICY "Admins podem gerenciar turmas" ON turmas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins verem todos os admins
DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON admins;
CREATE POLICY "Admins podem ver todos os admins" ON admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.auth_user_id = auth.uid()
      AND admins.ativo = true
    )
  );

-- Política RLS para admins gerenciarem admins
DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON admins;
CREATE POLICY "Admins podem gerenciar admins" ON admins FOR ALL
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
DROP POLICY IF EXISTS "Usuários veem apenas seus próprios dados" ON usuarios;
CREATE POLICY "Usuários veem apenas seus próprios dados" ON usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id AND eh_admin = FALSE
  );

-- RLS: Admins veem todos os usuários
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON usuarios;
CREATE POLICY "Admins veem todos os usuários" ON usuarios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- RLS: Admins podem gerenciar usuários
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON usuarios;
CREATE POLICY "Admins podem gerenciar usuários" ON usuarios FOR ALL
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

DROP POLICY IF EXISTS "Usuários veem apenas seus vínculos com alunos" ON usuario_aluno;

CREATE POLICY "Usuários veem apenas seus vínculos com alunos" ON usuario_aluno FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = usuario_aluno.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins veem todos os vínculos usuario-aluno" ON usuario_aluno;

CREATE POLICY "Admins veem todos os vínculos usuario-aluno" ON usuario_aluno FOR SELECT
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

DROP POLICY IF EXISTS "Usuários veem apenas alunos vinculados" ON alunos;

CREATE POLICY "Usuários veem apenas alunos vinculados" ON alunos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno
      JOIN usuarios ON usuarios.id = usuario_aluno.usuario_id
      WHERE usuario_aluno.aluno_id = alunos.id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins veem todos os alunos" ON alunos;

CREATE POLICY "Admins veem todos os alunos" ON alunos FOR SELECT
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

DROP POLICY IF EXISTS "Usuários veem apenas seus pedidos" ON pedidos;

CREATE POLICY "Usuários veem apenas seus pedidos" ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = pedidos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários criam pedidos para seus alunos" ON pedidos FOR INSERT
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

DROP POLICY IF EXISTS "Admins veem todos os pedidos" ON pedidos;

CREATE POLICY "Admins veem todos os pedidos" ON pedidos FOR SELECT
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

DROP POLICY IF EXISTS "Usuários veem seus endereços" ON enderecos;

CREATE POLICY "Usuários veem seus endereços" ON enderecos FOR SELECT
  USING (
    usuario_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = enderecos.usuario_id
      AND usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = FALSE
    )
  );

DROP POLICY IF EXISTS "Admins veem todos os endereços" ON enderecos;

CREATE POLICY "Admins veem todos os endereços" ON enderecos FOR SELECT
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

DROP POLICY IF EXISTS "Usuários veem turmas de seus alunos" ON turmas;

CREATE POLICY "Usuários veem turmas de seus alunos" ON turmas FOR SELECT
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

DROP POLICY IF EXISTS "Admins veem todas as turmas" ON turmas;

CREATE POLICY "Admins veem todas as turmas" ON turmas FOR SELECT
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

DROP POLICY IF EXISTS "Admins veem audit logs" ON audit_logs;

CREATE POLICY "Admins veem audit logs" ON audit_logs FOR SELECT
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
DROP POLICY IF EXISTS "Admins podem ver configurações" ON configuracoes;
CREATE POLICY "Admins podem ver configurações" ON configuracoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem atualizar configurações
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON configuracoes;
CREATE POLICY "Admins podem atualizar configurações" ON configuracoes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.auth_user_id = auth.uid()
      AND usuarios.eh_admin = TRUE
      AND usuarios.ativo = TRUE
    )
  );

-- Política: admins podem inserir configurações
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON configuracoes;
CREATE POLICY "Admins podem inserir configurações" ON configuracoes FOR INSERT
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
DROP POLICY IF EXISTS "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno;
DROP POLICY IF EXISTS "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno;
CREATE POLICY "Usuários veem seus próprios vínculos com alunos" ON usuario_aluno FOR SELECT
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
DROP POLICY IF EXISTS "Usuários veem seus próprios alunos vinculados" ON alunos;

DROP POLICY IF EXISTS "Usuários veem seus próprios alunos vinculados" ON alunos;

CREATE POLICY "Usuários veem seus próprios alunos vinculados" ON alunos FOR SELECT
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
DROP POLICY IF EXISTS "Admins podem gerenciar kits_itens" ON kits_itens;
CREATE POLICY "Admins podem gerenciar kits_itens" ON kits_itens FOR ALL
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

DROP POLICY IF EXISTS "Usuário lê próprio status admin" ON public.usuario_admin_cache;

CREATE POLICY "Usuário lê próprio status admin" ON public.usuario_admin_cache FOR SELECT
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
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
CREATE POLICY "Admins veem todos os usuários" ON public.usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;

CREATE POLICY "Admins podem gerenciar usuários" ON public.usuarios FOR ALL
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
DROP POLICY IF EXISTS "Produtos: Admins podem fazer upload" ON storage.objects;
CREATE POLICY "Produtos: Admins podem fazer upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS "Produtos: Todos podem ler" ON storage.objects;

CREATE POLICY "Produtos: Todos podem ler" ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'produtos');

DROP POLICY IF EXISTS "Produtos: Admins podem atualizar" ON storage.objects;

CREATE POLICY "Produtos: Admins podem atualizar" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS "Produtos: Admins podem deletar" ON storage.objects;

CREATE POLICY "Produtos: Admins podem deletar" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'produtos' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

-- Políticas para bucket 'loja' (logo e favicon)
DROP POLICY IF EXISTS "Loja: Admins podem fazer upload" ON storage.objects;
CREATE POLICY "Loja: Admins podem fazer upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'loja' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS "Loja: Todos podem ler" ON storage.objects;

CREATE POLICY "Loja: Todos podem ler" ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'loja');

DROP POLICY IF EXISTS "Loja: Admins podem atualizar" ON storage.objects;

CREATE POLICY "Loja: Admins podem atualizar" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'loja' AND
  EXISTS (
    SELECT 1 FROM public.usuario_admin_cache c
    WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
  )
);

DROP POLICY IF EXISTS "Loja: Admins podem deletar" ON storage.objects;

CREATE POLICY "Loja: Admins podem deletar" ON storage.objects FOR DELETE
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

DROP POLICY IF EXISTS "Produtos: Admins podem fazer upload" ON storage.objects;

CREATE POLICY "Produtos: Admins podem fazer upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos' AND public.eh_admin_upload()
);

DROP POLICY IF EXISTS "Loja: Admins podem fazer upload" ON storage.objects;

CREATE POLICY "Loja: Admins podem fazer upload" ON storage.objects FOR INSERT
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

DROP POLICY IF EXISTS "Admins podem ver perfis" ON public.perfis;
DROP POLICY IF EXISTS "Admins podem ver perfis" ON public.perfis;
CREATE POLICY "Admins podem ver perfis" ON public.perfis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis;
DROP POLICY IF EXISTS "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis;
CREATE POLICY "Super admins podem inserir/atualizar/deletar perfis" ON public.perfis FOR ALL
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

DROP POLICY IF EXISTS "Admins podem ver perfil_permissoes" ON public.perfil_permissoes;
DROP POLICY IF EXISTS "Admins podem ver perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Admins podem ver perfil_permissoes" ON public.perfil_permissoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes;
DROP POLICY IF EXISTS "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes;
CREATE POLICY "Super admins podem gerenciar perfil_permissoes" ON public.perfil_permissoes FOR ALL
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

DROP POLICY IF EXISTS "Usuario ve seus proprios papeis" ON usuario_papeis;

CREATE POLICY "Usuario ve seus proprios papeis" ON usuario_papeis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = usuario_papeis.usuario_id AND u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins veem todos usuario_papeis" ON usuario_papeis;

CREATE POLICY "Admins veem todos usuario_papeis" ON usuario_papeis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "Admins gerenciam usuario_papeis" ON usuario_papeis;

CREATE POLICY "Admins gerenciam usuario_papeis" ON usuario_papeis FOR ALL
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

DROP POLICY IF EXISTS "Admins veem aluno_saldos" ON aluno_saldos;

CREATE POLICY "Admins veem aluno_saldos" ON aluno_saldos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "Responsaveis veem saldo dos seus alunos" ON aluno_saldos;

CREATE POLICY "Responsaveis veem saldo dos seus alunos" ON aluno_saldos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno ua
      JOIN usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = aluno_saldos.aluno_id
    )
  );

DROP POLICY IF EXISTS "Admins atualizam aluno_saldos" ON aluno_saldos;

CREATE POLICY "Admins atualizam aluno_saldos" ON aluno_saldos FOR ALL
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

DROP POLICY IF EXISTS "Admins veem aluno_movimentacoes" ON aluno_movimentacoes;

CREATE POLICY "Admins veem aluno_movimentacoes" ON aluno_movimentacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "Responsaveis veem movimentacoes dos seus alunos" ON aluno_movimentacoes;

CREATE POLICY "Responsaveis veem movimentacoes dos seus alunos" ON aluno_movimentacoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuario_aluno ua
      JOIN usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = aluno_movimentacoes.aluno_id
    )
  );

DROP POLICY IF EXISTS "Admins inserem aluno_movimentacoes" ON aluno_movimentacoes;

CREATE POLICY "Admins inserem aluno_movimentacoes" ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_config
ALTER TABLE aluno_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsavel ve e gerencia seu aluno_config" ON aluno_config;

CREATE POLICY "Responsavel ve e gerencia seu aluno_config" ON aluno_config FOR ALL
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

DROP POLICY IF EXISTS "Admins veem aluno_config" ON aluno_config;

CREATE POLICY "Admins veem aluno_config" ON aluno_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: aluno_produto_bloqueado
ALTER TABLE aluno_produto_bloqueado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsavel ve e gerencia bloqueios" ON aluno_produto_bloqueado;

CREATE POLICY "Responsavel ve e gerencia bloqueios" ON aluno_produto_bloqueado FOR ALL
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

DROP POLICY IF EXISTS "Admins veem aluno_produto_bloqueado" ON aluno_produto_bloqueado;

CREATE POLICY "Admins veem aluno_produto_bloqueado" ON aluno_produto_bloqueado FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- RLS: caixas
ALTER TABLE caixas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operador ve seus caixas" ON caixas;

CREATE POLICY "Operador ve seus caixas" ON caixas FOR SELECT
  USING (operador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins veem todos caixas" ON caixas;

CREATE POLICY "Admins veem todos caixas" ON caixas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "Operador ou admin abre fecha caixa" ON caixas;

CREATE POLICY "Operador ou admin abre fecha caixa" ON caixas FOR ALL
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

DROP POLICY IF EXISTS "Colaborador ve proprio consumo" ON consumo_colaborador_mensal;

CREATE POLICY "Colaborador ve proprio consumo" ON consumo_colaborador_mensal FOR SELECT
  USING (
    usuario_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON consumo_colaborador_mensal;

CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON consumo_colaborador_mensal FOR ALL
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
-- =====================================================================
-- Operador pode inserir movimentacoes e atualizar saldos

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON aluno_movimentacoes;

CREATE POLICY "Operador insere aluno_movimentacoes" ON aluno_movimentacoes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON aluno_saldos;

CREATE POLICY "Operador atualiza aluno_saldos" ON aluno_saldos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON aluno_saldos;

CREATE POLICY "Operador insere aluno_saldos" ON aluno_saldos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/029_fix_rls_pedidos_insert_e_data_retirada_itens.sql
-- =====================================================================
-- 1. Corrigir RLS: permitir que usuário crie pedidos para seus alunos mesmo quando eh_admin = true (cantina: mesmo usuário pode ser admin e responsável)
DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

DROP POLICY IF EXISTS "Usuários criam pedidos para seus alunos" ON pedidos;

CREATE POLICY "Usuários criam pedidos para seus alunos" ON pedidos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = pedidos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM usuario_aluno ua
      WHERE ua.usuario_id = pedidos.usuario_id AND ua.aluno_id = pedidos.aluno_id
    )
  );

-- 2. data_retirada por item (kit lanche: um dia por linha)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS data_retirada DATE;

COMMENT ON COLUMN pedido_itens.data_retirada IS 'Para kit lanche: data de retirada deste item. Se null, usa pedidos.data_retirada';

-- 3. Permitir INSERT em pedido_itens quando o pedido pertence ao usuário
DROP POLICY IF EXISTS "Usuários inserem itens em seus pedidos" ON pedido_itens;
CREATE POLICY "Usuários inserem itens em seus pedidos" ON pedido_itens FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/030_colaborador_ve_pedidos_proprios.sql
-- =====================================================================
-- Colaborador pode ver pedidos em que ele é o beneficiário (colaborador_id)
DROP POLICY IF EXISTS "Colaborador ve pedidos em que e beneficiario" ON pedidos;
CREATE POLICY "Colaborador ve pedidos em que e beneficiario" ON pedidos FOR SELECT
  USING (
    colaborador_id IS NOT NULL
    AND colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  );

-- Colaborador pode ver itens dos pedidos em que é o beneficiário
DROP POLICY IF EXISTS "Colaborador ve itens de pedidos em que e beneficiario" ON pedido_itens;
CREATE POLICY "Colaborador ve itens de pedidos em que e beneficiario" ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND p.colaborador_id IN (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    )
  );

-- =====================================================================
-- supabase/migrations/031_operador_ve_pedidos_e_itens.sql
-- =====================================================================
-- Operador (PDV) pode ver pedidos e itens para tela de retirada

DROP POLICY IF EXISTS "Operador ve pedidos para retirada" ON pedidos;

CREATE POLICY "Operador ve pedidos para retirada" ON pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );

DROP POLICY IF EXISTS "Operador e admin veem itens de pedidos" ON pedido_itens;

CREATE POLICY "Operador e admin veem itens de pedidos" ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );

-- Operador pode ler produtos (para exibir nome dos itens no PDV)
DROP POLICY IF EXISTS "Operador le produtos" ON produtos;
CREATE POLICY "Operador le produtos" ON produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN usuario_papeis up ON up.usuario_id = u.id
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/032_fix_rls_pedido_itens_usuarios.sql
-- =====================================================================
-- Corrigir RLS de pedido_itens: a política antiga referencia responsaveis e responsavel_id,
-- que foram renomeados para usuarios e usuario_id na migration 012. Usuários não conseguiam
-- ver itens em "Meus Pedidos" nem no PDV (quando aplicável).

DROP POLICY IF EXISTS "Responsáveis veem itens de seus pedidos" ON pedido_itens;

DROP POLICY IF EXISTS "Usuários veem itens de seus pedidos" ON pedido_itens;

CREATE POLICY "Usuários veem itens de seus pedidos" ON pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/033_rpc_itens_meus_pedidos.sql
-- =====================================================================
-- Função para listar itens dos pedidos do usuário logado (contorna RLS no join com produtos).
-- Só retorna itens de pedidos que pertencem ao auth.uid().
CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.pedido_id,
    pi.produto_id,
    pi.quantidade,
    pi.preco_unitario,
    pi.subtotal,
    COALESCE(pi.variacoes_selecionadas, '{}'::jsonb),
    COALESCE(pr.nome, 'Produto')
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (para Meus Pedidos).';

-- =====================================================================
-- supabase/migrations/034_renomear_financeiro_para_rh.sql
-- =====================================================================
-- Migration para renomear FINANCEIRO para RH no enum papel_usuario

-- 1. Atualizar todos os registros existentes de FINANCEIRO para RH
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel = 'FINANCEIRO'::papel_usuario;

-- 2. Adicionar 'RH' ao enum (se ainda não existir)
-- Como não podemos remover valores de enum diretamente, vamos adicionar RH
DO $$ 
BEGIN
    -- Verificar se 'RH' já existe no enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'RH' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'papel_usuario')
    ) THEN
        -- Adicionar 'RH' ao enum
        ALTER TYPE papel_usuario ADD VALUE IF NOT EXISTS 'RH';
    END IF;
END $$;

-- 3. Atualizar novamente os registros (caso ainda existam FINANCEIRO)
UPDATE usuario_papeis 
SET papel = 'RH'::text::papel_usuario
WHERE papel::text = 'FINANCEIRO';

-- Nota: O valor 'FINANCEIRO' permanecerá no enum, mas não será mais usado.
-- Para remover completamente, seria necessário recriar o enum, o que é mais complexo.
-- Por enquanto, mantemos ambos para compatibilidade, mas o código usa apenas 'RH'.

-- =====================================================================
-- supabase/migrations/035_pagamentos_caixa_id.sql
-- =====================================================================
-- Garantir que pagamentos tenha caixa_id para vincular ao caixa do PDV (fechamento e movimentação)
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS caixa_id UUID REFERENCES caixas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_caixa ON pagamentos(caixa_id);

-- =====================================================================
-- supabase/migrations/036_pagamentos_rls_operador.sql
-- =====================================================================
-- Operador pode ver e inserir pagamentos do seu caixa (PDV)
DROP POLICY IF EXISTS "Operador ve e insere pagamentos do seu caixa" ON pagamentos;
CREATE POLICY "Operador ve e insere pagamentos do seu caixa" ON pagamentos FOR ALL
  USING (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    (pagamentos.caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.eh_admin = TRUE AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/037_operador_aluno_venda_direta.sql
-- =====================================================================
-- Operador do PDV precisa inserir e ler o aluno fictício "Venda Direta" para vendas diretas
DROP POLICY IF EXISTS "Operador ve alunos venda direta" ON alunos;
CREATE POLICY "Operador ve alunos venda direta" ON alunos FOR SELECT
  USING (
    prontuario = 'VENDA_DIRETA'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );

DROP POLICY IF EXISTS "Operador insere aluno venda direta" ON alunos;

CREATE POLICY "Operador insere aluno venda direta" ON alunos FOR INSERT
  WITH CHECK (
    prontuario = 'VENDA_DIRETA'
    AND nome = 'Venda Direta'
    AND EXISTS (
      SELECT 1 FROM usuario_papeis up
      JOIN usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid()
      WHERE up.papel = 'OPERADOR'
    )
  );

-- =====================================================================
-- supabase/migrations/038_operador_cria_pedidos_pdv.sql
-- =====================================================================
-- Permitir que operador do PDV crie pedidos com origem PDV vinculados ao seu caixa
DROP POLICY IF EXISTS "Operador cria pedidos PDV" ON pedidos;
CREATE POLICY "Operador cria pedidos PDV" ON pedidos FOR INSERT
  WITH CHECK (
    origem = 'PDV'
    AND caixa_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM caixas c
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pedidos.caixa_id
    )
  );

-- =====================================================================
-- supabase/migrations/039_pedido_itens_produto_nome.sql
-- =====================================================================
-- Nome do produto no momento da venda (histórico para relatórios mesmo se produto for renomeado)
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS produto_nome TEXT;
COMMENT ON COLUMN pedido_itens.produto_nome IS 'Nome do produto no momento da venda (PDV/relatórios)';

-- =====================================================================
-- supabase/migrations/040_operador_atualiza_estoque_variacao.sql
-- =====================================================================
-- Operador do PDV pode atualizar estoque em variacao_valores ao finalizar venda
DROP POLICY IF EXISTS "Operador PDV pode atualizar estoque variacao_valores" ON variacao_valores;
DROP POLICY IF EXISTS "Operador PDV pode atualizar estoque variacao_valores" ON variacao_valores;
CREATE POLICY "Operador PDV pode atualizar estoque variacao_valores" ON variacao_valores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM variacoes v
      JOIN produtos p ON p.id = v.produto_id
      JOIN caixas c ON c.empresa_id = p.empresa_id
      JOIN usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- Usuário autenticado (responsável) pode consumir estoque em variacao_valores em compras online
DROP POLICY IF EXISTS "Responsavel pode consumir estoque variacao_valores" ON variacao_valores;
DROP POLICY IF EXISTS "Responsavel pode consumir estoque variacao_valores" ON variacao_valores;
CREATE POLICY "Responsavel pode consumir estoque variacao_valores" ON variacao_valores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/041_produtos_favorito.sql
-- =====================================================================
-- Favoritar produto: usado no PDV para destacar na tela de vendas
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS favorito BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN produtos.favorito IS 'Produto favorito: destacado no PDV (tela de vendas).';

-- =====================================================================
-- supabase/migrations/042_operador_atualiza_pedido_entregue.sql
-- =====================================================================
-- Operador (PDV) e admin podem marcar pedido como entregue na tela de retirada
DROP POLICY IF EXISTS "Operador e admin atualizam pedido (marcar entregue)" ON pedidos;
CREATE POLICY "Operador e admin atualizam pedido (marcar entregue)" ON pedidos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
      AND (
        u.eh_admin = TRUE
        OR EXISTS (SELECT 1 FROM usuario_papeis up WHERE up.usuario_id = u.id AND up.papel = 'OPERADOR')
      )
    )
  );

-- =====================================================================
-- supabase/migrations/043_transacoes_gateway_rede.sql
-- =====================================================================
-- Transações do gateway de pagamento (Rede): checkout loja e recarga de saldo
-- Permite criar a intenção de pagamento antes de ter pedido; ao aprovar, cria pedido ou credita saldo.

CREATE TYPE transacao_tipo AS ENUM ('PEDIDO_LOJA', 'RECARGA_SALDO');
CREATE TYPE transacao_status AS ENUM ('PENDENTE', 'PROCESSANDO', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'CANCELADO');
CREATE TYPE transacao_metodo AS ENUM ('PIX', 'CARTAO');

CREATE TABLE transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo transacao_tipo NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  aluno_id UUID REFERENCES alunos(id) ON DELETE SET NULL,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  metodo transacao_metodo NOT NULL,
  status transacao_status NOT NULL DEFAULT 'PENDENTE',
  gateway_id TEXT,
  gateway_tid TEXT,
  gateway_nsu TEXT,
  gateway_data JSONB DEFAULT '{}'::jsonb,
  webhook_events JSONB DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_transacao_aluno_tipo CHECK (
    (tipo = 'PEDIDO_LOJA' AND aluno_id IS NOT NULL) OR
    (tipo = 'RECARGA_SALDO' AND aluno_id IS NOT NULL)
  )
);

COMMENT ON TABLE transacoes IS 'Intenções de pagamento via gateway Rede (loja e recarga). Pedido/saldo só é confirmado após APROVADO.';
COMMENT ON COLUMN transacoes.payload IS 'PEDIDO_LOJA: { itens, dataRetirada, agrupadoPorAluno }. RECARGA_SALDO: {}';
COMMENT ON COLUMN transacoes.gateway_id IS 'ID da transação no gateway Rede';
COMMENT ON COLUMN transacoes.gateway_tid IS 'TID retornado pelo gateway';
COMMENT ON COLUMN transacoes.gateway_nsu IS 'NSU retornado pelo gateway';

CREATE INDEX idx_transacoes_usuario ON transacoes(usuario_id);
CREATE INDEX idx_transacoes_aluno ON transacoes(aluno_id);
CREATE INDEX idx_transacoes_pedido ON transacoes(pedido_id);
CREATE INDEX idx_transacoes_status ON transacoes(status);
CREATE INDEX idx_transacoes_gateway_id ON transacoes(gateway_id);
CREATE INDEX idx_transacoes_created ON transacoes(created_at);
CREATE INDEX idx_transacoes_tipo ON transacoes(tipo);

-- Vincular pagamentos ao gateway (transação) quando gerados a partir do checkout online
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pagamentos_transacao ON pagamentos(transacao_id);

-- Vincular movimentação de saldo à transação (recarga online)
ALTER TABLE aluno_movimentacoes ADD COLUMN IF NOT EXISTS transacao_id UUID REFERENCES transacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_transacao ON aluno_movimentacoes(transacao_id);

-- RLS: responsável vê apenas suas transações
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve proprias transacoes" ON transacoes;

CREATE POLICY "Usuario ve proprias transacoes" ON transacoes FOR SELECT
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Usuario insere transacoes para si" ON transacoes;

CREATE POLICY "Usuario insere transacoes para si" ON transacoes FOR INSERT
  WITH CHECK (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));

-- UPDATE só pelo servidor (webhook/API com service role); cliente não atualiza transação.

-- =====================================================================
-- supabase/migrations/044_produtos_unidade.sql
-- =====================================================================
-- Unidade de venda do produto: Unitário (un) ou Kilograma (kg)
-- Se KG, o preço do produto é o preço por kg; no PDV o operador informa as gramas.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'UN' CHECK (unidade IN ('UN', 'KG'));

COMMENT ON COLUMN produtos.unidade IS 'UN = unitário (preço por unidade). KG = preço por kg; no PDV informar gramas.';

-- =====================================================================
-- supabase/migrations/045_usuarios_re_colaborador.sql
-- =====================================================================
-- RE (Registro do Empregado) para colaboradores importados pelo RH
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS re_colaborador TEXT;

COMMENT ON COLUMN usuarios.re_colaborador IS 'Registro do empregado (RE), preenchido na importação de colaboradores pelo RH';

-- =====================================================================
-- supabase/migrations/046_fix_sync_usuario_admin_cache_null.sql
-- =====================================================================
-- Colaboradores importados têm auth_user_id NULL; o cache só deve ter linhas com auth_user_id preenchido.
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
DECLARE
  uid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;

  uid := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  IF uid IS NOT NULL THEN
    INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
    VALUES (uid, COALESCE(NEW.eh_admin, false))
    ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================================
-- supabase/migrations/047_refatorar_usuarios_perfis.sql
-- =====================================================================
-- Refatoração: estrutura central em usuarios (nome, cpf, email, celular, responsabilidade),
-- perfis como tabela de dados (colaborador, responsável, admin, etc.) e usuario_perfis N:N.
-- Aluno passa a ter usuario_id (aluno também é usuário).
-- Colunas antigas são mantidas por enquanto para compatibilidade; podem ser removidas após atualizar o código.

-- 1. Novos campos em usuarios (unificando _financeiro e _pedagogico)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS celular TEXT,
  ADD COLUMN IF NOT EXISTS responsabilidade SMALLINT;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS chk_responsabilidade;

ALTER TABLE public.usuarios
  ADD CONSTRAINT chk_responsabilidade CHECK (responsabilidade IS NULL OR responsabilidade IN (1, 2, 3));

COMMENT ON COLUMN public.usuarios.cpf IS 'CPF do usuário (unificado)';
COMMENT ON COLUMN public.usuarios.responsabilidade IS '1=financeiro, 2=pedagógico, 3=ambos';

-- 2. Backfill: unificar dados em nome, cpf, email, celular, responsabilidade
UPDATE public.usuarios
SET
  nome = COALESCE(NULLIF(TRIM(nome), ''), nome_financeiro, nome_pedagogico),
  cpf = COALESCE(NULLIF(TRIM(cpf), ''), cpf_financeiro, cpf_pedagogico),
  email = COALESCE(NULLIF(TRIM(email), ''), email_financeiro, email_pedagogico),
  celular = COALESCE(NULLIF(TRIM(celular), ''), celular_financeiro, celular_pedagogico),
  responsabilidade = CASE
    WHEN tipo::text = 'FINANCEIRO' THEN 1
    WHEN tipo::text = 'PEDAGOGICO' THEN 2
    ELSE 3
  END
WHERE TRUE;

-- 3. Garantir perfis de “papel” (para usuario_perfis)
INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'Admin', 'Administrador do sistema', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'Admin');

INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'Diretor', 'Diretor', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'Diretor');

-- 4. Tabela N:N usuario_perfis (um usuário pode ter vários perfis)
CREATE TABLE IF NOT EXISTS public.usuario_perfis (
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  perfil_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (usuario_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_perfis_usuario ON public.usuario_perfis(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_perfil ON public.usuario_perfis(perfil_id);

COMMENT ON TABLE public.usuario_perfis IS 'Perfis do usuário (N:N). Ex.: colaborador, responsável, admin. Substitui uso exclusivo de usuario_papeis.';

-- 5. Migrar usuario_papeis -> usuario_perfis (mapeamento papel -> perfil por nome)
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT up.usuario_id, p.id
FROM public.usuario_papeis up
CROSS JOIN LATERAL (
  SELECT id FROM public.perfis
  WHERE nome IN ('Responsável', 'Admin', 'Operador', 'Colaborador', 'RH')
  AND (
    (up.papel::text = 'RESPONSAVEL' AND nome = 'Responsável')
    OR (up.papel::text = 'ADMIN' AND nome = 'Admin')
    OR (up.papel::text = 'OPERADOR' AND nome = 'Operador')
    OR (up.papel::text = 'COLABORADOR' AND nome = 'Colaborador')
    OR (up.papel::text IN ('RH', 'FINANCEIRO') AND nome = 'RH')
  )
  LIMIT 1
) p
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- Admin: se não houver perfil "Admin", usar "Acesso total"
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT up.usuario_id, p.id
FROM public.usuario_papeis up
JOIN public.perfis p ON p.nome = 'Acesso total'
WHERE up.papel::text = 'ADMIN'
AND NOT EXISTS (
  SELECT 1 FROM public.usuario_perfis up2
  JOIN public.perfis p2 ON p2.id = up2.perfil_id AND p2.nome = 'Admin'
  WHERE up2.usuario_id = up.usuario_id
)
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- 6. Migrar usuarios.perfil_id -> usuario_perfis (quem já tem perfil de acesso admin)
INSERT INTO public.usuario_perfis (usuario_id, perfil_id)
SELECT id, perfil_id
FROM public.usuarios
WHERE perfil_id IS NOT NULL
ON CONFLICT (usuario_id, perfil_id) DO NOTHING;

-- 7. alunos.usuario_id (aluno também é usuário)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_usuario ON public.alunos(usuario_id);
COMMENT ON COLUMN public.alunos.usuario_id IS 'Usuário vinculado ao aluno (aluno também é usuário no sistema)';

-- RLS: usuario_perfis (mesmo padrão de usuario_papeis: usuário vê os próprios; admin vê todos)
ALTER TABLE public.usuario_perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê próprios usuario_perfis" ON public.usuario_perfis;
DROP POLICY IF EXISTS "Usuário vê próprios usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Usuário vê próprios usuario_perfis" ON public.usuario_perfis FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = usuario_perfis.usuario_id AND u.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins veem todos usuario_perfis" ON public.usuario_perfis;
DROP POLICY IF EXISTS "Admins veem todos usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Admins veem todos usuario_perfis" ON public.usuario_perfis FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

DROP POLICY IF EXISTS "Admins gerenciam usuario_perfis" ON public.usuario_perfis;
DROP POLICY IF EXISTS "Admins gerenciam usuario_perfis" ON public.usuario_perfis;
CREATE POLICY "Admins gerenciam usuario_perfis" ON public.usuario_perfis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

-- =====================================================================
-- supabase/migrations/048_usuarios_remover_colunas_antigas.sql
-- =====================================================================
-- Remove colunas antigas de usuarios e passa a usar apenas a estrutura refatorada.
-- eh_admin e perfil_id são removidos; "é admin?" vem de usuario_perfis (perfil Admin ou Acesso total).
-- Antes de dropar eh_admin, atualizamos funções e políticas RLS para usarem usuario_admin_cache.

-- 1. Função: atualizar cache de admin para um usuario_id (com base em usuario_perfis)
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache_by_id(p_usuario_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT auth_user_id INTO v_auth_id FROM public.usuarios WHERE id = p_usuario_id;
  IF v_auth_id IS NULL THEN RETURN; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis up
    JOIN public.perfis p ON p.id = up.perfil_id
    WHERE up.usuario_id = p_usuario_id AND p.nome IN ('Admin', 'Acesso total')
  ) INTO v_is_admin;
  INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
  VALUES (v_auth_id, COALESCE(v_is_admin, false))
  ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
END;
$$;

-- 2. Trigger em usuario_perfis
CREATE OR REPLACE FUNCTION public.trg_sync_cache_on_usuario_perfis()
RETURNS TRIGGER AS $$
DECLARE u_id UUID;
BEGIN
  u_id := COALESCE(NEW.usuario_id, OLD.usuario_id);
  IF u_id IS NOT NULL THEN PERFORM public.sync_usuario_admin_cache_by_id(u_id); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_cache_usuario_perfis ON public.usuario_perfis;
CREATE TRIGGER trg_sync_cache_usuario_perfis
  AFTER INSERT OR DELETE OR UPDATE OF perfil_id ON public.usuario_perfis
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_cache_on_usuario_perfis();

-- 3. sync_usuario_admin_cache (usuarios): is_admin vem de usuario_perfis
CREATE OR REPLACE FUNCTION public.sync_usuario_admin_cache()
RETURNS TRIGGER AS $$
DECLARE uid UUID; v_is_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.usuario_admin_cache WHERE auth_user_id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;
  uid := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  IF uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_perfis up
      JOIN public.perfis p ON p.id = up.perfil_id
      WHERE up.usuario_id = NEW.id AND p.nome IN ('Admin', 'Acesso total')
    ) INTO v_is_admin;
    INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
    VALUES (uid, COALESCE(v_is_admin, false))
    ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_usuario_admin_cache ON public.usuarios;
CREATE TRIGGER trg_sync_usuario_admin_cache
  AFTER INSERT OR UPDATE OF auth_user_id OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_usuario_admin_cache();

-- 4. Repopular cache a partir de usuario_perfis
INSERT INTO public.usuario_admin_cache (auth_user_id, is_admin)
SELECT u.auth_user_id,
  EXISTS (
    SELECT 1 FROM public.usuario_perfis up
    JOIN public.perfis p ON p.id = up.perfil_id
    WHERE up.usuario_id = u.id AND p.nome IN ('Admin', 'Acesso total')
  )
FROM public.usuarios u
WHERE u.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

-- 5. eh_admin_usuario passa a usar apenas usuario_admin_cache + usuarios.ativo (sem coluna eh_admin)
CREATE OR REPLACE FUNCTION public.eh_admin_usuario(user_id UUID)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_admin_cache c ON c.auth_user_id = u.auth_user_id
    WHERE u.auth_user_id = user_id AND u.ativo = TRUE AND c.is_admin = TRUE
  );
END;
$$;

-- 6. Storage: eh_admin_upload usa a função (não lê coluna eh_admin)
CREATE OR REPLACE FUNCTION public.eh_admin_upload()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT public.eh_admin_usuario(auth.uid()); $$;

-- 7. Helper: usuário atual é admin OU operador (para políticas que misturam os dois)
CREATE OR REPLACE FUNCTION public.eh_admin_ou_operador()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.eh_admin_usuario(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_papeis up ON up.usuario_id = u.id
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
  );
$$;

-- 8. Dropar políticas que dependem de usuarios.eh_admin e recriar usando eh_admin_usuario/cache
-- usuarios
DROP POLICY IF EXISTS "Usuários veem apenas seus próprios dados" ON public.usuarios;
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;
DROP POLICY IF EXISTS "Usuários veem apenas seus próprios dados" ON public.usuarios;
CREATE POLICY "Usuários veem apenas seus próprios dados" ON public.usuarios FOR SELECT
  USING (
    auth.uid() = auth_user_id
    AND NOT public.eh_admin_usuario(auth.uid())
  );
DROP POLICY IF EXISTS "Admins veem todos os usuários" ON public.usuarios;
CREATE POLICY "Admins veem todos os usuários" ON public.usuarios FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins podem gerenciar usuários" ON public.usuarios;
CREATE POLICY "Admins podem gerenciar usuários" ON public.usuarios FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- audit_logs
DROP POLICY IF EXISTS "Admins veem audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins veem audit logs" ON public.audit_logs;
CREATE POLICY "Admins veem audit logs" ON public.audit_logs FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- configuracoes
DROP POLICY IF EXISTS "Admins podem ver configurações" ON public.configuracoes;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public.configuracoes;
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON public.configuracoes;
DROP POLICY IF EXISTS "Admins podem ver configurações" ON public.configuracoes;
CREATE POLICY "Admins podem ver configurações" ON public.configuracoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public.configuracoes;
CREATE POLICY "Admins podem atualizar configurações" ON public.configuracoes FOR UPDATE
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins podem inserir configurações" ON public.configuracoes;
CREATE POLICY "Admins podem inserir configurações" ON public.configuracoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- aluno_config
DROP POLICY IF EXISTS "Admins veem aluno_config" ON public.aluno_config;
DROP POLICY IF EXISTS "Admins veem aluno_config" ON public.aluno_config;
CREATE POLICY "Admins veem aluno_config" ON public.aluno_config FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- aluno_movimentacoes
DROP POLICY IF EXISTS "Admins veem aluno_movimentacoes" ON public.aluno_movimentacoes;
DROP POLICY IF EXISTS "Admins inserem aluno_movimentacoes" ON public.aluno_movimentacoes;
DROP POLICY IF EXISTS "Admins veem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Admins veem aluno_movimentacoes" ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins inserem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Admins inserem aluno_movimentacoes" ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- aluno_produto_bloqueado
DROP POLICY IF EXISTS "Admins veem aluno_produto_bloqueado" ON public.aluno_produto_bloqueado;
DROP POLICY IF EXISTS "Admins veem aluno_produto_bloqueado" ON public.aluno_produto_bloqueado;
CREATE POLICY "Admins veem aluno_produto_bloqueado" ON public.aluno_produto_bloqueado FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- aluno_saldos
DROP POLICY IF EXISTS "Admins veem aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Admins atualizam aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Admins veem aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Admins veem aluno_saldos" ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins atualizam aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Admins atualizam aluno_saldos" ON public.aluno_saldos FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- alunos
DROP POLICY IF EXISTS "Admins veem todos os alunos" ON public.alunos;
DROP POLICY IF EXISTS "Admins veem todos os alunos" ON public.alunos;
CREATE POLICY "Admins veem todos os alunos" ON public.alunos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- caixas
DROP POLICY IF EXISTS "Admins veem todos caixas" ON public.caixas;
DROP POLICY IF EXISTS "Operador ou admin abre fecha caixa" ON public.caixas;
DROP POLICY IF EXISTS "Admins veem todos caixas" ON public.caixas;
CREATE POLICY "Admins veem todos caixas" ON public.caixas FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Operador ou admin abre fecha caixa" ON public.caixas;
CREATE POLICY "Operador ou admin abre fecha caixa" ON public.caixas FOR ALL
  USING (
    (operador_id IN (SELECT id FROM public.usuarios WHERE auth_user_id = auth.uid()))
    OR public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    (operador_id IN (SELECT id FROM public.usuarios WHERE auth_user_id = auth.uid()))
    OR public.eh_admin_usuario(auth.uid())
  );

-- categorias
DROP POLICY IF EXISTS "Admins podem gerenciar categorias" ON public.categorias;
DROP POLICY IF EXISTS "Admins podem gerenciar categorias" ON public.categorias;
CREATE POLICY "Admins podem gerenciar categorias" ON public.categorias FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = categorias.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = categorias.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- consumo_colaborador_mensal
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- dias_uteis_config
DO $$
BEGIN
  IF to_regclass('public.dias_uteis_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config';
    EXECUTE 'CREATE POLICY "Admin e operador gerenciam dias_uteis_config" ON public.dias_uteis_config FOR ALL
      USING (public.eh_admin_ou_operador())
      WITH CHECK (public.eh_admin_ou_operador())';
  END IF;
END
$$;

-- dias_uteis_mes
DO $$
BEGIN
  IF to_regclass('public.dias_uteis_mes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes';
    EXECUTE 'CREATE POLICY "Admins e operadores veem e gerenciam dias_uteis_mes" ON public.dias_uteis_mes FOR ALL
      USING (public.eh_admin_ou_operador())
      WITH CHECK (public.eh_admin_ou_operador())';
  END IF;
END
$$;

-- enderecos
DROP POLICY IF EXISTS "Admins veem todos os endereços" ON public.enderecos;
DROP POLICY IF EXISTS "Usuários veem seus endereços" ON public.enderecos;
DROP POLICY IF EXISTS "Admins veem todos os endereços" ON public.enderecos;
CREATE POLICY "Admins veem todos os endereços" ON public.enderecos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Usuários veem seus endereços" ON public.enderecos;
CREATE POLICY "Usuários veem seus endereços" ON public.enderecos FOR SELECT
  USING (
    usuario_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = enderecos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );

-- grupos_opcionais
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_opcionais" ON public.grupos_opcionais;
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_opcionais" ON public.grupos_opcionais;
CREATE POLICY "Admins podem gerenciar grupos_opcionais" ON public.grupos_opcionais FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = grupos_opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = grupos_opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- grupos_produtos
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_produtos" ON public.grupos_produtos;
DROP POLICY IF EXISTS "Admins podem gerenciar grupos_produtos" ON public.grupos_produtos;
CREATE POLICY "Admins podem gerenciar grupos_produtos" ON public.grupos_produtos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = grupos_produtos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = grupos_produtos.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- kits_itens
DROP POLICY IF EXISTS "Admins podem gerenciar kits_itens" ON public.kits_itens;
DROP POLICY IF EXISTS "Admins podem gerenciar kits_itens" ON public.kits_itens;
CREATE POLICY "Admins podem gerenciar kits_itens" ON public.kits_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = kits_itens.kit_produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL OR u.super_admin = TRUE)
    )
    AND public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = kits_itens.kit_produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL OR u.super_admin = TRUE)
    )
    AND public.eh_admin_usuario(auth.uid())
  );

-- opcionais
DROP POLICY IF EXISTS "Admins podem gerenciar opcionais" ON public.opcionais;
DROP POLICY IF EXISTS "Admins podem gerenciar opcionais" ON public.opcionais;
CREATE POLICY "Admins podem gerenciar opcionais" ON public.opcionais FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = opcionais.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- pagamentos
DROP POLICY IF EXISTS "Operador ve e insere pagamentos do seu caixa" ON public.pagamentos;
DROP POLICY IF EXISTS "Operador ve e insere pagamentos do seu caixa" ON public.pagamentos;
CREATE POLICY "Operador ve e insere pagamentos do seu caixa" ON public.pagamentos FOR ALL
  USING (
    (caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR public.eh_admin_usuario(auth.uid())
  )
  WITH CHECK (
    (caixa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = c.operador_id AND u.auth_user_id = auth.uid()
      WHERE c.id = pagamentos.caixa_id
    ))
    OR public.eh_admin_usuario(auth.uid())
  );

-- pedido_itens
DROP POLICY IF EXISTS "Operador e admin veem itens de pedidos" ON public.pedido_itens;
DROP POLICY IF EXISTS "Operador e admin veem itens de pedidos" ON public.pedido_itens;
CREATE POLICY "Operador e admin veem itens de pedidos" ON public.pedido_itens FOR SELECT
  USING (public.eh_admin_ou_operador());

-- pedidos
DROP POLICY IF EXISTS "Admins veem todos os pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Usuários veem apenas seus pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Operador e admin atualizam pedido (marcar entregue)" ON public.pedidos;
DROP POLICY IF EXISTS "Admins veem todos os pedidos" ON public.pedidos;
CREATE POLICY "Admins veem todos os pedidos" ON public.pedidos FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Usuários veem apenas seus pedidos" ON public.pedidos;
CREATE POLICY "Usuários veem apenas seus pedidos" ON public.pedidos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = pedidos.usuario_id AND u.auth_user_id = auth.uid()
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );
DROP POLICY IF EXISTS "Operador e admin atualizam pedido (marcar entregue)" ON public.pedidos;
CREATE POLICY "Operador e admin atualizam pedido (marcar entregue)" ON public.pedidos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- produto_disponibilidade
DROP POLICY IF EXISTS "Admins podem gerenciar disponibilidade" ON public.produto_disponibilidade;
DROP POLICY IF EXISTS "Admins podem gerenciar disponibilidade" ON public.produto_disponibilidade;
CREATE POLICY "Admins podem gerenciar disponibilidade" ON public.produto_disponibilidade FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = produto_disponibilidade.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = produto_disponibilidade.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- produtos
DROP POLICY IF EXISTS "Admins podem gerenciar produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins podem gerenciar produtos" ON public.produtos;
CREATE POLICY "Admins podem gerenciar produtos" ON public.produtos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = produtos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = produtos.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- turmas
DROP POLICY IF EXISTS "Admins veem todas as turmas" ON public.turmas;
DROP POLICY IF EXISTS "Usuários veem turmas de seus alunos" ON public.turmas;
DROP POLICY IF EXISTS "Admins veem todas as turmas" ON public.turmas;
CREATE POLICY "Admins veem todas as turmas" ON public.turmas FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Usuários veem turmas de seus alunos" ON public.turmas;
CREATE POLICY "Usuários veem turmas de seus alunos" ON public.turmas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      JOIN public.usuario_aluno ua ON ua.aluno_id = a.id
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE a.turma_id = turmas.id
    )
    AND NOT public.eh_admin_usuario(auth.uid())
  );

-- usuario_aluno
DROP POLICY IF EXISTS "Admins veem todos os vínculos usuario-aluno" ON public.usuario_aluno;
DROP POLICY IF EXISTS "Admins veem todos os vínculos usuario-aluno" ON public.usuario_aluno;
CREATE POLICY "Admins veem todos os vínculos usuario-aluno" ON public.usuario_aluno FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

-- usuario_papeis
DROP POLICY IF EXISTS "Admins veem todos usuario_papeis" ON public.usuario_papeis;
DROP POLICY IF EXISTS "Admins gerenciam usuario_papeis" ON public.usuario_papeis;
DROP POLICY IF EXISTS "Admins veem todos usuario_papeis" ON public.usuario_papeis;
CREATE POLICY "Admins veem todos usuario_papeis" ON public.usuario_papeis FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));
DROP POLICY IF EXISTS "Admins gerenciam usuario_papeis" ON public.usuario_papeis;
CREATE POLICY "Admins gerenciam usuario_papeis" ON public.usuario_papeis FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- variacao_valores
DROP POLICY IF EXISTS "Admins podem gerenciar variacao_valores" ON public.variacao_valores;
DROP POLICY IF EXISTS "Admins podem gerenciar variacao_valores" ON public.variacao_valores;
CREATE POLICY "Admins podem gerenciar variacao_valores" ON public.variacao_valores FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE v.id = variacao_valores.variacao_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- variacoes
DROP POLICY IF EXISTS "Admins podem gerenciar variacoes" ON public.variacoes;
DROP POLICY IF EXISTS "Admins podem gerenciar variacoes" ON public.variacoes;
CREATE POLICY "Admins podem gerenciar variacoes" ON public.variacoes FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = variacoes.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.usuarios u ON u.auth_user_id = auth.uid()
      WHERE p.id = variacoes.produto_id AND u.ativo = TRUE
        AND (u.empresa_id = p.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- 8.1. Segurança: remover quaisquer políticas remanescentes que ainda dependam de usuarios.eh_admin
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schemaname, c.relname AS tablename, pol.polname AS policyname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE n.nspname = 'public'
      AND d.refobjid = 'public.usuarios'::regclass
      AND a.attname = 'eh_admin'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;
END
$$;

-- 9. Remover colunas antigas de usuarios
ALTER TABLE public.usuarios
  DROP COLUMN IF EXISTS nome_financeiro,
  DROP COLUMN IF EXISTS nome_pedagogico,
  DROP COLUMN IF EXISTS cpf_financeiro,
  DROP COLUMN IF EXISTS cpf_pedagogico,
  DROP COLUMN IF EXISTS email_financeiro,
  DROP COLUMN IF EXISTS email_pedagogico,
  DROP COLUMN IF EXISTS celular_financeiro,
  DROP COLUMN IF EXISTS celular_pedagogico,
  DROP COLUMN IF EXISTS tipo,
  DROP COLUMN IF EXISTS eh_admin,
  DROP COLUMN IF EXISTS perfil_id;

-- =====================================================================
-- supabase/migrations/049_calendario_dias_uteis.sql
-- =====================================================================
-- Calendário: feriados fixos (todo ano), eventos específicos e configuração de fim de semana
-- Usado para definir dias úteis: um dia é não útil se for feriado fixo, evento ou sáb/dom conforme config.

-- Configuração de fim de semana por empresa (sábado e domingo são úteis?)
CREATE TABLE IF NOT EXISTS calendario_fim_semana (
  empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  sabado_util BOOLEAN NOT NULL DEFAULT FALSE,
  domingo_util BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feriados/datas fixas que se repetem todo ano (ex: 01/01, 25/12, 07/09)
CREATE TABLE IF NOT EXISTS calendario_feriados_fixos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes SMALLINT NOT NULL CHECK (mes >= 1 AND mes <= 12),
  dia SMALLINT NOT NULL CHECK (dia >= 1 AND dia <= 31),
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mes, dia)
);

-- Eventos/datas específicas (um ano ou recorrentes)
-- ano_especifico NULL = recorrente (todo ano nessa data); preenchido = só naquele ano
CREATE TABLE IF NOT EXISTS calendario_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  ano_especifico INTEGER NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_empresa ON calendario_eventos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_data ON calendario_eventos(data);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_ano ON calendario_eventos(ano_especifico);

COMMENT ON TABLE calendario_fim_semana IS 'Define se sábado e domingo são dias úteis por empresa';
COMMENT ON TABLE calendario_feriados_fixos IS 'Datas fixas não úteis que se repetem todo ano (mes/dia)';
COMMENT ON TABLE calendario_eventos IS 'Datas específicas não úteis: ano_especifico NULL = todo ano; preenchido = só naquele ano';

-- RLS
ALTER TABLE calendario_fim_semana ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_feriados_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana;
DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana;
CREATE POLICY "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos;
DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos;
CREATE POLICY "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos;
DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos;
CREATE POLICY "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/050_turmas_turno.sql
-- =====================================================================
-- Turno da turma: Manhã ou Tarde (opcional)
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS turno TEXT;

COMMENT ON COLUMN public.turmas.turno IS 'Turno da turma: MANHA, TARDE ou null (não informado)';

-- =====================================================================
-- supabase/migrations/051_produtos_kit_festa_config.sql
-- =====================================================================
-- Configurações para produto tipo Kit Festa: antecedência de compra e horários por período
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_min INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_dias_antecedencia_max INTEGER NULL,
  ADD COLUMN IF NOT EXISTS kit_festa_horarios JSONB NULL;

COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_min IS 'Kit Festa: mínimo de dias de antecedência para compra (ex: 10)';
COMMENT ON COLUMN public.produtos.kit_festa_dias_antecedencia_max IS 'Kit Festa: máximo de dias de antecedência para compra (ex: 60)';
COMMENT ON COLUMN public.produtos.kit_festa_horarios IS 'Kit Festa: [{ "periodo": "MANHA"|"TARDE", "inicio": "HH:mm", "fim": "HH:mm" }, ...]';

-- =====================================================================
-- supabase/migrations/052_pedido_itens_kit_festa_google.sql
-- =====================================================================
-- Kit Festa: campos no pedido_item (tema, idade, data/horário, evento Google)
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS tema_festa TEXT,
  ADD COLUMN IF NOT EXISTS idade_festa INTEGER,
  ADD COLUMN IF NOT EXISTS kit_festa_data DATE,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_inicio TEXT,
  ADD COLUMN IF NOT EXISTS kit_festa_horario_fim TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_link TEXT;

COMMENT ON COLUMN pedido_itens.tema_festa IS 'Kit Festa: tema informado pelo responsável';
COMMENT ON COLUMN pedido_itens.idade_festa IS 'Kit Festa: idade que a criança fará (1-15)';
COMMENT ON COLUMN pedido_itens.kit_festa_data IS 'Kit Festa: data de retirada (YYYY-MM-DD)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_inicio IS 'Kit Festa: início do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.kit_festa_horario_fim IS 'Kit Festa: fim do horário (HH:mm)';
COMMENT ON COLUMN pedido_itens.google_event_id IS 'Kit Festa: ID do evento criado na Google Agenda após pagamento';
COMMENT ON COLUMN pedido_itens.google_event_link IS 'Kit Festa: link para o evento na Google Agenda';

-- =====================================================================
-- supabase/migrations/053_rpc_itens_meus_pedidos_kit_festa.sql
-- =====================================================================
-- Estende get_itens_meus_pedidos para retornar campos Kit Festa e opcionais.
DROP FUNCTION IF EXISTS public.get_itens_meus_pedidos(uuid[]);

CREATE OR REPLACE FUNCTION public.get_itens_meus_pedidos(p_pedido_ids uuid[])
RETURNS TABLE (
  id uuid,
  pedido_id uuid,
  produto_id uuid,
  quantidade integer,
  preco_unitario numeric,
  subtotal numeric,
  variacoes_selecionadas jsonb,
  produto_nome text,
  tema_festa text,
  idade_festa integer,
  kit_festa_data date,
  kit_festa_horario_inicio text,
  kit_festa_horario_fim text,
  google_event_id text,
  google_event_link text,
  opcionais_selecionados jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.pedido_id,
    pi.produto_id,
    pi.quantidade,
    pi.preco_unitario,
    pi.subtotal,
    COALESCE(pi.variacoes_selecionadas, '{}'::jsonb),
    COALESCE(pi.produto_nome, pr.nome, 'Produto'),
    pi.tema_festa,
    pi.idade_festa,
    pi.kit_festa_data,
    pi.kit_festa_horario_inicio,
    pi.kit_festa_horario_fim,
    pi.google_event_id,
    pi.google_event_link,
    COALESCE(pi.opcionais_selecionados, '[]'::jsonb)
  FROM pedido_itens pi
  JOIN produtos pr ON pr.id = pi.produto_id
  WHERE pi.pedido_id = ANY(p_pedido_ids)
  AND EXISTS (
    SELECT 1 FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id AND u.auth_user_id = auth.uid()
    WHERE p.id = pi.pedido_id
  );
$$;

COMMENT ON FUNCTION public.get_itens_meus_pedidos(uuid[]) IS 'Retorna itens de pedidos do usuário logado (inclui Kit Festa e opcionais).';

-- =====================================================================
-- supabase/migrations/054_loja_variacoes_opcionais_select_autenticado.sql
-- =====================================================================
-- Loja: usuário autenticado (ex.: responsável) pode ler variações e opcionais de produtos ativos
-- para exibir na página do produto ao adicionar ao carrinho (sem ser admin).

-- variacoes: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le variacoes de produtos ativos" ON public.variacoes;
CREATE POLICY "Loja: autenticado le variacoes de produtos ativos" ON public.variacoes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = variacoes.produto_id AND p.ativo = TRUE
    )
  );

-- variacao_valores: SELECT para qualquer autenticado (produto ativo via variacao)
DROP POLICY IF EXISTS "Loja: autenticado le variacao_valores de produtos ativos" ON public.variacao_valores;
CREATE POLICY "Loja: autenticado le variacao_valores de produtos ativos" ON public.variacao_valores FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.variacoes v
      JOIN public.produtos p ON p.id = v.produto_id AND p.ativo = TRUE
      WHERE v.id = variacao_valores.variacao_id
    )
  );

-- grupos_opcionais: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le grupos_opcionais de produtos ativos" ON public.grupos_opcionais;
CREATE POLICY "Loja: autenticado le grupos_opcionais de produtos ativos" ON public.grupos_opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = grupos_opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- opcionais: SELECT para qualquer autenticado em produtos ativos
DROP POLICY IF EXISTS "Loja: autenticado le opcionais de produtos ativos" ON public.opcionais;
CREATE POLICY "Loja: autenticado le opcionais de produtos ativos" ON public.opcionais FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = opcionais.produto_id AND p.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/055_responsavel_ve_itens_pedidos_alunos.sql
-- =====================================================================
-- Responsável pode ver itens de pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para o extrato na Gestão de Saldo mostrar produtos das compras no PDV (pedido tem usuario_id = operador).
DROP POLICY IF EXISTS "Responsáveis veem itens de pedidos dos seus alunos" ON public.pedido_itens;
CREATE POLICY "Responsáveis veem itens de pedidos dos seus alunos" ON public.pedido_itens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      JOIN public.usuario_aluno ua ON ua.aluno_id = p.aluno_id
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE p.id = pedido_itens.pedido_id
    )
  );

-- =====================================================================
-- supabase/migrations/056_categorias_select_autenticados.sql
-- =====================================================================
-- Permite que usuários autenticados leiam categorias (para a loja agrupar produtos por categoria).
-- Admins continuam com FOR ALL; esta política adiciona SELECT para qualquer auth.uid() não nulo.
DROP POLICY IF EXISTS "Autenticados podem ler categorias" ON public.categorias;
CREATE POLICY "Autenticados podem ler categorias" ON public.categorias FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================================
-- supabase/migrations/057_abatimento_colaborador_lancamento.sql
-- =====================================================================
-- Lançamentos de abatimento (baixas) feitas pelo RH para relatório com data/hora
CREATE TABLE IF NOT EXISTS abatimento_colaborador_lancamento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor DECIMAL(12,2) NOT NULL CHECK (valor > 0),
  operador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_usuario ON abatimento_colaborador_lancamento(usuario_id);
CREATE INDEX IF NOT EXISTS idx_abatimento_lancamento_created ON abatimento_colaborador_lancamento(created_at);

ALTER TABLE abatimento_colaborador_lancamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento;
DROP POLICY IF EXISTS "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento;
CREATE POLICY "Admin RH ve e insere abatimento lancamento" ON public.abatimento_colaborador_lancamento FOR ALL
  USING (public.eh_admin_usuario(auth.uid()))
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- =====================================================================
-- supabase/migrations/058_config_lanche_do_dia_credito_cantina.sql
-- =====================================================================
-- Configurações: Lanche do Dia e segmentos com acesso ao Crédito Cantina
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('lanche_do_dia_produto_id', '', 'ID do produto exibido como Lanche do Dia na Loja', 'TEXTO', false),
  ('segmentos_credito_cantina', '[]', 'Segmentos (turmas) com acesso à rota /loja/credito-cantina (JSON array)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;

-- =====================================================================
-- supabase/migrations/059_credito_cantina_excecoes_turmas.sql
-- =====================================================================
-- Lista de exceção: turmas que NÃO têm acesso ao Crédito Cantina (por padrão todas têm acesso).
INSERT INTO configuracoes (chave, valor, descricao, tipo, sensivel) VALUES
  ('credito_cantina_excecoes_turma_ids', '[]', 'IDs das turmas sem acesso à rota /loja/credito-cantina (exceção)', 'JSON', false)
ON CONFLICT (chave) DO NOTHING;

-- =====================================================================
-- supabase/migrations/060_produto_disponibilidade_segmento_tipo_curso.sql
-- =====================================================================
-- Permite que produto_disponibilidade.segmento armazene valores da coluna tipo_curso da tabela turmas (texto livre)
ALTER TABLE produto_disponibilidade
  ALTER COLUMN segmento TYPE TEXT USING segmento::text;

-- =====================================================================
-- supabase/migrations/061_responsavel_ve_pedidos_dos_alunos.sql
-- =====================================================================
-- Responsável pode ver pedidos cujo aluno está vinculado a ele (usuario_aluno).
-- Necessário para a política "Responsáveis veem itens de pedidos dos seus alunos" em pedido_itens
-- funcionar: o subquery dessa política lê de pedidos; sem isso, responsáveis não-admin não
-- conseguiam ver itens das compras no extrato (pedidos PDV têm usuario_id = operador).
DROP POLICY IF EXISTS "Responsáveis veem pedidos dos seus alunos" ON public.pedidos;
CREATE POLICY "Responsáveis veem pedidos dos seus alunos" ON public.pedidos FOR SELECT
  USING (
    NOT public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuario_aluno ua
      JOIN public.usuarios u ON u.id = ua.usuario_id AND u.auth_user_id = auth.uid()
      WHERE ua.aluno_id = pedidos.aluno_id
    )
  );

-- =====================================================================
-- supabase/migrations/062_deduplicar_colaboradores_por_cpf.sql
-- =====================================================================
-- Deduplicar colaboradores por CPF: manter um por CPF (o de menor id), reassignar referências e apagar os demais.
-- Rodar manualmente uma vez no SQL Editor do Supabase (ou via MCP).

DO $$
DECLARE
  rec RECORD;
  kept_id UUID;
  dup_id UUID;
BEGIN
  FOR rec IN (
    WITH
    raw_cpf AS (
      SELECT u.id, u.cpf,
             regexp_replace(COALESCE(TRIM(u.cpf::text), ''), '[^0-9]', '', 'g') AS digits
      FROM usuarios u
      WHERE EXISTS (
        SELECT 1 FROM usuario_papeis up
        WHERE up.usuario_id = u.id AND up.papel = 'COLABORADOR'
      )
    ),
    colab AS (
      SELECT rc.id, rc.cpf,
             CASE
               WHEN LENGTH(rc.digits) = 11 THEN rc.digits
               WHEN LENGTH(rc.digits) = 10 THEN '0' || rc.digits
               ELSE NULL
             END AS cpf_norm,
             EXISTS (
               SELECT 1 FROM public.usuario_perfis up
               JOIN public.perfis p ON p.id = up.perfil_id
               WHERE up.usuario_id = rc.id AND p.nome IN ('Admin', 'Acesso total')
             ) AS tem_admin
      FROM raw_cpf rc
      WHERE LENGTH(rc.digits) IN (10, 11)
    ),
    ranked AS (
      -- Manter o que tem Admin (ou Acesso total); senão o de menor id (nunca apagar admin por engano)
      SELECT id, cpf_norm,
             ROW_NUMBER() OVER (PARTITION BY cpf_norm ORDER BY tem_admin DESC, id) AS rn
      FROM colab
    ),
    dups AS (
      SELECT rk.id AS duplicate_id,
             (SELECT r2.id FROM ranked r2 WHERE r2.cpf_norm = rk.cpf_norm AND r2.rn = 1 LIMIT 1) AS keep_id
      FROM ranked rk
      WHERE rk.rn > 1
    )
    SELECT duplicate_id, keep_id FROM dups
  )
  LOOP
    dup_id := rec.duplicate_id;
    kept_id := rec.keep_id;
    IF dup_id IS NULL OR kept_id IS NULL OR dup_id = kept_id THEN
      CONTINUE;
    END IF;

    -- Pedidos: apontar para o usuário que fica
    UPDATE pedidos SET colaborador_id = kept_id WHERE colaborador_id = dup_id;
    -- Transações (pagamentos) do duplicado passam para o kept (evita RESTRICT)
    UPDATE transacoes SET usuario_id = kept_id WHERE usuario_id = dup_id;
    -- Caixas: se o duplicado for operador de caixa, reassign para o kept (evita RESTRICT ao deletar)
    UPDATE caixas SET operador_id = kept_id WHERE operador_id = dup_id;

    -- Consumo mensal: linhas do duplicado que não conflitam com kept -> só trocar usuario_id
    UPDATE consumo_colaborador_mensal
    SET usuario_id = kept_id, updated_at = NOW()
    WHERE usuario_id = dup_id
      AND NOT EXISTS (
        SELECT 1 FROM consumo_colaborador_mensal c2
        WHERE c2.usuario_id = kept_id
          AND c2.empresa_id = consumo_colaborador_mensal.empresa_id
          AND c2.ano = consumo_colaborador_mensal.ano
          AND c2.mes = consumo_colaborador_mensal.mes
      );

    -- Conflitos: somar valor_total e valor_abatido na linha do kept
    UPDATE consumo_colaborador_mensal c
    SET valor_total = c.valor_total + sub.soma_total,
        valor_abatido = c.valor_abatido + sub.soma_abatido,
        updated_at = NOW()
    FROM (
      SELECT empresa_id, ano, mes,
             SUM(valor_total) AS soma_total,
             SUM(valor_abatido) AS soma_abatido
      FROM consumo_colaborador_mensal
      WHERE usuario_id = dup_id
      GROUP BY empresa_id, ano, mes
    ) sub
    WHERE c.usuario_id = kept_id
      AND c.empresa_id = sub.empresa_id AND c.ano = sub.ano AND c.mes = sub.mes;

    -- Remover todas as linhas de consumo do duplicado
    DELETE FROM consumo_colaborador_mensal WHERE usuario_id = dup_id;

    -- Abatimentos: apontar para o que fica (tabela pode não existir em todos os projetos)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abatimento_colaborador_lancamento') THEN
      UPDATE abatimento_colaborador_lancamento SET usuario_id = kept_id WHERE usuario_id = dup_id;
    END IF;

    -- Papéis e depois o usuário
    DELETE FROM usuario_papeis WHERE usuario_id = dup_id;
    DELETE FROM usuarios WHERE id = dup_id;
  END LOOP;
END $$;

-- =====================================================================
-- supabase/migrations/063_movimento_estoque_entrada.sql
-- =====================================================================
-- Registro de entradas de estoque (e futuras saídas) para rastreabilidade.
-- Cada linha é um movimento: produto (e opcionalmente variacao_valor) + quantidade.
CREATE TABLE IF NOT EXISTS public.movimento_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_empresa ON public.movimento_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_produto ON public.movimento_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_created ON public.movimento_estoque(created_at DESC);

COMMENT ON TABLE public.movimento_estoque IS 'Entradas (e futuras saídas) de estoque; quantidade > 0 = entrada.';

ALTER TABLE public.movimento_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem movimentos de estoque da empresa" ON public.movimento_estoque;

CREATE POLICY "Admins veem movimentos de estoque da empresa" ON public.movimento_estoque FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Admins inserem movimentos de estoque" ON public.movimento_estoque;

CREATE POLICY "Admins inserem movimentos de estoque" ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/064_entrada_estoque_cabecalho_custo.sql
-- =====================================================================
-- Cabeçalho da entrada (número da entrada, número da nota, valor total) e custo unitário nos itens.

CREATE TABLE IF NOT EXISTS public.entrada_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_entrada INTEGER NOT NULL,
  numero_nota TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  valor_total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entrada_estoque_empresa_numero ON public.entrada_estoque(empresa_id, numero_entrada);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_empresa ON public.entrada_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_entrada_estoque_created ON public.entrada_estoque(created_at DESC);

COMMENT ON TABLE public.entrada_estoque IS 'Cabeçalho de cada entrada de estoque (número da entrada, nota, usuário, valor total).';

ALTER TABLE public.entrada_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem entradas de estoque" ON public.entrada_estoque;

CREATE POLICY "Admins veem entradas de estoque" ON public.entrada_estoque FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

DROP POLICY IF EXISTS "Admins inserem entradas de estoque" ON public.entrada_estoque;

CREATE POLICY "Admins inserem entradas de estoque" ON public.entrada_estoque FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

DROP POLICY IF EXISTS "Admins atualizam entradas de estoque" ON public.entrada_estoque;

CREATE POLICY "Admins atualizam entradas de estoque" ON public.entrada_estoque FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.usuario_admin_cache c WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE)
  );

-- Adicionar colunas em movimento_estoque
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS entrada_id UUID REFERENCES public.entrada_estoque(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_entrada ON public.movimento_estoque(entrada_id);

-- =====================================================================
-- supabase/migrations/065_produtos_valor_custo.sql
-- =====================================================================
-- Valor de custo do produto (moeda) para controle interno
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS valor_custo NUMERIC(12,2);

COMMENT ON COLUMN public.produtos.valor_custo IS 'Custo unitário do produto em R$ (uso interno/admin).';

-- =====================================================================
-- supabase/migrations/066_parcelamento_regras.sql
-- =====================================================================
-- Regras de parcelamento para checkout (cartão)
CREATE TABLE IF NOT EXISTS public.parcelamento_regras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  valor_min NUMERIC(12,2) NOT NULL CHECK (valor_min >= 0),
  valor_max NUMERIC(12,2) NULL,
  max_parcelas INTEGER NOT NULL CHECK (max_parcelas >= 1 AND max_parcelas <= 10),
  tipo TEXT NOT NULL CHECK (tipo IN ('SEM_JUROS', 'COM_JUROS')),
  taxa_juros_pct NUMERIC(5,2) NULL CHECK (taxa_juros_pct IS NULL OR (taxa_juros_pct >= 0 AND taxa_juros_pct <= 100)),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_taxa_se_com_juros CHECK (
    (tipo = 'SEM_JUROS' AND taxa_juros_pct IS NULL) OR
    (tipo = 'COM_JUROS')
  ),
  CONSTRAINT chk_valor_max CHECK (valor_max IS NULL OR valor_max >= valor_min)
);

CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_ordem ON public.parcelamento_regras(ordem);
CREATE INDEX IF NOT EXISTS idx_parcelamento_regras_valor ON public.parcelamento_regras(valor_min, valor_max);

COMMENT ON TABLE public.parcelamento_regras IS 'Regras de parcelamento por faixa de valor (admin > Configurações > Pagamento).';

ALTER TABLE public.parcelamento_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler regras de parcelamento" ON public.parcelamento_regras;

CREATE POLICY "Autenticados podem ler regras de parcelamento" ON public.parcelamento_regras FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins podem gerenciar regras de parcelamento" ON public.parcelamento_regras;

CREATE POLICY "Admins podem gerenciar regras de parcelamento" ON public.parcelamento_regras FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuario_admin_cache c
      WHERE c.auth_user_id = auth.uid() AND c.is_admin = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/067_concorrencia_transacoes_saldo.sql
-- =====================================================================
-- Garantir idempotência na confirmação de transação (evitar dupla criação de pedidos/recarga)
-- e incremento atômico de saldo para recargas concorrentes.

-- Tabela de “lock”: quem inserir primeiro confirma a transação; demais retornam sem duplicar.
CREATE TABLE IF NOT EXISTS transacao_confirmacao (
  transacao_id UUID PRIMARY KEY REFERENCES transacoes(id) ON DELETE CASCADE
);
COMMENT ON TABLE transacao_confirmacao IS 'Uma linha por transação já confirmada; evita dupla execução de confirmarTransacaoAprovada.';

-- Função atômica: incrementa saldo do aluno (INSERT ou UPDATE) sem race condition.
CREATE OR REPLACE FUNCTION public.incrementar_saldo_aluno(p_aluno_id UUID, p_valor DECIMAL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO aluno_saldos (aluno_id, saldo)
  VALUES (p_aluno_id, GREATEST(0, p_valor))
  ON CONFLICT (aluno_id)
  DO UPDATE SET
    saldo = aluno_saldos.saldo + EXCLUDED.saldo,
    updated_at = now();
$$;
COMMENT ON FUNCTION public.incrementar_saldo_aluno IS 'Incrementa saldo do aluno de forma atômica (recarga online concorrente).';

-- Abate atômico de estoque (variacao_valores): evita estoque negativo com PDV e online concorrentes.
CREATE OR REPLACE FUNCTION public.decrementar_estoque_variacao_valor(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE variacao_valores
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;

-- Abate atômico de estoque (produtos).
CREATE OR REPLACE FUNCTION public.decrementar_estoque_produto(p_id UUID, p_quantidade INT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE produtos
    SET estoque = estoque - p_quantidade, updated_at = now()
    WHERE id = p_id AND estoque IS NOT NULL AND estoque >= p_quantidade
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM u);
$$;

-- =====================================================================
-- supabase/migrations/068_departamentos_segmentos.sql
-- =====================================================================
-- Departamentos (ex.: Pedagógico, Administrativo) por empresa
CREATE TABLE IF NOT EXISTS departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departamentos_empresa ON departamentos(empresa_id);

-- Segmentos (ex.: EFAF, EFAI, Infantil) dentro de cada departamento
CREATE TABLE IF NOT EXISTS segmentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segmentos_departamento ON segmentos(departamento_id);

-- RLS
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem gerenciar departamentos" ON departamentos;

CREATE POLICY "Admins podem gerenciar departamentos" ON departamentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Admins podem gerenciar segmentos" ON segmentos;

CREATE POLICY "Admins podem gerenciar segmentos" ON segmentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );

-- =====================================================================
-- supabase/migrations/069_consumo_interno.sql
-- =====================================================================
-- Módulo Consumo Interno no PDV: cabecalho e itens com custo histórico.

CREATE TABLE IF NOT EXISTS public.consumo_interno (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  withdrawn_by TEXT NOT NULL,
  departamento_id UUID NOT NULL REFERENCES public.departamentos(id) ON DELETE RESTRICT,
  segmento_id UUID NOT NULL REFERENCES public.segmentos(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_empresa ON public.consumo_interno(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consumo_interno_created ON public.consumo_interno(created_at DESC);

COMMENT ON TABLE public.consumo_interno IS 'Lançamentos de consumo interno no PDV (operador, quem retirou, departamento/segmento).';

CREATE TABLE IF NOT EXISTS public.consumo_interno_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumo_interno_id UUID NOT NULL REFERENCES public.consumo_interno(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variacao_valor_id UUID REFERENCES public.variacao_valores(id) ON DELETE SET NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario NUMERIC(12,2) NOT NULL,
  total_custo NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_itens_consumo ON public.consumo_interno_itens(consumo_interno_id);

COMMENT ON TABLE public.consumo_interno_itens IS 'Itens do consumo interno com custo histórico no momento do lançamento.';

-- movimento_estoque: tipo (entrada vs consumo interno) e referência ao consumo
ALTER TABLE public.movimento_estoque
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS consumo_interno_id UUID REFERENCES public.consumo_interno(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.movimento_estoque.tipo IS 'entrada | internal_consumption. Para internal_consumption a quantidade é negativa.';

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_consumo ON public.movimento_estoque(consumo_interno_id) WHERE consumo_interno_id IS NOT NULL;

-- RLS consumo_interno
ALTER TABLE public.consumo_interno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados veem consumo interno da empresa" ON public.consumo_interno;

CREATE POLICY "Usuários autenticados veem consumo interno da empresa" ON public.consumo_interno FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Usuários autenticados inserem consumo interno" ON public.consumo_interno;

CREATE POLICY "Usuários autenticados inserem consumo interno" ON public.consumo_interno FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = consumo_interno.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- RLS consumo_interno_itens
ALTER TABLE public.consumo_interno_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados veem itens de consumo interno" ON public.consumo_interno_itens;

CREATE POLICY "Usuários autenticados veem itens de consumo interno" ON public.consumo_interno_itens FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

DROP POLICY IF EXISTS "Usuários autenticados inserem itens de consumo interno" ON public.consumo_interno_itens;

CREATE POLICY "Usuários autenticados inserem itens de consumo interno" ON public.consumo_interno_itens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.consumo_interno c
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = c.empresa_id OR u.empresa_id IS NULL)
      WHERE c.id = consumo_interno_itens.consumo_interno_id
    )
  );

-- Operador pode inserir movimento de estoque do tipo consumo interno
DROP POLICY IF EXISTS "Operador insere movimento consumo interno" ON public.movimento_estoque;
CREATE POLICY "Operador insere movimento consumo interno" ON public.movimento_estoque FOR INSERT
  WITH CHECK (
    tipo = 'internal_consumption'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- Operador pode ver movimentos da própria empresa (para consistência)
DROP POLICY IF EXISTS "Usuários veem movimentos da empresa" ON public.movimento_estoque;
CREATE POLICY "Usuários veem movimentos da empresa" ON public.movimento_estoque FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = movimento_estoque.empresa_id OR u.empresa_id IS NULL)
    )
  );

-- PDV: listar departamentos e segmentos (SELECT para usuários da empresa)
DROP POLICY IF EXISTS "Usuários autenticados veem departamentos" ON public.departamentos;
CREATE POLICY "Usuários autenticados veem departamentos" ON public.departamentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Usuários autenticados veem segmentos" ON public.segmentos;

CREATE POLICY "Usuários autenticados veem segmentos" ON public.segmentos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );

-- =====================================================================
-- supabase/migrations/070_variacao_valores_label_igual_valor.sql
-- =====================================================================
-- Garantir que label seja exibido na loja/PDV: preencher label com valor quando estiver vazio.
-- Assim a loja e o PDV exibem o mesmo texto (label ou valor) sem quebrar.
UPDATE public.variacao_valores
SET label = valor
WHERE label IS NULL OR TRIM(label) = '';

-- =====================================================================
-- supabase/migrations/071_produtos_termo_aceite.sql
-- =====================================================================
-- Termo de aceite no produto: exibir na loja e exigir checkbox antes de adicionar ao carrinho.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS exigir_termo_aceite BOOLEAN DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS texto_termo_aceite TEXT;

COMMENT ON COLUMN public.produtos.exigir_termo_aceite IS 'Se true, na loja exige aceite do termo antes de adicionar ao carrinho';
COMMENT ON COLUMN public.produtos.texto_termo_aceite IS 'Texto do termo de aceite (quebras de linha preservadas)';

-- =====================================================================
-- supabase/migrations/072_rh_acesso_consumo_empresas.sql
-- =====================================================================
-- Permite que usuários com perfil RH (recurso admin.rh) vejam e gerenciem consumo_colaborador_mensal
-- e vejam empresas, para que a página /admin/rh funcione sem depender apenas do service role.

-- Função: true se o usuário tem perfil com recurso admin.rh
CREATE OR REPLACE FUNCTION public.eh_rh_usuario(user_id UUID)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_perfis up ON up.usuario_id = u.id
    JOIN public.perfil_permissoes pp ON pp.perfil_id = up.perfil_id
    WHERE u.auth_user_id = user_id AND u.ativo = TRUE
      AND pp.recurso = 'admin.rh'
  );
END;
$$;

-- consumo_colaborador_mensal: permitir RH além de admin
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
DROP POLICY IF EXISTS "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal;
CREATE POLICY "Financeiro admin veem e gerenciam consumo" ON public.consumo_colaborador_mensal FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid()) OR public.eh_rh_usuario(auth.uid())
  );

-- empresas: em 002 já existe "Todos veem empresas" (SELECT USING true). Se em algum
-- projeto essa política tiver sido removida, descomente e aplique:
-- CREATE POLICY "RH podem ver empresas" ON public.empresas FOR SELECT USING (public.eh_rh_usuario(auth.uid()));

-- =====================================================================
-- supabase/migrations/073_perfil_permissoes_usuario_ve_proprios_perfis.sql
-- =====================================================================
-- Usuários com perfil (ex.: RH) precisam poder LER as permissões dos perfis que têm atribuídos,
-- para obterRecursosDoUsuario() e podeAcessarRH() funcionarem. Sem isso, RLS bloqueia e o menu
-- fica cheio (recursos = []) e o RH não vê colaboradores (podeAcessarRH = false).

DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;

CREATE POLICY "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes FOR SELECT
  USING (
    perfil_id IN (
      SELECT up.perfil_id
      FROM public.usuario_perfis up
      JOIN public.usuarios u ON u.id = up.usuario_id AND u.auth_user_id = auth.uid() AND u.ativo = TRUE
    )
  );

-- =====================================================================
-- supabase/migrations/074_rh_perfil_permissoes_definer.sql
-- =====================================================================
-- Garante que usuário (ex.: RH) consiga ler permissões dos próprios perfis.
-- Usa função SECURITY DEFINER para não depender de RLS em usuario_perfis/usuarios na hora de avaliar a política.

-- Função: retorna os perfil_id que o usuário atual tem em usuario_perfis
CREATE OR REPLACE FUNCTION public.perfis_do_usuario_atual()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT up.perfil_id
  FROM public.usuario_perfis up
  JOIN public.usuarios u ON u.id = up.usuario_id AND u.ativo = TRUE
  WHERE u.auth_user_id = auth.uid();
$$;

-- Remove política anterior se existir (evita duplicata)
DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;

-- Política usando a função: usuário vê apenas perfil_permissoes dos perfis que ele tem
DROP POLICY IF EXISTS "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes;
CREATE POLICY "Usuário vê permissões dos próprios perfis" ON public.perfil_permissoes FOR SELECT
  USING (perfil_id IN (SELECT public.perfis_do_usuario_atual()));

-- =====================================================================
-- supabase/migrations/075_perfil_rh_recurso_admin_rh.sql
-- =====================================================================
-- Garante que o perfil "RH" exista e tenha o recurso admin.rh em perfil_permissoes.
-- Assim usuários atribuídos ao perfil RH (usuario_perfis) passam a ver o módulo RH.
-- O código também aceita papel RH em usuario_papeis (legado).

INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'RH', 'Recursos Humanos – colaboradores, consumo e abatimento', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'RH');

INSERT INTO public.perfil_permissoes (perfil_id, recurso)
SELECT p.id, 'admin.rh'
FROM public.perfis p
WHERE p.nome = 'RH'
  AND NOT EXISTS (
    SELECT 1 FROM public.perfil_permissoes pp
    WHERE pp.perfil_id = p.id AND pp.recurso = 'admin.rh'
  );

-- =====================================================================
-- supabase/migrations/076_migracao_saldo_historico.sql
-- =====================================================================
-- Migração de saldo do sistema antigo: tipo de movimentação e tabela de histórico
-- Projeto: loja-sup (jznhaioobvjwjdmigxja) – aplicar via MCP Supabase ou Supabase CLI/Dashboard

-- Novo valor no enum de movimentação de saldo (compatível com PG < 15)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'movimento_saldo_tipo' AND e.enumlabel = 'MIGRACAO_SALDO'
  ) THEN
    ALTER TYPE movimento_saldo_tipo ADD VALUE 'MIGRACAO_SALDO';
  END IF;
END
$$;

-- Tabela de histórico de migrações (cada execução do "Confirmar Migração")
CREATE TABLE IF NOT EXISTS historico_migracoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_alunos INT NOT NULL,
  valor_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE historico_migracoes IS 'Registro de cada lote de migração de saldo do sistema antigo.';

-- RLS: apenas admins
ALTER TABLE historico_migracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem historico_migracoes" ON historico_migracoes;

CREATE POLICY "Admins veem historico_migracoes" ON historico_migracoes FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

DROP POLICY IF EXISTS "Admins inserem historico_migracoes" ON historico_migracoes;

CREATE POLICY "Admins inserem historico_migracoes" ON historico_migracoes FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_historico_migracoes_created ON historico_migracoes(created_at DESC);

-- RPC: executar migração de saldo em uma única transação
CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Valor inválido para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (v_total_alunos, v_valor_total)
  RETURNING id INTO v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

COMMENT ON FUNCTION public.executar_migracao_saldo IS 'Migração de saldo: atualiza aluno_saldos, insere aluno_movimentacoes (MIGRACAO_SALDO) e historico_migracoes em uma transação.';

-- Recurso "Migrar Saldo" no perfil Acesso total
INSERT INTO public.perfil_permissoes (perfil_id, recurso)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'admin.migrarSaldo')
ON CONFLICT (perfil_id, recurso) DO NOTHING;

-- =====================================================================
-- supabase/migrations/077_historico_migracao_itens.sql
-- =====================================================================
-- Detalhe por aluno em cada lançamento de migração (para expandir no histórico)

CREATE TABLE IF NOT EXISTS historico_migracao_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  historico_migracao_id UUID NOT NULL REFERENCES historico_migracoes(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  valor DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_migracao_itens_historico ON historico_migracao_itens(historico_migracao_id);

COMMENT ON TABLE historico_migracao_itens IS 'Cada aluno e valor de um lote de migração de saldo (para exibir no histórico expandido).';

ALTER TABLE historico_migracao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem historico_migracao_itens" ON historico_migracao_itens;

CREATE POLICY "Admins veem historico_migracao_itens" ON historico_migracao_itens FOR SELECT
  USING (public.eh_admin_usuario(auth.uid()));

DROP POLICY IF EXISTS "Admins inserem historico_migracao_itens" ON historico_migracao_itens;

CREATE POLICY "Admins inserem historico_migracao_itens" ON historico_migracao_itens FOR INSERT
  WITH CHECK (public.eh_admin_usuario(auth.uid()));

-- RPC atualizada: cria historico primeiro, insere itens no loop, atualiza totais no final
CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  -- Criar registro do histórico (totais atualizados no final)
  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (0, 0)
  RETURNING id INTO v_historico_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Valor inválido para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    INSERT INTO historico_migracao_itens (historico_migracao_id, aluno_id, valor)
    VALUES (v_historico_id, v_aluno_id, v_valor);

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  UPDATE historico_migracoes
  SET total_alunos = v_total_alunos, valor_total = v_valor_total
  WHERE id = v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/078_pdv_perfil_rls.sql
-- =====================================================================
-- Permite que usuários com perfil PDV (recurso 'pdv' em perfil_permissoes) tenham as mesmas
-- permissões de operador (usuario_papeis OPERADOR): ver pedidos do dia, listar alunos, produtos, turmas.

-- 1. Estender eh_admin_ou_operador para incluir quem tem recurso 'pdv' no perfil
CREATE OR REPLACE FUNCTION public.eh_admin_ou_operador()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.eh_admin_usuario(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_papeis up ON up.usuario_id = u.id
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE AND up.papel = 'OPERADOR'
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_perfis up ON up.usuario_id = u.id
    JOIN public.perfil_permissoes pp ON pp.perfil_id = up.perfil_id AND pp.recurso = 'pdv'
    WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
  );
$$;

COMMENT ON FUNCTION public.eh_admin_ou_operador IS 'True se usuário é admin, operador (usuario_papeis) ou tem perfil com recurso pdv (perfil_permissoes).';

-- 2. Pedidos: operador/pdv deve ver pedidos (para pdv/pedidos e retirada)
DROP POLICY IF EXISTS "Operador ve pedidos para retirada" ON public.pedidos;
DROP POLICY IF EXISTS "Operador e PDV veem pedidos para retirada" ON public.pedidos;
CREATE POLICY "Operador e PDV veem pedidos para retirada" ON public.pedidos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Produtos: operador/pdv deve ler produtos (para listar itens no PDV)
DROP POLICY IF EXISTS "Operador le produtos" ON public.produtos;
DROP POLICY IF EXISTS "Operador e PDV leem produtos" ON public.produtos;
CREATE POLICY "Operador e PDV leem produtos" ON public.produtos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 4. Alunos: operador/pdv deve ver todos os alunos (para venda aluno em pdv/vendas)
DROP POLICY IF EXISTS "Operador e PDV veem alunos" ON public.alunos;
CREATE POLICY "Operador e PDV veem alunos" ON public.alunos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 5. Turmas: operador/pdv deve ver turmas (join em listagem de alunos)
DROP POLICY IF EXISTS "Operador e PDV veem turmas" ON public.turmas;
CREATE POLICY "Operador e PDV veem turmas" ON public.turmas FOR SELECT
  USING (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/079_rpc_produtos_disponiveis_responsavel.sql
-- =====================================================================
-- RPC: retorna IDs dos produtos disponíveis para o responsável logado (auth.uid()).
-- Resolve truncamento do PostgREST (limite 1000 linhas) e evita trazer milhares de linhas de produto_disponibilidade.
-- Uma única chamada; a lógica de disponibilidade (TODOS, TURMA, SEGMENTO, ALUNO) e filtros (empresa, unidade, visibilidade) fica no banco.

CREATE OR REPLACE FUNCTION public.produtos_disponiveis_ids_responsavel()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH responsavel AS (
    SELECT u.id AS usuario_id
    FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
    LIMIT 1
  ),
  filhos AS (
    SELECT ua.aluno_id
    FROM usuario_aluno ua
    JOIN responsavel r ON r.usuario_id = ua.usuario_id
  ),
  alunos_ativos AS (
    SELECT a.id, a.turma_id, a.empresa_id, a.unidade_id
    FROM alunos a
    JOIN filhos f ON f.aluno_id = a.id
    WHERE a.situacao = 'ATIVO'
  ),
  turmas_filhos AS (
    SELECT t.id AS turma_id, lower(trim(coalesce(nullif(trim(t.tipo_curso), ''), t.segmento::text, ''))) AS segmento_norm
    FROM alunos_ativos aa
    JOIN turmas t ON t.id = aa.turma_id
    WHERE aa.turma_id IS NOT NULL
  ),
  empresas_filhos AS (
    SELECT DISTINCT empresa_id FROM alunos_ativos
  ),
  unidades_filhos AS (
    SELECT DISTINCT unidade_id FROM alunos_ativos WHERE unidade_id IS NOT NULL
  ),
  tem_aluno_sem_unidade AS (
    SELECT EXISTS (SELECT 1 FROM alunos_ativos WHERE unidade_id IS NULL) AS v
  ),
  produtos_candidatos AS (
    SELECT p.id
    FROM produtos p
    CROSS JOIN responsavel r
    JOIN usuarios u ON u.id = r.usuario_id
    JOIN empresas_filhos ef ON ef.empresa_id = p.empresa_id
    WHERE p.ativo = true
      AND (
        p.unidade_id IS NULL
        OR p.unidade_id IN (SELECT unidade_id FROM unidades_filhos)
        OR ((SELECT v FROM tem_aluno_sem_unidade) AND (SELECT count(*) FROM unidades_filhos) = 0)
      )
  ),
  segmentos_norm AS (
    SELECT DISTINCT segmento_norm FROM turmas_filhos WHERE segmento_norm <> ''
  ),
  turma_ids_arr AS (
    SELECT array_agg(DISTINCT turma_id) AS arr FROM turmas_filhos
  ),
  aluno_ids_arr AS (
    SELECT array_agg(DISTINCT id) AS arr FROM alunos_ativos
  )
  SELECT DISTINCT pc.id
  FROM produtos_candidatos pc
  WHERE (
    -- Sem nenhuma regra de disponibilidade: produto visível para todos (comportamento do app)
    NOT EXISTS (SELECT 1 FROM produto_disponibilidade pd0 WHERE pd0.produto_id = pc.id)
    OR
    EXISTS (
      SELECT 1
      FROM produto_disponibilidade pd
      WHERE pd.produto_id = pc.id
        AND (pd.disponivel_de IS NULL OR pd.disponivel_de <= now())
        AND (pd.disponivel_ate IS NULL OR pd.disponivel_ate >= now())
        AND (
          pd.tipo = 'TODOS'
          OR (pd.tipo = 'TURMA' AND pd.turma_id IS NOT NULL AND pd.turma_id IN (SELECT unnest(COALESCE((SELECT arr FROM turma_ids_arr), ARRAY[]::uuid[]))))
          OR (pd.tipo = 'SEGMENTO' AND pd.segmento IS NOT NULL AND trim(pd.segmento) <> '' AND lower(trim(pd.segmento)) IN (SELECT segmento_norm FROM segmentos_norm))
          OR (pd.tipo = 'ALUNO' AND pd.aluno_id IS NOT NULL AND pd.aluno_id IN (SELECT unnest(COALESCE((SELECT arr FROM aluno_ids_arr), ARRAY[]::uuid[]))))
        )
    )
  );
$$;

COMMENT ON FUNCTION public.produtos_disponiveis_ids_responsavel() IS 'Retorna os IDs dos produtos que estão disponíveis para o responsável logado (loja), conforme regras de disponibilidade e filtros de empresa/unidade/visibilidade.';

-- =====================================================================
-- supabase/migrations/080_pdv_saldo_alunos_rls.sql
-- =====================================================================
-- Permite que usuários com perfil PDV (recurso 'pdv') vejam e atualizem saldo dos alunos
-- em PDV/vendas. A migration 078 já estendeu eh_admin_ou_operador() para pedidos, alunos,
-- produtos e turmas, mas aluno_saldos e aluno_movimentacoes ainda só permitiam OPERADOR
-- (usuario_papeis), não quem tem apenas perfil com recurso 'pdv'.

-- 1. aluno_saldos: SELECT para operador/PDV ver saldo dos alunos no PDV
DROP POLICY IF EXISTS "Operador e PDV veem aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV veem aluno_saldos" ON public.aluno_saldos FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 2. aluno_movimentacoes: SELECT para operador/PDV ver histórico (ex.: tela de vendas)
DROP POLICY IF EXISTS "Operador e PDV veem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV veem aluno_movimentacoes" ON public.aluno_movimentacoes FOR SELECT
  USING (public.eh_admin_ou_operador());

-- 3. Substituir políticas que hoje só permitem OPERADOR (usuario_papeis) por eh_admin_ou_operador(),
--    para que perfil PDV também possa inserir movimentações e atualizar saldos ao vender.

DROP POLICY IF EXISTS "Operador insere aluno_movimentacoes" ON public.aluno_movimentacoes;
DROP POLICY IF EXISTS "Operador e PDV inserem aluno_movimentacoes" ON public.aluno_movimentacoes;
CREATE POLICY "Operador e PDV inserem aluno_movimentacoes" ON public.aluno_movimentacoes FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador atualiza aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Operador e PDV atualizam aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV atualizam aluno_saldos" ON public.aluno_saldos FOR UPDATE
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Operador insere aluno_saldos" ON public.aluno_saldos;
DROP POLICY IF EXISTS "Operador e PDV inserem aluno_saldos" ON public.aluno_saldos;
CREATE POLICY "Operador e PDV inserem aluno_saldos" ON public.aluno_saldos FOR INSERT
  WITH CHECK (public.eh_admin_ou_operador());

-- =====================================================================
-- supabase/migrations/081_aluno_config_saldo_negativo.sql
-- =====================================================================
-- Controle do responsável: bloquear compra na cantina com saldo negativo
ALTER TABLE public.aluno_config
  ADD COLUMN IF NOT EXISTS bloquear_compra_saldo_negativo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.aluno_config.bloquear_compra_saldo_negativo IS
  'Se true, o responsável bloqueia compras no PDV com saldo negativo para este aluno.';

-- =====================================================================
-- supabase/migrations/082_indices_performance_concorrencia.sql
-- =====================================================================
-- Índices para alta concorrência e performance (PDV, loja, admin)
-- Reduz 504/Statement Timeout e bloqueios em pedidos, saldo e caixas.

-- ========== PEDIDOS (vendas, relatórios, listagens) ==========
-- Filtros comuns: status, created_at (período), empresa_id, caixa_id, aluno_id
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status_created ON public.pedidos(status, created_at DESC)
  WHERE status IN ('PAGO', 'ENTREGUE');
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_created ON public.pedidos(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_caixa ON public.pedidos(caixa_id) WHERE caixa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_aluno ON public.pedidos(aluno_id) WHERE aluno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_origem ON public.pedidos(origem) WHERE origem IS NOT NULL;

-- ========== PEDIDO_ITENS (JOINs, listagens por pedido) ==========
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id ON public.pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_produto_id ON public.pedido_itens(produto_id);

-- ========== CAIXAS (abertura/fechamento, resumo por operador) ==========
CREATE INDEX IF NOT EXISTS idx_caixas_empresa_status ON public.caixas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_caixas_operador_status ON public.caixas(operador_id, status);

-- ========== ALUNO_MOVIMENTACOES (extrato, gasto hoje, relatórios) ==========
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_pedido_id ON public.aluno_movimentacoes(pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aluno_movimentacoes_aluno_tipo_created ON public.aluno_movimentacoes(aluno_id, tipo, created_at DESC);

-- ========== CONSUMO COLABORADOR (financeiro mensal) ==========
CREATE INDEX IF NOT EXISTS idx_consumo_colaborador_empresa_ano_mes ON public.consumo_colaborador_mensal(empresa_id, ano, mes DESC);

-- ========== PAGAMENTOS (por caixa, por pedido) ==========
-- idx_pagamentos_caixa (035) e idx_pagamentos_pedido (001) já existem

-- ========== CONFIGURAÇÕES (leitura frequente) ==========
-- idx_configuracoes_chave já existe em 009

-- =====================================================================
-- supabase/migrations/083_aluno_saldos_permitir_negativo.sql
-- =====================================================================
-- Permitir saldo negativo em aluno_saldos (regras aplicadas na aplicação: admin, responsável, limite).
-- Remove a CHECK que impedia saldo < 0 e causava "violates check constraint" ao debitar no PDV.
ALTER TABLE public.aluno_saldos
  DROP CONSTRAINT IF EXISTS aluno_saldos_saldo_check;

COMMENT ON TABLE public.aluno_saldos IS 'Saldo por aluno. Pode ser negativo quando admin permite e responsável não bloqueou (regras em configuracoes e aluno_config).';

-- =====================================================================
-- supabase/migrations/084_migracao_saldo_permitir_negativo.sql
-- =====================================================================
-- Permitir valores negativos na migração de saldo (débitos do sistema antigo).
-- Ajusta a RPC executar_migracao_saldo para aceitar valor < 0 e recusar apenas 0.

CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    -- Agora permite valores negativos (débito), apenas recusa zero.
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'Valor inválido (zero) para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (v_total_alunos, v_valor_total)
  RETURNING id INTO v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/085_migracao_saldo_restaurar_itens.sql
-- =====================================================================
-- Restaurar gravação de itens no histórico de migração
-- (ajuste anterior de 084 removeu, sem querer, o INSERT em historico_migracao_itens).
-- Esta versão permite valores negativos (débito) e volta a registrar todos os alunos/valores.

CREATE OR REPLACE FUNCTION public.executar_migracao_saldo(p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  v_aluno_id UUID;
  v_valor DECIMAL(12,2);
  v_saldo_atual DECIMAL(12,2);
  v_total_alunos INT := 0;
  v_valor_total DECIMAL(12,2) := 0;
  v_historico_id UUID;
BEGIN
  IF NOT public.eh_admin_usuario(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar migração de saldo';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum item para migrar');
  END IF;

  -- Criar registro do histórico (totais atualizados no final)
  INSERT INTO historico_migracoes (total_alunos, valor_total)
  VALUES (0, 0)
  RETURNING id INTO v_historico_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_aluno_id := (item->>'aluno_id')::UUID;
    v_valor := (item->>'valor')::DECIMAL(12,2);
    -- Permite valores negativos (débito), apenas recusa zero.
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'Valor inválido (zero) para aluno %', v_aluno_id;
    END IF;

    SELECT saldo INTO v_saldo_atual
    FROM aluno_saldos
    WHERE aluno_id = v_aluno_id
    FOR UPDATE;
    IF v_saldo_atual IS NULL THEN
      v_saldo_atual := 0;
      INSERT INTO aluno_saldos (aluno_id, saldo, updated_at)
      VALUES (v_aluno_id, v_valor, NOW());
    ELSE
      UPDATE aluno_saldos
      SET saldo = saldo + v_valor, updated_at = NOW()
      WHERE aluno_id = v_aluno_id;
    END IF;

    INSERT INTO aluno_movimentacoes (aluno_id, tipo, valor, observacao)
    VALUES (v_aluno_id, 'MIGRACAO_SALDO', v_valor, 'Migração de saldo do sistema antigo');

    INSERT INTO historico_migracao_itens (historico_migracao_id, aluno_id, valor)
    VALUES (v_historico_id, v_aluno_id, v_valor);

    v_total_alunos := v_total_alunos + 1;
    v_valor_total := v_valor_total + v_valor;
  END LOOP;

  UPDATE historico_migracoes
  SET total_alunos = v_total_alunos, valor_total = v_valor_total
  WHERE id = v_historico_id;

  RETURN jsonb_build_object('ok', true, 'total_alunos', v_total_alunos, 'valor_total', v_valor_total, 'historico_id', v_historico_id);
END;
$$;

-- =====================================================================
-- supabase/migrations/086_consumo_interno_solicitante_retirado.sql
-- =====================================================================
-- Consumo interno: quem solicitou e quem retirou (colaboradores por usuario_id)
-- Mantém withdrawn_by para compatibilidade; novos lançamentos usam solicitante_id e retirado_por_id.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS solicitante_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retirado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.solicitante_id IS 'Colaborador que solicitou o consumo (perfil COLABORADOR).';
COMMENT ON COLUMN public.consumo_interno.retirado_por_id IS 'Colaborador que retirou os itens (perfil COLABORADOR).';

-- withdrawn_by permanece para registros antigos e exibição; novos registros podem preencher com o nome do retirado_por.

CREATE INDEX IF NOT EXISTS idx_consumo_interno_solicitante ON public.consumo_interno(solicitante_id) WHERE solicitante_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumo_interno_retirado_por ON public.consumo_interno(retirado_por_id) WHERE retirado_por_id IS NOT NULL;

-- =====================================================================
-- supabase/migrations/087_consumo_interno_cancelamento.sql
-- =====================================================================
-- Cancelamento de consumo interno: status, auditoria e referência ao usuário que cancelou.

ALTER TABLE public.consumo_interno
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consumo_interno.status IS 'ATIVO | CANCELADO';
COMMENT ON COLUMN public.consumo_interno.cancelado_em IS 'Data/hora do cancelamento do lançamento de consumo interno.';
COMMENT ON COLUMN public.consumo_interno.cancelado_por_id IS 'Usuário que realizou o cancelamento do lançamento de consumo interno.';

-- =====================================================================
-- supabase/migrations/087_fix_rls_importacao_logs_transacao_confirmacao.sql
-- =====================================================================
-- Habilitar RLS em tabelas internas expostas ao PostgREST
-- Objetivo: impedir acesso público (anon) a logs e locks internos.

-- importacao_logs: usada apenas por rotinas internas/admin.
ALTER TABLE public.importacao_logs ENABLE ROW LEVEL SECURITY;

-- Ninguém acessa via PostgREST/anon; apenas service_role (admin client) ignora RLS.
DROP POLICY IF EXISTS "negado_todos_importacao_logs" ON public.importacao_logs;
CREATE POLICY "negado_todos_importacao_logs" ON public.importacao_logs FOR ALL
  USING (false)
  WITH CHECK (false);

-- transacao_confirmacao: tabela de lock interna para confirmação de transações.
ALTER TABLE public.transacao_confirmacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "negado_todos_transacao_confirmacao" ON public.transacao_confirmacao;

CREATE POLICY "negado_todos_transacao_confirmacao" ON public.transacao_confirmacao FOR ALL
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- supabase/migrations/088_pdv_operador_ve_nome_colaborador_pedidos.sql
-- =====================================================================
-- Policy removida: causava recursão infinita em RLS (policy em usuarios referenciando usuarios).
-- Nome do colaborador no relatório PDV é obtido via admin client em app/actions/pdv-vendas.ts (listarVendasDiaCaixa).
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;

-- =====================================================================
-- supabase/migrations/089_reverter_pdv_ve_nome_colaborador.sql
-- =====================================================================
-- Reverte a migration 088: remove a policy que permitia operador PDV ver nome de colaborador.
DROP POLICY IF EXISTS "Operador PDV vê nome de colaborador em pedidos do seu caixa" ON public.usuarios;

-- =====================================================================
-- supabase/migrations/090_hardening_rls_unrestricted_tables.sql
-- =====================================================================
-- Hardening: habilitar RLS em tabelas sensíveis que podem ficar UNRESTRICTED
-- em projetos novos após import/execução parcial de migrations.
-- Mantém idempotente e seguro para reexecução.

DO $$
BEGIN
  -- Tabelas legadas de administração/autorização
  IF to_regclass('public.admins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.admin_roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY';
  END IF;

  IF to_regclass('public.tenants') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY';
  END IF;

  -- Log sensível
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;

-- =====================================================================
-- supabase/migrations/091_fix_recursao_policies_admins.sql
-- =====================================================================
-- Corrige recursão infinita em policies da tabela legada public.admins.
-- Causa: policies antigas consultam a própria tabela admins no USING.
-- Solução: recriar policies usando usuario_admin_cache (sem autorreferência).

DO $$
BEGIN
  IF to_regclass('public.admins') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON public.admins';
    EXECUTE 'DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON public.admins';

    EXECUTE '
      DROP POLICY IF EXISTS "Admins podem ver todos os admins" ON public.admins;
      CREATE POLICY "Admins podem ver todos os admins" ON public.admins FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )';

    EXECUTE '
      DROP POLICY IF EXISTS "Admins podem gerenciar admins" ON public.admins;
      CREATE POLICY "Admins podem gerenciar admins" ON public.admins FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.usuario_admin_cache c
          WHERE c.auth_user_id = auth.uid()
            AND c.is_admin = TRUE
        )
      )';
  END IF;
END
$$;

-- =====================================================================
-- supabase/migrations/092_produtos_desconto_kit_mensal_pct.sql
-- =====================================================================
-- Campo usado no kit lanche mensal para aplicar desconto percentual.
-- Idempotente para projetos novos e bases já existentes.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS desconto_kit_mensal_pct NUMERIC(5,2);

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_desconto_kit_mensal_pct_check;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_desconto_kit_mensal_pct_check
  CHECK (
    desconto_kit_mensal_pct IS NULL
    OR (desconto_kit_mensal_pct >= 0 AND desconto_kit_mensal_pct <= 100)
  );

-- =====================================================================
-- supabase/migrations/093_produtos_visibilidade.sql
-- =====================================================================
-- Campo de visibilidade do produto usado no admin/loja.
-- Idempotente para bases novas e existentes.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS visibilidade TEXT DEFAULT 'APP';

ALTER TABLE public.produtos
  ALTER COLUMN visibilidade SET DEFAULT 'APP';

UPDATE public.produtos
SET visibilidade = 'APP'
WHERE visibilidade IS NULL OR trim(visibilidade) = '';

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_visibilidade_check;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_visibilidade_check
  CHECK (visibilidade IN ('APP', 'CANTINA', 'AMBOS', 'CONSUMO_INTERNO'));

-- =====================================================================
-- supabase/migrations/094_pagamento_metodo_credito_debito.sql
-- =====================================================================
-- Compatibilidade PDV: métodos de cartão separados.
-- O fluxo de vendas usa CREDITO e DEBITO em pagamentos do caixa.

ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'CREDITO';
ALTER TYPE pagamento_metodo ADD VALUE IF NOT EXISTS 'DEBITO';

-- =====================================================================
-- supabase/migrations/095_rpc_creditar_debitar_aluno_saldo.sql
-- =====================================================================
-- RPC atômica para crédito/débito de saldo.
-- Necessária para checkout com saldo e cancelamento de pedidos online.

CREATE OR REPLACE FUNCTION public.creditar_debitar_aluno_saldo(
  p_aluno_id UUID,
  p_valor DECIMAL,
  p_tipo movimento_saldo_tipo,
  p_pedido_id UUID DEFAULT NULL,
  p_transacao_id UUID DEFAULT NULL,
  p_caixa_id UUID DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL
)
RETURNS TABLE(novo_saldo DECIMAL, erro TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_atual DECIMAL;
  v_novo_saldo DECIMAL;
  v_valor_abs DECIMAL;
BEGIN
  v_valor_abs := ABS(p_valor);
  IF v_valor_abs <= 0 THEN
    RETURN QUERY SELECT NULL::DECIMAL, 'Valor inválido'::TEXT;
    RETURN;
  END IF;

  -- Garante linha de saldo e aplica lock para evitar corrida
  INSERT INTO public.aluno_saldos (aluno_id, saldo, updated_at)
  VALUES (p_aluno_id, 0, NOW())
  ON CONFLICT (aluno_id) DO NOTHING;

  SELECT saldo
    INTO v_saldo_atual
  FROM public.aluno_saldos
  WHERE aluno_id = p_aluno_id
  FOR UPDATE;

  -- Débito (COMPRA, DESCONTO)
  IF p_tipo IN ('COMPRA', 'DESCONTO') THEN
    v_novo_saldo := v_saldo_atual - v_valor_abs;
    IF v_novo_saldo < 0 THEN
      RETURN QUERY SELECT v_saldo_atual, 'Saldo insuficiente'::TEXT;
      RETURN;
    END IF;
  -- Crédito (RECARGA, RECARGA_PRESENCIAL, ESTORNO)
  ELSIF p_tipo IN ('RECARGA', 'RECARGA_PRESENCIAL', 'ESTORNO') THEN
    v_novo_saldo := v_saldo_atual + v_valor_abs;
  ELSE
    RETURN QUERY SELECT NULL::DECIMAL, ('Tipo não suportado: ' || p_tipo)::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.aluno_movimentacoes (
    aluno_id,
    tipo,
    valor,
    pedido_id,
    transacao_id,
    caixa_id,
    usuario_id,
    observacao
  )
  VALUES (
    p_aluno_id,
    p_tipo,
    v_valor_abs,
    p_pedido_id,
    p_transacao_id,
    p_caixa_id,
    p_usuario_id,
    p_observacao
  );

  UPDATE public.aluno_saldos
  SET saldo = v_novo_saldo, updated_at = NOW()
  WHERE aluno_id = p_aluno_id;

  RETURN QUERY SELECT v_novo_saldo, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.creditar_debitar_aluno_saldo IS
  'Operação atômica: insere movimentação e atualiza saldo com lock. Usar para checkout com saldo e estornos.';

COMMIT;
