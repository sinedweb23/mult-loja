# PDV – Estrutura de dados e relatórios por operador

O sistema registra **tudo por operador** via caixa. Use esta estrutura para construir relatórios no painel admin.

---

## Visão por operador

- Cada **caixa** pertence a um **operador** (`caixas.operador_id`).
- Toda venda no PDV tem **`pedidos.caixa_id`** e **`pedidos.usuario_id`** (operador).
- Toda movimentação de caixa tem **`pagamentos.caixa_id`**.

**Operador = `caixas.operador_id`** ou, para pedidos PDV, **`pedidos.usuario_id`** (são o mesmo).

---

## Tabelas principais

| Tabela | Uso |
|--------|-----|
| **caixas** | Um caixa por operador por vez. `operador_id`, `aberto_em`, `fechado_em`, `fundo_troco`, `status`. |
| **pedidos** | Cada venda (PDV ou online). PDV: `origem = 'PDV'`, `caixa_id` preenchido, `usuario_id` = operador. |
| **pedido_itens** | Itens da venda: `produto_id`, `produto_nome` (nome na hora da venda), `quantidade`, `preco_unitario`, `subtotal`. |
| **pagamentos** | Movimentação do caixa: `caixa_id`, `pedido_id`, `metodo` (DINHEIRO, DEBITO, CREDITO, SALDO), `valor`. |

---

## Relatórios sugeridos (queries base)

### Vendas por operador (valor no período)
```sql
SELECT c.operador_id, u.nome AS operador_nome,
       SUM(p.total) AS total_vendas, COUNT(p.id) AS qtd_pedidos
FROM pedidos p
JOIN caixas c ON c.id = p.caixa_id
JOIN usuarios u ON u.id = c.operador_id
WHERE p.origem = 'PDV' AND p.status = 'PAGO'
  AND p.created_at BETWEEN :inicio AND :fim
GROUP BY c.operador_id, u.nome;
```

### Produtos mais vendidos (por período)
```sql
SELECT pi.produto_id, COALESCE(pi.produto_nome, prod.nome) AS nome,
       SUM(pi.quantidade) AS quantidade, SUM(pi.subtotal) AS total
FROM pedido_itens pi
JOIN pedidos p ON p.id = pi.pedido_id
LEFT JOIN produtos prod ON prod.id = pi.produto_id
WHERE p.origem = 'PDV' AND p.status = 'PAGO'
  AND p.created_at BETWEEN :inicio AND :fim
GROUP BY pi.produto_id, pi.produto_nome, prod.nome
ORDER BY quantidade DESC;
```

### Vendas em valor por período
```sql
SELECT DATE(p.created_at) AS data, SUM(p.total) AS total
FROM pedidos p
WHERE p.origem = 'PDV' AND p.status = 'PAGO'
  AND p.created_at BETWEEN :inicio AND :fim
GROUP BY DATE(p.created_at)
ORDER BY data;
```

### Movimentação de caixa por operador (fechamento)
```sql
SELECT metodo, SUM(valor) AS total
FROM pagamentos
WHERE caixa_id = :caixa_id
GROUP BY metodo;
-- Dinheiro esperado = caixas.fundo_troco + SUM(valor) WHERE metodo = 'DINHEIRO'
```

---

## Regras garantidas pelo sistema

- Nenhuma venda PDV é concluída sem **`caixa_id`** e sem **registro em `pagamentos`** (movimentação do caixa).
- **`pedido_itens.produto_nome`** é gravado na venda para histórico (relatórios mesmo se o produto for renomeado).
- Fechamento de caixa usa **`pagamentos`** com `caixa_id` + **`caixas.fundo_troco`**.
