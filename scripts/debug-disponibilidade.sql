-- Diagnóstico: por que produto com disponibilidade por TURMA não aparece na loja?
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor) para comparar dados.

-- 1) Produtos que têm disponibilidade por TURMA (ex.: Cookie Monkey, Tic-Tac)
-- Troque 'NOME_DO_PRODUTO' pelo nome do produto que não aparece
SELECT p.id AS produto_id, p.nome AS produto_nome, pd.tipo, pd.turma_id, pd.disponivel_de, pd.disponivel_ate
FROM produtos p
JOIN produto_disponibilidade pd ON pd.produto_id = p.id
WHERE p.nome ILIKE '%Cookie Monkey%' OR p.nome ILIKE '%Tic-Tac%'
ORDER BY p.nome, pd.tipo;

-- 2) Turmas configuradas nesses produtos (IDs que a loja usa para comparar)
SELECT DISTINCT lower(trim(pd.turma_id::text)) AS turma_id_configurada
FROM produto_disponibilidade pd
JOIN produtos p ON p.id = pd.produto_id
WHERE pd.tipo = 'TURMA'
  AND (p.nome ILIKE '%Cookie Monkey%' OR p.nome ILIKE '%Tic-Tac%');

-- 3) Turmas dos alunos (ex.: de um responsável) – troque pelo empresa_id ou por aluno_id se preferir
-- Aqui listamos turma_id dos alunos ativos; na loja usamos os alunos do responsável logado
SELECT DISTINCT lower(trim(a.turma_id::text)) AS turma_id_aluno, t.descricao AS turma_nome
FROM alunos a
LEFT JOIN turmas t ON t.id = a.turma_id
WHERE a.situacao = 'ATIVO'
ORDER BY t.descricao;

-- 4) Verificar se há interseção: algum aluno em turma que está na disponibilidade do produto
-- (ajuste o nome do produto e o empresa_id conforme seu caso)
/*
SELECT p.nome,
       pd.turma_id AS disp_turma_id,
       count(a.id) AS alunos_nessa_turma
FROM produtos p
JOIN produto_disponibilidade pd ON pd.produto_id = p.id AND pd.tipo = 'TURMA'
LEFT JOIN alunos a ON a.turma_id = pd.turma_id AND a.situacao = 'ATIVO'
WHERE p.nome ILIKE '%Cookie Monkey%'
GROUP BY p.nome, pd.turma_id;
*/

-- 5) Janela de datas: se disponivel_de / disponivel_ate estiver preenchida, a loja só mostra dentro do período
-- Confira se now() está entre as datas
SELECT p.nome, pd.tipo, pd.disponivel_de, pd.disponivel_ate,
       (now() >= pd.disponivel_de OR pd.disponivel_de IS NULL) AS ok_inicio,
       (now() <= pd.disponivel_ate OR pd.disponivel_ate IS NULL) AS ok_fim
FROM produtos p
JOIN produto_disponibilidade pd ON pd.produto_id = p.id
WHERE p.nome ILIKE '%Cookie Monkey%' OR p.nome ILIKE '%Tic-Tac%';
