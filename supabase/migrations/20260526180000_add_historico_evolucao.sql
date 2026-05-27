-- M3.5 — Histórico de evolução pastoral
-- Armazena as datas em que a pessoa foi promovida na jornada:
--   Visitante → Congregado → Membro
-- Preenchidos automaticamente pelo sistema ao clicar em "Promover"

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS data_congregado TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_membro     TIMESTAMPTZ;

COMMENT ON COLUMN public.membros.data_congregado IS 'Data em que a pessoa foi promovida para Congregado';
COMMENT ON COLUMN public.membros.data_membro     IS 'Data em que a pessoa foi promovida para Membro';
