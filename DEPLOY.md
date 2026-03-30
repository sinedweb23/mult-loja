# Deploy na Vercel.

## Pré-requisitos

1. Conta na [Vercel](https://vercel.com)
2. Repositório no GitHub/GitLab/Bitbucket
3. Projeto Supabase configurado

## Passo a Passo

### 1. Preparar o Repositório

```bash
git init
git add .
git commit -m "Preparar para deploy"
git remote add origin <seu-repositorio>
git push -u origin main
```

### 2. Conectar na Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "Add New Project"
3. Importe seu repositório
4. Configure o projeto:
   - **Framework Preset**: Next.js (detectado automaticamente)
   - **Root Directory**: `./` (raiz)
   - **Build Command**: `npm run build` (padrão)
   - **Output Directory**: `.next` (padrão)

### 3. Configurar Variáveis de Ambiente

Na Vercel, vá em **Settings > Environment Variables** e adicione:

#### Obrigatórias:

```
NEXT_PUBLIC_SUPABASE_URL=https://jznhaioobvjwjdmigxja.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6bmhhaW9vYnZqd2pkbWlneGphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyODc3MDYsImV4cCI6MjA4NDg2MzcwNn0.rWMfxxjhH8LjPw0yfsFkA0oiEOHjNygLCi6MZ-87y_U
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
IMPORTACAO_API_KEY=sua_chave_api_importacao
NEXT_PUBLIC_APP_URL=https://seu-projeto.vercel.app
```

#### Opcionais (se usar SMTP):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-app
```

**Importante:**
- Configure para **Production**, **Preview** e **Development**
- Substitua `NEXT_PUBLIC_APP_URL` pela URL real após o primeiro deploy

### 4. Deploy

1. Clique em **Deploy**
2. Aguarde o build (2-5 minutos)
3. Acesse a URL gerada: `https://seu-projeto.vercel.app`

### 5. Configurar Supabase (URLs de Redirect)

No Supabase Dashboard:

1. Vá em **Authentication > URL Configuration**
2. Adicione nas **Redirect URLs**:
   - `https://seu-projeto.vercel.app/auth/callback`
   - `https://seu-projeto.vercel.app/auth/confirm`
   - `https://seu-projeto.vercel.app/auth/reset-password`
3. Adicione nas **Site URL**:
   - `https://seu-projeto.vercel.app`

### 6. Atualizar Variável de Ambiente

Após o primeiro deploy, atualize `NEXT_PUBLIC_APP_URL` na Vercel com a URL real do projeto.

## Deploy Automático

- **Push para `main`**: Deploy em produção
- **Pull Request**: Deploy de preview (URL temporária)

## Troubleshooting

### Build falha
- Verifique se todas as variáveis de ambiente estão configuradas
- Verifique os logs de build na Vercel

### Erro de autenticação
- Verifique se as URLs de redirect estão configuradas no Supabase
- Verifique se `NEXT_PUBLIC_APP_URL` está correto

### Imagens não carregam
- Verifique se o bucket do Supabase Storage está público
- Verifique a configuração de `remotePatterns` no `next.config.js`

## Comandos Úteis

```bash
# Instalar Vercel CLI (opcional)
npm i -g vercel

# Deploy manual
vercel

# Deploy em produção
vercel --prod
```
