-- ─── Liderança passa a poder editar pessoas e contatos ──────────────────────
--
-- Decisão da Telma em 20/08/2026, e a mais adiada do sistema: quatro dos seis
-- usuários da igreja têm o papel `lideranca`, e nenhum deles conseguia alterar
-- um telefone, corrigir um nome ou promover um visitante a congregado. A tela
-- oferecia; o banco recusava.
--
-- Até 18/08 recusava em silêncio: no Postgres com RLS um UPDATE barrado afeta
-- zero linhas e devolve SUCESSO. A migration 20260818000000 e o
-- `lib/escritaConferida.ts` fizeram o sistema ao menos avisar. Esta aqui tira
-- o motivo do aviso.
--
-- ── O QUE ESTA MIGRATION FAZ, E O QUE NÃO FAZ ──────────────────────────────
--
-- Acrescenta `lideranca` a duas políticas: INSERT e UPDATE de `membros`.
--
-- NÃO toca em DELETE. Apagar pessoa continua sendo só de admin — é a convenção
-- deste banco (praticamente toda tabela tem DELETE restrito a `is_admin()`) e
-- é a operação sem volta. Um líder que errou um cadastro corrige; um líder que
-- apagou a pessoa errada não desfaz.
--
-- ── SOBRE AS OBSERVAÇÕES PASTORAIS ─────────────────────────────────────────
--
-- A coluna `observacoes_pastorais` fica dentro do mesmo UPDATE: RLS é por
-- linha, não por coluna, e não há como liberar o telefone e reter a
-- observação por aqui. Quatro pessoas têm esse campo preenchido hoje.
--
-- Isso NÃO aumenta a exposição de leitura, que já era total: a política
-- `membros_by_igreja` concede SELECT a qualquer usuário autenticado da igreja,
-- sem checar papel nenhum. Os líderes já liam as observações pastorais antes
-- desta migration. Se um dia a igreja quiser fechar isso, o lugar é aquela
-- política de SELECT — e provavelmente um trigger para barrar a escrita da
-- coluna, já que privilégio de coluna no Postgres é por papel do banco e aqui
-- todos compartilham o `authenticated`.

-- ── UPDATE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS staff_update_membros ON public.membros;

CREATE POLICY staff_update_membros ON public.membros
  FOR UPDATE
  USING (
    has_any_role((SELECT auth.uid()), ARRAY[
      'admin'::app_role,
      'secretaria'::app_role,
      'diakonia'::app_role,
      'operador'::app_role,
      'lideranca'::app_role   -- novo
    ])
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
--
-- Junto com o UPDATE, e não depois: um líder que pode corrigir a ficha de uma
-- visitante mas não pode cadastrar a que chegou ontem faria o trabalho pela
-- metade, e a outra metade viraria bilhete para a secretaria.
DROP POLICY IF EXISTS staff_insert_membros ON public.membros;

CREATE POLICY staff_insert_membros ON public.membros
  FOR INSERT
  WITH CHECK (
    has_any_role((SELECT auth.uid()), ARRAY[
      'admin'::app_role,
      'secretaria'::app_role,
      'diakonia'::app_role,
      'operador'::app_role,
      'lideranca'::app_role   -- novo
    ])
  );

COMMENT ON POLICY staff_update_membros ON public.membros IS
  'Quem edita ficha de pessoa. `lideranca` entrou em 20/08/2026: são 4 dos 6 usuários e não conseguiam corrigir um telefone. DELETE continua só de admin.';
