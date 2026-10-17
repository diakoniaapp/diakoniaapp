-- ENSAIO (não grava nada: termina em ROLLBACK). Rode DEPOIS de aplicar a função. Devolve uma linha por conferência; todas devem dar "true".
BEGIN;

DO $$
DECLARE
  esperado int;
  como_lideranca int;
  como_ninguem int;
  uid_lideranca uuid;
BEGIN
  SELECT count(*) INTO esperado FROM public.membros
   WHERE tipo_pessoa IN ('membro', 'congregado') AND (data_nascimento IS NOT NULL OR nascimento_dia_mes IS NOT NULL OR data_casamento IS NOT NULL);

  -- na pele de um usuário de papel de trabalho (uma conta real com papel "lideranca", só dentro desta transação)
  SELECT user_id INTO uid_lideranca FROM public.user_roles WHERE role = 'lideranca' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid_lideranca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid_lideranca::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO como_lideranca FROM public.agenda_aniversarios_casamentos();

  -- na pele de alguém SEM papel nenhum (um uuid que não existe): não recebe nada
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  SELECT count(*) INTO como_ninguem FROM public.agenda_aniversarios_casamentos();
  RESET ROLE;

  CREATE TEMP TABLE _conferencias ON COMMIT DROP AS
  SELECT 'a função devolve tudo a quem tem papel de trabalho' AS conferencia, (como_lideranca = esperado AND esperado > 0) AS ok, esperado AS esperado, como_lideranca AS obtido
  UNION ALL SELECT 'e nada a quem não tem papel', (como_ninguem = 0), 0, como_ninguem;
END $$;

SELECT * FROM _conferencias;
ROLLBACK;
