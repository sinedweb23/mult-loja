# Onde aparecem as configurações de Perfis

## 1. No menu do Admin (header)

Depois de logado como **admin**, no topo da página você deve ver os links:

**Dashboard | Pedidos | Produtos | Alunos | Empresas | Turmas | Usuários | Perfis | Importação | Configurações**

- O link **"Perfis"** fica entre **"Usuários"** e **"Importação"**.
- Ao clicar, a URL é: **`/admin/perfis`**.

## 2. Na página Usuários

Em **Admin > Usuários**, ao clicar em **"Tornar Admin"** ou **"Editar Permissões"** de um usuário, o modal passa a ter:

- **Perfil de acesso (opcional)** – dropdown para escolher o perfil (ex.: "Acesso total" ou outros que você criar).
- Continua tendo Empresa e Unidade como antes.

---

# Se não aparecer: aplicar a migration no Supabase

As mudanças **só funcionam** depois de criar as tabelas no banco. Faça **uma** das opções abaixo.

## Opção A – Supabase Dashboard (recomendado)

1. Acesse [Supabase](https://supabase.com/dashboard) e abra o projeto (ex.: **loja-sup**).
2. No menu lateral: **SQL Editor**.
3. Clique em **New query**.
4. Copie **todo** o conteúdo do arquivo:
   **`supabase/migrations/025_perfis_permissoes.sql`**
5. Cole no editor e clique em **Run** (ou Ctrl+Enter).
6. Confirme que a execução terminou sem erro.

## Opção B – Supabase CLI

No terminal, na pasta do projeto:

```bash
npx supabase db push
```

(Use isso se o projeto já estiver linkado ao Supabase via CLI.)

---

# Depois de aplicar a migration

1. **Local:** reinicie o servidor se estiver rodando (`npm run dev`) e abra de novo **`/admin`**.
2. **Deploy (Vercel etc.):** o commit já leva o código; confirme que o deploy terminou e abra de novo o site em **`/admin`**.

Se ainda não aparecer o **"Perfis"** no menu ou der erro ao abrir **`/admin/perfis`**, abra o **Console do navegador** (F12 > Console) e a aba **Network** ao carregar `/admin` e envie a mensagem de erro que aparecer.
