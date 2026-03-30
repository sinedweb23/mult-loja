# Configuração de Email - Primeiro Acesso

## Problema

O Supabase pode não estar enviando emails se não houver SMTP customizado configurado. Por padrão, o Supabase usa um serviço de email limitado que pode não funcionar em todos os casos.

## Solução Temporária (Desenvolvimento)

Em **modo de desenvolvimento**, o sistema agora retorna o link de recuperação diretamente na mensagem de sucesso. Você pode copiar e colar o link no navegador para testar.

## Configuração de SMTP no Supabase (Produção)

Para que os emails sejam enviados automaticamente em produção, configure um SMTP customizado:

1. Acesse o Dashboard do Supabase: https://supabase.com/dashboard/project/jznhaioobvjwjdmigxja
2. Vá em **Settings** > **Auth** > **SMTP Settings**
3. Configure um provedor SMTP (ex: SendGrid, Mailgun, AWS SES, Gmail SMTP)
4. Preencha as credenciais:
   - **SMTP Host**: host do seu provedor
   - **SMTP Port**: porta (geralmente 587 ou 465)
   - **SMTP User**: usuário/email
   - **SMTP Password**: senha
   - **Sender Email**: email remetente
   - **Sender Name**: nome do remetente

## Provedores Recomendados

- **SendGrid**: https://sendgrid.com (gratuito até 100 emails/dia)
- **Mailgun**: https://mailgun.com (gratuito até 5.000 emails/mês)
- **AWS SES**: https://aws.amazon.com/ses/ (muito barato)
- **Gmail SMTP**: Para testes (requer App Password)

## Verificação

Após configurar o SMTP:

1. Teste novamente o primeiro acesso
2. Verifique os logs do console (deve mostrar o link gerado)
3. Verifique a caixa de entrada do email
4. Verifique a pasta de spam

## Logs de Debug

O sistema agora registra no console:
- ✅ Link gerado
- ✅ Email do destinatário
- ✅ ID do usuário criado

Verifique o console do servidor (terminal onde roda `npm run dev`) para ver esses logs.
