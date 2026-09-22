-- ─── alerta pontual: ata de reunião atrasada ─────────────────────────────
--
-- Top 10 da Bússola do Diakonia não numera este item à parte, mas o
-- card de papel da Secretaria (seção 2) e o roadmap de 12 meses (seção
-- 12) citam os três alertas pontuais juntos: "visitante esfriando, ata
-- atrasada, aluno ausente por 2 domingos". O primeiro já tem infra
-- pronta (`visitantes_esfriando_novos`, 22/09/2026). Este cobre o
-- segundo.
--
-- MEDIDO antes de construir: `gov_alertas()` (RPC já existente) cobre 5
-- tipos de alerta de governança, mas NENHUM deles é "ata atrasada" — e
-- `alertasGovernanca()`, o wrapper em `governancaService.ts` que a
-- chama, não é consumido por nenhuma tela (grep confirmado). O único
-- lugar do produto que já enxerga isso é `PainelSecretaria.tsx`, via
-- `carregarPainelSecretaria()`: conta reuniões `concluida` com
-- `ata_url IS NULL`, SEM corte de tempo — aparece 1 desde o primeiro
-- dia que a reunião termina, junto com pauta em rascunho.
--
-- Este alerta pontual é mais estreito de propósito: só depois de 7 dias
-- (o número do próprio card de papel da Secretaria na Bússola), e só
-- uma vez por reunião — não repete o aviso toda vez que a Edge Function
-- rodar, mesma lógica de `esfriando_alertado_em`. A contagem sem corte
-- de tempo do Painel da Secretaria continua existindo do jeito que
-- está; este alerta não a substitui, só soma um empurrão quando a
-- pendência já passou do razoável.
--
-- Igual ao alerta de visitante: constrói a infraestrutura, NÃO agenda
-- cron nenhum. Combinado com ela (22/09/2026): nenhum alerta dispara de
-- verdade enquanto o resumo semanal ainda está em validação.
ALTER TABLE public.gov_reunioes
  ADD COLUMN IF NOT EXISTS ata_alertada_em timestamptz;

COMMENT ON COLUMN public.gov_reunioes.ata_alertada_em IS
  'Quando o alerta pontual de "ata atrasada" avisou sobre esta reunião. '
  'Null = nunca avisado. Uma vez marcado, não avisa de novo para a mesma '
  'reunião — se a ata for lançada depois, a reunião some da consulta de '
  'qualquer forma (ata_url deixa de ser null) e a marca fica só como '
  'histórico de que já foi avisado uma vez.';

CREATE OR REPLACE FUNCTION public.atas_atrasadas_novas()
RETURNS TABLE(
  id uuid,
  titulo text,
  tipo gov_reuniao_tipo,
  data_reuniao date,
  dias_sem_ata integer,
  secretaria_nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.titulo, r.tipo, r.data_reuniao,
    (current_date - r.data_reuniao)::integer AS dias_sem_ata,
    r.secretaria_nome
  FROM public.gov_reunioes r
  WHERE r.status = 'concluida'
    AND r.ata_url IS NULL
    AND r.data_reuniao < current_date - interval '7 days'
    AND r.ata_alertada_em IS NULL
  ORDER BY r.data_reuniao;
$$;

REVOKE ALL ON FUNCTION public.atas_atrasadas_novas() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.atas_atrasadas_novas() TO service_role;

CREATE OR REPLACE FUNCTION public.marcar_atas_alertadas(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.gov_reunioes
  SET ata_alertada_em = now()
  WHERE id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.marcar_atas_alertadas(uuid[]) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atas_alertadas(uuid[]) TO service_role;
