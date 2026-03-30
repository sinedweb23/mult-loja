-- criar_policies.sql
-- Projeto: loja-sup (Supabase)
-- Objetivo: aplicar somente políticas/ajustes de acesso (RLS, permissões e perfis).
--
-- IMPORTANTE
-- - Execute este arquivo APENAS após o schema/base já existir.
-- - Em banco vazio, rode antes o criar_projeto.sql.
-- - Migrations legadas de RLS em "responsaveis" (pré-unificação para "usuarios")
--   não devem ser reaplicadas aqui.

\i supabase/migrations/016_fix_rls_usuario_aluno_admin.sql
\i supabase/migrations/025_perfis_permissoes.sql
\i supabase/migrations/028_cantina_operador_movimentacoes_saldos.sql
\i supabase/migrations/029_fix_rls_pedidos_insert_e_data_retirada_itens.sql
\i supabase/migrations/030_colaborador_ve_pedidos_proprios.sql
\i supabase/migrations/032_fix_rls_pedido_itens_usuarios.sql
\i supabase/migrations/038_operador_cria_pedidos_pdv.sql
\i supabase/migrations/054_loja_variacoes_opcionais_select_autenticado.sql
\i supabase/migrations/055_responsavel_ve_itens_pedidos_alunos.sql
\i supabase/migrations/056_categorias_select_autenticados.sql
\i supabase/migrations/061_responsavel_ve_pedidos_dos_alunos.sql
\i supabase/migrations/072_rh_acesso_consumo_empresas.sql
\i supabase/migrations/073_perfil_permissoes_usuario_ve_proprios_perfis.sql
\i supabase/migrations/074_rh_perfil_permissoes_definer.sql
\i supabase/migrations/075_perfil_rh_recurso_admin_rh.sql
\i supabase/migrations/078_pdv_perfil_rls.sql
\i supabase/migrations/080_pdv_saldo_alunos_rls.sql
\i supabase/migrations/087_fix_rls_importacao_logs_transacao_confirmacao.sql
\i supabase/migrations/088_pdv_operador_ve_nome_colaborador_pedidos.sql
\i supabase/migrations/089_reverter_pdv_ve_nome_colaborador.sql
\i supabase/migrations/090_hardening_rls_unrestricted_tables.sql
\i supabase/migrations/091_fix_recursao_policies_admins.sql
