-- criar_projeto.sql
-- Projeto: loja-sup (Supabase)
-- Objetivo: recriar o banco do zero de forma idêntica ao projeto atual.
--
-- COMO USAR
-- 1) Este arquivo deve ser executado via psql/supabase CLI no contexto deste repositório.
-- 2) Ele inclui TODAS as migrations em ordem.
-- 3) Para ambiente novo, execute em banco vazio.
--
-- Exemplo (psql):
-- psql "$DATABASE_URL" -f criar_projeto.sql

\i supabase/migrations/001_initial_schema.sql
\i supabase/migrations/002_rls_policies.sql
\i supabase/migrations/004_produtos_estrutura_completa.sql
\i supabase/migrations/005_rls_admin_produtos.sql
\i supabase/migrations/006_importacao_logs.sql
\i supabase/migrations/007_auth_user_id_nullable.sql
\i supabase/migrations/008_responsaveis_ativo.sql
\i supabase/migrations/009_configuracoes_smtp.sql
\i supabase/migrations/010_rls_admin_alunos.sql
\i supabase/migrations/011_rls_admin_empresas_turmas.sql
\i supabase/migrations/012_unificar_usuarios.sql
\i supabase/migrations/013_rls_usuarios_unificado.sql
\i supabase/migrations/014_super_admin_permissions.sql
\i supabase/migrations/015_configuracoes_aparencia.sql
\i supabase/migrations/016_fix_rls_usuario_aluno_admin.sql
\i supabase/migrations/017_adicionar_segmentos_efaf_efai.sql
\i supabase/migrations/018_rls_kits_itens.sql
\i supabase/migrations/019_campos_fiscais_produtos.sql
\i supabase/migrations/020_fix_rls_usuarios_recursion.sql
\i supabase/migrations/021_storage_buckets_imagens.sql
\i supabase/migrations/022_storage_buckets_criar.sql
\i supabase/migrations/023_storage_eh_admin_func.sql
\i supabase/migrations/024_produto_tipos_kit_festa_lanche.sql
\i supabase/migrations/025_perfis_permissoes.sql
\i supabase/migrations/026_cantina_escolar_schema.sql
\i supabase/migrations/027_cantina_escolar_rls_e_consumo.sql
\i supabase/migrations/028_cantina_operador_movimentacoes_saldos.sql
\i supabase/migrations/029_fix_rls_pedidos_insert_e_data_retirada_itens.sql
\i supabase/migrations/030_colaborador_ve_pedidos_proprios.sql
\i supabase/migrations/031_operador_ve_pedidos_e_itens.sql
\i supabase/migrations/032_fix_rls_pedido_itens_usuarios.sql
\i supabase/migrations/033_rpc_itens_meus_pedidos.sql
\i supabase/migrations/034_renomear_financeiro_para_rh.sql
\i supabase/migrations/035_pagamentos_caixa_id.sql
\i supabase/migrations/036_pagamentos_rls_operador.sql
\i supabase/migrations/037_operador_aluno_venda_direta.sql
\i supabase/migrations/038_operador_cria_pedidos_pdv.sql
\i supabase/migrations/039_pedido_itens_produto_nome.sql
\i supabase/migrations/040_operador_atualiza_estoque_variacao.sql
\i supabase/migrations/041_produtos_favorito.sql
\i supabase/migrations/042_operador_atualiza_pedido_entregue.sql
\i supabase/migrations/043_transacoes_gateway_rede.sql
\i supabase/migrations/044_produtos_unidade.sql
\i supabase/migrations/045_usuarios_re_colaborador.sql
\i supabase/migrations/046_fix_sync_usuario_admin_cache_null.sql
\i supabase/migrations/047_refatorar_usuarios_perfis.sql
\i supabase/migrations/048_usuarios_remover_colunas_antigas.sql
\i supabase/migrations/049_calendario_dias_uteis.sql
\i supabase/migrations/050_turmas_turno.sql
\i supabase/migrations/051_produtos_kit_festa_config.sql
\i supabase/migrations/052_pedido_itens_kit_festa_google.sql
\i supabase/migrations/053_rpc_itens_meus_pedidos_kit_festa.sql
\i supabase/migrations/054_loja_variacoes_opcionais_select_autenticado.sql
\i supabase/migrations/055_responsavel_ve_itens_pedidos_alunos.sql
\i supabase/migrations/056_categorias_select_autenticados.sql
\i supabase/migrations/057_abatimento_colaborador_lancamento.sql
\i supabase/migrations/058_config_lanche_do_dia_credito_cantina.sql
\i supabase/migrations/059_credito_cantina_excecoes_turmas.sql
\i supabase/migrations/060_produto_disponibilidade_segmento_tipo_curso.sql
\i supabase/migrations/061_responsavel_ve_pedidos_dos_alunos.sql
\i supabase/migrations/062_deduplicar_colaboradores_por_cpf.sql
\i supabase/migrations/063_movimento_estoque_entrada.sql
\i supabase/migrations/064_entrada_estoque_cabecalho_custo.sql
\i supabase/migrations/065_produtos_valor_custo.sql
\i supabase/migrations/066_parcelamento_regras.sql
\i supabase/migrations/067_concorrencia_transacoes_saldo.sql
\i supabase/migrations/068_departamentos_segmentos.sql
\i supabase/migrations/069_consumo_interno.sql
\i supabase/migrations/070_variacao_valores_label_igual_valor.sql
\i supabase/migrations/071_produtos_termo_aceite.sql
\i supabase/migrations/072_rh_acesso_consumo_empresas.sql
\i supabase/migrations/073_perfil_permissoes_usuario_ve_proprios_perfis.sql
\i supabase/migrations/074_rh_perfil_permissoes_definer.sql
\i supabase/migrations/075_perfil_rh_recurso_admin_rh.sql
\i supabase/migrations/076_migracao_saldo_historico.sql
\i supabase/migrations/077_historico_migracao_itens.sql
\i supabase/migrations/078_pdv_perfil_rls.sql
\i supabase/migrations/079_rpc_produtos_disponiveis_responsavel.sql
\i supabase/migrations/080_pdv_saldo_alunos_rls.sql
\i supabase/migrations/081_aluno_config_saldo_negativo.sql
\i supabase/migrations/082_indices_performance_concorrencia.sql
\i supabase/migrations/083_aluno_saldos_permitir_negativo.sql
\i supabase/migrations/084_migracao_saldo_permitir_negativo.sql
\i supabase/migrations/085_migracao_saldo_restaurar_itens.sql
\i supabase/migrations/086_consumo_interno_solicitante_retirado.sql
\i supabase/migrations/087_consumo_interno_cancelamento.sql
\i supabase/migrations/087_fix_rls_importacao_logs_transacao_confirmacao.sql
\i supabase/migrations/088_pdv_operador_ve_nome_colaborador_pedidos.sql
\i supabase/migrations/089_reverter_pdv_ve_nome_colaborador.sql
\i supabase/migrations/090_hardening_rls_unrestricted_tables.sql
\i supabase/migrations/091_fix_recursao_policies_admins.sql
\i supabase/migrations/092_produtos_desconto_kit_mensal_pct.sql
\i supabase/migrations/093_produtos_visibilidade.sql
\i supabase/migrations/094_pagamento_metodo_credito_debito.sql
\i supabase/migrations/095_rpc_creditar_debitar_aluno_saldo.sql
