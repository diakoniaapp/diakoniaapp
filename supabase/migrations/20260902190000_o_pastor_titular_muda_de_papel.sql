-- ═══════════════════════════════════════════════════════════════════════════
-- O pastor titular muda de papel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O ÚLTIMO PASSO DA SEPARAÇÃO ────────────────────────────────────────────
--
-- `diakonia` virou o dono do sistema em 20260902160000. Falta tirar de cima
-- dele o cargo que ele nunca deveria ter vestido: o de pastor titular.
--
-- O Lúcio migra para `pastor`. Mas migrar antes de preparar o destino seria
-- um desastre — medido, com a mesma ficha, só trocando o papel:
--
--                          diakonia   pastor
--   famílias                     80        0    ← perderia
--   vínculos familiares         219        0    ← perderia
--   histórico do membro         253        0    ← perderia
--   visitas                       5        0    ← perderia
--   acompanh. de visitante        2        0    ← perderia
--   lançamentos financeiros       0        1    ← GANHARIA
--   reuniões de governança        0        1    ← GANHARIA
--
-- Exatamente o inverso do pretendido. O ganho indevido já foi fechado em
-- 20260902180000, quando `pastor` saiu do Grupo A. Esta migration fecha a
-- outra ponta.
--
-- ── AS CINCO QUE TRANSFERO, E AS SEIS QUE NÃO ──────────────────────────────
--
-- São 23 as políticas onde `diakonia` entra e `pastor` não. Transferir todas
-- seria copiar o papel inteiro, e a regra da igreja é mais estreita: "o
-- pastor deve visualizar só o que estiver no painel pastoral".
--
-- Entram as cinco que o painel dele usa — família, vínculo, histórico do
-- membro, visita e acompanhamento de visitante. É o rebanho.
--
-- Ficam de fora, e cada uma por um motivo:
--
--   locais, locais_historico_operacional, predios, unidades
--       patrimônio. Nunca esteve no painel pastoral, e o menu já lhe tirou
--       "Espaços" em 01/09.
--   historico_lideranca
--       quem liderou o quê — governança de equipe, bancada de quem lidera.
--   pessoas_cargos
--       cadastro de cargo institucional, trabalho da secretaria.
--
-- ── SÓ LEITURA ─────────────────────────────────────────────────────────────
--
-- A palavra da igreja foi "visualizar". Então SELECT, e nada de UPDATE —
-- nem em famílias, nem em vínculos. Ele continua registrando o que é dele
-- por `visita_historico`, cujo INSERT sempre esteve aberto, e continua
-- escrevendo observação pastoral por `pastor_acessa_obs_pastorais`, que já
-- nomeia `pastor` desde antes de tudo isto.
--
-- Se faltar alguma escrita no uso real, é acrescentar uma política — e aí
-- será porque alguém sentiu falta, não porque eu supus.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O destino: `pastor` passa a enxergar o rebanho
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Políticas novas ao lado das que existem, e não um `OR` dentro delas: as
-- originais são `Staff leem ...` e valem para admin, secretaria e diakonia.
-- Mexer nelas misturaria duas decisões na mesma linha; somar uma política
-- permissiva diz exatamente uma coisa e pode ser desfeita sozinha.

DROP POLICY IF EXISTS "pastor_ve_familias" ON public.familias;
CREATE POLICY "pastor_ve_familias" ON public.familias
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'pastor'::app_role));

DROP POLICY IF EXISTS "pastor_ve_vinculos" ON public.vinculos_familiares;
CREATE POLICY "pastor_ve_vinculos" ON public.vinculos_familiares
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'pastor'::app_role));

DROP POLICY IF EXISTS "pastor_ve_historico_membro" ON public.historico_membro;
CREATE POLICY "pastor_ve_historico_membro" ON public.historico_membro
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'pastor'::app_role));

DROP POLICY IF EXISTS "pastor_ve_visitas" ON public.visitas;
CREATE POLICY "pastor_ve_visitas" ON public.visitas
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'pastor'::app_role));

DROP POLICY IF EXISTS "pastor_ve_acompanhamentos" ON public.acompanhamentos_visitante;
CREATE POLICY "pastor_ve_acompanhamentos" ON public.acompanhamentos_visitante
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'pastor'::app_role));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. As permissões: `pastor` recebe o que faltava do painel dele
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `ver_painel_pastoral` é a que define o cargo, e foi tirada do `pastor` em
-- 20260901160000 justamente para que o painel fosse só do titular. Agora que
-- `pastor` É o titular, ela volta.
--
-- `gerenciar_familias` vem junto porque a família é matéria pastoral e o
-- painel dela é dele. As outras três que `diakonia` tinha a mais —
-- `ver_financeiro`, `ver_relatorios_executivos` e `ver_manutencao` — NÃO
-- vêm: eram o resíduo que esta semana inteira vinha apontando.

INSERT INTO public.role_permissoes (role, permissao_codigo)
VALUES ('pastor'::app_role, 'ver_painel_pastoral'),
       ('pastor'::app_role, 'gerenciar_familias')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O Lúcio muda de papel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pelo `pessoa_id`, e não pelo id da conta: se a conta for recriada, é a
-- ficha que continua sendo a mesma pessoa.

UPDATE public.user_roles ur
   SET role = 'pastor'::app_role
  FROM public.profiles p
 WHERE p.id = ur.user_id
   AND ur.role = 'diakonia'::app_role
   AND p.pessoa_id = (SELECT pessoa_id FROM public.profiles
                       WHERE id = 'a275f9b2-4a59-418b-ab52-a37175979fcd');

UPDATE public.profiles
   SET role = 'pastor'::app_role
 WHERE id = 'a275f9b2-4a59-418b-ab52-a37175979fcd';

COMMIT;
