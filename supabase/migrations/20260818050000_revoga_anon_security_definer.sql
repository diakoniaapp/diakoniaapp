-- ---------------------------------------------------------------------------
-- Tira de quem nao esta logado a execucao das funcoes SECURITY DEFINER
-- ---------------------------------------------------------------------------
--
-- O QUE FOI ENCONTRADO
--
-- 132 das 140 funcoes SECURITY DEFINER do schema public eram executaveis por
-- `anon` — o papel de quem NAO fez login. Como sao SECURITY DEFINER, elas
-- ignoram as politicas de seguranca das tabelas; e o PostgREST publica todas
-- em /rpc/<nome> para quem tiver a chave publica do projeto, que e publica por
-- definicao e viaja dentro do pacote do navegador.
--
-- Testado em transacao desfeita, como `anon`:
--
--   pessoas_sem_familia_sobrenome_conhecido   devolveu 50 NOMES de pessoas
--   gov_alertas                               devolveu 3 linhas
--   pgm_resumo_geral                          devolveu 1 linha
--   vincular_pessoa_familia                   EXECUTOU (vincula pessoa a familia)
--   fiscal_marcar_atrasados                   EXECUTOU (altera obrigacoes)
--   fin_recalc_saldo_conta                    EXECUTOU (altera saldo)
--
-- O vazamento de nomes e o mais grave: sao dados pessoais de membros da igreja,
-- entregues a qualquer um, num sistema que tem modulo de LGPD.
--
-- NAO E UM DEFEITO DE QUEM ESCREVEU ESSAS FUNCOES. O Supabase define
-- privilegios padrao que concedem EXECUTE de toda funcao nova do schema public
-- a anon, authenticated e service_role. Toda funcao criada nasce assim, em
-- silencio, e nenhum `revoke ... from public` alcanca esse grant — ele e
-- direto, e nao herdado de PUBLIC. Foi assim que descobri: a funcao
-- registrar_contato, que eu mesmo criei ontem com revoke de PUBLIC, aparecia
-- com anon=X na lista de permissoes.
--
-- Algumas funcoes ja se defendiam por dentro — fn_listar_acessos_sistema
-- responde "Acesso negado: apenas administradores". Mas depender disso e
-- depender de cada autor lembrar; o privilegio nao deveria estar la.
--
-- ---------------------------------------------------------------------------
-- O QUE CONTINUA PUBLICO, E POR QUE
--
-- Quatro funcoes SAO chamadas antes do login e precisam continuar assim.
-- Levantadas lendo as telas das rotas publicas, uma a uma:
--
--   solicitar_reset_senha   /esqueci-senha
--   validar_convite         /convite/:token e /reset/:token
--   aceitar_convite         /convite/:token
--   redefinir_senha         /reset/:token
--
-- Quem nao fez login precisa poder pedir recuperacao de senha e aceitar um
-- convite — sao justamente as portas de entrada.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- TIRAR DE `anon` NAO BASTA — E ISSO QUASE PASSOU DESPERCEBIDO
--
-- A primeira versao desta migracao fazia `REVOKE ... FROM anon` e o ensaio
-- mostrou 105 das 108 funcoes AINDA executaveis por anon. A lista de
-- permissoes explica:
--
--   {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/..., ...}
--    ^^^^^^^^^^^
--
-- A primeira entrada, sem nome de papel antes do "=", e o grant a PUBLIC. As
-- funcoes tem os DOIS: um grant direto a anon E um a PUBLIC. Tirar o de anon
-- deixa o de PUBLIC intacto, e anon faz parte de PUBLIC — entao nada muda.
--
-- A migracao teria sido aplicada sem erro, o log diria "revogadas: 104", e o
-- furo continuaria aberto. Foi o ensaio com contagem depois do revoke que
-- pegou; o RAISE NOTICE sozinho teria mentido.
--
-- Por isso a ordem correta e: tirar de PUBLIC e de anon, e devolver
-- explicitamente a quem precisa.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  f record;
  permitidas text[] := ARRAY[
    'solicitar_reset_senha',
    'validar_convite',
    'aceitar_convite',
    'redefinir_senha'
  ];
  n int := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura, p.proname
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef = true
       AND p.prorettype <> 'trigger'::regtype
       AND NOT (p.proname = ANY (permitidas))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   f.assinatura);
    -- Devolvido explicitamente: e por authenticated que o aplicativo chama, e
    -- service_role e usado por rotinas de servidor.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'ajustadas % funcoes SECURITY DEFINER', n;
END
$$;

-- Impede que a proxima funcao criada nasca com o mesmo furo. Sem isto, o
-- privilegio padrao volta a conceder na primeira migracao escrita depois desta.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
