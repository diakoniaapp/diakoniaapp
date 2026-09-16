-- ─── proprietario: concessão + permissão "estruturar_financeiro" ─────────
--
-- Depende da migration anterior (20260916000000) já ter commitado o valor
-- 'proprietario' do enum public.app_role.
--
-- Uma permissão nova, não a reaproveitada `gerenciar_financeiro` — aquela
-- já existia sem nunca ter sido lida pelo front-end (ver comentário da
-- migration anterior), e reaproveitá-la agora criaria ambiguidade sobre o
-- que ela realmente cobre. `estruturar_financeiro` é só o recorte pedido:
-- criar centro de custo à mão e excluir centro/categoria mesmo em uso.
-- Editar nome/cor/orçamento e ativar/desativar continuam com quem já tem
-- acesso à tela hoje (ROLES_FINANCEIRO) — não fazem parte deste pedido.
--
-- Telma Souza (58eb1c4e-97f5-4354-a51e-25dee1111677) já tem os papéis
-- 'diakonia' e 'admin' — mantidos. 'proprietario' é aditivo, só para esta
-- checagem de permissão; a RLS de fin_centros_custo/fin_categorias
-- continua liberando pelos papéis que ela já tem.

insert into public.permissoes (codigo, modulo, descricao)
values ('estruturar_financeiro', 'financeiro', 'Criar centro de custo à mão e excluir centro/categoria mesmo em uso (dona do sistema)')
on conflict (codigo) do nothing;

insert into public.role_permissoes (role, permissao_codigo)
values ('proprietario', 'estruturar_financeiro')
on conflict do nothing;

insert into public.user_roles (user_id, role)
values ('58eb1c4e-97f5-4354-a51e-25dee1111677', 'proprietario')
on conflict do nothing;
