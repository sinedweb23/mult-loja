# Integração Gateway de Pagamento (Rede)

## Visão geral

O checkout da loja e a recarga de saldo passam pelo gateway **Rede (e.Rede)**. O pedido/saldo só é confirmado após aprovação do pagamento (Pix ou cartão).

## Fluxos

### 1. Checkout – Pedido da loja
- Responsável adiciona itens ao carrinho → **Finalizar Compra** → redireciona para **Checkout**.
- No checkout: escolhe **Pix** ou **Cartão**, conclui o pagamento.
- **Pix**: gera QR/código; após confirmação (webhook ou polling), o sistema cria o(s) pedido(s) e abate estoque.
- **Cartão**: dados enviados à Rede; se aprovado na hora, o sistema já cria o(s) pedido(s).

### 2. Recarga de saldo
- Em **Gestão de Saldo** → **Adicionar crédito** → informa valor → redireciona para **Checkout**.
- Pagamento via Pix ou Cartão; após aprovação, o saldo é creditado e a movimentação registrada com vínculo à transação do gateway.

### 3. Extrato do aluno
- Todas as movimentações aparecem no extrato (compras, recargas, estornos, etc.).
- Cada linha pode incluir: **origem** (Loja online / Cantina), **forma de pagamento** (Pix/Cartão) e **identificador no gateway** para rastreio e conciliação.

## Estrutura de dados (relatórios e admin)

### Tabelas principais

| Tabela | Uso |
|--------|-----|
| **transacoes** | Intenções de pagamento no gateway. Campos: `tipo` (PEDIDO_LOJA, RECARGA_SALDO), `valor`, `metodo` (PIX, CARTAO), `status`, `gateway_id`, `gateway_tid`, `gateway_nsu`, `payload` (itens/data para pedido), `created_at`. |
| **pagamentos** | Pagamentos efetivados (vinculados a pedidos). Possui `transacao_id` quando o pagamento veio do checkout online. |
| **aluno_movimentacoes** | Movimentações de saldo (recarga, compra, estorno). Possui `transacao_id` quando a recarga foi via gateway. |
| **pedidos** | Pedidos da loja; status PAGO após confirmação do gateway. |

### Consultas úteis para relatórios

- **Vendas loja (por período)**  
  `pedidos` com `origem = 'ONLINE'` e `status = 'PAGO'`, join com `pagamentos` (e opcionalmente `transacoes` para `gateway_id`/metodo).

- **Entradas PDV**  
  `pedidos` com `origem = 'PDV'`; `pagamentos` com `caixa_id` para fechamento de caixa.

- **Recargas de saldo (online)**  
  `transacoes` com `tipo = 'RECARGA_SALDO'` e `status = 'APROVADO'`; ou `aluno_movimentacoes` com `tipo = 'RECARGA'` e `transacao_id` preenchido.

- **Total arrecadado por período**  
  Somar `pagamentos.valor` (status APROVADO) e/ou `transacoes.valor` (status APROVADO), filtrando por `created_at`.

- **Conciliação com a Rede**  
  Usar `transacoes.gateway_id`, `gateway_tid`, `gateway_nsu` e `gateway_data` para cruzar com o painel/relatórios do gateway.

### Segurança e auditoria

- **Autenticação:** Todas as rotas de checkout (`/api/checkout/criar`, `/api/checkout/status`) exigem usuário logado; a consulta de status só retorna transação se `transacao.usuario_id` for do usuário atual.
- **Rastreio:** Cada transação grava `usuario_id`, `gateway_tid`, `gateway_nsu`, `status` e `gateway_data` (returnCode/returnMessage); pedidos ficam em `pedidos` + `pagamentos` com `transacao_id`; recargas em `aluno_movimentacoes` com `transacao_id`. Permite auditoria e conciliação.
- **Escalabilidade:** Fluxo stateless (API + Supabase); criação de pedido e abate de estoque em `confirmarTransacaoAprovada` no servidor; carrinho em localStorage é limpo após pagamento aprovado (PEDIDO_LOJA) no checkout e na página de sucesso.

## Variáveis de ambiente

No `.env` (e no painel da Vercel/hosting):

```env
# Gateway Rede (e.Rede) – Basic Auth (PV + Token do painel)
# https://developer.userede.com.br/e-rede
EREDE_PV=             # Afiliação (PV) do painel Rede
EREDE_TOKEN=          # Token do painel Rede (não regenerar se outra aplicação usa o mesmo token)
REDE_WEBHOOK_URL=     # URL que a Rede chama ao confirmar Pix
# Opcional: base da API (padrão https://api.userede.com.br/erede)
# EREDE_URL_PRODUCTION=https://api.userede.com.br/erede
```

**Autenticação:** `Authorization: Basic base64(EREDE_PV:EREDE_TOKEN)`. Não usar OAuth2; não usar clientId/clientSecret.

**Endpoint de produção:** `https://api.userede.com.br/erede/v2/transactions`. Todas as chamadas são feitas somente no backend (Node.js).

Configure no painel da Rede a URL do webhook para: `https://<seu-dominio>/api/webhooks/rede`

## Troubleshooting: 403 (CloudFront bloqueou a requisição)

Quando a Rede responde com **403** e a mensagem menciona *CloudFront* ou *Request blocked*, a requisição está sendo barrada. Quase sempre é um destes cenários:

---

### 1. Por que o PHP funciona e o Node (Next.js) dá 403?

O CloudFront da Rede pode bloquear por **origem** ou **IP**:

- **Localhost:** Se você testa o Next.js em `localhost:3000`, o CloudFront muitas vezes bloqueia. O PHP que "funciona há tempos" provavelmente roda em um **servidor** (VPS, hospedagem) cujo IP já está liberado pela Rede.
- **Vercel / outro hosting:** O IP do servidor onde o Next.js roda pode não estar na lista de permissões. Peça à Rede para liberar o IP ou o domínio do deploy.
- **Headers:** O PHP (cURL) envia só `Content-Type` e `Authorization`. O Node envia também `User-Agent` e `Accept`. Em alguns casos o WAF/CloudFront é sensível. **Teste com headers mínimos:** no `.env` defina `REDE_HEADERS_MINIMAL=true`. O código passará a enviar apenas `Content-Type` e `Authorization`, igual ao PHP.

**Resumo:** Teste o Next.js **deployado** (não em localhost). Se ainda der 403, use `REDE_HEADERS_MINIMAL=true` e, se precisar, peça ao suporte da Rede para liberar o IP/domínio do seu deploy.

---

### 2. Não testar produção em localhost

Em produção, a Rede pode exigir domínio válido, HTTPS ou IP autorizado. Rodar em `localhost` costuma dar 403. **Sempre testar deployado** (Vercel, VPS, etc.).

---

### 3. Headers mínimos (igual ao PHP)

Se o 403 continuar mesmo deployado, force os mesmos headers do PHP:

```env
REDE_HEADERS_MINIMAL=true
```

Isso envia apenas `Content-Type: application/json` e `Authorization: Basic ...`, sem `User-Agent` nem `Accept`.

---

### 4. Projeto habilitado para produção

No portal da Rede, confira se o projeto está **aprovado** e com **Produção ativa**. Projetos só em homologação podem ser bloqueados (403).

---

### 5. URL correta

- Transações: `POST https://api.userede.com.br/erede/v2/transactions` (Basic Auth).
- Não use `sandbox-erede.useredecloud.com.br`; use `api.userede.com.br/erede`.

**Se o 403 continuar:** entre em contato com o suporte da Rede (restrição de IP/WAF, projeto ativo para produção).

---

### 6. Quando a Rede pedir o “cabeçalho completo da requisição” (log operacional)

O suporte pode pedir o **cabeçalho completo** e o **endpoint** que seu sistema usa. Para gerar esse log:

1. No `.env.local` (ou nas variáveis de ambiente do deploy), defina:  
   `REDE_LOG_HEADERS=true`
2. Reinicie o servidor e faça **uma requisição** que chame a Rede (ex.: tentativa de checkout com PIX ou cartão).
3. No **console/logs** (terminal do `npm run dev` ou logs da Vercel/hosting), procure a linha que começa com `[Rede – log para suporte]`. Ela terá um JSON com:
   - **method** (ex.: POST)
   - **url** (endpoint completo, ex.: https://api.userede.com.br/erede/v2/transactions/pix)
   - **headers** (cabeçalhos enviados; o valor de `Authorization` aparece como `Basic ***` ou `Bearer ***` por segurança)
4. Copie esse JSON (ou o trecho relevante) e envie ao suporte da Rede.
5. Depois, **remova** ou defina `REDE_LOG_HEADERS=false` para não encher os logs.

---

## Observações

- Autenticação: **Basic Auth** com `EREDE_PV` e `EREDE_TOKEN` (token do painel). Não usar OAuth2.
- O payload PIX está alinhado ao que funciona no PHP (RedePayment): `kind: 'pix'` (minúsculo), `capture: true`, `qrCode.dateTimeExpiration` em ISO.
- Os endpoints exatos da API Rede podem variar; confira a documentação oficial (developer.userede.com.br) e ajuste `lib/rede.ts` se necessário.
