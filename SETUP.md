# Setup do Projeto loja-sup

## Projeto Supabase Criado

✅ **Projeto**: loja-sup  
✅ **ID**: jznhaioobvjwjdmigxja  
✅ **Região**: sa-east-1  
✅ **Status**: ACTIVE_HEALTHY  
✅ **Migrations aplicadas**: 
   - 001_initial_schema (schema completo)
   - 002_rls_policies (RLS para responsáveis)
   - 003_rls_admin_tables (RLS para tabelas administrativas)

## Configuração Local

1. Copie o arquivo `env.example` para `.env.local`:
```bash
cp env.example .env.local
```

2. Obtenha a `SUPABASE_SERVICE_ROLE_KEY`:
   - Acesse: https://supabase.com/dashboard/project/jznhaioobvjwjdmigxja/settings/api
   - Copie a chave "service_role" (secret)
   - Cole no arquivo `.env.local`

3. Instale as dependências:
```bash
npm install
```

4. Execute o projeto:
```bash
npm run dev
```

## Credenciais do Projeto

- **URL**: https://jznhaioobvjwjdmigxja.supabase.co
- **Anon Key**: Configurada no `env.example`
- **Service Role Key**: Obter no dashboard (Settings > API)

## Próximos Passos

1. Criar usuário de teste no Supabase Auth
2. Criar empresa, turma e aluno de teste
3. Vincular responsável ao aluno
4. Testar a loja
