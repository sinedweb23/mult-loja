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
