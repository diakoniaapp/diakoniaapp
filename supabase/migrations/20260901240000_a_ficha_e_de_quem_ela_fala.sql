-- ═══════════════════════════════════════════════════════════════════════════
-- A ficha é de quem ela fala
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── A REGRA, DITADA PELA IGREJA EM 01/09/2026 ──────────────────────────────
--
--   "membro comum não pode consultar a ficha dos outros, apenas visualiza a
--    sua, pode editar; visualiza a agenda sem poder de edição; é sugerido
--    para servir em ministérios; é convidado para participar de alguma classe
--    com sugestão pelo sexo e/ou idade; é convidado para PGM que aconteça
--    próximo de sua residência."
--
-- E o mesmo para membro ou congregado que já seja voluntário — com os
-- convites valendo só para quem ainda não está em nenhuma classe ou grupo.
--
-- ── O QUE UM MEMBRO COMUM ENXERGAVA ANTES DESTA MIGRATION ──────────────────
--
-- Medido rebaixando uma conta real a 'membro' dentro de transação desfeita, e
-- varrendo as 144 tabelas do schema: **43 tabelas com linhas visíveis**. As
-- que falam de outra pessoa:
--
--   membros              297   a igreja inteira: nome, telefone, endereço,
--                              nascimento — as 297 fichas
--   visita_historico     293   visitas e anotações pastorais
--   ebd_matriculas       133   quem estuda em qual classe
--   ebd_entradas          69   DINHEIRO: valor, forma, comprovante
--   perfil_servico        73   disponibilidade, restrições, motivo do
--                              descanso e nível de sobrecarga de cada um
--   escala_voluntarios    12   quem está escalado para quê
--   acolhimento_tarefas   12   o acompanhamento dos visitantes
--   ebd_presencas          9   quem faltou
--
-- ── A POLÍTICA DISFARÇADA ──────────────────────────────────────────────────
--
-- A porta de `membros` não era uma política óbvia. Era esta:
--
--   membros_by_igreja   USING (igreja_id = '000…001'::uuid)
--
-- Tem cara de filtro multi-inquilino. Mas o banco é de UMA igreja: medido,
-- **297 de 297** membros têm esse id. É `true` vestido de tenancy — e por
-- isso não apareceu em nenhuma das varreduras anteriores, que procuravam
-- `qual = 'true'` ou `auth.role() = 'authenticated'`.
--
-- Ela também tornava decorativa a `membro_ve_proprio`
-- (`id = minha_pessoa_id()`), consertada em 01/09: essa política nunca foi o
-- que decidia, porque a de cima já deixava tudo passar.
--
-- As mesmas três linhas existem em `ministerios` e `documentos`. A de
-- `ministerios` sai aqui por limpeza (não muda nada — há uma política
-- explícita `true` ao lado, e ela é deliberada: o membro precisa dos nomes
-- dos ministérios para ser sugerido a servir). A de `documentos` fica para
-- quando se decidir o que é documento de igreja e o que é documento interno.
--
-- ── O QUE ESTA MIGRATION NÃO PRECISA FECHAR ────────────────────────────────
--
-- Os convites continuam funcionando com as tabelas fechadas, porque as três
-- funções que os produzem são SECURITY DEFINER e não passam por RLS:
--
--   sugerir_classe_ebd(nascimento, sexo)   filtra por faixa etária e gênero,
--                                          prefere classe específica e a
--                                          faixa mais estreita
--   pgm_sugerir_por_bairro(bairro)         devolve nome, dia, horário, bairro,
--                                          nº de membros e nome do líder —
--                                          e NÃO devolve o endereço da casa
--                                          do anfitrião
--   sugerir_voluntarios_escala(...)        a sugestão de quem serve
--
-- Por isso `pgm_grupos` pode continuar fechada: o convite chega pela função,
-- sem que ninguém leia a tabela e o endereço junto. `ebd_classes` fica
-- legível de propósito — nome, cor, gênero e faixa etária não são dado de
-- ninguém, e o cartão do convite precisa do nome da classe.
--
-- ── QUEM PERDE O QUÊ ───────────────────────────────────────────────────────
--
-- Medido antes de aplicar, conta por conta, com ROLLBACK. Ninguém que
-- trabalha perde o que usa: admin, secretaria e o pastor titular continuam
-- lendo as 297 fichas pelas políticas que já tinham.
--
-- O Bruno (lideranca) passa de 297 para a própria ficha. Não é regressão: ele
-- **lidera 0 ministérios e 0 áreas** — é liderança no papel, não no dado. A
-- política nova `lider_ve_sua_equipe` dá a quem de fato lidera exatamente a
-- sua equipe, e são 19 pessoas esperando conta.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- A ficha de membro
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "membros_by_igreja" ON public.membros;

-- Quem lidera vê quem serve com ele — nem uma ficha a mais.
--
-- O recorte NÃO vem do papel: vem do dado. `fn_meus_ministerios()` e
-- `fn_minhas_areas()` (criadas em 20260901190000) leem `ministerios.lider_id`
-- e `areas.lider_id`, que é onde a liderança real está registrada. O papel só
-- diz "esta pessoa lidera alguma coisa"; o banco diz qual.

DROP POLICY IF EXISTS "lider_ve_sua_equipe" ON public.membros;
CREATE POLICY "lider_ve_sua_equipe" ON public.membros
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.area_voluntarios av
       WHERE av.membro_id = membros.id
         AND ( av.ministerio_id IN (SELECT public.fn_meus_ministerios())
            OR av.area_id      IN (SELECT public.fn_minhas_areas()) )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- EBD — a própria matrícula, a própria presença, e o dinheiro fora
-- ═══════════════════════════════════════════════════════════════════════════
--
-- As três tinham `USING (true)`. Os líderes de EBD continuam enxergando tudo
-- pela política `*_modify_lider`, que é `ALL` e cobre admin, secretaria,
-- pastor, diakonia e lideranca — nada aqui tira nada deles.

DROP POLICY IF EXISTS "ebd_matriculas_select" ON public.ebd_matriculas;
CREATE POLICY "ebd_matriculas_a_minha" ON public.ebd_matriculas
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

DROP POLICY IF EXISTS "ebd_presencas_select" ON public.ebd_presencas;
CREATE POLICY "ebd_presencas_a_minha" ON public.ebd_presencas
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

-- `ebd_entradas` é caixa: valor, forma de pagamento, comprovante. Não tem
-- versão "a minha" — ou a pessoa cuida da tesouraria da EBD, ou não vê.
DROP POLICY IF EXISTS "ebd_entradas_select" ON public.ebd_entradas;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escala e perfil de serviço — os próprios
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `perfil_servico` guarda `motivo_descanso`, `restricoes`, `nivel_sobrecarga`
-- e `score_engajamento`. É a coisa mais íntima do módulo de escalas, e estava
-- aberta a qualquer pessoa logada.
--
-- Staff e liderança seguem cobertos por `escvol_admin` e `ps_admin`, ambas
-- `ALL` — que já dão SELECT.

DROP POLICY IF EXISTS "escvol_select" ON public.escala_voluntarios;
CREATE POLICY "escvol_a_minha" ON public.escala_voluntarios
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

DROP POLICY IF EXISTS "ps_select" ON public.perfil_servico;
CREATE POLICY "ps_o_meu" ON public.perfil_servico
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

-- E o pastor titular continua LENDO as duas.
--
-- Descoberto ensaiando: sem isto ele perdia o widget "Quem serve" do próprio
-- painel — `sinais-voluntariado`, que é `paineis: ["pastoral"]` e lê
-- `v_voluntarios_completo`, que por sua vez junta `perfil_servico`. O recorte
-- pastoral definido pela igreja inclui "quem serve", então tirar isso dele
-- seria estreitar o painel, não protegê-lo.
--
-- Só SELECT: ler é do pastor, mexer na escala é de quem a monta.

DROP POLICY IF EXISTS "escvol_pastoral_le" ON public.escala_voluntarios;
CREATE POLICY "escvol_pastoral_le" ON public.escala_voluntarios
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()),
         ARRAY['pastor'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "ps_pastoral_le" ON public.perfil_servico;
CREATE POLICY "ps_pastoral_le" ON public.perfil_servico
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()),
         ARRAY['pastor'::app_role, 'diakonia'::app_role]));

-- ═══════════════════════════════════════════════════════════════════════════
-- O trabalho pastoral não é do membro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 293 registros de visita e anotação pastoral, e 12 tarefas de acolhimento de
-- visitantes, liam-se com qualquer login. `acolhimento_tarefas` ainda tinha
-- UPDATE aberto — qualquer pessoa logada podia marcar como concluída a tarefa
-- de acolher alguém que ninguém acolheu.

DROP POLICY IF EXISTS "auth_select_historico" ON public.visita_historico;
CREATE POLICY "visita_historico_pastoral" ON public.visita_historico
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()),
         ARRAY['admin'::app_role, 'secretaria'::app_role,
               'pastor'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "auth_select_acolhimento_tarefas" ON public.acolhimento_tarefas;
CREATE POLICY "acolhimento_le_pastoral" ON public.acolhimento_tarefas
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()),
         ARRAY['admin'::app_role, 'secretaria'::app_role,
               'pastor'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "auth_update_acolhimento_tarefas" ON public.acolhimento_tarefas;
CREATE POLICY "acolhimento_edita_pastoral" ON public.acolhimento_tarefas
  FOR UPDATE TO authenticated
  USING (has_any_role((SELECT auth.uid()),
         ARRAY['admin'::app_role, 'secretaria'::app_role,
               'pastor'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()),
         ARRAY['admin'::app_role, 'secretaria'::app_role,
               'pastor'::app_role, 'diakonia'::app_role]));

-- ═══════════════════════════════════════════════════════════════════════════
-- Consentimento — o conta≠ficha que tinha sobrado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `consent_proprio` comparava `registrado_por = auth.uid()`. `registrado_por`
-- é quem REGISTROU o consentimento — a secretaria, quase sempre. Então a
-- pessoa não via o próprio consentimento, e a secretaria via os que ela mesma
-- digitou por acaso. É a mesma confusão entre conta e ficha corrigida em
-- 20260901180000, numa política que ficou de fora.

DROP POLICY IF EXISTS "consent_proprio" ON public.consentimento;
CREATE POLICY "consent_o_meu" ON public.consentimento
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- Pequenos Grupos — o meu grupo, e o convite pela função
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Em 20260901210000 os `pgm_*` foram fechados à equipe. Isso deixou o membro
-- comum sem ver nem o PRÓPRIO grupo — regressão latente, porque ainda não há
-- conta de membro comum. Aqui ela se fecha.
--
-- Quem não participa de nenhum continua recebendo o convite por
-- `pgm_sugerir_por_bairro()`, que é SECURITY DEFINER e devolve bairro, dia e
-- horário sem o endereço da casa.

DROP POLICY IF EXISTS "pgm_membros_o_meu_vinculo" ON public.pgm_membros;
CREATE POLICY "pgm_membros_o_meu_vinculo" ON public.pgm_membros
  FOR SELECT TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

DROP POLICY IF EXISTS "pgm_grupos_o_meu_grupo" ON public.pgm_grupos;
CREATE POLICY "pgm_grupos_o_meu_grupo" ON public.pgm_grupos
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT pm.grupo_id
        FROM public.pgm_membros pm
       WHERE pm.pessoa_id = public.minha_pessoa_id()
         AND pm.ativo
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza: a segunda política disfarçada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Não muda comportamento: `Autenticados leem ministerios` (`true`) está ao
-- lado e é deliberada — o membro precisa dos nomes dos ministérios para ser
-- sugerido a servir. O que sai é a duplicata disfarçada de filtro de igreja,
-- para que a próxima varredura não tenha de descobri-la de novo.

DROP POLICY IF EXISTS "ministerios_by_igreja" ON public.ministerios;

-- ═══════════════════════════════════════════════════════════════════════════
-- As quatro views que passavam por baixo de tudo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem isto, esta migration inteira seria uma promessa falsa. Uma view sem
-- `security_invoker=true` roda com os poderes de QUEM A CRIOU, não de quem a
-- consulta — a RLS da tabela por baixo simplesmente não é aplicada.
--
-- Medido: 30 views em `public`, e **4 sem `security_invoker`**. Três carregam
-- dado de pessoa:
--
--   v_conselho_da_igreja   nome, foto e cargo de quem está no conselho
--   vw_agenda_pastoral     nome, aniversário e TELEFONE (dois campos)
--   vw_ebd_alertas_idade   nome, sexo, data de nascimento e idade
--   v_proximas_escalas     quem está escalado para quê
--
-- O membro comum não conseguiria ler `membros` depois desta migration — e
-- leria os mesmos nomes, e os telefones, por estas quatro portas.
--
-- Ligar `security_invoker` não muda o que a view MOSTRA: muda quem consegue
-- ver cada linha, que passa a ser exatamente quem já podia ver a linha na
-- tabela de origem. Staff e liderança não perdem nada — as políticas `ALL`
-- delas continuam valendo por baixo.

ALTER VIEW public.v_conselho_da_igreja  SET (security_invoker = true);
ALTER VIEW public.vw_agenda_pastoral    SET (security_invoker = true);
ALTER VIEW public.vw_ebd_alertas_idade  SET (security_invoker = true);
ALTER VIEW public.v_proximas_escalas    SET (security_invoker = true);

COMMIT;
