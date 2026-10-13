-- DESFAZER a migration 20261013110000. Só remove a view; nenhum dado muda (o aplicativo continua calculando o estado pela lib, como antes).
DROP VIEW IF EXISTS public.vw_fin_ciclo;
