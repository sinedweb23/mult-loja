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
