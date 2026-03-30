<?php
// Iniciar buffer de saída para capturar qualquer echo
ob_start();

require_once '../config/database_online.php';
require_once '../includes/functions.php';

// Função para testar conectividade antes da sincronização
function testarConectividade($host, $port, $timeout = 10) {
    $connection = @fsockopen($host, $port, $errno, $errstr, $timeout);
    if ($connection) {
        fclose($connection);
        return ['success' => true, 'error' => null];
    } else {
        return ['success' => false, 'error' => "$errstr (Código: $errno)"];
    }
}

// Função para determinar segmento (adaptada para os novos critérios)
function determinarSegmentoSincronizacao($descricaoTurma) {
    $descricao = strtoupper(trim($descricaoTurma));
    if (strpos($descricao, 'KINDERGARTEN') !== false) {
        return 'INFANTIL';
    } elseif (strpos($descricao, 'EFAF') !== false) {
        return 'EFAF';
    } elseif (strpos($descricao, 'EFAI') !== false) {
        return 'EFAI';
    } elseif (strpos($descricao, 'EM') !== false) {
        return 'EM';
    } elseif (strpos($descricao, 'BERÇÁRIO') !== false) {
        return 'BERÇÁRIO';
    } else {
        return 'OUTROS';
    }
}

// Função getOrInsertTurma já existe no functions.php - será usada de lá

// Carregar configurações do .env usando Env::get()
$env = [
    'EXTERNAL_DB_HOST' => \Env::get('EXTERNAL_DB_HOST'),
    'EXTERNAL_DB_PORT' => \Env::get('EXTERNAL_DB_PORT'),
    'EXTERNAL_DB_USERNAME' => \Env::get('EXTERNAL_DB_USERNAME'),
    'EXTERNAL_DB_PASSWORD' => \Env::get('EXTERNAL_DB_PASSWORD'),
    'EXTERNAL_DB_NAME' => \Env::get('EXTERNAL_DB_NAME'),
    'EXTERNAL_DB_VIEW' => \Env::get('EXTERNAL_DB_VIEW')
];

// Verificar configurações necessárias
$required_env = ['EXTERNAL_DB_HOST', 'EXTERNAL_DB_PORT', 'EXTERNAL_DB_USERNAME', 'EXTERNAL_DB_PASSWORD', 'EXTERNAL_DB_NAME', 'EXTERNAL_DB_VIEW'];
$missing_configs = [];
foreach ($required_env as $key) {
    if (!isset($env[$key]) || empty($env[$key])) {
        $missing_configs[] = $key;
    }
}

if (!empty($missing_configs)) {
    $error_msg = "Configurações ausentes no arquivo .env: " . implode(', ', $missing_configs);
    header("Location: sincronizacao.php?error=" . urlencode($error_msg));
    exit;
}

// Verificar se ano letivo foi enviado
$ano_letivo = $_POST['ano_letivo'] ?? '2025/1';
if (empty($ano_letivo)) {
    $error_msg = "Ano letivo não informado";
    header("Location: sincronizacao.php?error=" . urlencode($error_msg));
    exit;
}

// Iniciar sincronização silenciosamente

try {
    // Inicializar dados e log
    $tempo_inicio = time();
    $dados = [
        'tempo_inicio' => $tempo_inicio,
        'ano_letivo' => $ano_letivo,
        'total_registros' => 0,
        'alunos_novos' => 0,
        'alunos_atualizados' => 0,
        'alunos_inativados' => 0,
        'alunos_reativados' => 0,
        'duplicatas_ignoradas' => 0,
        'erros_encontrados' => 0
    ];
    
    $log_id = iniciarLogSincronizacao($conn, 'manual');
    
    // Testar conectividade antes de tentar conectar
    $host = $env['EXTERNAL_DB_HOST'];
    $port = intval($env['EXTERNAL_DB_PORT']);
    
    $teste_conectividade = testarConectividade($host, $port);
    if (!$teste_conectividade['success']) {
        throw new Exception("Erro de conectividade: " . $teste_conectividade['error'] . " - Verifique se o servidor tem acesso à porta $port e se não há firewall bloqueando.");
    }
    
    // Conectar ao banco externo com timeout e tratamento de erro melhorado
    $external_conn = new mysqli();
    
    // Configurar timeout de conexão
    $external_conn->options(MYSQLI_OPT_CONNECT_TIMEOUT, 30);
    $external_conn->options(MYSQLI_OPT_READ_TIMEOUT, 60);
    
    if (!$external_conn->real_connect(
        $env['EXTERNAL_DB_HOST'],
        $env['EXTERNAL_DB_USERNAME'],
        $env['EXTERNAL_DB_PASSWORD'],
        $env['EXTERNAL_DB_NAME'],
        intval($env['EXTERNAL_DB_PORT'])
    )) {
        throw new Exception("Erro na conexão MySQL: " . $external_conn->connect_error . " - Verifique credenciais e permissões do usuário " . $env['EXTERNAL_DB_USERNAME']);
    }
    
    $external_conn->set_charset("utf8");
    
    // Mapear alunos locais para controle de status
    $sql_ativos = "SELECT prontuario, status FROM alunos";
    $stmt_ativos = $conn->prepare($sql_ativos);
    $stmt_ativos->execute();
    $alunos_locais = [];
    while ($row = $stmt_ativos->fetch()) {
        $alunos_locais[$row['prontuario']] = $row['status'];
    }
    
    // Colunas da view - incluindo responsáveis pedagógicos e endereços
    $colunas = [
        'nomealuno', 'prontuario', 'descricaoturma', 'tipocurso',
        'nomerespfin', 'cpfrespfin', 'emailrespfin',
        'nomerespped', 'cpfrespped', 'emailrespped',
        'situacao',
        // Campos de endereço do responsável financeiro
        'logradourorespfin', 'ceprespfin', 'numerorespfin', 'complementorespfin',
        'bairrorespfin', 'cidaderespfin', 'estadorespfin', 'celularrespfin',
        // Campos de endereço do responsável pedagógico
        'logradourorespped', 'ceprespped', 'numerorespped', 'complementorespped',
        'bairrorespped', 'cidaderespped', 'estadorespped', 'celularrespped'
    ];
    
    // Query para buscar dados
    $sql_view = "SELECT " . implode(',', $colunas) . " FROM " . $env['EXTERNAL_DB_VIEW'] . " 
                  WHERE anoletivo = ? 
                  AND LENGTH(TRIM(descricaoturma)) > 0 
                  AND (tipocurso = 'Regular' OR (tipocurso = 'Livre' AND nomecurso = 'BERÇÁRIO'))";
    
    $stmt_view = $external_conn->prepare($sql_view);
    if (!$stmt_view) {
        throw new Exception("Erro ao preparar consulta na view " . $env['EXTERNAL_DB_VIEW'] . ": " . $external_conn->error);
    }
    
    $stmt_view->bind_param('s', $ano_letivo);
    if (!$stmt_view->execute()) {
        throw new Exception("Erro ao executar consulta na view " . $env['EXTERNAL_DB_VIEW'] . ": " . $stmt_view->error);
    }
    
    $result = $stmt_view->get_result();
    
    // Iniciar transação
    $conn->beginTransaction();
    
    // Agrupar registros por prontuário para processar todos os responsáveis únicos
    $alunos_agrupados = [];
    while ($row = $result->fetch_assoc()) {
        $prontuario = trim($row['prontuario']);
        if (!empty($prontuario)) {
            if (!isset($alunos_agrupados[$prontuario])) {
                $alunos_agrupados[$prontuario] = [];
            }
            $alunos_agrupados[$prontuario][] = $row;
        }
    }
    
    // Processar alunos encontrados
    
    foreach ($alunos_agrupados as $prontuario => $registros) {
        $dados['total_registros']++;
        
        try {
            // Pegar o primeiro registro para dados básicos do aluno
            $primeiro_registro = $registros[0];
            $nomeAluno = trim($primeiro_registro['nomealuno']);
            $descricaoTurma = trim($primeiro_registro['descricaoturma']);
            $situacao = trim($primeiro_registro['situacao']);
            
            // Validar dados obrigatórios
            if (empty($nomeAluno) || empty($prontuario)) {
                $dados['erros_encontrados']++;
                continue;
            }
            
            // Determinar status
            $status_novo = (strtoupper($situacao) === 'ATIVO') ? 'ativo' : 'inativo';
            $status_anterior = isset($alunos_locais[$prontuario]) ? $alunos_locais[$prontuario] : null;
            
            // Determinar segmento
            $segmento = determinarSegmentoSincronizacao($descricaoTurma);
            
            // Processar turma (sem período - será preenchido manualmente)
            $turmaId = getOrInsertTurma($conn, $descricaoTurma, $segmento, null);
            
            // Processar responsáveis únicos de TODOS os registros
            $responsaveis_unicos = [];
            
            foreach ($registros as $registro) {
                $nomeResponsavelFin = trim($registro['nomerespfin']);
                $cpfResponsavelFin = trim($registro['cpfrespfin']);
                $emailResponsavelFin = trim($registro['emailrespfin']);
                
                $nomeResponsavelPed = trim($registro['nomerespped']);
                $cpfResponsavelPed = trim($registro['cpfrespped']);
                $emailResponsavelPed = trim($registro['emailrespped']);
                
                // Processar responsável financeiro
                if (!empty($nomeResponsavelFin) && !empty($cpfResponsavelFin)) {
                    $cpfFormatadoFin = formatarCPF($cpfResponsavelFin);
                    if (!isset($responsaveis_unicos[$cpfFormatadoFin])) {
                        // Preparar dados de endereço do responsável financeiro
                        $dados_endereco_fin = [
                            'cep' => trim($registro['ceprespfin'] ?? ''),
                            'logradouro' => trim($registro['logradourorespfin'] ?? ''),
                            'numero' => trim($registro['numerorespfin'] ?? ''),
                            'complemento' => trim($registro['complementorespfin'] ?? ''),
                            'bairro' => trim($registro['bairrorespfin'] ?? ''),
                            'cidade' => trim($registro['cidaderespfin'] ?? ''),
                            'estado' => trim($registro['estadorespfin'] ?? ''),
                            'celular' => trim($registro['celularrespfin'] ?? '')
                        ];
                        
                        // IMPORTANTE: Não passar status do aluno para o responsável
                        // O status do responsável será gerenciado no final baseado em todos os filhos
                        $resultadoFin = getOrInsertResponsavelComEndereco($conn, $nomeResponsavelFin, $cpfFormatadoFin, $emailResponsavelFin, 'ativo', 'financeiro', false, $dados_endereco_fin);
                        $responsavelFinId = $resultadoFin['id'];
                        
                        // Registrar detalhe do responsável se houve mudança real
                        if ($resultadoFin['acao'] === 'criado') {
                            $dados_extras = json_encode([
                                'cpf' => $cpfFormatadoFin,
                                'email' => $emailResponsavelFin,
                                'tipo' => 'financeiro',
                                'status' => $status_novo,
                                'endereco' => $dados_endereco_fin
                            ]);
                            adicionarDetalheSincronizacao($conn, $log_id, 'responsavel_novo', $responsavelFinId, $nomeResponsavelFin, $dados_extras);
                        } elseif ($resultadoFin['acao'] === 'atualizado' && !empty($resultadoFin['mudancas'])) {
                            $dados_extras = json_encode([
                                'cpf' => $cpfFormatadoFin,
                                'email' => $emailResponsavelFin,
                                'tipo' => 'financeiro',
                                'status' => $status_novo,
                                'endereco' => $dados_endereco_fin,
                                'mudancas' => $resultadoFin['mudancas']
                            ]);
                            adicionarDetalheSincronizacao($conn, $log_id, 'responsavel_atualizado', $responsavelFinId, $nomeResponsavelFin, $dados_extras);
                        }
                        
                        $responsaveis_unicos[$cpfFormatadoFin] = [
                            'id' => $responsavelFinId,
                            'nome' => $nomeResponsavelFin,
                            'cpf' => $cpfFormatadoFin,
                            'email' => $emailResponsavelFin,
                            'tipos' => ['financeiro'],
                            'endereco' => $dados_endereco_fin
                        ];
                    } else {
                        // Responsável já existe, adicionar tipo financeiro se não existir
                        if (!in_array('financeiro', $responsaveis_unicos[$cpfFormatadoFin]['tipos'])) {
                            $responsaveis_unicos[$cpfFormatadoFin]['tipos'][] = 'financeiro';
                        }
                        // Atualizar endereço se for responsável financeiro
                        $dados_endereco_fin = [
                            'cep' => trim($registro['ceprespfin'] ?? ''),
                            'logradouro' => trim($registro['logradourorespfin'] ?? ''),
                            'numero' => trim($registro['numerorespfin'] ?? ''),
                            'complemento' => trim($registro['complementorespfin'] ?? ''),
                            'bairro' => trim($registro['bairrorespfin'] ?? ''),
                            'cidade' => trim($registro['cidaderespfin'] ?? ''),
                            'estado' => trim($registro['estadorespfin'] ?? ''),
                            'celular' => trim($registro['celularrespfin'] ?? '')
                        ];
                        $responsaveis_unicos[$cpfFormatadoFin]['endereco'] = $dados_endereco_fin;
                    }
                }
                
                // Processar responsável pedagógico
                if (!empty($nomeResponsavelPed) && !empty($cpfResponsavelPed)) {
                    $cpfFormatadoPed = formatarCPF($cpfResponsavelPed);
                    if (!isset($responsaveis_unicos[$cpfFormatadoPed])) {
                        // Preparar dados de endereço do responsável pedagógico
                        $dados_endereco_ped = [
                            'cep' => trim($registro['ceprespped'] ?? ''),
                            'logradouro' => trim($registro['logradourorespped'] ?? ''),
                            'numero' => trim($registro['numerorespped'] ?? ''),
                            'complemento' => trim($registro['complementorespped'] ?? ''),
                            'bairro' => trim($registro['bairrorespped'] ?? ''),
                            'cidade' => trim($registro['cidaderespped'] ?? ''),
                            'estado' => trim($registro['estadorespped'] ?? ''),
                            'celular' => trim($registro['celularrespped'] ?? '')
                        ];
                        
                        // IMPORTANTE: Não passar status do aluno para o responsável
                        // O status do responsável será gerenciado no final baseado em todos os filhos
                        $resultadoPed = getOrInsertResponsavelComEndereco($conn, $nomeResponsavelPed, $cpfFormatadoPed, $emailResponsavelPed, 'ativo', 'pedagogico', false, $dados_endereco_ped);
                        $responsavelPedId = $resultadoPed['id'];
                        
                        // Registrar detalhe do responsável se houve mudança real
                        if ($resultadoPed['acao'] === 'criado') {
                            $dados_extras = json_encode([
                                'cpf' => $cpfFormatadoPed,
                                'email' => $emailResponsavelPed,
                                'tipo' => 'pedagogico',
                                'status' => $status_novo,
                                'endereco' => $dados_endereco_ped
                            ]);
                            adicionarDetalheSincronizacao($conn, $log_id, 'responsavel_novo', $responsavelPedId, $nomeResponsavelPed, $dados_extras);
                        } elseif ($resultadoPed['acao'] === 'atualizado' && !empty($resultadoPed['mudancas'])) {
                            $dados_extras = json_encode([
                                'cpf' => $cpfFormatadoPed,
                                'email' => $emailResponsavelPed,
                                'tipo' => 'pedagogico',
                                'status' => $status_novo,
                                'endereco' => $dados_endereco_ped,
                                'mudancas' => $resultadoPed['mudancas']
                            ]);
                            adicionarDetalheSincronizacao($conn, $log_id, 'responsavel_atualizado', $responsavelPedId, $nomeResponsavelPed, $dados_extras);
                        }
                        
                        $responsaveis_unicos[$cpfFormatadoPed] = [
                            'id' => $responsavelPedId,
                            'nome' => $nomeResponsavelPed,
                            'cpf' => $cpfFormatadoPed,
                            'email' => $emailResponsavelPed,
                            'tipos' => ['pedagogico'],
                            'endereco' => $dados_endereco_ped
                        ];
                    } else {
                        // Responsável já existe, adicionar tipo pedagógico se não existir
                        if (!in_array('pedagogico', $responsaveis_unicos[$cpfFormatadoPed]['tipos'])) {
                            $responsaveis_unicos[$cpfFormatadoPed]['tipos'][] = 'pedagogico';
                        }
                        // Atualizar endereço se for responsável pedagógico
                        $dados_endereco_ped = [
                            'cep' => trim($registro['ceprespped'] ?? ''),
                            'logradouro' => trim($registro['logradourorespped'] ?? ''),
                            'numero' => trim($registro['numerorespped'] ?? ''),
                            'complemento' => trim($registro['complementorespped'] ?? ''),
                            'bairro' => trim($registro['bairrorespped'] ?? ''),
                            'cidade' => trim($registro['cidaderespped'] ?? ''),
                            'estado' => trim($registro['estadorespped'] ?? ''),
                            'celular' => trim($registro['celularrespped'] ?? '')
                        ];
                        $responsaveis_unicos[$cpfFormatadoPed]['endereco'] = $dados_endereco_ped;
                    }
                }
            }
            
            // Atualizar responsáveis com tipos corretos e endereços
            // IMPORTANTE: Não alteramos o status aqui, apenas atualizamos dados básicos
            foreach ($responsaveis_unicos as $cpf => $responsavel) {
                $tipos = $responsavel['tipos'];
                $tipo_final = (in_array('financeiro', $tipos) && in_array('pedagogico', $tipos)) ? 'ambos' : $tipos[0];
                
                // Determinar qual endereço usar baseado no tipo de responsável
                $dados_endereco = $responsavel['endereco'] ?? [];
                
                // Só atualizar dados básicos, não o status
                // O status será gerenciado no final, após todos os alunos serem processados
                $resultado_final = getOrInsertResponsavelComEndereco($conn, $responsavel['nome'], $responsavel['cpf'], $responsavel['email'], 'ativo', $tipo_final, false, $dados_endereco);
                
                $responsavel['id'] = $resultado_final['id']; // Atualizar o ID se mudou
            }
            
            // Determinar responsável principal (financeiro tem prioridade)
            $responsavelPrincipalId = null;
            foreach ($responsaveis_unicos as $responsavel) {
                if (in_array('financeiro', $responsavel['tipos'])) {
                    $responsavelPrincipalId = $responsavel['id'];
                    break;
                }
            }
            if (!$responsavelPrincipalId && !empty($responsaveis_unicos)) {
                $responsavelPrincipalId = reset($responsaveis_unicos)['id'];
            }
            
            // Verificar se aluno já existe e buscar dados atuais
            $sql_check = "SELECT id, nome, turma_id, status FROM alunos WHERE prontuario = ?";
            $stmt_check = $conn->prepare($sql_check);
            $stmt_check->execute([$prontuario]);
            $aluno_existente = $stmt_check->fetch();
            
            if ($aluno_existente) {
                $aluno_id = $aluno_existente['id'];
                
                // Verificar se houve mudanças reais nos dados
                $nome_mudou = $aluno_existente['nome'] !== $nomeAluno;
                $turma_mudou = $aluno_existente['turma_id'] != $turmaId;
                $status_mudou = $aluno_existente['status'] !== $status_novo;
                $houve_mudanca = $nome_mudou || $turma_mudou || $status_mudou;
                
                // Atualizar aluno (lógica original mantida)
                $sql_update = "UPDATE alunos SET nome = ?, turma_id = ?, status = ? WHERE prontuario = ?";
                $stmt_update = $conn->prepare($sql_update);
                $stmt_update->execute([$nomeAluno, $turmaId, $status_novo, $prontuario]);
                
                // Contador sempre incrementa (lógica original mantida)
                $dados['alunos_atualizados']++;
                
                // Registrar detalhe da atualização apenas se houve mudança real
                if ($houve_mudanca) {
                    // Verificar se já foi registrado uma mudança para este aluno neste log
                    $sql_verificar = "SELECT COUNT(*) as total FROM sincronizacao_detalhes 
                                     WHERE log_id = ? AND registro_id = ? 
                                     AND tipo_registro IN ('aluno_atualizado', 'aluno_inativado', 'aluno_reativado')";
                    $stmt_verificar = $conn->prepare($sql_verificar);
                    $stmt_verificar->execute([$log_id, $aluno_id]);
                    $ja_registrado = $stmt_verificar->fetch()['total'] > 0;
                    
                    // Só registra se ainda não foi registrado neste log
                    if (!$ja_registrado) {
                        $dados_extras = json_encode([
                            'prontuario' => $prontuario,
                            'nome_anterior' => $aluno_existente['nome'],
                            'turma_anterior' => $aluno_existente['turma_id'],
                            'status_anterior' => $aluno_existente['status'],
                            'nome_novo' => $nomeAluno,
                            'turma_nova' => $turmaId,
                            'status_novo' => $status_novo,
                            'mudancas' => [
                                'nome' => $nome_mudou,
                                'turma' => $turma_mudou,
                                'status' => $status_mudou
                            ]
                        ]);
                        adicionarDetalheSincronizacao($conn, $log_id, 'aluno_atualizado', $aluno_id, $nomeAluno, $dados_extras);
                    }
                }
                
                // Controlar mudanças de status (apenas para contadores, detalhes já foram registrados acima)
                if ($status_anterior && $status_anterior !== $status_novo) {
                    if ($status_anterior === 'ativo' && $status_novo === 'inativo') {
                        $dados['alunos_inativados']++;
                    } elseif ($status_anterior === 'inativo' && $status_novo === 'ativo') {
                        $dados['alunos_reativados']++;
                    }
                }
            } else {
                // Inserir novo aluno
                $sql_insert = "INSERT INTO alunos (nome, prontuario, turma_id, status) VALUES (?, ?, ?, ?)";
                $stmt_insert = $conn->prepare($sql_insert);
                $stmt_insert->execute([$nomeAluno, $prontuario, $turmaId, $status_novo]);
                
                $aluno_id = $conn->lastInsertId();
                $dados['alunos_novos']++;
                
                // Registrar detalhe do novo aluno
                $dados_extras = json_encode([
                    'prontuario' => $prontuario,
                    'turma' => $descricaoTurma,
                    'status' => $status_novo
                ]);
                adicionarDetalheSincronizacao($conn, $log_id, 'aluno_novo', $aluno_id, $nomeAluno, $dados_extras);
            }
            
            // Gerenciar relacionamentos na tabela aluno_responsavel
            // Usar a função que limpa e recria todos os relacionamentos do aluno
            limparERecriarRelacionamentosAluno($conn, $aluno_id, $responsaveis_unicos);
            
        } catch (Exception $e) {
            $dados['erros_encontrados']++;
        }
    }
    
    // Fechar conexão externa ANTES do commit para evitar problemas
    if (isset($external_conn) && $external_conn instanceof mysqli) {
        try {
            $external_conn->close();
        } catch (Exception $e) {
            // Ignore connection close errors
        }
        $external_conn = null; // Marcar como fechada
    }
    
    // Commit the transaction
    $conn->commit();
    
    // Gerenciar status dos responsáveis após sincronização
    // Só inativa responsável quando TODOS os seus filhos estiverem inativos
    // Passamos log_id apenas para registrar mudanças reais de status
    $resultado_responsaveis = gerenciarStatusResponsaveis($conn, $log_id);
    if ($resultado_responsaveis['success']) {
        $dados['responsaveis_ativados'] = $resultado_responsaveis['responsaveis_ativados'];
        $dados['responsaveis_inativados'] = $resultado_responsaveis['responsaveis_inativados'];
        $dados['responsaveis_processados'] = $resultado_responsaveis['total_processados'];
    }
    
    // Preparar mensagem de sucesso
    $totalAlunosProcessados = $dados['alunos_novos'] + $dados['alunos_atualizados'];
    $dados['mensagem'] = "Sincronização manual concluída para o ano letivo {$ano_letivo}! ";
    $dados['mensagem'] .= "{$dados['alunos_novos']} novos alunos, {$dados['alunos_atualizados']} atualizados. ";
    $dados['mensagem'] .= "Total de alunos únicos processados: $totalAlunosProcessados. ";
    $dados['mensagem'] .= "Registros na view: {$dados['total_registros']}";
    
    if ($dados['alunos_inativados'] > 0) {
        $dados['mensagem'] .= ", {$dados['alunos_inativados']} inativados";
    }
    if ($dados['alunos_reativados'] > 0) {
        $dados['mensagem'] .= ", {$dados['alunos_reativados']} reativados";
    }
    if ($dados['duplicatas_ignoradas'] > 0) {
        $dados['mensagem'] .= " ({$dados['duplicatas_ignoradas']} duplicatas ignoradas)";
    }
    if ($dados['erros_encontrados'] > 0) {
        $dados['mensagem'] .= ". {$dados['erros_encontrados']} erros encontrados";
    }
    
    // Adicionar informações dos responsáveis
    if (isset($dados['responsaveis_processados'])) {
        $dados['mensagem'] .= ". Responsáveis: {$dados['responsaveis_processados']} processados";
        if (isset($dados['responsaveis_ativados']) && $dados['responsaveis_ativados'] > 0) {
            $dados['mensagem'] .= ", {$dados['responsaveis_ativados']} ativados";
        }
        if (isset($dados['responsaveis_inativados']) && $dados['responsaveis_inativados'] > 0) {
            $dados['mensagem'] .= ", {$dados['responsaveis_inativados']} inativados";
        }
    }
    
    // Finalizar log
    finalizarLogSincronizacao($conn, $log_id, 'sucesso', $dados);
    
    // Limpar qualquer saída capturada
    ob_end_clean();
    
    // Redirecionar para a página de sincronização com mensagem de sucesso
    header("Location: sincronizacao.php?success=" . urlencode($dados['mensagem']));
    exit;
    
} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    if (isset($external_conn) && $external_conn instanceof mysqli && $external_conn !== null) {
        try {
            $external_conn->close();
        } catch (Exception $e) {
            // Ignore connection close errors
        }
        $external_conn = null;
    }
    
    // Finalizar log com erro
    if (isset($log_id)) {
        $dados['mensagem'] = 'Erro durante sincronização manual';
        $dados['detalhes_erro'] = $e->getMessage();
        finalizarLogSincronizacao($conn, $log_id, 'erro', $dados);
    }
    
    // Limpar qualquer saída capturada
    ob_end_clean();
    
    // Redirecionar com erro detalhado
    $error_msg = "Erro na sincronização: " . $e->getMessage();
    header("Location: sincronizacao.php?error=" . urlencode($error_msg));
    exit;
} 