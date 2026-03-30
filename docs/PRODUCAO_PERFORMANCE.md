# Performance e concorrência em produção

## O que já foi feito no código

### 1. Índices (migration `082_indices_performance_concorrencia.sql`)
- **pedidos**: `created_at`, `(status, created_at)` para PAGO/ENTREGUE, `empresa_id`, `caixa_id`, `aluno_id`, `origem`
- **pedido_itens**: `pedido_id`, `produto_id`
- **caixas**: `(empresa_id, status)`, `(operador_id, status)`
- **aluno_movimentacoes**: `pedido_id`, `(aluno_id, tipo, created_at)` (extrato e gasto hoje)
- **consumo_colaborador_mensal**: `(empresa_id, ano, mes)`

### 2. Limites em queries pesadas
- Relatórios (período): pedidos, transações e recargas limitados a 10.000 registros por request.
- Extrato do aluno: 200 movimentações (já existia).
- Pedido_itens em relatórios: busca em chunks de 200 `pedido_id`.

### 3. Concorrência (migration `067_concorrencia_transacoes_saldo.sql`)
- **incrementar_saldo_aluno**: RPC atômica para recarga (evita race).
- **transacao_confirmacao**: evita dupla confirmação de transação.
- **decrementar_estoque_***: abate atômico de estoque.

---

## Configurações recomendadas

### Supabase (Dashboard → Settings → Database)
- **Statement timeout**: 15s–30s (evita queries travando o banco). Padrão costuma ser 8s.
- **Connection pooler**: usar **Session mode** para transações que usam RPC/triggers; **Transaction mode** para serverless (menos conexões).

### Vercel (Dashboard → Project → Settings → Functions)
- **Max Duration**: 30s (ou o máximo do plano) para evitar 504 antes do timeout do Supabase.
- **Região**: escolher a mesma região do Supabase (ex.: South America) para menor latência.

### Variáveis de ambiente
- Manter `NEXT_PUBLIC_SUPABASE_URL` e chaves corretas para o ambiente.
- Não reduzir demais o timeout do fetch no Supabase client; 15–30s é razoável.

---

## Monitoramento

1. **Supabase → Reports**: ver queries lentas e uso de CPU.
2. **Vercel → Analytics / Logs**: duração das serverless e erros 504.
3. **EXPLAIN ANALYZE**: em queries novas pesadas, rodar no SQL Editor para checar uso de índices.

---

## Se ainda houver timeout

1. Aumentar **Statement timeout** no Supabase (ex.: 30s).
2. Aumentar **Max Duration** das functions na Vercel (ex.: 60s no Pro).
3. Dividir relatórios muito grandes em **paginação** ou **filtro por empresa/unidade** antes de buscar.
4. Processos pesados (importação, relatórios gigantes): considerar **fila/worker** (ex.: Inngest, Trigger.dev) em vez de fazer tudo na mesma request HTTP.
