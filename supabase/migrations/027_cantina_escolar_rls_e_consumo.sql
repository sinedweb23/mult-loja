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
