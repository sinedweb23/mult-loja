# API de Importação de Dados

## Endpoint

```
POST /api/importacao
```

**URL Completa:** A URL completa depende de onde sua aplicação está hospedada:
- **Desenvolvimento:** `http://localhost:3000/api/importacao`
- **Produção:** `https://seu-dominio.com/api/importacao` (ou onde você hospedar)

**⚠️ IMPORTANTE:** A API externa (ex: `https://loja.escolamorumbisul.com.br/api/importacao.php`) deve fazer uma requisição POST para a URL da sua aplicação Next.js, não o contrário.

## Autenticação

A API utiliza autenticação via `api_key` no payload. Configure a variável de ambiente `IMPORTACAO_API_KEY` no servidor.

## Payload

```json
{
  "empresa_id": "uuid-da-empresa",
  "api_key": "sua-api-key",
  "registros": [
    {
      "nomealuno": "João Silva",
      "prontuario": "12345",
      "descricaoturma": "Kindergarten 5",
      "tipocurso": "Educação Infantil",
      "situacao": "ATIVO",
      
      "nomerespfin": "Maria Silva",
      "cpfrespfin": "123.456.789-00",
      "emailrespfin": "maria@email.com",
      "logradourorespfin": "Rua Exemplo",
      "numerorespfin": "123",
      "complementorespfin": "Apto 45",
      "bairrorespfin": "Centro",
      "cidaderespfin": "São Paulo",
      "estadorespfin": "SP",
      "ceprespfin": "01234-567",
      "celularrespfin": "(11) 98765-4321",
      
      "nomerespped": "Pedro Silva",
      "cpfrespped": "987.654.321-00",
      "emailrespped": "pedro@email.com",
      "logradourorespped": "Rua Exemplo",
      "numerorespped": "123",
      "complementorespped": "Apto 45",
      "bairrorespped": "Centro",
      "cidaderespped": "São Paulo",
      "estadorespped": "SP",
      "ceprespped": "01234-567",
      "celularrespped": "(11) 98765-4321"
    }
  ]
}
```

## Campos Obrigatórios

- `empresa_id`: UUID da empresa
- `api_key`: Chave de API para autenticação
- `registros`: Array com pelo menos 1 registro
  - `nomealuno`: Nome do aluno (obrigatório)
  - `prontuario`: Prontuário do aluno (obrigatório)
  - `descricaoturma`: Descrição da turma (obrigatório)

## Campos Opcionais

- `tipocurso`: Tipo do curso (usado para mapear segmento)
- `situacao`: Situação do aluno (default: "ATIVO")
- Dados do responsável financeiro (todos opcionais)
- Dados do responsável pedagógico (todos opcionais)

## Resposta de Sucesso

```json
{
  "success": true,
  "log_id": "uuid-do-log",
  "total_registros": 10,
  "registros_processados": 10,
  "registros_criados": 5,
  "registros_atualizados": 5,
  "registros_com_erro": 0
}
```

## Resposta com Erros

```json
{
  "success": true,
  "log_id": "uuid-do-log",
  "total_registros": 10,
  "registros_processados": 8,
  "registros_criados": 3,
  "registros_atualizados": 5,
  "registros_com_erro": 2,
  "erros": [
    {
      "registro": "12345",
      "erro": "Erro ao criar turma"
    }
  ]
}
```

## Resposta de Erro

```json
{
  "error": "Mensagem de erro"
}
```

## Códigos de Status HTTP

- `200`: Sucesso
- `400`: Erro de validação ou processamento
- `401`: API key inválida
- `404`: Empresa não encontrada

## Características

1. **Idempotente**: Upsert por `prontuario` + `cpf/email` do responsável
2. **Logs**: Todas as importações são registradas na tabela `importacao_logs`
3. **Validação**: Schema Zod valida todos os campos
4. **Mapeamento de Segmento**: Automático baseado em `tipocurso`:
   - "Educação Infantil" → `EDUCACAO_INFANTIL`
   - "Fundamental" → `FUNDAMENTAL`
   - "Médio" → `MEDIO`
   - Outros → `OUTRO`
5. **Responsáveis**: Cria/atualiza responsável financeiro e pedagógico separadamente
6. **Endereços**: Cria/atualiza endereços dos responsáveis automaticamente
7. **Vínculos**: Cria vínculos entre responsáveis e alunos automaticamente

## Exemplo de Uso (cURL)

```bash
curl -X POST https://seu-dominio.com/api/importacao \
  -H "Content-Type: application/json" \
  -d '{
    "empresa_id": "uuid-da-empresa",
    "api_key": "sua-api-key",
    "registros": [
      {
        "nomealuno": "João Silva",
        "prontuario": "12345",
        "descricaoturma": "Kindergarten 5",
        "tipocurso": "Educação Infantil",
        "situacao": "ATIVO",
        "nomerespfin": "Maria Silva",
        "emailrespfin": "maria@email.com"
      }
    ]
  }'
```

## Exemplo de Uso (PHP - API Externa)

Se você tem uma API PHP que precisa chamar esta API, use algo assim:

```php
<?php
// api/importacao.php

$url = 'https://seu-dominio.com/api/importacao'; // URL da sua aplicação Next.js
$empresaId = 'uuid-da-empresa';
$apiKey = 'sua-api-key';

$dados = [
    'empresa_id' => $empresaId,
    'api_key' => $apiKey,
    'registros' => [
        [
            'nomealuno' => 'João Silva',
            'prontuario' => '12345',
            'descricaoturma' => 'Kindergarten 5',
            'tipocurso' => 'Educação Infantil',
            'situacao' => 'ATIVO',
            'nomerespfin' => 'Maria Silva',
            'emailrespfin' => 'maria@email.com',
        ],
    ],
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($dados));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$resultado = json_decode($response, true);

if ($httpCode === 200 && isset($resultado['success']) && $resultado['success']) {
    echo "Importação realizada com sucesso!\n";
    echo "Registros processados: " . $resultado['registros_processados'] . "\n";
} else {
    echo "Erro na importação: " . ($resultado['error'] ?? 'Erro desconhecido') . "\n";
}
?>
```

## Exemplo de Uso (JavaScript)

```javascript
const response = await fetch('https://seu-dominio.com/api/importacao', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    empresa_id: 'uuid-da-empresa',
    api_key: 'sua-api-key',
    registros: [
      {
        nomealuno: 'João Silva',
        prontuario: '12345',
        descricaoturma: 'Kindergarten 5',
        tipocurso: 'Educação Infantil',
        situacao: 'ATIVO',
        nomerespfin: 'Maria Silva',
        emailrespfin: 'maria@email.com',
      },
    ],
  }),
})

const result = await response.json()
console.log(result)
```
