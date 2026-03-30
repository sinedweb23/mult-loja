# 🏪 Loja Supabase - E-commerce para Escolas

Sistema completo de e-commerce desenvolvido para escolas, permitindo que responsáveis financeiros e pedagógicos realizem compras de produtos, serviços e kits para seus dependentes (alunos). Inclui painel administrativo completo para gerenciamento de pedidos, produtos, alunos, turmas, empresas e importação de dados.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Regras de Negócio](#regras-de-negócio)
- [Modelo de Dados](#modelo-de-dados)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso do Sistema](#uso-do-sistema)
- [Desenvolvimento](#desenvolvimento)
- [Testes](#testes)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Documentação Adicional](#documentação-adicional)

---

## 🎯 Visão Geral

Sistema de e-commerce multi-tenant desenvolvido para escolas, com duas interfaces principais:

1. **Loja Online** (`/loja`): Interface responsiva para responsáveis comprarem produtos/serviços/kits
2. **Painel Admin** (`/admin`): Interface administrativa para gerenciar todo o sistema

### Características Principais

- ✅ Multi-empresa e multi-unidade
- ✅ Controle de visibilidade de produtos por aluno/turma/segmento
- ✅ Sistema de kits (produtos compostos)
- ✅ Compra única por aluno
- ✅ Importação de dados via API externa
- ✅ Integração fiscal (Focus NFe) - preparado
- ✅ Pagamentos (PIX/Cartão) - arquitetura pluggable
- ✅ Row Level Security (RLS) forte
- ✅ Role-Based Access Control (RBAC)
- ✅ Auditoria completa de ações

---

## 🛠 Stack Tecnológica

### Frontend
- **Framework**: Next.js 14.1.0 (App Router)
- **Linguagem**: TypeScript 5.3.3
- **UI**: Tailwind CSS 3.4.1 + shadcn/ui
- **Componentes**: Radix UI
- **Formulários**: React Hook Form + Zod
- **Ícones**: Lucide React

### Backend
- **Runtime**: Node.js (via Next.js Server Actions/Route Handlers)
- **Validação**: Zod 3.22.4
- **Email**: Nodemailer 7.0.12

### Banco de Dados & Auth
- **Database**: PostgreSQL (via Supabase)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (preparado)
- **RLS**: Row Level Security policies
- **Migrations**: SQL migrations versionadas

### Testes
- **Framework**: Jest 29.7.0
- **Testing Library**: @testing-library/react 14.1.2
- **Environment**: jest-environment-jsdom

### Ferramentas
- **Package Manager**: npm
- **TypeScript Compiler**: tsc
- **Linter**: ESLint + Next.js config
- **Scripts**: tsx (TypeScript execution)

---

## 🏗 Arquitetura

### Padrão de Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Loja UI    │  │  Admin UI    │  │   Auth UI    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────▼─────────────────▼──────────────────▼──────┐  │
│  │         Server Actions / Route Handlers          │  │
│  └──────────────────────┬───────────────────────────┘  │
└─────────────────────────┼─────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────┐
│              Supabase (PostgreSQL + Auth)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Database   │  │     Auth     │  │    RLS       │ │
│  │  (Postgres)  │  │   (JWT)     │  │  Policies   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

1. **Cliente** → Next.js (Server Component/Action)
2. **Server Action** → Supabase Client (com RLS)
3. **Supabase** → PostgreSQL (com RLS policies aplicadas)
4. **Resposta** → Cliente (dados filtrados por RLS)

### Segurança

- **RLS (Row Level Security)**: Políticas no banco de dados
- **RBAC (Role-Based Access Control)**: Permissões por função
- **Server-Side Validation**: Zod schemas
- **Idempotência**: Importação e webhooks
- **Rate Limiting**: Preparado para endpoints sensíveis

---

## ✨ Funcionalidades

### Loja Online (`/loja`)

#### Para Responsáveis
- ✅ Login com email/senha
- ✅ Primeiro acesso (criação de senha via email)
- ✅ Recuperação de senha
- ✅ Visualização de todos os filhos vinculados
- ✅ Listagem de produtos disponíveis para todos os filhos
- ✅ Seleção de aluno ao adicionar ao carrinho
- ✅ Carrinho de compras persistente (localStorage)
- ✅ Modal de confirmação ao adicionar item
- ✅ Página dedicada de carrinho (`/loja/carrinho`)
- ✅ Design moderno e responsivo

#### Regras de Visibilidade
- Produtos disponíveis para **TODOS**
- Produtos disponíveis para **SEGMENTO** (ex: Educação Infantil)
- Produtos disponíveis para **TURMA** específica
- Produtos disponíveis para **ALUNO** específico
- Janelas de data (disponível_de / disponível_ate)

### Painel Administrativo (`/admin`)

#### Dashboard
- Visão geral de pedidos, produtos, alunos

#### Pedidos (`/admin/pedidos`)
- Listagem de pedidos
- Visualização de detalhes
- Alteração de status
- Emissão/cancelamento de notas fiscais (preparado)

#### Produtos (`/admin/produtos`)
- ✅ CRUD completo de produtos
- ✅ Categorias e grupos
- ✅ Variações e opcionais
- ✅ Disponibilidade (TODOS/SEGMENTO/TURMA/ALUNO)
- ✅ Janelas de data
- ✅ Controle de estoque
- ✅ Compra única e limite máximo
- ✅ Tipos: PRODUTO, SERVICO, KIT
- ✅ Itens de kit (produtos compostos)

#### Alunos (`/admin/alunos`)
- ✅ Listagem de todos os alunos
- ✅ Visualização de detalhes
- ✅ Responsáveis vinculados
- ✅ Turma e segmento
- ✅ Filtros e busca

#### Empresas/Unidades (`/admin/empresas`)
- ✅ CRUD de empresas
- ✅ CRUD de unidades (vinculadas a empresas)
- ✅ Multi-tenancy

#### Turmas (`/admin/turmas`)
- ✅ CRUD de turmas
- ✅ Segmentos (Educação Infantil, Fundamental, Médio, Outro)
- ✅ Vinculação a empresa/unidade

#### Usuários (`/admin/usuarios`)
- ✅ Listagem de todos os usuários
- ✅ Indicação de usuários que já fizeram login
- ✅ Tornar usuário admin
- ✅ Configurar permissões (super admin, empresa, unidade)
- ✅ Remover permissões de admin

#### Importação (`/admin/importacao`)
- ✅ Importação manual via UI
- ✅ Importação via API externa (`POST /api/importacao`)
- ✅ Logs completos de importação
- ✅ Idempotência (upsert por prontuário + CPF/email)
- ✅ Processamento de alunos, turmas e responsáveis
- ✅ Validação de dados

#### Configurações (`/admin/configuracoes`)
- ✅ Configuração SMTP para envio de emails
- ✅ Teste de conexão SMTP
- ✅ Configuração de remetente

---

## 📐 Regras de Negócio

### 1. Autenticação
- **Loja**: Apenas responsáveis (financeiro e/ou pedagógico)
- **Admin**: Usuários com flag `eh_admin = true`
- **Super Admin**: Usuários com `super_admin = true` (acesso total)

### 2. Responsáveis e Alunos
- Um responsável pode ter múltiplos alunos
- Um aluno pode ter múltiplos responsáveis
- Responsável pode ser: FINANCEIRO, PEDAGOGICO ou AMBOS
- **Obrigatório**: Todo aluno deve ter pelo menos um responsável financeiro

### 3. Visibilidade de Produtos
Produtos são visíveis se atenderem **pelo menos uma** regra:
- `tipo = TODOS` (disponível para todos)
- `tipo = SEGMENTO` + segmento do aluno
- `tipo = TURMA` + turma do aluno
- `tipo = ALUNO` + aluno específico
- Dentro da janela de datas (se definida)

### 4. Tipos de Produto
- **PRODUTO**: Item físico
- **SERVICO**: Serviço prestado
- **KIT**: Composto por outros produtos (expandido na nota fiscal)

### 5. Compra Única
- Produto pode ter `compra_unica = true`
- Limite máximo definido em `limite_max_compra_unica`
- Regra aplicada **por aluno** (não por responsável)
- Bloqueio no checkout e backend

### 6. Multi-Empresa e Multi-Unidade
- Produto pertence a uma empresa
- Produto pode pertencer a uma unidade específica (opcional)
- Se `unidade_id IS NULL`, produto é da empresa inteira
- Pedido herda empresa/unidade do produto

### 7. Importação de Dados
- Endpoint: `POST /api/importacao`
- Autenticação: API Key (`IMPORTACAO_API_KEY`)
- Idempotente: Upsert por `prontuario` + `cpf/email` do responsável
- Logs: Todas as importações registradas em `importacao_logs`
- Validação: Schema Zod

### 8. Fiscal (Preparado)
- Integração com Focus NFe
- NF-e para produtos
- NFS-e para serviços
- Emissão após pagamento confirmado

### 9. Pagamentos (Preparado)
- Arquitetura pluggable (PIX/Cartão)
- Webhooks idempotentes
- Status de pedido e pagamento separados

---

## 🗄 Modelo de Dados

### Tabelas Principais

#### `usuarios`
Tabela unificada para responsáveis e admins:
- `id`: UUID (PK)
- `auth_user_id`: UUID (FK para auth.users, nullable)
- `tipo`: ENUM('FINANCEIRO', 'PEDAGOGICO', 'AMBOS')
- `eh_admin`: BOOLEAN
- `super_admin`: BOOLEAN
- `nome`: TEXT
- `nome_financeiro`, `cpf_financeiro`, `email_financeiro`, `celular_financeiro`
- `nome_pedagogico`, `cpf_pedagogico`, `email_pedagogico`, `celular_pedagogico`
- `empresa_id`, `unidade_id`: UUID (para admins)
- `ativo`: BOOLEAN
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `usuario_aluno`
Vínculo entre usuários e alunos:
- `id`: UUID (PK)
- `usuario_id`: UUID (FK)
- `aluno_id`: UUID (FK)
- `created_at`: TIMESTAMPTZ

#### `alunos`
- `id`: UUID (PK)
- `empresa_id`: UUID (FK)
- `unidade_id`: UUID (FK, nullable)
- `turma_id`: UUID (FK, nullable)
- `prontuario`: TEXT (unique por empresa)
- `nome`: TEXT
- `situacao`: TEXT
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `turmas`
- `id`: UUID (PK)
- `empresa_id`: UUID (FK)
- `unidade_id`: UUID (FK, nullable)
- `descricao`: TEXT
- `segmento`: ENUM('EDUCACAO_INFANTIL', 'FUNDAMENTAL', 'MEDIO', 'OUTRO')
- `tipo_curso`: TEXT
- `situacao`: TEXT
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `empresas`
- `id`: UUID (PK)
- `tenant_id`: UUID (FK, nullable)
- `nome`: TEXT
- `cnpj`: TEXT (unique)
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `unidades`
- `id`: UUID (PK)
- `empresa_id`: UUID (FK)
- `nome`: TEXT
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `produtos`
- `id`: UUID (PK)
- `empresa_id`: UUID (FK)
- `unidade_id`: UUID (FK, nullable)
- `tipo`: ENUM('PRODUTO', 'SERVICO', 'KIT')
- `nome`: TEXT
- `descricao`: TEXT
- `preco`: DECIMAL(10,2)
- `estoque`: INTEGER
- `compra_unica`: BOOLEAN
- `limite_max_compra_unica`: INTEGER
- `permitir_pix`: BOOLEAN
- `permitir_cartao`: BOOLEAN
- `ativo`: BOOLEAN
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `produto_disponibilidade`
- `id`: UUID (PK)
- `produto_id`: UUID (FK)
- `tipo`: ENUM('TODOS', 'SEGMENTO', 'TURMA', 'ALUNO')
- `segmento`: ENUM (nullable, se tipo = SEGMENTO)
- `turma_id`: UUID (FK, nullable, se tipo = TURMA)
- `aluno_id`: UUID (FK, nullable, se tipo = ALUNO)
- `disponivel_de`: TIMESTAMPTZ (nullable)
- `disponivel_ate`: TIMESTAMPTZ (nullable)
- `created_at`: TIMESTAMPTZ

#### `kits_itens`
- `id`: UUID (PK)
- `kit_produto_id`: UUID (FK)
- `produto_id`: UUID (FK)
- `quantidade`: INTEGER
- `ordem`: INTEGER
- `created_at`: TIMESTAMPTZ

#### `pedidos`
- `id`: UUID (PK)
- `usuario_id`: UUID (FK)
- `aluno_id`: UUID (FK)
- `empresa_id`: UUID (FK)
- `unidade_id`: UUID (FK, nullable)
- `status`: ENUM('PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO', 'ENTREGUE')
- `total`: DECIMAL(10,2)
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `pedido_itens`
- `id`: UUID (PK)
- `pedido_id`: UUID (FK)
- `produto_id`: UUID (FK)
- `quantidade`: INTEGER
- `preco_unitario`: DECIMAL(10,2)
- `subtotal`: DECIMAL(10,2)
- `created_at`: TIMESTAMPTZ

#### `enderecos`
- `id`: UUID (PK)
- `usuario_id`: UUID (FK, nullable)
- `aluno_id`: UUID (FK, nullable)
- `tipo`: TEXT (default: 'RESIDENCIAL')
- `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `cep`: TEXT
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `importacao_logs`
- `id`: UUID (PK)
- `empresa_id`: UUID (FK)
- `usuario_id`: UUID (FK, nullable)
- `tipo`: ENUM('MANUAL', 'AGENDADA', 'API')
- `status`: ENUM('EM_PROGRESSO', 'SUCESSO', 'ERRO', 'PARCIAL')
- `total_registros`, `registros_processados`, `registros_criados`, `registros_atualizados`, `registros_com_erro`: INTEGER
- `erros`: JSONB
- `payload_inicial`: JSONB
- `iniciado_em`, `finalizado_em`: TIMESTAMPTZ
- `created_at`, `updated_at`: TIMESTAMPTZ

#### `configuracoes`
- `id`: UUID (PK)
- `chave`: TEXT (unique)
- `valor`: JSONB
- `descricao`: TEXT
- `created_at`, `updated_at`: TIMESTAMPTZ

### Relacionamentos

```
usuarios ←→ usuario_aluno ←→ alunos
usuarios ←→ pedidos
alunos → turmas → empresas
alunos → empresas
produtos → empresas
produtos → unidades
produtos → produto_disponibilidade
produtos → kits_itens (self-reference)
pedidos → pedido_itens → produtos
```

---

## 🔐 Autenticação e Autorização

### Autenticação

#### Supabase Auth
- Login com email/senha
- Primeiro acesso: link de confirmação via email
- Recuperação de senha: link de reset via email
- Sessão gerenciada por cookies (SSR)

#### Fluxo de Primeiro Acesso
1. Usuário acessa `/primeiro-acesso`
2. Informa email
3. Sistema verifica se email está em `usuarios` e ativo
4. Gera link de confirmação via Supabase Auth
5. Envia email via SMTP configurado
6. Usuário clica no link e define senha
7. `auth_user_id` é vinculado automaticamente

### Autorização (RLS + RBAC)

#### Row Level Security (RLS)

**Políticas para Responsáveis:**
- Veem apenas seus próprios dados em `usuarios`
- Veem apenas alunos vinculados em `usuario_aluno`
- Veem apenas produtos disponíveis para seus alunos
- Veem apenas seus próprios pedidos

**Políticas para Admins:**
- Função helper `eh_admin_usuario(user_id UUID)` (SECURITY DEFINER)
- Admins veem todos os dados (exceto dados sensíveis de outros admins)
- Admins podem gerenciar produtos, alunos, turmas, empresas
- Super admins têm acesso total

#### Role-Based Access Control (RBAC)

**Níveis de Acesso:**
1. **Responsável**: Acesso apenas à loja
2. **Admin**: Acesso ao painel admin (escopo por empresa/unidade)
3. **Super Admin**: Acesso total, pode gerenciar outros admins

**Escopo por Empresa/Unidade:**
- Admin pode ter `empresa_id` e `unidade_id` definidos
- Se `empresa_id IS NULL`: acesso a todas as empresas
- Se `unidade_id IS NULL`: acesso a todas as unidades da empresa

---

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+ e npm
- Conta no Supabase (ou instalação local)
- Conta de email SMTP (para envio de emails)

### Passo a Passo

1. **Clone o repositório:**
```bash
git clone <repository-url>
cd loja-supabase
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**
```bash
cp env.example .env.local
```

Edite `.env.local` com suas credenciais:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
IMPORTACAO_API_KEY=sua_api_key_secreta
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Aplique as migrations no Supabase:**
   - Via Supabase Dashboard: SQL Editor → Execute cada arquivo em `supabase/migrations/` na ordem
   - Via Supabase CLI: `supabase db push`

**Ordem das migrations:**
1. `001_initial_schema.sql`
2. `002_rls_policies.sql`
3. `004_produtos_estrutura_completa.sql`
4. `005_rls_admin_produtos.sql`
5. `006_importacao_logs.sql`
6. `007_auth_user_id_nullable.sql` (deprecated, mas mantido)
7. `008_responsaveis_ativo.sql` (deprecated, mas mantido)
8. `009_configuracoes_smtp.sql`
9. `010_rls_admin_alunos.sql`
10. `011_rls_admin_empresas_turmas.sql`
11. `012_unificar_usuarios.sql` ⚠️ **Importante**: Unifica `admins` e `responsaveis` em `usuarios`
12. `013_rls_usuarios_unificado.sql`
13. `014_super_admin_permissions.sql`

5. **Execute o projeto:**
```bash
npm run dev
```

Acesse: http://localhost:3000

---

## ⚙️ Configuração

### Configuração SMTP

1. Acesse `/admin/configuracoes`
2. Preencha os dados SMTP:
   - Habilitado: `true`
   - Host: `smtp.gmail.com` (ou seu servidor)
   - Porta: `587` (ou `465` para SSL)
   - Usuário: seu email
   - Senha: senha de app (Gmail) ou senha normal
   - Nome do remetente: Nome que aparece nos emails
   - Email do remetente: Email que envia

3. Teste a conexão

### Criar Usuários de Teste

#### Via Script
```bash
npm run criar-usuarios
```

#### Manualmente
1. Criar usuário no Supabase Auth
2. Inserir registro em `usuarios` com `auth_user_id`
3. Para admin: definir `eh_admin = true`
4. Para super admin: definir `super_admin = true`

### Configurar Super Admin

Execute no SQL Editor do Supabase:
```sql
UPDATE usuarios
SET eh_admin = TRUE, super_admin = TRUE, ativo = TRUE
WHERE email_financeiro = 'seu-email@exemplo.com'
   OR email_pedagogico = 'seu-email@exemplo.com';
```

---

## 📖 Uso do Sistema

### Para Responsáveis

1. **Primeiro Acesso:**
   - Acesse `/primeiro-acesso`
   - Informe seu email
   - Verifique sua caixa de entrada
   - Clique no link e defina sua senha

2. **Login:**
   - Acesse `/login`
   - Informe email e senha
   - Se for admin também, escolha o modo (Loja ou Admin)

3. **Comprar:**
   - Navegue pelos produtos em `/loja`
   - Selecione um aluno ao adicionar ao carrinho
   - Revise o carrinho em `/loja/carrinho`
   - Finalize a compra (checkout em desenvolvimento)

### Para Administradores

1. **Login:**
   - Acesse `/login` com credenciais de admin
   - Escolha "Modo Admin"

2. **Gerenciar Produtos:**
   - Acesse `/admin/produtos`
   - Clique em "Novo Produto"
   - Preencha dados, categorias, disponibilidade
   - Salve

3. **Importar Dados:**
   - Acesse `/admin/importacao`
   - Opção 1: Importação manual (cole JSON)
   - Opção 2: Use a API (`POST /api/importacao`)

4. **Gerenciar Usuários:**
   - Acesse `/admin/usuarios`
   - Veja todos os usuários
   - Clique em "Tornar Admin" para conceder permissões
   - Configure empresa/unidade e super admin

---

## 💻 Desenvolvimento

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Inicia servidor de desenvolvimento

# Build
npm run build            # Build de produção
npm run start            # Inicia servidor de produção

# Qualidade
npm run lint             # Executa ESLint
npm run type-check       # Verifica tipos TypeScript

# Testes
npm test                 # Executa testes
npm run test:watch       # Testes em modo watch

# Scripts utilitários
npm run criar-usuarios   # Cria usuários de teste
npm run criar-dados      # Cria dados de teste (alunos, turmas, produtos)
npm run resetar-senhas   # Reseta senhas de usuários de teste
```

### Estrutura de Código

```
app/
├── actions/           # Server Actions (lógica de negócio)
│   ├── admin.ts
│   ├── alunos.ts
│   ├── empresas.ts
│   ├── importacao.ts
│   ├── produtos.ts
│   ├── produtos-admin.ts
│   ├── responsavel.ts
│   ├── responsavel-auth.ts
│   ├── turmas.ts
│   ├── usuarios-admin.ts
│   └── configuracoes.ts
├── admin/             # Páginas do painel admin
│   ├── alunos/
│   ├── empresas/
│   ├── importacao/
│   ├── pedidos/
│   ├── produtos/
│   ├── turmas/
│   ├── usuarios/
│   └── configuracoes/
├── api/                # Route Handlers (API endpoints)
│   ├── importacao/
│   ├── criar-usuarios-teste/
│   └── redefinir-senha-admin/
├── auth/               # Páginas de autenticação
│   ├── callback/
│   ├── confirm/
│   └── reset-password/
├── loja/               # Páginas da loja
│   ├── page.tsx        # Lista de produtos
│   └── carrinho/       # Página do carrinho
├── login/
├── primeiro-acesso/
└── escolher-modo/

components/
├── admin/              # Componentes específicos do admin
│   ├── categorias-manager.tsx
│   ├── disponibilidade-manager.tsx
│   ├── grupos-manager.tsx
│   ├── importacao-manager.tsx
│   └── produto-form-modal.tsx
├── ui/                 # Componentes shadcn/ui
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── select.tsx
│   ├── tabs.tsx
│   └── textarea.tsx
├── alternar-modo-button.tsx
└── logout-button.tsx

lib/
├── supabase/           # Clientes Supabase
│   ├── admin.ts        # Cliente admin (service role)
│   ├── client.ts       # Cliente browser
│   └── server.ts       # Cliente server (SSR)
├── types/              # TypeScript types
│   └── database.ts
├── email.ts            # Utilitários de email
├── carrinho.ts         # Utilitários do carrinho (localStorage)
└── utils.ts            # Utilitários gerais

supabase/
└── migrations/         # Migrations SQL (ordem numérica)

scripts/                # Scripts utilitários
├── criar-usuarios-teste.ts
├── criar-dados-teste.ts
└── redefinir-senha-admin.ts
```

### Convenções

- **Server Actions**: Sempre `'use server'`, validação com Zod
- **TypeScript**: Strict mode, tipos explícitos
- **RLS**: Sempre verificar no backend, nunca confiar apenas no frontend
- **Idempotência**: Importação e webhooks devem ser idempotentes
- **Logs**: Usar `console.log` para debug, logs estruturados para produção

---

## 🧪 Testes

### Executar Testes

```bash
npm test                # Todos os testes
npm run test:watch      # Modo watch
```

### Estrutura de Testes

```
__tests__/
└── produtos.test.ts    # Testes de produtos
```

### Exemplo de Teste

```typescript
import { getProdutosDisponiveis } from '@/app/actions/produtos'

describe('getProdutosDisponiveis', () => {
  it('deve retornar produtos disponíveis para o aluno', async () => {
    // Teste aqui
  })
})
```

### Cobertura de Testes

- ✅ Regras de visibilidade de produtos
- ✅ Compra única
- ✅ RLS policies
- ✅ Validação de dados (Zod)

---

## 📁 Estrutura do Projeto

```
loja-supabase/
├── app/                    # Next.js App Router
├── components/              # Componentes React
├── lib/                    # Bibliotecas e utilitários
├── supabase/               # Migrations SQL
├── scripts/                # Scripts utilitários
├── __tests__/              # Testes
├── .env.local              # Variáveis de ambiente (não versionado)
├── .env.example            # Exemplo de variáveis
├── .gitignore
├── jest.config.js
├── jest.setup.js
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── README.md               # Este arquivo
├── SETUP.md                # Guia de setup
├── API_IMPORTACAO.md       # Documentação da API de importação
└── CONFIGURACAO_EMAIL.md   # Guia de configuração de email
```

---

## 📚 Documentação Adicional

### Arquivos de Documentação

- **README.md** (este arquivo): Visão geral completa
- **SETUP.md**: Guia de setup inicial
- **API_IMPORTACAO.md**: Documentação da API de importação
- **CONFIGURACAO_EMAIL.md**: Guia de configuração SMTP

### APIs

#### Importação de Dados
- **Endpoint**: `POST /api/importacao`
- **Autenticação**: Header `X-API-Key: <IMPORTACAO_API_KEY>`
- **Documentação**: Ver `API_IMPORTACAO.md`

#### Criar Usuários de Teste
- **Endpoint**: `POST /api/criar-usuarios-teste`
- **Uso**: Apenas desenvolvimento

### Migrations

Todas as migrations estão em `supabase/migrations/` e devem ser aplicadas na ordem numérica.

**Importante**: A migration `012_unificar_usuarios.sql` unifica as tabelas `admins` e `responsaveis` em uma única tabela `usuarios`. Todas as migrations subsequentes usam a nova estrutura.

---

## 🔄 Roadmap / Funcionalidades Futuras

### Em Desenvolvimento
- [ ] Checkout completo
- [ ] Integração com gateway de pagamento (PIX/Cartão)
- [ ] Webhooks de pagamento
- [ ] Integração fiscal (Focus NFe)
- [ ] Emissão de notas fiscais
- [ ] Conciliação de pagamentos

### Planejado
- [ ] Agendamento de importação
- [ ] Relatórios e dashboards
- [ ] Notificações por email
- [ ] Histórico de pedidos na loja
- [ ] Upload de imagens de produtos
- [ ] Sistema de cupons/descontos

---

## 🤝 Contribuindo

1. Crie uma branch para sua feature
2. Faça commit das mudanças
3. Abra um Pull Request
4. Aguarde revisão

---

## 📝 Licença

Este projeto é privado e proprietário.

---

## 🚀 Deploy

O projeto está configurado para deploy na **Vercel**. Consulte o arquivo [`DEPLOY.md`](./DEPLOY.md) para instruções detalhadas.

### Resumo Rápido

1. Conecte o repositório na [Vercel](https://vercel.com)
2. Configure as variáveis de ambiente (veja `DEPLOY.md`)
3. Deploy automático a cada push

---

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no repositório
- Entre em contato com a equipe de desenvolvimento

---

**Desenvolvido com ❤️ usando Next.js, TypeScript e Supabase**
#   l o j a - s u p a b a s e 
 
 