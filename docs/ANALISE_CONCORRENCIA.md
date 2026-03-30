# Análise de concorrência: loja, PDV e múltiplos usuários

Este documento resume a análise do sistema para uso simultâneo por **vários responsáveis** (comprar lanche, adicionar crédito) e **operadores no PDV**, sem quebra de dados ou regras de negócio.

---

## 1. O que está preparado (sem quebra)

### 1.1 Isolamento por usuário (auth/sessão)

- **Loja (responsáveis):** cada request usa o JWT do usuário (`createClient()` no servidor). O Supabase aplica RLS: cada um vê apenas seus dados (transações, pedidos dos seus alunos).
- **Checkout:** identidade vem de `supabase.auth.getUser()`; `usuario_id` é resolvido por `auth_user_id`. Não há compartilhamento de sessão entre usuários.
- **Status da transação:** `/api/checkout/status` compara `transacao.usuario_id === usuario.id`; não é possível ver transação de outro usuário.

### 1.2 Carrinho e payload do checkout

- **Carrinho:** `localStorage` com chave `loja_carrinho` — **por dispositivo/navegador**. Dois responsáveis em dispositivos diferentes têm carrinhos independentes.
- **Payload do checkout:** `sessionStorage` (`loja_checkout_payload`) — **por aba**. Não há vazamento entre usuários ou abas.

### 1.3 Criação de transações e pedidos

- Cada POST em `/api/checkout/criar` cria **uma** linha em `transacoes` com `usuario_id` do logado. Várias requisições (vários usuários ou várias abas do mesmo usuário) geram transações distintas; não há conflito de ID (UUID).
- Pedidos são criados por **transação** (uma transação PEDIDO_LOJA pode gerar vários pedidos, um por aluno). Operador no PDV cria pedidos por outro fluxo (`pdv-vendas`), também com inserts independentes.

### 1.4 RLS (Row Level Security)

- **transacoes:** responsável vê só as próprias (`usuario_id` ligado ao `auth.uid()`).
- **pedidos / pedido_itens:** operador e admin têm políticas de SELECT; responsável vê itens de pedidos dos **seus** alunos (`usuario_aluno`).
- **aluno_saldos / aluno_movimentacoes:** operador pode inserir/atualizar; admin vê tudo; responsável vê saldo dos alunos vinculados.

### 1.5 Multi-empresa (multi-escola)

- Dados são segregados por `empresa_id` (e onde existir `unidade_id`). Pedidos e alunos carregam `empresa_id` do aluno; relatórios e listagens filtram por empresa do admin/operador quando a regra de negócio exige.

---

## 2. Ajustes feitos para concorrência

### 2.1 Idempotência na confirmação de transação

- **Problema:** webhook (Rede/PIX) e, em tese, outro canal poderiam chamar `confirmarTransacaoAprovada(transacaoId)` duas vezes, gerando pedidos ou recargas duplicados.
- **Solução:** tabela `transacao_confirmacao(transacao_id PK)`. Quem inserir primeiro “leva” a confirmação; os demais retornam sucesso com o resultado já existente (ex.: `pedido_id` já preenchido). Em erro após inserir o lock, o lock é removido para permitir retry.

### 2.2 Recarga de saldo (mesmo aluno, várias recargas ao mesmo tempo)

- **Problema:** duas confirmações de recarga para o mesmo aluno podiam fazer read-modify-write em `aluno_saldos` e uma parte do valor se perder.
- **Solução:** função SQL `incrementar_saldo_aluno(aluno_id, valor)` com `INSERT ... ON CONFLICT (aluno_id) DO UPDATE SET saldo = aluno_saldos.saldo + EXCLUDED.saldo`. Incremento atômico, sem race.

### 2.3 Estoque (PDV e online ao mesmo tempo)

- **Problema:** abate de estoque era “ler estoque, subtrair, escrever”. Várias vendas simultâneas (PDV + online) podiam deixar estoque negativo ou inconsistente.
- **Solução:** funções atômicas `decrementar_estoque_variacao_valor(id, quantidade)` e `decrementar_estoque_produto(id, quantidade)` que fazem `UPDATE ... SET estoque = estoque - quantidade WHERE ... AND estoque >= quantidade RETURNING id`. Só atualizam se houver estoque suficiente; na confirmação online, se o abate falhar, a confirmação retorna erro e o lock é liberado para retry (estoque pode ser reposto).

---

## 3. Pontos de atenção (já cobertos ou operacionais)

### 3.1 Operador vê todos os pedidos

- A política “Operador ve pedidos para retirada” não restringe por `empresa_id`. Se um mesmo operador atender várias empresas/unidades, ele vê pedidos de todas. Isso é intencional para cenários multi-unidade; se for preciso restringir por empresa/unidade do operador, a política pode ser endurecida (ex.: JOIN com `usuario_empresa` ou equivalente).

### 3.2 Estoque insuficiente na confirmação online

- Se na hora de confirmar o pagamento aprovado o estoque já tiver sido consumido (ex.: venda no PDV), o abate atômico falha e a confirmação retorna erro. O usuário já pagou; o suporte deve resolver (estorno, reposição de estoque e nova tentativa, ou entrega combinada). O sistema não deixa estoque negativo.

### 3.3 Gateway (Rede) e webhook

- O webhook da Rede pode ser reenviado. Com o lock em `transacao_confirmacao`, a segunda execução não cria pedidos/recarga de novo; retorna sucesso com o resultado já persistido.

---

## 4. Resumo

- **Vários responsáveis** em vários lugares (país/dispositivos) **comprando lanche** e **adicionando crédito** ao mesmo tempo: **suportado**; cada um com sua sessão, carrinho e transações.
- **Operador no PDV** usando o sistema ao mesmo tempo: **suportado**; pedidos e abates de estoque são independentes ou atômicos.
- **Concorrência** em confirmação de transação, recarga de saldo e estoque foi tratada com **locks/idempotência** e **atualizações atômicas** no banco (tabela de confirmação, funções SQL de saldo e estoque).

As alterações estão na migration `067_concorrencia_transacoes_saldo.sql` e em `app/actions/transacoes.ts` (confirmarTransacaoAprovada e abaterEstoquePedido).
