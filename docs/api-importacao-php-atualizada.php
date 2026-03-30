<?php
/**
 * API de Importação/Exportação de Dados de Alunos
 * 
 * Endpoint: GET /api/importacao.php
 * Autenticação: Bearer Token (API_KEY)
 * 
 * Retorna todos os dados de alunos no formato esperado pela aplicação EatSimple.
 * 
 * ALTERAÇÕES PARA FUNCIONAR COM A APLICAÇÃO:
 * 1. Incluir alunos com status 'ativo' E sem filtro que exclua "novos" (veja WHERE).
 * 2. descricaoturma nunca vazio (COALESCE para "Sem turma") para não rejeitar na validação.
 * 3. Resposta com chave "registros" e opcionalmente "total_alunos" (alunos únicos).
 */

require_once '../config/database_online.php';
require_once '../includes/Env.php';

header('Content-Type: application/json; charset=utf-8');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ============================================
// AUTENTICAÇÃO VIA BEARER TOKEN
// ============================================
$auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$api_key = '';

if (!empty($auth_header)) {
    if (preg_match('/Bearer\s+(.*)$/i', $auth_header, $matches)) {
        $api_key = trim($matches[1]);
    }
}

if (empty($api_key) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $dados = json_decode($input, true);
    $api_key = $dados['api_key'] ?? '';
}

$expected_api_key = Env::get('API_IMPORTACAO_KEY', 'qEdBMvsoCg8dx9oTCSSQtuCuhtdcHWRFYU');

if (empty($api_key) || $api_key !== $expected_api_key) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Unauthorized',
        'message' => 'Token de autorização inválido ou não fornecido'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================
// CONEXÃO COM BANCO DE DADOS
// ============================================
try {
    $conn = getExistingConnectionOnline();
    if (!$conn instanceof PDO) {
        throw new Exception('Erro de conexão com o banco de dados');
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'DatabaseError',
        'message' => 'Erro ao conectar ao banco de dados: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================
// PROCESSAR REQUISIÇÃO
// ============================================
try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $prontuario = isset($_GET['prontuario']) ? trim($_GET['prontuario']) : null;
        if ($prontuario === '') $prontuario = null;
        exportarDados($conn, $prontuario);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'NotImplemented',
            'message' => 'Importação ainda não implementada'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'error' => 'MethodNotAllowed',
            'message' => 'Método não permitido'
        ], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'ServerError',
        'message' => 'Erro ao processar requisição: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Exportar dados de alunos no formato de importação
 * ALTERAÇÃO: incluir todos os alunos que devem ser sincronizados (ativo e, se existir, status de "novo").
 * ALTERAÇÃO: descricaoturma nunca vazio (COALESCE para "Sem turma").
 */
function exportarDados($conn, $prontuario = null) {
    if (!empty($prontuario)) {
        $sql = "SELECT 
                    a.id,
                    a.nome as nomealuno,
                    a.prontuario,
                    a.email as emailaluno,
                    COALESCE(NULLIF(TRIM(t.denominacao), ''), 'Sem turma') as descricaoturma,
                    t.segmento as tipocurso,
                    CASE 
                        WHEN LOWER(TRIM(COALESCE(a.status, ''))) = 'ativo' THEN 'ATIVO'
                        WHEN LOWER(TRIM(COALESCE(a.status, ''))) = 'inativo' THEN 'INATIVO'
                        ELSE UPPER(TRIM(COALESCE(a.status, 'ATIVO')))
                    END as situacao
                FROM alunos a
                LEFT JOIN turmas t ON a.turma_id = t.id
                WHERE a.prontuario = ?
                ORDER BY a.nome";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$prontuario]);
    } else {
        // IMPORTANTE: Quem deve aparecer na sincronização?
        // Opção A: Só ativos (como abaixo).
        // Opção B: Ativos + "novos" (se no seu banco alunos novos têm status 'novo' ou 'pendente'):
        //   WHERE ( LOWER(TRIM(COALESCE(a.status, 'ativo'))) = 'ativo'
        //           OR LOWER(TRIM(COALESCE(a.status, ''))) IN ('novo', 'pendente', 'matriculado') )
        $sql = "SELECT 
                    a.id,
                    a.nome as nomealuno,
                    a.prontuario,
                    a.email as emailaluno,
                    COALESCE(NULLIF(TRIM(t.denominacao), ''), 'Sem turma') as descricaoturma,
                    t.segmento as tipocurso,
                    CASE 
                        WHEN LOWER(TRIM(COALESCE(a.status, ''))) = 'ativo' THEN 'ATIVO'
                        WHEN LOWER(TRIM(COALESCE(a.status, ''))) = 'inativo' THEN 'INATIVO'
                        ELSE UPPER(TRIM(COALESCE(a.status, 'ATIVO')))
                    END as situacao
                FROM alunos a
                LEFT JOIN turmas t ON a.turma_id = t.id
                WHERE LOWER(TRIM(COALESCE(a.status, 'ativo'))) = 'ativo'
                ORDER BY a.nome";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
    }

    $alunos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($prontuario) && empty($alunos)) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'NotFound',
            'message' => 'Nenhum aluno encontrado com o prontuário informado: ' . $prontuario
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $registros = [];
    $prontuarios_unicos = [];

    foreach ($alunos as $aluno) {
        $pront = $aluno['prontuario'] ?? '';
        if ($pront !== '') $prontuarios_unicos[$pront] = true;

        $sql_responsaveis = "SELECT 
                                r.*,
                                ar.responsabilidade,
                                CASE WHEN COALESCE(r.status, 'ativo') = 'ativo' THEN 0 ELSE 1 END as ordem_status
                            FROM responsaveis r
                            JOIN aluno_responsavel ar ON r.id = ar.responsavel_id
                            WHERE ar.aluno_id = ?
                            ORDER BY ordem_status, ar.responsabilidade, r.nome";

        $stmt_resp = $conn->prepare($sql_responsaveis);
        $stmt_resp->execute([$aluno['id']]);
        $responsaveis = $stmt_resp->fetchAll(PDO::FETCH_ASSOC);

        $responsaveis_fin = [];
        $responsaveis_ped = [];

        foreach ($responsaveis as $resp) {
            $responsabilidade = strtolower(trim($resp['responsabilidade'] ?? ''));
            if ($responsabilidade === 'ambos') {
                $responsaveis_fin[] = $resp;
                $responsaveis_ped[] = $resp;
            } elseif ($responsabilidade === 'financeiro') {
                $responsaveis_fin[] = $resp;
            } elseif ($responsabilidade === 'pedagogico') {
                $responsaveis_ped[] = $resp;
            }
        }

        if (empty($responsaveis_fin) && !empty($responsaveis_ped)) {
            $responsaveis_fin[] = $responsaveis_ped[0];
        }
        if (empty($responsaveis_fin) && !empty($responsaveis)) {
            $responsaveis_fin[] = $responsaveis[0];
        }

        $resp_fin = !empty($responsaveis_fin) ? $responsaveis_fin[0] : null;
        $resp_ped = !empty($responsaveis_ped) ? $responsaveis_ped[0] : null;

        if (empty($resp_ped) && $resp_fin) {
            $resp_fin_resp = strtolower(trim($resp_fin['responsabilidade'] ?? ''));
            if ($resp_fin_resp === 'ambos' || $resp_fin_resp === 'pedagogico') {
                $resp_ped = $resp_fin;
            }
        }

        $formatarCPF = function($cpf) {
            if (empty($cpf)) return '';
            $cpf = preg_replace('/[^0-9]/', '', $cpf);
            if (strlen($cpf) === 11) {
                return substr($cpf, 0, 3) . '.' . substr($cpf, 3, 3) . '.' . substr($cpf, 6, 3) . '-' . substr($cpf, 9, 2);
            }
            return $cpf;
        };
        $formatarCEP = function($cep) {
            if (empty($cep)) return '';
            $cep = preg_replace('/[^0-9]/', '', $cep);
            if (strlen($cep) === 8) {
                return substr($cep, 0, 5) . '-' . substr($cep, 5, 3);
            }
            return $cep;
        };
        $formatarTelefone = function($telefone) {
            if (empty($telefone)) return '';
            $telefone = preg_replace('/[^0-9]/', '', $telefone);
            if (strlen($telefone) === 11) {
                return '(' . substr($telefone, 0, 2) . ') ' . substr($telefone, 2, 5) . '-' . substr($telefone, 7, 4);
            } elseif (strlen($telefone) === 10) {
                return '(' . substr($telefone, 0, 2) . ') ' . substr($telefone, 2, 4) . '-' . substr($telefone, 6, 4);
            }
            return $telefone;
        };

        $cpf_fin = $resp_fin ? preg_replace('/[^0-9]/', '', $resp_fin['cpf'] ?? '') : '';
        $cpf_ped_primeiro = $resp_ped ? preg_replace('/[^0-9]/', '', $resp_ped['cpf'] ?? '') : '';
        $ped_diferente_fin = ($cpf_ped_primeiro && $cpf_ped_primeiro !== $cpf_fin);

        $registro_base = [
            'nomealuno' => $aluno['nomealuno'] ?? '',
            'prontuario' => $aluno['prontuario'] ?? '',
            'emailaluno' => $aluno['emailaluno'] ?? '',
            'descricaoturma' => $aluno['descricaoturma'] ?? 'Sem turma',
            'tipocurso' => $aluno['tipocurso'] ?? '',
            'situacao' => $aluno['situacao'] ?? 'ATIVO',
            'nomerespfin' => $resp_fin ? ($resp_fin['nome'] ?? '') : '',
            'cpfrespfin' => $resp_fin ? $formatarCPF($resp_fin['cpf'] ?? '') : '',
            'emailrespfin' => $resp_fin ? ($resp_fin['email'] ?? '') : '',
            'logradourorespfin' => $resp_fin ? ($resp_fin['logradouro'] ?? '') : '',
            'numerorespfin' => $resp_fin ? ($resp_fin['numero'] ?? '') : '',
            'bairrorespfin' => $resp_fin ? ($resp_fin['bairro'] ?? '') : '',
            'cidaderespfin' => $resp_fin ? ($resp_fin['cidade'] ?? '') : '',
            'estadorespfin' => $resp_fin ? ($resp_fin['estado'] ?? '') : '',
            'ceprespfin' => $resp_fin ? $formatarCEP($resp_fin['cep'] ?? '') : '',
            'celularrespfin' => $resp_fin ? $formatarTelefone($resp_fin['celular'] ?? '') : '',
            'nomerespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['nome'] ?? '') : '',
            'cpfrespped' => ($ped_diferente_fin && $resp_ped) ? $formatarCPF($resp_ped['cpf'] ?? '') : '',
            'emailrespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['email'] ?? '') : '',
            'logradourorespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['logradouro'] ?? '') : '',
            'numerorespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['numero'] ?? '') : '',
            'bairrorespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['bairro'] ?? '') : '',
            'cidaderespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['cidade'] ?? '') : '',
            'estadorespped' => ($ped_diferente_fin && $resp_ped) ? ($resp_ped['estado'] ?? '') : '',
            'ceprespped' => ($ped_diferente_fin && $resp_ped) ? $formatarCEP($resp_ped['cep'] ?? '') : '',
            'celularrespped' => ($ped_diferente_fin && $resp_ped) ? $formatarTelefone($resp_ped['celular'] ?? '') : ''
        ];

        $registros[] = $registro_base;

        $cpfs_ped_ja_incluidos = [];
        if ($ped_diferente_fin && $resp_ped) {
            $cpf_ped_incluido = preg_replace('/[^0-9]/', '', $resp_ped['cpf'] ?? '');
            if ($cpf_ped_incluido) $cpfs_ped_ja_incluidos[] = $cpf_ped_incluido;
        }

        foreach ($responsaveis_ped as $resp_ped_extra) {
            $cpf_ped_extra = preg_replace('/[^0-9]/', '', $resp_ped_extra['cpf'] ?? '');
            if ($cpf_ped_extra && $cpf_ped_extra !== $cpf_fin && !in_array($cpf_ped_extra, $cpfs_ped_ja_incluidos)) {
                $registro_extra = [
                    'nomealuno' => $aluno['nomealuno'] ?? '',
                    'prontuario' => $aluno['prontuario'] ?? '',
                    'emailaluno' => $aluno['emailaluno'] ?? '',
                    'descricaoturma' => $aluno['descricaoturma'] ?? 'Sem turma',
                    'tipocurso' => $aluno['tipocurso'] ?? '',
                    'situacao' => $aluno['situacao'] ?? 'ATIVO',
                    'nomerespfin' => '', 'cpfrespfin' => '', 'emailrespfin' => '',
                    'logradourorespfin' => '', 'numerorespfin' => '', 'bairrorespfin' => '',
                    'cidaderespfin' => '', 'estadorespfin' => '', 'ceprespfin' => '', 'celularrespfin' => '',
                    'nomerespped' => $resp_ped_extra['nome'] ?? '',
                    'cpfrespped' => $formatarCPF($resp_ped_extra['cpf'] ?? ''),
                    'emailrespped' => $resp_ped_extra['email'] ?? '',
                    'logradourorespped' => $resp_ped_extra['logradouro'] ?? '',
                    'numerorespped' => $resp_ped_extra['numero'] ?? '',
                    'bairrorespped' => $resp_ped_extra['bairro'] ?? '',
                    'cidaderespped' => $resp_ped_extra['cidade'] ?? '',
                    'estadorespped' => $resp_ped_extra['estado'] ?? '',
                    'ceprespped' => $formatarCEP($resp_ped_extra['cep'] ?? ''),
                    'celularrespped' => $formatarTelefone($resp_ped_extra['celular'] ?? '')
                ];
                $registros[] = $registro_extra;
                $cpfs_ped_ja_incluidos[] = $cpf_ped_extra;
            }
        }
    }

    $total_alunos = count($prontuarios_unicos);

    echo json_encode([
        'success' => true,
        'registros' => $registros,
        'total' => count($registros),
        'total_alunos' => $total_alunos,
        'data_exportacao' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}
