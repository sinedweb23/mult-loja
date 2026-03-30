# Sincronização de importação via Cron (Vercel)

A sincronização pode ser disparada em horário programado (ex.: 2h da manhã) sem precisar abrir a tela Admin → Importação.

**Horário padrão:** 2h da manhã (horário de Brasília), configurado em `vercel.json` como `0 5 * * *` (5h UTC).

## Onde achar o ID da empresa (IMPORTACAO_CRON_EMPRESA_ID)

Como você tem só uma empresa, use o UUID dela:

1. **No Supabase:** Abra o SQL Editor e rode:  
   `SELECT id, nome FROM empresas LIMIT 1;`  
   O valor da coluna `id` é o que vai em `IMPORTACAO_CRON_EMPRESA_ID`.

2. **Pela aplicação:** Se no Admin a URL de alguma tela tiver algo como `?empresa=xxxx` ou um dropdown de empresa, o ID costuma aparecer ali (ou no código da página). O mesmo UUID da tabela `empresas` é o que deve ser usado.

## Por que a aluna sumiu depois da sincronização?

Ao **concluir** a sync, o sistema **inativa** alunos que não estão na lista retornada pela API (para refletir quem saiu da escola). Se o payload for **truncado** (JSON grande cortado no banco) ou a sync for **interrompida** (timeout, fechou a aba), a lista fica incompleta e alunos que ainda estão na API podem ser inativados por engano.

Foi adicionada uma **proteção**: só inativamos quando temos certeza de que a lista está completa (total de prontuários no payload confere com o esperado). Se houver indício de truncamento, a inativação em massa **não** é feita.

## Configuração do Cron na Vercel

### 1. Variáveis de ambiente (Vercel → Project → Settings → Environment Variables)

| Variável | Exemplo | Obrigatório |
|----------|---------|-------------|
| `IMPORTACAO_CRON_URL` | `https://loja.escolamorumbisul.com.br/api/importacao.php` | Sim |
| `IMPORTACAO_CRON_API_KEY` | Mesma chave usada na tela de importação (Bearer da API PHP) | Sim |
| `IMPORTACAO_CRON_EMPRESA_ID` | UUID da empresa (veja seção "Onde achar o ID da empresa" acima) | Sim |
| `IMPORTACAO_CRON_SECRET` | Senha para proteger a rota (opcional) | Não |

Se **não** definir `IMPORTACAO_CRON_SECRET`, a rota do cron roda sem senha (qualquer um que descobrir a URL pode disparar a sync). Em produção é mais seguro definir um secret e a Vercel envia ele no cron automaticamente se você configurar.

### 2. Horário (vercel.json)

O cron está configurado para rodar **todo dia às 2h da manhã (horário de Brasília)** — no `vercel.json` isso é `0 5 * * *` (5h UTC). Para alterar, edite `vercel.json`:

```json
"crons": [
  {
    "path": "/api/cron/importacao",
    "schedule": "0 9 * * *"
  }
]
```

Exemplos de `schedule` (formato cron: minuto hora dia mês dia-da-semana):

- `0 5 * * *` — 5h UTC = **2h BRT** (padrão atual)
- `0 9 * * *` — 9h UTC (6h BRT)
- `0 1 * * *` — 1h UTC (22h BRT)
- `30 5 * * 1-5` — 5h30 UTC (2h30 BRT) só em dias úteis

### 3. Testar manualmente (curl)

```bash
curl -H "Authorization: Bearer SEU_IMPORTACAO_CRON_SECRET" \
  "https://seu-dominio.vercel.app/api/cron/importacao"
```

Ou com query (menos seguro, use só em teste):

```bash
curl "https://seu-dominio.vercel.app/api/cron/importacao?secret=SEU_IMPORTACAO_CRON_SECRET"
```

### 4. Comportamento

- Na **primeira** execução do dia (ou quando não há sync em andamento): a rota baixa os dados da API PHP e grava no log; em seguida processa o máximo de lotes possível em até **50 segundos** (limite para não estourar timeout da Vercel).
- Se não der tempo de terminar, na **próxima** execução do cron (no dia seguinte ou em outro horário que você configurar) a rota vê que existe log “em progresso” e **continua** de onde parou, até concluir.
- Assim, mesmo com muitos alunos, a sincronização completa em uma ou mais execuções do cron, sem depender de alguém com a aba aberta.

## Teste local

Defina as mesmas variáveis no `.env.local` e chame a rota:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" "http://localhost:3000/api/cron/importacao"
```

A resposta indica se a sync foi iniciada, se terminou e quantos registros foram processados.
