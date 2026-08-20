-- ---------------------------------------------------------------------------
-- O gatilho de carga para de mentir
-- ---------------------------------------------------------------------------
--
-- `fn_atualizar_carga_voluntario` roda a cada escala confirmada e mantem
-- sozinho a carga do mes, o nivel de sobrecarga, a data da ultima escala e o
-- total. E a peca que faz a barra de carga do painel ser real.
--
-- Encontrados dois defeitos ao rodar o ciclo completo pela primeira vez, na
-- Sprint 4. Os dois corrompem exatamente os numeros que o painel mostra e que
-- o motor de sugestoes usa para pontuar.
--
-- ── 1. A PRIMEIRA ESCALA MARCAVA A PESSOA COMO SOBRECARREGADA ──────────────
--
-- Medido: Ana Cristina, primeira escala da vida, saiu com
--
--   carga 1 de 4, sobrecarga 10 de 10
--
-- A formula é LEAST(10, ROUND(total / max * 10)). Com max = 4 e total = 1 ela
-- da 3. Para dar 10 seria preciso max = 1.
--
-- E era: a busca do teto e
--
--   SELECT COALESCE(max_escalas_mes, 4) INTO v_max_mes
--   FROM perfil_servico WHERE pessoa_id = NEW.pessoa_id;
--
-- O COALESCE protege contra a COLUNA nula, nao contra a LINHA ausente. Quem
-- ainda nao tem perfil de servico nao devolve linha nenhuma, `v_max_mes` fica
-- NULL, e `GREATEST(NULL, 1)` no Postgres ignora o NULL e devolve 1. Divide
-- por 1: sobrecarga 10.
--
-- O estrago nao e cosmetico. `nivel_sobrecarga` vale -3 pontos por ponto no
-- score do motor: a pessoa perdia 30 pontos e ganhava o motivo "Carga elevada
-- — revisao pastoral recomendada" por ter servido UMA vez. E ate hoje isso
-- nunca apareceu porque nunca houve uma escala.
--
-- ── 2. `total_escalas` CONTAVA DUAS VEZES ──────────────────────────────────
--
-- O gatilho dispara em INSERT **e** em UPDATE OF status, e fazia
-- `total_escalas = total_escalas + 1` nos dois casos. No fluxo natural do
-- modelo — pendente -> confirmado -> presente — a mesma escala incrementa
-- duas vezes.
--
-- Trocado por recontagem: `total_escalas` passa a ser um COUNT do que
-- realmente existe. Alem de nao inflar mais, isso CORRIGE sozinho qualquer
-- inflacao ja acumulada na proxima vez que a pessoa for escalada.
--
-- ── O QUE NAO MUDOU ────────────────────────────────────────────────────────
--
-- `ultima_escala_em = CURRENT_DATE` continua como esta, e vale registrar por
-- que: ele carimba o dia da CONFIRMACAO, nao o dia do evento. Numa escala
-- montada com antecedencia, "ultima escala" fica sendo o dia em que o lider
-- clicou.
--
-- Nao mexo agora porque o motor de sugestoes NAO usa essa coluna — ele
-- calcula a ultima escala com `max(e.data_evento)` direto de
-- `escala_voluntarios`, que esta certo. Quem usa a coluna e a view
-- `v_voluntarios_completo`, no painel. Sao dois numeros com o mesmo nome e
-- definicoes diferentes, e unifica-los e decisao de produto: vale mais "quando
-- serviu" ou "quando confirmou"? Fica registrado para a Sprint 5.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_atualizar_carga_voluntario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
DECLARE
  v_mes_inicio DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_mes_fim    DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  v_total_mes  INT;
  v_max_mes    INT;
  v_sobrecarga INT;
  v_area       UUID;
BEGIN
  -- Escalas do mês atual para esta pessoa
  SELECT count(*) INTO v_total_mes
  FROM escala_voluntarios ev
  JOIN escalas e ON e.id = ev.escala_id
  WHERE ev.pessoa_id = NEW.pessoa_id
    AND ev.status NOT IN ('recusado')
    AND e.data_evento BETWEEN v_mes_inicio AND v_mes_fim;

  -- O teto. O COALESCE de fora é o que faltava: sem linha em perfil_servico,
  -- o SELECT INTO deixa v_max_mes NULL, e GREATEST(NULL,1) vira 1.
  SELECT max_escalas_mes INTO v_max_mes
  FROM perfil_servico WHERE pessoa_id = NEW.pessoa_id;
  v_max_mes := COALESCE(v_max_mes, 4);

  v_sobrecarga := LEAST(10, GREATEST(0, ROUND((v_total_mes::NUMERIC / GREATEST(v_max_mes, 1)) * 10)));

  INSERT INTO public.perfil_servico (pessoa_id, carga_atual_mes, nivel_sobrecarga)
  VALUES (NEW.pessoa_id, v_total_mes, v_sobrecarga)
  ON CONFLICT (pessoa_id) DO UPDATE
    SET carga_atual_mes  = v_total_mes,
        nivel_sobrecarga = v_sobrecarga,
        updated_at       = now();

  -- `total_escalas` por RECONTAGEM, e não por incremento.
  --
  -- O incremento cego contava duas vezes no fluxo pendente -> confirmado ->
  -- presente, porque o gatilho dispara nos dois. A recontagem também corrige
  -- sozinha qualquer inflação já acumulada.
  SELECT e.area_id INTO v_area FROM escalas e WHERE e.id = NEW.escala_id;

  IF v_area IS NOT NULL THEN
    UPDATE public.area_voluntarios av
    SET ultima_escala_em = CURRENT_DATE,
        total_escalas = (
          SELECT count(*)
          FROM escala_voluntarios ev2
          JOIN escalas e2 ON e2.id = ev2.escala_id
          WHERE ev2.pessoa_id = NEW.pessoa_id
            AND e2.area_id = v_area
            AND ev2.status IN ('confirmado','presente')
        )
    WHERE av.membro_id = NEW.pessoa_id
      AND av.area_id = v_area;
  END IF;

  RETURN NEW;
END;
$function$;
