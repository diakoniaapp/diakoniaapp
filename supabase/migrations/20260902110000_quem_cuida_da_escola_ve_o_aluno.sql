-- ═══════════════════════════════════════════════════════════════════════════
-- Quem cuida da Escola vê o aluno
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE O ENSAIO PEGOU ───────────────────────────────────────────────────
--
-- A bancada da Educação Cristã ficou pronta e foi medida com a identidade de
-- quem vai usá-la: a Patrícia, líder do ministério, com papel `lideranca`.
-- Resultado, contra o banco:
--
--   classes                 8   ✓
--   matrículas ativas      87   ✓
--   professores            13   ✓
--   aulas                  14   ✓
--   presenças               9   ✓
--   ALUNOS FORA DA FAIXA    0   ✗  (a administradora vê 3)
--   fichas de pessoa       14      (só a equipe dela)
--
-- Ela enxerga a Escola inteira, menos os NOMES. `vw_ebd_alertas_idade` junta
-- `membros`, e desde 20260901240000 quem lidera um ministério lê a ficha de
-- quem serve com ele — e aluno de EBD não é voluntário.
--
-- O efeito é o pior possível numa tela de alerta: ela não erra, ela CALA. A
-- líder veria dois avisos onde a administradora vê três, sem nada indicando
-- que falta um. Foi por isso que a lista dos alunos fora da faixa nasceu
-- documentada no serviço como "pode voltar vazia por RLS".
--
-- ── O CRITÉRIO ────────────────────────────────────────────────────────────
--
-- O mesmo de sempre nesta casa: o recorte vem do DADO, não do papel.
--
--   quem lidera o ministério que opera a EBD   vê a ficha de todo matriculado
--   quem é professor de uma classe             vê a ficha dos alunos DAQUELA
--                                              classe, e de mais ninguém
--
-- "O ministério que opera a EBD" é lido de `ministerios.modulo = 'ebd'`
-- (20260902100000), e não de um nome fixo no código. Se a igreja mudar qual
-- ministério cuida da Escola, a permissão acompanha sozinha.
--
-- Só SELECT, e só de quem tem matrícula ATIVA. Ninguém ganha aqui o direito
-- de editar ficha de ninguém — isso continua com admin e secretaria.

BEGIN;

DROP POLICY IF EXISTS "ebd_ve_a_ficha_do_aluno" ON public.membros;

CREATE POLICY "ebd_ve_a_ficha_do_aluno" ON public.membros
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ebd_matriculas mt
       WHERE mt.pessoa_id = membros.id
         AND mt.ativo
    )
    AND (
      -- Lidero (ou co-lidero) o ministério que opera a Escola.
      EXISTS (
        SELECT 1 FROM public.ministerios m
         WHERE m.modulo = 'ebd'
           AND m.ativo
           AND public.minha_pessoa_id() IN (m.lider_id, m.vice_lider_id, m.co_lider_id)
      )
      OR
      -- Ou dou aula para esta pessoa — a ficha do meu aluno, não a de todos.
      EXISTS (
        SELECT 1
          FROM public.ebd_professores pr
          JOIN public.ebd_matriculas  mt2 ON mt2.classe_id = pr.classe_id
         WHERE pr.pessoa_id = public.minha_pessoa_id()
           AND pr.ativo
           AND mt2.pessoa_id = membros.id
           AND mt2.ativo
      )
    )
  );

COMMIT;
