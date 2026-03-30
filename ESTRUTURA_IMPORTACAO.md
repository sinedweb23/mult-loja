# Estrutura das tabelas e importação

## Tabelas envolvidas na importação

### `empresas`
- **id** (UUID), nome, cnpj  
- A importação usa o `empresa_id` do admin logado.

### `turmas`
- **id**, empresa_id, unidade_id (opcional), **descricao**, segmento, tipo_curso, situacao  
- A API envia `descricaoturma` → vira **descricao** da turma (busca case-insensitive).  
- Se a turma não existir, é criada; se existir, é atualizada (segmento, tipo_curso, situacao).

### `alunos`
- **id**, empresa_id, **unidade_id**, **turma_id**, **prontuario**, nome, situacao  
- **turma_id** e **unidade_id** vêm da turma (descricao da API).  
- Na listagem, a turma é exibida via relação `turmas:turma_id`: o Supabase retorna **um objeto** (não array), por isso a tela usa `turmaDoAluno(aluno)` para tratar objeto ou array.

### `usuarios` (responsáveis e admins)
- **id**, auth_user_id, tipo (FINANCEIRO/PEDAGOGICO/AMBOS), nome_financeiro, cpf_financeiro, email_financeiro, nome_pedagogico, cpf_pedagogico, email_pedagogico, **empresa_id**, **perfil_id**, eh_admin, ativo, etc.  
- Na importação: responsáveis recebem **perfil_id** do perfil "Responsável" (se a tabela `perfis` existir) e **empresa_id** da empresa da importação.  
- Na tela de Usuários, o **Perfil** é exibido para todos (admins e responsáveis) quando houver `perfil_id` ou objeto `perfis`.

### `usuario_aluno`
- usuario_id, aluno_id  
- Vincula responsáveis aos alunos. A importação recria os vínculos do aluno a cada rodada.

### `perfis` e `perfil_permissoes`
- **perfis**: id, nome (ex.: "Responsável", "Acesso total").  
- **perfil_permissoes**: perfil_id, recurso (páginas que o perfil pode acessar).  
- A coluna **usuarios.perfil_id** foi adicionada na migration `025_perfis_permissoes.sql`. Se essa migration não tiver sido aplicada no projeto, o perfil não será gravado.

---

## 980 alunos na fonte vs 717 na importação

- O sistema **só importa o que a API devolve**. O número que aparece no histórico (ex.: 717) é o total de **registros** retornados no JSON (campo `registros` ou `alunos`).  
- Se na sua fonte há **980 alunos** e a API só retorna **717**, a diferença está na **API/fonte**, não no Cantina:
  - A API está paginada ou com filtro?
  - O export/script que gera o JSON inclui todos os 980?
- Ajuste a API (ou o processo que gera o JSON) para enviar todos os alunos; a importação processa tudo o que vier em `registros`/`alunos`.

---

## Por que “Sem turma” ou “Sem perfil” na tela?

1. **Turma**
   - A listagem de alunos usa a relação `turmas:turma_id`. O PostgREST devolve essa relação como **objeto** (uma turma por aluno).  
   - Se a UI tratasse como array (`turmas[0]`), a turma não aparecia. Foi corrigido com `turmaDoAluno(aluno)`, que aceita objeto ou array.  
   - Além disso, a busca da turma na importação passou a ser **case-insensitive** (`.ilike('descricao', descricaoturma)`), para bater com variações de maiúsculas/minúsculas da API.

2. **Perfil**
   - O perfil só é gravado se existir a coluna **usuarios.perfil_id** (migration 025) e um perfil "Responsável" em **perfis**.  
   - A tela de Usuários passou a exibir o perfil para **todos** os usuários (não só admins), quando houver `perfil_id` ou `perfis` no retorno da API.

---

## Resumo do fluxo de importação

1. **Fase 1**: GET na API → salva JSON em `importacao_logs.payload_inicial` (registros + total_alunos) → retorna rápido.  
2. **Fase 2**: Polling em lotes; cada lote processa um grupo de alunos (turma, aluno, responsáveis, vínculos, perfil, empresa_id).  
3. **Ao concluir**: Alunos da empresa que **não** estão na lista da API são marcados como **INATIVO**.

Se após uma importação completa os alunos ainda aparecem sem turma ou os usuários sem perfil, confira no Supabase (SQL ou Table Editor):

- `alunos.turma_id` e `alunos.unidade_id` preenchidos?
- `usuarios.perfil_id` e `usuarios.empresa_id` preenchidos?
- A migration `025_perfis_permissoes.sql` está aplicada?
