# Recuperação de senha – configuração no Supabase

Se o link "Redefinir senha" do email leva para a tela de login em vez da tela de criar/redefinir senha, configure o Supabase assim:

## 1. Redirect URLs

No [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto → **Authentication** → **URL Configuration** → **Redirect URLs**, adicione:

```
https://eat-simple-10.vercel.app/auth/callback
```

(Ou a URL do seu domínio em produção: `https://SEU_DOMINIO/auth/callback`)

Sem essa URL na lista, o Supabase ignora o `redirectTo` que enviamos e usa o **Site URL** (geralmente a raiz `/`). Nesse caso, o fluxo acaba na tela de login.

## 2. Site URL

O **Site URL** deve ser a URL base do app, por exemplo:
```
https://eat-simple-10.vercel.app
```

## 3. Variável de ambiente

Na Vercel (ou seu host), confira se `NEXT_PUBLIC_APP_URL` está definido com a mesma URL:
```
NEXT_PUBLIC_APP_URL=https://eat-simple-10.vercel.app
```

---

**Fallback no app:** Mesmo que o Supabase redirecione para `/`, o middleware e o cliente tentam detectar o `code` e encaminhar para `/auth/callback`. A configuração correta em Redirect URLs evita problemas e deixa o fluxo mais estável.
