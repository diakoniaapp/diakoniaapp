-- ─── Alerta pontual — visitante esfriando ────────────────────────────────
--
-- Top 10 #6 da Bússola do Diakonia, o único item da lista sem "feito":
-- "É a única fila do sistema com prazo de validade real — visitante não
-- procurado não volta, e hoje nada avisa antes de já ser tarde." Fase 4
-- (Automação) previa isso como "alerta pontual", de propósito represado
-- até o resumo semanal ser validado — já foi: duas sextas seguidas
-- (11/09, 18/09) rodando sozinhas, mais a expansão a pastor/secretaria/
-- tesouraria (22/09).
--
-- ── PONTUAL, NÃO CADÊNCIA: A DIFERENÇA QUE IMPORTA ────────────────────────
--
-- O resumo semanal soma um NÚMERO ("6 visitantes sem contato") toda
-- sexta, não importa se são os mesmos 6 de sábado passado. Um alerta
-- pontual avisa da PESSOA, uma vez só, no dia em que ela esfria — repetir
-- o aviso todo dia enquanto ninguém agir vira ruído que ensina a ignorar
-- (mesmo raciocínio já registrado no widget `AcoesHoje`: "boa notícia
-- repetida todo dia vira ruído").
--
-- `membros.esfriando_alertado_em` guarda QUANDO o aviso saiu pela ÚLTIMA
-- vez pra essa pessoa. Um contato registrado DEPOIS desse carimbo reseta o
-- relógio — se a pessoa esfriar de novo depois de um contato, é uma
-- pendência NOVA, não a mesma, e merece aviso de novo.
ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS esfriando_alertado_em timestamptz;

COMMENT ON COLUMN public.membros.esfriando_alertado_em IS
  'Quando o alerta pontual de "visitante esfriando" foi enviado pela última vez pra esta pessoa. Contato registrado depois deste carimbo reseta — a pessoa pode ser alertada de novo se esfriar outra vez. Só faz sentido pra tipo_pessoa=visitante.';

-- Quem esfriou e AINDA não foi avisado desta vez (ou nunca foi). Mesma
-- régua de `precisaAcao()` (lib/visitantesFluxo.ts): sem contato há mais
-- de 2 dias.
CREATE OR REPLACE FUNCTION public.visitantes_esfriando_novos()
RETURNS TABLE(id uuid, nome_completo text, telefone_celular text, dias_sem_contato int, ultimo_contato_em timestamptz, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.nome_completo, m.telefone_celular,
    floor(extract(epoch from (now() - COALESCE(m.ultimo_contato_em, m.created_at))) / 86400)::int,
    m.ultimo_contato_em, m.created_at
  FROM membros m
  WHERE m.tipo_pessoa = 'visitante'
    AND m.status = 'ativo'
    AND (m.ultimo_contato_em IS NULL OR m.ultimo_contato_em < now() - interval '2 days')
    AND (m.esfriando_alertado_em IS NULL OR m.esfriando_alertado_em < COALESCE(m.ultimo_contato_em, m.created_at))
  ORDER BY COALESCE(m.ultimo_contato_em, m.created_at) ASC;
$$;

-- Carimba quem acabou de ser avisado — chamada pela Edge Function logo
-- depois de mandar o e-mail, nunca antes (se o envio falhar, a pessoa
-- continua aparecendo em `visitantes_esfriando_novos()` na próxima
-- checagem, em vez de ficar silenciosamente esquecida).
CREATE OR REPLACE FUNCTION public.marcar_visitantes_alertados(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.membros
  SET esfriando_alertado_em = now()
  WHERE id = ANY(p_ids) AND tipo_pessoa = 'visitante';
$$;

REVOKE ALL ON FUNCTION public.visitantes_esfriando_novos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_visitantes_alertados(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visitantes_esfriando_novos() TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_visitantes_alertados(uuid[]) TO service_role;
