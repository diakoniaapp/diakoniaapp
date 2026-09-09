-- ═══════════════════════════════════════════════════════════════════════════
-- O `WITH CHECK` das sete políticas de EBD estava escancarado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- As sete tabelas do módulo de EBD têm, cada uma, uma política de escrita por
-- papel — `ebd_aulas_modify_lider`, `ebd_campanhas_modify_lider`,
-- `ebd_classes_modify_lider`, `ebd_entradas_modify_lider`,
-- `ebd_matriculas_modify_lider`, `ebd_presencas_modify_lider` e
-- `ebd_prof_modify` (nome fora do padrão, mesma função). O `USING` das sete
-- restringe a admin / secretaria / pastor / diakonia; o `WITH CHECK` das sete
-- era a constante `true`.
--
-- INSERT no Postgres avalia SÓ o `WITH CHECK` (nunca o `USING`). Com o check
-- em `true`, QUALQUER usuário autenticado conseguia inserir linha nas sete
-- tabelas — criar classe falsa, matrícula falsa, presença falsa, entrada de
-- arrecadação falsa. UPDATE e DELETE seguiam protegidos, porque esses
-- avaliam o `USING` para escolher a linha.
--
-- Origem: a `20260805150000_optimize_auth_rls_initplan.sql` (aplicada à mão
-- pelo SQL Editor e versionada depois) recriou as sete políticas com
-- `WITH CHECK (true)` explícito — enquanto para todas as outras 80+ políticas
-- daquele mesmo arquivo ela repetiu a expressão do `USING` no check. As sete
-- de EBD foram a exceção, provavelmente porque já estavam assim no banco. A
-- `20260903160000_lideranca_so_opera_o_proprio_modulo.sql` (B·2) apertou o
-- `USING` (tirou `lideranca` do array) e não tocou no `WITH CHECK` — deixou o
-- furo à vista: `lideranca` sai do `USING` e mesmo assim continua inserindo.
--
-- ── A MEDIÇÃO ───────────────────────────────────────────────────────────────
--
-- Impersonando o JWT em BEGIN/ROLLBACK pela API de gerenciamento
-- (projeto prjoftmlkusbjoeptabp), INSERT em `ebd_classes` (nome único por
-- persona, sem colisão de unique a mascarar o veredito da RLS):
--
--   persona                                  | antes            | depois
--   -----------------------------------------|------------------|------------------
--   Bruno  (tesouraria)                      | INSERIU          | BLOQUEADO (RLS)
--   Ana Paula (lideranca, não lidera EBD)    | INSERIU          | BLOQUEADO (RLS)
--   Patricia (lidera Educação Cristã → EBD)  | INSERIU          | INSERIU
--   Telma  (admin)                           | INSERIU          | INSERIU
--
-- Repetido para as sete tabelas: no "depois", Bruno e Ana Paula levam
-- "new row violates row-level security policy" nas sete; Patricia e Telma
-- nunca são barradas pela RLS (inserem, ou esbarram só em unique/CHECK de
-- dado). Ou seja: quem opera o módulo continua operando; quem não tem nada
-- com ele para de inserir.
--
-- ── A CORREÇÃO ──────────────────────────────────────────────────────────────
--
-- `WITH CHECK` de cada uma das sete = a MESMA expressão do seu `USING` (o
-- ramo por papel). O ramo de quem lidera o ministério não entra aqui: já é
-- coberto pela política irmã `lider_ebd_opera_*` (`20260903160000`), que tem
-- `USING` e `WITH CHECK` iguais a `lidero_ministerio_do_modulo('ebd')`. As
-- duas se somam por OR — INSERT passa para papel de equipe OU para quem
-- lidera o ministério, e para mais ninguém. É o mesmo desenho que as sete
-- políticas irmãs de PGM (`pgm_*_equipe`) já têm desde a B·2.
--
-- ── ALTERNATIVA DESCARTADA ──────────────────────────────────────────────────
--
-- Trocar o `WITH CHECK (true)` por `WITH CHECK (lidero_ministerio_do_modulo(
-- 'ebd') OR <ramo por papel>)` numa política só, e apagar a `lider_ebd_opera_*`.
-- Descartado: manteria as duas responsabilidades numa expressão só e
-- desalinharia de PGM, que ficou com as duas políticas separadas. Espelhar o
-- `USING` no `WITH CHECK` é a mudança mínima e deixa EBD e PGM com a mesma
-- forma.

BEGIN;

ALTER POLICY "ebd_aulas_modify_lider" ON public.ebd_aulas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_campanhas_modify_lider" ON public.ebd_campanhas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_classes_modify_lider" ON public.ebd_classes
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_entradas_modify_lider" ON public.ebd_entradas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_matriculas_modify_lider" ON public.ebd_matriculas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_presencas_modify_lider" ON public.ebd_presencas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

ALTER POLICY "ebd_prof_modify" ON public.ebd_professores
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = (SELECT auth.uid())
                         AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));

COMMIT;
