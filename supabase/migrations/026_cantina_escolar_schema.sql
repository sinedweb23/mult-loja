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
