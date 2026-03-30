-- Deduplicar colaboradores por CPF: manter um por CPF (o de menor id), reassignar referências e apagar os demais.
-- Rodar manualmente uma vez no SQL Editor do Supabase (ou via MCP).

DO $$
DECLARE
  rec RECORD;
  kept_id UUID;
  dup_id UUID;
BEGIN
  FOR rec IN (
    WITH
    raw_cpf AS (
      SELECT u.id, u.cpf,
             regexp_replace(COALESCE(TRIM(u.cpf::text), ''), '[^0-9]', '', 'g') AS digits
      FROM usuarios u
      WHERE EXISTS (
        SELECT 1 FROM usuario_papeis up
        WHERE up.usuario_id = u.id AND up.papel = 'COLABORADOR'
      )
    ),
    colab AS (
      SELECT rc.id, rc.cpf,
             CASE
               WHEN LENGTH(rc.digits) = 11 THEN rc.digits
               WHEN LENGTH(rc.digits) = 10 THEN '0' || rc.digits
               ELSE NULL
             END AS cpf_norm,
             EXISTS (
               SELECT 1 FROM public.usuario_perfis up
               JOIN public.perfis p ON p.id = up.perfil_id
               WHERE up.usuario_id = rc.id AND p.nome IN ('Admin', 'Acesso total')
             ) AS tem_admin
      FROM raw_cpf rc
      WHERE LENGTH(rc.digits) IN (10, 11)
    ),
    ranked AS (
      -- Manter o que tem Admin (ou Acesso total); senão o de menor id (nunca apagar admin por engano)
      SELECT id, cpf_norm,
             ROW_NUMBER() OVER (PARTITION BY cpf_norm ORDER BY tem_admin DESC, id) AS rn
      FROM colab
    ),
    dups AS (
      SELECT rk.id AS duplicate_id,
             (SELECT r2.id FROM ranked r2 WHERE r2.cpf_norm = rk.cpf_norm AND r2.rn = 1 LIMIT 1) AS keep_id
      FROM ranked rk
      WHERE rk.rn > 1
    )
    SELECT duplicate_id, keep_id FROM dups
  )
  LOOP
    dup_id := rec.duplicate_id;
    kept_id := rec.keep_id;
    IF dup_id IS NULL OR kept_id IS NULL OR dup_id = kept_id THEN
      CONTINUE;
    END IF;

    -- Pedidos: apontar para o usuário que fica
    UPDATE pedidos SET colaborador_id = kept_id WHERE colaborador_id = dup_id;
    -- Transações (pagamentos) do duplicado passam para o kept (evita RESTRICT)
    UPDATE transacoes SET usuario_id = kept_id WHERE usuario_id = dup_id;
    -- Caixas: se o duplicado for operador de caixa, reassign para o kept (evita RESTRICT ao deletar)
    UPDATE caixas SET operador_id = kept_id WHERE operador_id = dup_id;

    -- Consumo mensal: linhas do duplicado que não conflitam com kept -> só trocar usuario_id
    UPDATE consumo_colaborador_mensal
    SET usuario_id = kept_id, updated_at = NOW()
    WHERE usuario_id = dup_id
      AND NOT EXISTS (
        SELECT 1 FROM consumo_colaborador_mensal c2
        WHERE c2.usuario_id = kept_id
          AND c2.empresa_id = consumo_colaborador_mensal.empresa_id
          AND c2.ano = consumo_colaborador_mensal.ano
          AND c2.mes = consumo_colaborador_mensal.mes
      );

    -- Conflitos: somar valor_total e valor_abatido na linha do kept
    UPDATE consumo_colaborador_mensal c
    SET valor_total = c.valor_total + sub.soma_total,
        valor_abatido = c.valor_abatido + sub.soma_abatido,
        updated_at = NOW()
    FROM (
      SELECT empresa_id, ano, mes,
             SUM(valor_total) AS soma_total,
             SUM(valor_abatido) AS soma_abatido
      FROM consumo_colaborador_mensal
      WHERE usuario_id = dup_id
      GROUP BY empresa_id, ano, mes
    ) sub
    WHERE c.usuario_id = kept_id
      AND c.empresa_id = sub.empresa_id AND c.ano = sub.ano AND c.mes = sub.mes;

    -- Remover todas as linhas de consumo do duplicado
    DELETE FROM consumo_colaborador_mensal WHERE usuario_id = dup_id;

    -- Abatimentos: apontar para o que fica (tabela pode não existir em todos os projetos)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abatimento_colaborador_lancamento') THEN
      UPDATE abatimento_colaborador_lancamento SET usuario_id = kept_id WHERE usuario_id = dup_id;
    END IF;

    -- Papéis e depois o usuário
    DELETE FROM usuario_papeis WHERE usuario_id = dup_id;
    DELETE FROM usuarios WHERE id = dup_id;
  END LOOP;
END $$;
