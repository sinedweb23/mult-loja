# Guia de suporte – Transações e pagamentos

Onde consultar e o que fazer em cada tipo de reclamação.

---

## 1. “Pagamento aprovado mas saldo não caiu”

**Onde consultar**

- **Admin → Transações** (ou tabela `transacoes`): filtrar por status `APROVADO` ou `APROVADO_PENDENTE_CONFIRMACAO` e verificar se existe registro em `aluno_movimentacoes` com o mesmo `transacao_id`.
- **gateway_logs**: ver se o webhook foi recebido e qual foi a resposta (e se houve erro ao confirmar no nosso sistema).
- **eventos_auditoria**: ação `confirmar_recarga` ou `webhook_rede` para essa transação; se faltar, a confirmação não rodou ou falhou.

**O que fazer**

1. Confirmar na Rede (TID/NSU) que o pagamento está aprovado.
2. Se a transação estiver em `APROVADO_PENDENTE_CONFIRMACAO` ou `APROVADO` sem movimentação: usar o botão **“Reprocessar transação”** (idempotente). Isso aplica o crédito uma única vez.
3. Se reprocessar falhar: ver mensagem de erro e `gateway_logs` / logs do servidor; corrigir causa (ex.: constraint, aluno inexistente) e reprocessar de novo.

---

## 2. “Pedido ficou pendente”

**Onde consultar**

- **transacoes**: status `PENDENTE` ou `PROCESSANDO`; anotar `gateway_id` (TID).
- **gateway_logs**: última chamada ao gateway (criar transação) e último webhook recebido; ver `return_code` e `return_message`.
- Consultar status na Rede (por TID) se a API permitir, para ver se está pago do lado deles.

**O que fazer**

1. Se na Rede constar como aprovado e aqui ainda PROCESSANDO: o webhook pode ter falhado ou atrasado. Marcar como APROVADO e rodar “Reprocessar transação” (ou disparar confirmação manual uma vez).
2. Se na Rede constar recusado: informar ao cliente (e opcionalmente mostrar `return_message` mascarado).
3. Se timeout/erro técnico: transação pode estar em `ERRO_TECNICO`; verificar e reenviar confirmação se o gateway tiver aprovado depois.

---

## 3. “Operador diz que fez venda e sumiu”

**Onde consultar**

- **pedidos**: filtrar por `caixa_id` (e caixa por `operador_id`) no período em que o operador afirma ter vendido.
- **aluno_movimentacoes**: filtrar por `caixa_id` e data; tipo `COMPRA`.
- **eventos_auditoria**: `action` relacionada a venda (ex. `finalizar_venda_aluno`), `actor_id` = operador, `entidade` = pedido.

**O que fazer**

1. Se existir pedido e movimentação para aquele caixa/horário: a venda foi registrada; mostrar comprovante (pedido + movimentação) ao operador.
2. Se não existir: verificar se houve erro na tela (timeout, rede). Se a venda foi recebida em dinheiro e não caiu no sistema, tratar como incidente operacional (estorno manual ou ajuste sob supervisão).

---

## 4. “Pai diz que pagou e não liberou”

**Onde consultar**

- **transacoes**: buscar por `usuario_id` (responsável) ou `aluno_id` no período informado.
- Ver `status`, `gateway_tid`, `gateway_nsu`; abrir **gateway_logs** para essa transação (request + response / webhook).

**O que fazer**

1. **APROVADO** ou **APROVADO_PENDENTE_CONFIRMACAO** sem movimentação/recarga: reprocessar transação (aplicar crédito idempotente).
2. **RECUSADO**: informar ao cliente que o pagamento foi recusado (e, se seguro, `return_message` genérico); orientar a tentar de novo ou outro meio de pagamento.
3. **PROCESSANDO** / **PENDENTE**: verificar na Rede pelo TID se foi aprovado; se sim, atualizar status e reprocessar.
4. **ERRO_TECNICO**: ver `gateway_logs` e logs do servidor; se na Rede estiver aprovado, reprocessar.

---

## 5. Resumo rápido – Onde está cada informação

| Dúvida | Tabela / lugar |
|--------|-----------------|
| Status da transação, TID, NSU | `transacoes` |
| Request/response do gateway, webhook | `gateway_logs` |
| Quem fez o quê e quando | `eventos_auditoria` |
| Crédito/debito no aluno | `aluno_movimentacoes` (+ `transacao_id`) |
| Saldo atual do aluno | `aluno_saldos` |
| Pedido gerado pelo checkout | `pedidos` (+ `transacoes.pedido_id`) |
| Pagamento do pedido | `pagamentos` (+ `transacao_id`) |

Sempre que reprocessar ou fizer ajuste manual, registrar em eventos_auditoria (actor_type = admin, action = reprocessar_transacao ou similar) para manter rastreabilidade.
