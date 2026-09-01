-- ═══════════════════════════════════════════════════════════════════════════
-- Conta não é ficha — as cinco políticas que faltavam
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO, PELA TERCEIRA VEZ ───────────────────────────────────────────
--
-- Este banco guarda duas identidades para a mesma pessoa:
--
--   conta   quem entrou no sistema        auth.users.id, via auth.uid()
--   ficha   quem a pessoa é na igreja     membros.id
--
-- O elo é `profiles.pessoa_id`. Cinco políticas ainda comparam o id da FICHA
-- direto com o da CONTA — identificadores de tabelas diferentes.
--
-- Medido em 01/09/2026, uma consulta por tabela:
--
--   escala_voluntarios   0 linhas cujo pessoa_id seja id de conta
--   perfil_servico       0
--   consentimento        0
--   membros_detalhes     0 (a tabela está vazia)
--
-- Nenhuma delas jamais liberou uma linha. Duas irmãs em `membros` já foram
-- corrigidas na migration 20260901120000; estas são as que sobraram.
--
-- ── O QUE ISSO DESTRAVA ────────────────────────────────────────────────────
--
-- Três funcionalidades que a igreja pensa que tem e que o banco barrava em
-- silêncio — RLS que recusa devolve SUCESSO com zero linhas:
--
--   escvol_proprio              o voluntário confirmar a própria escala
--   ps_proprio                  a pessoa dizer quando pode servir
--   user_update_consentimento   registrar o próprio aceite de LGPD
--
-- As duas primeiras valem sobre dado real: 12 escalados e 73 perfis de
-- serviço. A terceira, sobre 29 consentimentos — que hoje só a administração
-- consegue gravar.
--
-- ── A QUINTA É OUTRO ERRO, NA MESMA FAMÍLIA ────────────────────────────────
--
-- `det_proprio_membro` liga conta e ficha pelo E-MAIL:
--
--   JOIN profiles pr ON pr.email = pe.email
--
-- O e-mail da conta é fabricado a partir do telefone — 5521…@app.diakonia — e
-- o e-mail real da pessoa vive noutro campo. Medido: das 4 contas, 4 têm
-- e-mail fabricado e 0 casam com o e-mail de algum membro.
--
-- Pior: ela consulta `pessoas`, que é uma tabela LEGADA paralela a `membros`,
-- com 0 linhas contra 297. E `membros_detalhes` também está vazia. A política
-- liga duas tabelas vazias por um campo que não casa.
--
-- Corrigida junto, por coerência e porque custa uma linha — mas sem ilusão de
-- que destrave algo hoje. `pessoas` e `membros_detalhes` são candidatas a
-- remoção, e isso é decisão de produto, não desta migration.
--
-- ── POR QUE `minha_pessoa_id()` ────────────────────────────────────────────
--
-- Criada na migration de 01/09 pelo mesmo motivo, e já em uso na política de
-- leitura de `membros`. É `SECURITY DEFINER` porque `profiles` tem RLS: dentro
-- de uma política, a consulta a `profiles` precisa valer sem disparar a RLS de
-- lá. Uma quarta reescrita do mesmo `SELECT pessoa_id FROM profiles` seria a
-- quarta chance de escrevê-lo diferente.

BEGIN;

-- ── 1. O voluntário confirma a própria escala ──────────────────────────────
DROP POLICY IF EXISTS escvol_proprio ON public.escala_voluntarios;
CREATE POLICY escvol_proprio ON public.escala_voluntarios
  FOR UPDATE
  TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

-- ── 2. O mesmo erro, no ramo OR da política da equipe ──────────────────────
--
-- O primeiro ramo (admin e liderança) sempre funcionou; só o segundo estava
-- morto. Recriada inteira porque uma política não se altera pela metade.
DROP POLICY IF EXISTS staff_update_escala_voluntarios ON public.escala_voluntarios;
CREATE POLICY staff_update_escala_voluntarios ON public.escala_voluntarios
  FOR UPDATE
  USING (
    has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'lideranca'::app_role])
    OR pessoa_id = public.minha_pessoa_id()
  );

-- ── 3. A pessoa diz quando pode servir ─────────────────────────────────────
DROP POLICY IF EXISTS ps_proprio ON public.perfil_servico;
CREATE POLICY ps_proprio ON public.perfil_servico
  FOR UPDATE
  TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

-- ── 4. A pessoa registra o próprio aceite de LGPD ──────────────────────────
--
-- `auth.uid() IS NOT NULL` fica: ele é o que barra o anônimo, e continua
-- valendo. O que muda é só a comparação do dono.
DROP POLICY IF EXISTS user_update_consentimento ON public.consentimento;
CREATE POLICY user_update_consentimento ON public.consentimento
  FOR UPDATE
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (is_admin() OR pessoa_id = public.minha_pessoa_id())
  );

-- ── 5. Os próprios detalhes ────────────────────────────────────────────────
--
-- Sai o JOIN por e-mail com a tabela legada `pessoas`. Ver a nota do
-- cabeçalho: as duas tabelas envolvidas estão vazias, e o e-mail nunca casou.
DROP POLICY IF EXISTS det_proprio_membro ON public.membros_detalhes;
CREATE POLICY det_proprio_membro ON public.membros_detalhes
  FOR SELECT
  TO authenticated
  USING (pessoa_id = public.minha_pessoa_id());

COMMIT;
