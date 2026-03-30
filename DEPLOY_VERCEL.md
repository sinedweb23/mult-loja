# Deploy na Vercel.

Use este guia para evitar deploys com erro (a Vercel cobra por deploy).

## Antes de cada deploy

1. **Rodar o check local** (TypeScript + build):
   ```bash
   npm run vercel:check
   ```
   Se der erro, corrija antes de fazer push/deploy.

2. **Confirmar variáveis de ambiente** no projeto Vercel (ver seção abaixo).

---

## Variáveis de ambiente na Vercel

No [Dashboard Vercel](https://vercel.com/dashboard) → seu projeto → **Settings** → **Environment Variables**, configure:

### Obrigatórias (app quebra sem elas)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase | `eyJhbGci...` |
| `NEXT_PUBLIC_APP_URL` | URL do app em produção | `https://seu-dominio.vercel.app` ou domínio customizado |

### Recomendadas (funcionalidades específicas)

| Variável | Descrição |
|----------|-----------|
| `IMPORTACAO_API_KEY` | Chave para a API de importação (altere em produção) |
| `EREDE_ENV` | `sandbox` ou `production` |
| `EREDE_PV_SANDBOX` / `EREDE_TOKEN_SANDBOX` / `EREDE_URL_SANDBOX` | Rede – sandbox |
| `EREDE_PV_PRODUCTION` / `EREDE_TOKEN_PRODUCTION` / `EREDE_URL_PRODUCTION` | Rede – produção |
| `REDE_WEBHOOK_TOKEN` | Token para validar webhook PIX (opcional se `REDE_WEBHOOK_REQUIRE_TOKEN=false`) |
| `REDE_WEBHOOK_REQUIRE_TOKEN` | Use `false` para aceitar webhook PIX sem token (quando a Rede não envia Bearer). Default: token obrigatório |
| `GOOGLE_CALENDAR_ID` | ID do calendário (Kit Festa) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Na Vercel:** use esta (veja abaixo). No local: pode usar `GOOGLE_APPLICATION_CREDENTIALS` com caminho do arquivo. |

### Google Agenda na Vercel (arquivo de credenciais não sobe)

A pasta `credencials/` (e o arquivo `.json` da conta de serviço) **não existe** no deploy da Vercel — e não deve ir para o Git. Para o Google Calendar funcionar em produção:

1. **Na Vercel** → **Settings** → **Environment Variables**:
   - **GOOGLE_CALENDAR_ID:** o ID do calendário (ex.: `primary` ou o e-mail do calendário).
   - **GOOGLE_SERVICE_ACCOUNT_JSON:** o **conteúdo completo** do arquivo JSON da conta de serviço (Google Cloud → Contas de serviço → Chave JSON), em **uma única linha**.  
     Exemplo: copie o conteúdo de `credencials/loja-eat-81b87bafe0b8.json`, remova quebras de linha (ou compacte com um minificador JSON) e cole como valor da variável.

2. **Remova** na Vercel a variável **GOOGLE_APPLICATION_CREDENTIALS** (caminho do arquivo), senão o app tenta abrir o arquivo e dá erro "no such file or directory".

---

## Redirect indo para http://localhost:3000 (ex.: /admin)

Se após o login o app redireciona para `http://localhost:3000/admin` em vez de ficar na URL da Vercel, faça **duas** coisas:

### 1. Variável na Vercel

No projeto na Vercel → **Settings** → **Environment Variables**:

- **Nome:** `NEXT_PUBLIC_APP_URL`
- **Valor:** a URL real do app, por exemplo: `https://eat-simple-10.vercel.app`
- Marque **Production** (e Preview se quiser). Salve e faça um **novo deploy** para a variável valer.

### 2. URLs no Supabase

No [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto → **Authentication** → **URL Configuration**:

- **Site URL:** coloque exatamente a URL do app em produção, ex.: `https://eat-simple-10.vercel.app`
- **Redirect URLs:** adicione:
  - `https://eat-simple-10.vercel.app/**` (wildcard para OAuth e previews)
  - `https://eat-simple-10.vercel.app/auth/callback` (obrigatório para recuperação/criação de senha)
  - `http://localhost:3000/**` (para desenvolvimento)

O Supabase usa o **Site URL** como base para redirecionamentos; se estiver como `http://localhost:3000`, os links de e-mail e o fluxo de auth vão mandar o usuário para o localhost. Sem `/auth/callback` na lista, o fluxo "Esqueci minha senha" pode redirecionar para a raiz em vez da tela de redefinição.

---

## Configuração do projeto

- **vercel.json** já está configurado: `framework: nextjs`, `regions: ["gru1"]`, `buildCommand: npm run build`.
- **Build:** `npm run build` (Next.js 14).

---

## Checklist rápido

- [ ] `npm run vercel:check` passou localmente
- [ ] Variáveis obrigatórias (Supabase + `NEXT_PUBLIC_APP_URL`) configuradas na Vercel
- [ ] `NEXT_PUBLIC_APP_URL` aponta para a URL real do deploy (ex.: `https://xxx.vercel.app`)
- [ ] Variáveis de pagamento (Rede) e importação configuradas se for usar
- [ ] Fazer deploy (push na branch conectada ou deploy manual)

Depois do primeiro deploy, anote a URL e atualize `NEXT_PUBLIC_APP_URL` se necessário (e faça um novo deploy para aplicar).
