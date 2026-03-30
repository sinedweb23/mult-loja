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
