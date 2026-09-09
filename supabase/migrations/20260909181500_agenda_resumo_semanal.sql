-- ─── Agendamento do resumo semanal ──────────────────────────────────────
--
-- Fase 4 da Bússola do Diakonia. Chama a Edge Function `resumo-semanal`
-- toda sexta-feira às 18h de Brasília (21h UTC, sem horário de verão no
-- Brasil desde 2019) — antes do culto, tempo de agir sobre o que o resumo
-- apontar até domingo.
--
-- A função foi implantada com `--no-verify-jwt`: pg_cron chama via
-- `net.http_post` sem token nenhum, então não há chave nem secret pra
-- guardar aqui. Ver o cabeçalho de `supabase/functions/resumo-semanal/index.ts`
-- para o porquê dessa escolha e o que ela custa (a resposta da função nunca
-- devolve o conteúdo do resumo, por estar alcançável sem login).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'resumo-semanal',
  '0 21 * * 5',  -- sexta-feira, 21h UTC = 18h em Brasília
  $$
  SELECT net.http_post(
    url := 'https://prjoftmlkusbjoeptabp.supabase.co/functions/v1/resumo-semanal',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
