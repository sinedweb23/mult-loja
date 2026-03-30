# Acesso e perfis — Cantina Escolar

## Dois níveis de acesso

### 1. Papéis (com qual “área” o usuário entra)

**Um usuário tem N papéis.** Os papéis definem **em qual área** ele pode atuar:

| Papel        | Onde entra        | Uso                         |
|-------------|-------------------|-----------------------------|
| RESPONSAVEL | Loja              | Comprar para filhos, saldo, extrato |
| ADMIN       | Painel admin      | Gestão geral                |
| OPERADOR    | PDV / Caixa       | Abrir caixa, pedidos do dia  |
| COLABORADOR | Loja colaborador  | Consumo mensal (sem saldo)   |
| FINANCEIRO  | Admin > Financeiro| Consumo colaboradores, folha|

- **Onde fica:** tabela `usuario_papeis` (um registro por usuário + papel).
- **No login:**
  - Se o usuário tem **só 1 papel** → vai **direto** para a página daquele papel (loja, admin, pdv, etc.).
  - Se tem **vários papéis** → aparece a tela **“Escolher perfil”** (Admin, PDV, Loja, etc.) e ele escolhe para onde ir.

Resumo: **“Determinado usuário tem N papéis; no login ele escolhe com qual acessar (ou é redirecionado se tiver só um).”**

---

### 2. Perfil e permissões (só dentro do Admin)

**Só vale para quem acessa como ADMIN.** Aí entra o conceito:

- **Usuário tem 1 perfil** (opcional; tabela `usuarios.perfil_id` → `perfis`).
- **Esse perfil tem N permissões** (tabela `perfil_permissoes`: quais recursos do admin ele pode ver, ex.: admin.pedidos, admin.produtos).

Ou seja: **“Determinado usuário tem um perfil, e esse perfil tem N permissões.”**  
Isso só define **quais menus/páginas do painel admin** aquele usuário enxerga (pedidos, produtos, empresas, etc.).

- Se `perfil_id` for null e o usuário for admin (`eh_admin = true`), ele tem acesso total ao admin.

---

## Resumo rápido

| Pergunta | Resposta |
|----------|----------|
| Usuário tem X perfil e esse perfil tem N permissões? | **Sim, mas só dentro do Admin.** Perfil = 1 por usuário (opcional); permissões = o que ele pode fazer no admin. |
| Usuário tem N “perfis” para escolher no login? | **Sim.** No sistema isso se chama **papéis** (Responsável, Admin, PDV, Financeiro, etc.). Um usuário pode ter vários papéis. |
| No login ele escolhe Admin / Caixa / Financeiro / Loja? | **Sim.** Se tiver mais de um papel, aparece a tela para escolher. |
| Se tiver só um perfil/papel, vai direto? | **Sim.** Vai direto para a página daquele papel (loja, admin, pdv, etc.). |

---

## Como configurar

**Dar papéis a um usuário (para ele poder escolher Admin, PDV, Loja, etc.):**

- Tabela `usuario_papeis`: inserir linhas com `usuario_id` e `papel` (`'ADMIN'`, `'OPERADOR'`, `'RESPONSAVEL'`, `'FINANCEIRO'`, `'COLABORADOR'`).

**Definir o que um admin pode fazer (permissões no painel):**

- Tabela `perfis`: criar perfis (ex.: “Operador de pedidos”).
- Tabela `perfil_permissoes`: vincular recurso a perfil (ex.: admin.pedidos, admin.produtos).
- Em `usuarios`: preencher `perfil_id` com o perfil desejado para aquele usuário.
