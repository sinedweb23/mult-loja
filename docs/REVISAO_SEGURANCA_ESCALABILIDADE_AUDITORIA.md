# Revisão completa: Segurança, Escalabilidade e Auditoria

Sistema: Next.js + Vercel + Supabase + e.Rede (gateway).  
Objetivo: deixar o sistema seguro, escalável e auditável para múltiplos operadores PDV, muitos pais em checkout e 1000+ alunos, com tolerância a falhas e rastreabilidade total.

---

## 1) Diagnóstico técnico (arquitetura atual)

### 1.1 Fluxo Loja → Checkout → e.Rede → Banco → Confirmação

1. **Loja (responsável)**  
   - Autenticação: Supabase Auth (cookies, JWT).  
   - Responsável escolhe itens/recarga e envia para `/api/checkout/criar`.

2. **POST /api/checkout/criar**  
   - Valida sessão (Supabase `getUser()`).  
   - Busca `usuario_id` por `auth_user_id`.  
   - **Problema**: valor e itens vêm do body; o servidor recalcula `valor` a partir de `payload.pedidos[].itens[].subtotal`, mas **não revalida preços contra a base** (produtos/preços). Risco de alteração de `subtotal` no cliente.  
   - Cria linha em `transacoes` (status PENDENTE) com `admin` (service role).  
   - Gera `referencia` = `tr-${Date.now()}-${random}` (não idempotente: novo POST = nova transação).  
   - Chama e.Rede (PIX ou cartão).  
   - Se PIX: atualiza transação para PROCESSANDO, retorna QR.  
   - Se cartão aprovado: atualiza para APROVADO, chama `confirmarTransacaoAprovada(transacaoId)` na mesma requisição; se confirmar falhar, retorna 502 mas transação já está APROVADO no DB (inconsistência).

3. **confirmarTransacaoAprovada (transacoes.ts)**  
   - Lê transação com admin.  
   - RECARGA_SALDO: lê `aluno_saldos.saldo`, soma valor, faz UPDATE em `aluno_saldos` e INSERT em `aluno_movimentacoes`. **Não atômico**: entre SELECT e UPDATE outro request pode alterar saldo (race). Não verifica se já foi confirmada (idempotência).  
   - PEDIDO_LOJA: cria pedidos, itens, pagamentos, atualiza estoque; no final atualiza `transacoes.pedido_id`. Múltiplos INSERTs sem transação SQL única (falha parcial possível).

4. **Webhook POST /api/webhooks/rede**  
   - Recebe JSON com `id/tid`, status.  
   - **Problemas**: sem validação de assinatura; identifica transação por `gateway_id`; se status APROVADO chama `confirmarTransacaoAprovada` de novo (duplica recarga/pedido se a primeira confirmação tiver falhado sem marcar “confirmado”).  
   - Anexa body ao `webhook_events` (bom para auditoria), mas não há idempotência por evento (dois webhooks iguais = duas execuções de confirmar).

### 1.2 Fluxo PDV

1. **Caixa**  
   - `obterCaixaAberto()`: um caixa ABERTO por `operador_id` (usuário logado). Vários operadores = vários caixas abertos (correto).  
   - `abrirCaixa(empresaId, fundoTroco)`: impede dois abertos para o mesmo operador.

2. **Venda aluno (finalizarVendaAluno)**  
   - Valida itens, limite diário, produtos bloqueados.  
   - Cria pedido, itens, movimentação COMPRA (aluno_movimentacoes), atualiza `aluno_saldos` (lê saldo, subtrai, atualiza). **Race**: dois PDVs vendendo para o mesmo aluno ao mesmo tempo podem gerar saldo negativo ou inconsistente (não é operação atômica).

3. **Venda direta / colaborador**  
   - Sem uso de saldo aluno; cria pedido e (para colaborador) atualiza `consumo_colaborador_mensal`.

### 1.3 Autenticação e autorização

- **Auth**: Supabase Auth (cookies em server components/API).  
- **Autorização**:  
  - RLS em várias tabelas (transacoes: SELECT/INSERT por usuario_id; aluno_saldos/aluno_movimentacoes: operador pode INSERT/UPDATE; etc.).  
  - `transacoes`: **não há política UPDATE** para cliente → apenas service role atualiza (bom).  
  - Admin/operador: `createAdminClient()` ou `createClient()` com usuário operador; RLS decide acesso.

### 1.4 Pontos críticos identificados

| Área | Problema | Impacto |
|------|----------|--------|
| Checkout | Valor/itens não validados contra DB (preços reais) | Fraude (valor menor no pagamento) |
| Checkout | Sem chave idempotente | Duplicar POST = duas transações e possível cobrança dupla |
| Confirmação | Recarga/saldo não atômica (SELECT + UPDATE) | Race, saldo errado ou duplicado |
| Confirmação | confirmarTransacaoAprovada não idempotente | Webhook + retry = saldo/pedido duplicado |
| Webhook | Sem assinatura | Falsificação de evento aprovado |
| Webhook | Sem idempotência por evento | Duplicação de crédito/pedido |
| PDV saldo | Debito em aluno_saldos não atômico | Double-spend entre operadores |
| Auditoria | Sem tabela unificada de eventos | Difícil investigar reclamações |
| Gateway | Sem gateway_logs (request/response) | Não dá para provar TID/NSU/status real |
| Transação | Estados limitados (sem APROVADO_PENDENTE_CONFIRMACAO, ERRO_TECNICO) | Não diferencia “pago mas DB falhou” |

---

## 2) Segurança (obrigatório)

### 2.1 RLS – estado e recomendações

- **transacoes**: SELECT/INSERT por usuario; UPDATE apenas service role (implícito: sem política UPDATE para auth.uid()). **Faltando**: política explícita para service role ou função SECURITY DEFINER que só o backend use.  
- **aluno_saldos / aluno_movimentacoes**: operador e admin. Garantir que **nenhum** cliente (responsável) faça UPDATE direto em aluno_saldos; apenas leitura onde aplicável (extrato).  
- **caixas, pedidos, pagamentos**: verificar que apenas operador/admin alteram o que precisam; cliente não altera pedidos de outros.

**Recomendação**: Revisar todas as tabelas sensíveis (transacoes, aluno_saldos, aluno_movimentacoes, caixas, pedidos, pagamentos, consumo_colaborador_mensal) e documentar política por papel (responsável só lê seus dados; operador só insere/atualiza no seu contexto; admin full). Usar service role **apenas** em server (API routes / Server Actions), nunca expor ao cliente.

### 2.2 Validação server-side

- **Checkout**:  
  - Calcular valor **no servidor** a partir de produto_id + quantidade + preço atual (produtos tabela ou variações).  
  - Validar que alunoId pertence ao responsável (usuario_id).  
  - Rejeitar qualquer valor total vindo do cliente como “fonte da verdade”.

- **Rotas /api/\***:  
  - Validar todos os bodies com **Zod** (tipos, ranges, enums).  
  - Não confiar em alunoId, valor, itens, preços do payload para decisão financeira.

### 2.3 Proteções

- **Idempotência**: Header ou body `Idempotency-Key` (ex.: UUID ou transacao.id após criar) em POST checkout; se já processado, retornar 200 + mesmo resultado.  
- **Rate limit**: Por IP e por user (Vercel ou middleware) em `/api/checkout/criar`, `/api/webhooks/rede`.  
- **Webhook**: Validar assinatura (Rede: ver documentação; HMAC ou header específico).  
- **CSRF**: Next.js com cookies SameSite; APIs que mudam estado devem validar origem ou token se necessário.

### 2.4 Segredos e logs

- PV/Token e.Rede: **só** em variáveis de ambiente (Vercel), nunca no cliente.  
- Rotação sandbox/produção: já existe `EREDE_ENV` + `EREDE_PV_*` / `EREDE_TOKEN_*`; manter e nunca logar valores.  
- Logs: nunca número completo de cartão, CVV; mascarar CPF/email em logs (ex.: `***.***.***-12`).  
- LGPD: definir retenção para eventos_auditoria e gateway_logs; acesso a dados pessoais apenas por função e logado.

---

## 3) Escalabilidade e concorrência

### 3.1 Saldo e “ledger”

- **Problema**: Saldo hoje é um único campo `aluno_saldos.saldo`; atualizações são READ + cálculo + WRITE → race.  
- **Solução (recomendada)**:  
  - Manter `aluno_saldos` como cache do saldo atual.  
  - **Toda** alteração de saldo passar por uma **função SQL (RPC)** que:  
    - Insere em `aluno_movimentacoes` (tipo, valor, transacao_id/pedido_id/caixa_id, etc.).  
    - Recalcula saldo (SUM das movimentações ou regra explícita) e faz UPDATE em `aluno_saldos` dentro da **mesma transação**, com lock (SELECT FOR UPDATE no aluno).  
  - Assim: uma única “escrita” atômica por evento; saldo sempre consistente.

### 3.2 PDV multi-operador

- Já suportado: um caixa aberto por operador (`caixas.operador_id` + status ABERTO).  
- Melhoria: garantir que cada venda use sempre o `caixa_id` do operador que está vendendo (já feito).  
- Evitar “caixa global único”: não mudar modelo; manter um caixa por operador.

### 3.3 Concorrência nas vendas (double-spend)

- Venda aluno que debita saldo deve chamar a **mesma RPC atômica** (debito + movimentação + atualização de saldo).  
- Transação SQL com `SELECT ... FOR UPDATE` na linha do aluno em `aluno_saldos` (ou na tabela de movimentações por aluno) para serializar debitos.

### 3.4 Checkout – idempotência

- Gerar ou aceitar `idempotency_key` (máx 16 chars para e.Rede reference).  
- Antes de criar transação: buscar transacao existente por idempotency_key (nova coluna ou tabela de chaves).  
  - Se existir e já finalizada: retornar 200 + resultado anterior.  
  - Se existir e ainda PENDENTE/PROCESSANDO: retornar 200 + status atual (evitar segunda chamada ao gateway).  
- Usar esse mesmo idempotency_key como `reference` na Rede (já limitado a 16 chars) quando possível, ou manter reference interno e mapear.

### 3.5 Confirmação e reprocessamento

- Introduzir estado **APROVADO_PENDENTE_CONFIRMACAO** quando o gateway retornar aprovado mas `confirmarTransacaoAprovada` falhar.  
- Job/endpoint admin “Reprocessar transação” que:  
  - Só processa transações em APROVADO_PENDENTE_CONFIRMACAO (ou APROVADO sem pedido_id/sem movimentação).  
  - Chama lógica de confirmação **idempotente** (verificar se já existe pedido/movimentação para essa transacao_id antes de inserir).  
- Retries com backoff para chamadas ao gateway e para confirmação interna.

---

## 4) Logs e auditoria

### 4.1 Tabela eventos_auditoria (recomendada)

- Campos sugeridos:  
  `id`, `timestamp`, `actor_type` (pai, operador, admin, webhook, sistema), `actor_id`, `ip`, `user_agent`, `route`, `action`, `entidade` (transacao, pedido, aluno, caixa), `entidade_id`, `payload_reduzido` (JSON sem cartão/CPF completo), `correlation_id` / `request_id`.

- Uso: em cada ação crítica (criar transação, confirmar, abater saldo, abrir/fechar caixa, webhook recebido), inserir um registro.  
- Consulta admin: por transacaoId, tid, nsu, reference, aluno, período.

### 4.2 Tabela gateway_logs (recomendada)

- Campos: `transacao_id`, `referencia`, `tid`, `nsu`, `request_sanitizado` (sem número cartão/CVV), `response_raw` (com mascaramento), `http_status`, `return_code`, `return_message`, `created_at`.  
- Registrar toda chamada de ida ao e.Rede (criar transação, consultar) e toda resposta de webhook.

### 4.3 Logs estruturados (Vercel)

- Usar JSON com `requestId`, `route`, `action`, `entidade`, `erro` (sem dados sensíveis).  
- Facilita busca e correlação com eventos_auditoria.

### 4.4 Página admin – consulta

- Tela “Transações / Gateway”:  
  - Busca por transacaoId, gateway_id (tid), nsu, reference.  
  - Timeline: criado → processando → aprovado/recusado → confirmado → saldo aplicado.  
  - Filtros: aluno, usuário, período, status.  
- Dados vindos de `transacoes` + `gateway_logs` + `eventos_auditoria` (e aluno_movimentacoes quando houver).

---

## 5) Observabilidade e recuperação

### 5.1 Estados de transação (sugerido)

- PENDENTE  
- PROCESSANDO  
- APROVADO  
- RECUSADO  
- **APROVADO_PENDENTE_CONFIRMACAO** (novo)  
- CONFIRMADO (ou manter “tem pedido_id / tem movimentação” como implícito)  
- **ERRO_TECNICO** (novo)  
- ESTORNADO, CANCELADO (já existem)

### 5.2 Retentativas e reprocessamento

- Confirmação: retry com backoff (ex.: 3x com 1s, 2s, 4s).  
- Endpoint admin “Reprocessar transação”: só para transações aprovadas não confirmadas; lógica idempotente (verificar pedido/movimentação por transacao_id).

### 5.3 Webhook

- Validar assinatura (Rede).  
- Idempotência: guardar `gateway_event_id` ou hash(body) por transacao_id; se já processado esse evento, retornar 200 sem alterar saldo/pedido.  
- Persistir todos os eventos em gateway_logs (e opcionalmente em webhook_events na transação, como hoje).

---

## 6) Checklist de testes (obrigatório)

### 6.1 Carga e concorrência

- Simular **50** responsáveis finalizando checkout (PIX e cartão) em paralelo.  
- Simular **10** operadores vendendo no PDV ao mesmo tempo (vários alunos, mesmo aluno em dois caixas).

### 6.2 Falhas

- Rede retorna aprovado mas DB falha na confirmação → transação deve ficar em estado recuperável (APROVADO_PENDENTE_CONFIRMACAO), sem duplicar saldo ao reprocessar.  
- DB confirma pedido mas falha ao inserir movimentação → transação em estado inconsistente; testar reprocessamento idempotente.  
- Timeout no gateway → transação em PENDENTE/PROCESSANDO; polling ou webhook devem concluir.  
- Request duplicado (mesmo idempotency key) → mesma transação, mesma resposta.  
- Webhook duplicado → apenas uma confirmação de saldo/pedido.

### 6.3 Segurança

- Tentativa de trocar alunoId no payload (outro aluno) → 403.  
- Tentativa de mudar valor no front (subtotal menor) → servidor ignora e usa valor calculado no servidor.  
- Acesso indevido a dados (outro aluno, outro operador) → RLS bloqueia; testes com tokens de diferentes usuários.

---

## 7) Entregáveis

### 7.1 Lista priorizada (P0 / P1 / P2)

**P0 (crítico – consistência e fraude)**  
- Validar preços/valor no servidor no checkout (calcular a partir de produtos).  
- Operação atômica de saldo (RPC: movimentação + update saldo em uma transação com lock).  
- Idempotência na confirmação (não duplicar recarga/pedido por transacao_id).  
- Idempotência no webhook (por evento/gateway_id + status já processado).  
- Estados APROVADO_PENDENTE_CONFIRMACAO e ERRO_TECNICO + endpoint Reprocessar.

**P1 (segurança e auditoria)**  
- RLS revisado e documentado em todas as tabelas sensíveis.  
- Zod em todas as rotas /api/*.  
- Idempotency-Key no checkout.  
- Tabelas eventos_auditoria e gateway_logs + escrita nas ações críticas.  
- Webhook: validação de assinatura.  
- Rate limit (checkout e webhook).  
- Sanitização de logs (cartão, CPF, email).

**P2 (observabilidade e operação)**  
- Página admin: busca por transacaoId/tid/nsu/reference e timeline.  
- Logs estruturados (requestId, JSON).  
- LGPD: política de retenção e acesso.

### 7.2 Mudanças de schema (SQL) – ver arquivos em `docs/migrations/`

- `058_eventos_auditoria.sql`: criação da tabela e índices.  
- `059_gateway_logs.sql`: criação da tabela e índices.  
- `060_transacoes_estados_idempotencia.sql`: novos enum values, coluna idempotency_key; índice.  
- `061_rpc_saldo_atomico.sql`: função que debita/credita com lock e insere movimentação (a ser usada por PDV e por confirmação de recarga).

### 7.3 Funções/RPC Supabase recomendadas

- **creditar_debitar_aluno_saldo(aluno_id, valor_centavos_ou_decimal, tipo, pedido_id, transacao_id, caixa_id, usuario_id, observacao)**:  
  - Dentro de transação: INSERT em aluno_movimentacoes; SELECT aluno_saldos FOR UPDATE; UPDATE aluno_saldos com novo saldo.  
  - Retornar novo saldo ou erro.  
- **confirmar_recarga_online(transacao_id)**: chamada por confirmarTransacaoAprovada; verificar se já existe movimentação com transacao_id; se não, chamar creditar_debitar_aluno_saldo (crédito). Idempotente.

### 7.4 Mudanças no código (resumo)

| Arquivo | Mudança |
|---------|--------|
| `app/api/checkout/criar/route.ts` | Validar preços no servidor (buscar produtos); aceitar Idempotency-Key; gravar em gateway_logs e eventos_auditoria; usar reference/idempotency curta (≤16) quando possível. |
| `app/actions/transacoes.ts` | confirmarTransacaoAprovada: verificar se já confirmado (pedido_id preenchido ou movimentação com transacao_id); para recarga usar RPC creditar; em falha, marcar APROVADO_PENDENTE_CONFIRMACAO. |
| `app/api/webhooks/rede/route.ts` | Validar assinatura; idempotência por (gateway_id + status aprovado já processado); gravar gateway_logs; chamar confirmação idempotente. |
| `app/actions/saldo.ts` e PDV | Trocar update manual de aluno_saldos + insert movimentação por chamada à RPC creditar_debitar_aluno_saldo. |
| `lib/rede.ts` | Não alterar PV/token; garantir que logs nunca incluam número de cartão/CVV (já não inclui no body completo em produção). |
| Novo: `app/admin/transacoes/page.tsx` ou similar | Busca por transacaoId/tid/nsu; timeline; filtros. |
| Middleware ou route handlers | Rate limit para /api/checkout/criar e /api/webhooks/rede. |

### 7.5 Guia de suporte (onde consultar cada problema)

- **“Pagamento aprovado mas saldo não caiu”**  
  - Transações: filtrar por status APROVADO ou APROVADO_PENDENTE_CONFIRMACAO sem movimentação com transacao_id.  
  - gateway_logs: ver resposta do webhook e se houve erro na confirmação.  
  - Ação: usar “Reprocessar transação” (idempotente).

- **“Pedido ficou pendente”**  
  - Transações: status PROCESSANDO ou PENDENTE; ver gateway_id e consultar status na Rede.  
  - gateway_logs: última chamada e último webhook.  
  - Se aprovado na Rede e não confirmado: reprocessar.

- **“Operador diz que fez venda e sumiu”**  
  - Pedidos: filtrar por caixa_id / operador no período.  
  - aluno_movimentacoes: filtrar por caixa_id e data.  
  - eventos_auditoria: action tipo “venda_aluno” / “finalizar_venda” por operador.

- **“Pai diz que pagou e não liberou”**  
  - Transações: buscar por usuario_id ou aluno_id e data.  
  - Ver status, gateway_tid, gateway_nsu; gateway_logs para request/response.  
  - Se APROVADO_PENDENTE_CONFIRMACAO: reprocessar.  
  - Se RECUSADO: mostrar returnMessage para o cliente.

---

Os arquivos SQL de exemplo (058–061) e um guia de suporte mais curto em formato de “playbook” estão nos próximos arquivos desta pasta `docs/`.
