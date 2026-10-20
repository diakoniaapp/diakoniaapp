-- ─── Limpeza das linhas de TESTE do funil do AutoCadastro (visitante_funil) — 20/10/2026 ───────────────────────────────────────────────────────────────────────
-- O funil não guarda dado pessoal (só: sessão sorteada no navegador, passo, concluiu, duração), então manter essas linhas não expõe ninguém — a limpeza é só para não sujar a taxa
-- de conclusão do painel do QR. Medido hoje (SELECT pela sessão da administradora): 29 linhas, 7 em 17/10.
--
-- AS 6 QUE SÃO TESTE: 17/10/2026, das 13:02:43 às 13:02:58 — uma a cada ~3 segundos, todas no passo 1 e nenhuma concluída: é o ritmo de uma sondagem automática (o freio do
-- cadastro público), não de gente preenchendo um formulário. Identificadas pelo id exato abaixo (nunca por faixa de data), para não apagar nada além delas.
-- NÃO MEXO nas outras 23: as de 11/10 à noite (dezenas de preenchimentos em ~1 hora) parecem visitantes de verdade num culto, e a de 17/10 15:17 e as de 07 e 08/10 podem ser testes
-- feitos por você no celular — só você sabe. Se quiser apagar também, diga quais.
--
-- COMO RODAR (SQL Editor do Supabase): rode o bloco 1 (só leitura; esperado: 6 linhas), depois o bloco 2 inteiro. O bloco 2 aborta sozinho se não apagar exatamente 6.

-- ── 1 · Conferir (só leitura) — esperado: 6 linhas, todas passo_max = 1 e concluiu = false ──────────────────────────────────────────────────────────────────
SELECT sessao_id, criado_em, passo_max, concluiu
  FROM public.visitante_funil
 WHERE sessao_id IN (
   'bcfb3ffa-67af-4e4b-b986-829a2db49c3a', 'd0c884d9-0bf5-4498-9df1-3e640e3efdb3', '58461b97-f252-4d33-9a4e-739dba9de6f1',
   '66286ceb-fe1c-4e79-b3a3-f342404b5b0f', '3387f4fd-1aac-4556-bb91-ee104d0eada0', '5bc63fd1-7191-4ac8-a539-cdc6a23d8669')
 ORDER BY criado_em;

-- ── 2 · Apagar (aborta se não forem exatamente 6) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.visitante_funil
   WHERE sessao_id IN (
     'bcfb3ffa-67af-4e4b-b986-829a2db49c3a', 'd0c884d9-0bf5-4498-9df1-3e640e3efdb3', '58461b97-f252-4d33-9a4e-739dba9de6f1',
     '66286ceb-fe1c-4e79-b3a3-f342404b5b0f', '3387f4fd-1aac-4556-bb91-ee104d0eada0', '5bc63fd1-7191-4ac8-a539-cdc6a23d8669')
     AND passo_max = 1 AND concluiu = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Esperava apagar 6 linhas e apaguei %: nada foi alterado.', n; END IF;
END $$;

-- ── 3 · Conferir depois (só leitura) — esperado: 23 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS linhas_no_funil FROM public.visitante_funil;
