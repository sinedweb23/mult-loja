-- Habilitar RLS em tabelas internas expostas ao PostgREST
-- Objetivo: impedir acesso público (anon) a logs e locks internos.

-- importacao_logs: usada apenas por rotinas internas/admin.
ALTER TABLE public.importacao_logs ENABLE ROW LEVEL SECURITY;

-- Ninguém acessa via PostgREST/anon; apenas service_role (admin client) ignora RLS.
CREATE POLICY "negado_todos_importacao_logs"
  ON public.importacao_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- transacao_confirmacao: tabela de lock interna para confirmação de transações.
ALTER TABLE public.transacao_confirmacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negado_todos_transacao_confirmacao"
  ON public.transacao_confirmacao
  FOR ALL
  USING (false)
  WITH CHECK (false);

