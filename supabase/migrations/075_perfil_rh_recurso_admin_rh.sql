-- Garante que o perfil "RH" exista e tenha o recurso admin.rh em perfil_permissoes.
-- Assim usuários atribuídos ao perfil RH (usuario_perfis) passam a ver o módulo RH.
-- O código também aceita papel RH em usuario_papeis (legado).

INSERT INTO public.perfis (id, nome, descricao, ativo)
SELECT uuid_generate_v4(), 'RH', 'Recursos Humanos – colaboradores, consumo e abatimento', true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome = 'RH');

INSERT INTO public.perfil_permissoes (perfil_id, recurso)
SELECT p.id, 'admin.rh'
FROM public.perfis p
WHERE p.nome = 'RH'
  AND NOT EXISTS (
    SELECT 1 FROM public.perfil_permissoes pp
    WHERE pp.perfil_id = p.id AND pp.recurso = 'admin.rh'
  );
