-- ─── A agenda entra no catálogo de permissões ──────────────────────────────
--
-- A tela de perfis mostrava 12 módulos e nenhum deles era a agenda. Eventos e
-- locais existem, são usados todo domingo, e não havia como dizer quem cuida
-- deles — a decisão estava presa em `canEdit`, no código.
--
-- ── TRÊS CÓDIGOS, E NENHUM `ver_agenda` ────────────────────────────────────
--
-- Todos os outros módulos têm um `ver_*`, e a simetria pedia um aqui. Mas
-- `ver_agenda` não teria nada obedecendo: a política de SELECT de `eventos`
-- libera qualquer usuário autenticado, e esconder a agenda de quem hoje a vê
-- seria mudança de comportamento que ninguém pediu.
--
-- Uma caixa que não muda nada é pior que uma caixa a menos: ela ensina quem
-- usa a tela que marcar caixa ali não adianta.
--
-- ── O QUE CADA UM GOVERNA, E POR QUE ESTE RECORTE ──────────────────────────
--
-- O recorte não é opinião: é o que as políticas de RLS já separam.
--
--   gerenciar_agenda   criar e editar evento
--                      RLS de `eventos`: admin, secretaria, lideranca
--   excluir_evento     apagar evento
--                      RLS de `eventos`: só admin
--   gerenciar_locais   criar e editar local
--                      RLS de `locais`: admin, secretaria (sem lideranca)
--
-- Separar "excluir" de "gerenciar" segue o mesmo princípio de `pessoas`, e
-- pela mesma razão: editar errado se conserta, apagar não.
--
-- ── A QUEM ISTO É CONCEDIDO AGORA ──────────────────────────────────────────
--
-- Exatamente a quem já podia: admin e secretaria, que é o que `canEdit`
-- entrega hoje nas duas telas. Ninguém ganha nem perde nada nesta migration.
--
-- **A liderança fica de fora de propósito, e não por descuido.** O banco já a
-- autoriza a criar e editar evento — as políticas de INSERT e UPDATE de
-- `eventos`, `evento_ministerios` e `evento_areas` nomeiam `lideranca`
-- explicitamente. Só a tela nunca deixou. Abrir isso muda o dia a dia de 4 dos
-- 6 usuários, e é decisão da igreja, não consequência de uma migration:
-- agora é uma caixa de seleção em Usuários.

INSERT INTO public.permissoes (codigo, modulo, descricao) VALUES
  ('gerenciar_agenda', 'agenda', 'Criar e editar eventos da agenda'),
  ('excluir_evento',   'agenda', 'Excluir eventos da agenda'),
  ('gerenciar_locais', 'agenda', 'Criar e editar locais e espaços')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.role_permissoes (role, permissao_codigo) VALUES
  ('admin'::app_role,      'gerenciar_agenda'),
  ('secretaria'::app_role, 'gerenciar_agenda'),
  ('admin'::app_role,      'excluir_evento'),
  ('admin'::app_role,      'gerenciar_locais'),
  ('secretaria'::app_role, 'gerenciar_locais')
ON CONFLICT DO NOTHING;
