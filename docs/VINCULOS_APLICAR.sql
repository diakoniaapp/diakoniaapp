-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela. GRAVA: cria 1 tabela NOVA (fin_extrato_vinculos) com 1 linha por marca existente, 3 colunas vazias em fin_lancamentos,
-- 2 gatilhos e atualiza a view vw_fin_ciclo. NENHUM lançamento existente é alterado.
-- Idêntico a supabase/migrations/20261013120000_fin_extrato_vinculos_e_conferencia.sql. Pode rodar mais de uma vez. Para desfazer: docs/VINCULOS_ROLLBACK.sql.
-- ─── D4: o vínculo com a linha do banco vira REGISTRO (e a conferência humana ganha rastro) ──────────────────────────────────────────────────
-- Decisões dela (13/10/2026): (1) uma linha do extrato só pode pertencer a UMA despesa — o banco RECUSA a segunda ligação e diz qual despesa já a usa;
-- (2) o vínculo é mantido por GATILHO, para que nenhuma tela mude e qualquer tela futura herde a regra; (3) o PDF do Invest Fácil entra na mesma tabela, com
-- `origem` = 'pdf' (OFX = 'ofx'); (4) o vínculo é PATRIMÔNIO HISTÓRICO da despesa: não é apagado — quando a marca some ou a despesa é excluída, ele é FECHADO
-- (quem, quando, por quê) e continua registrado; reabrir uma despesa não o toca; (5) Conferida (ação humana) ≠ Conciliada (vínculo bancário válido).
--
-- Hoje o vínculo é um TEXTO em `observacoes` (`[ofx:FITID]`; `[ofx:PDF:…]` para o PDF). Medido em 13/10/2026: 336 marcas (308 OFX + 28 PDF), nenhuma chave repetida
-- na mesma conta, nenhuma linha com duas marcas. A marca continua sendo escrita por todas as telas — o gatilho a lê.
--
-- O que muda (nenhum lançamento existente é alterado; só nascem linhas numa tabela NOVA):
--   1. tabela `fin_extrato_vinculos`: conta + FITID únicos enquanto o vínculo estiver ATIVO (índice único parcial); guarda lancamento_id, obrigacao_id (a identidade da
--      despesa), origem, quem/quando vinculou e, se desfeito, quem/quando/por quê. Só LEITURA para o app (RLS); quem escreve é o gatilho (SECURITY DEFINER).
--   2. 3 colunas em `fin_lancamentos` (conferido_em, conferido_por, conferencia_nota), todas nulas nas linhas existentes — "Conferida" passa a ter rastro.
--   3. preenchimento inicial: uma linha na tabela para cada marca existente (vinculado_em = created_at do lançamento; a nota diz que é aproximado).
--   4. gatilhos em fin_lancamentos (inserir/atualizar + apagar): AFTER INSERT/UPDATE (abre/fecha vínculos conforme a marca; RECUSA a segunda ligação) e BEFORE DELETE (fecha os vínculos).
--   5. `vw_fin_ciclo` passa a ler o vínculo da tabela (mesmo resultado de hoje) e ganha 4 colunas no fim: conferido_em, conferido_por, vinculo_origem, vinculo_fitid.
-- Reversível: docs/VINCULOS_ROLLBACK.sql remove gatilhos e devolve a view anterior; por padrão MANTÉM a tabela e as colunas (o histórico não se perde).

-- ── 1) a tabela ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_extrato_vinculos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid NOT NULL REFERENCES public.fin_contas(id),
  fitid            text NOT NULL CHECK (btrim(fitid) <> ''),
  origem           text NOT NULL CHECK (origem IN ('ofx', 'pdf')),
  lancamento_id    uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,   -- some se a despesa for excluída; o registro fica (fechado)
  obrigacao_id     uuid,                                                           -- a identidade da despesa no momento da ligação (sem FK: é história)
  vinculado_em     timestamptz NOT NULL DEFAULT now(),
  vinculado_por    uuid,
  desfeito_em      timestamptz,
  desfeito_por     uuid,
  desfeito_motivo  text,
  nota             text,
  CHECK ((desfeito_em IS NULL) = (desfeito_motivo IS NULL))
);

-- uma linha do banco pertence a UMA despesa: único por conta + FITID enquanto o vínculo estiver ATIVO
CREATE UNIQUE INDEX IF NOT EXISTS fin_extrato_vinculos_ativo_idx ON public.fin_extrato_vinculos (conta_id, fitid) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS fin_extrato_vinculos_lancamento_idx ON public.fin_extrato_vinculos (lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_extrato_vinculos_obrigacao_idx ON public.fin_extrato_vinculos (obrigacao_id) WHERE obrigacao_id IS NOT NULL;

COMMENT ON TABLE public.fin_extrato_vinculos IS 'O vínculo entre uma despesa e a linha do banco (OFX ou PDF). Patrimônio histórico: nunca é apagado — ao sair a marca ou ser excluída a despesa, é FECHADO (desfeito_*). Única por conta+FITID enquanto ativo. Mantida por gatilho a partir da marca [ofx:…] em fin_lancamentos.observacoes.';

ALTER TABLE public.fin_extrato_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_extrato_vinculos_leitura ON public.fin_extrato_vinculos;
CREATE POLICY fin_extrato_vinculos_leitura ON public.fin_extrato_vinculos
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de INSERT/UPDATE/DELETE: o app não escreve aqui; só o gatilho (SECURITY DEFINER). O histórico não pode ser adulterado pela API.

-- ── 2) a conferência humana ganha rastro ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS conferido_em     timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por    uuid,
  ADD COLUMN IF NOT EXISTS conferencia_nota text;
COMMENT ON COLUMN public.fin_lancamentos.conferido_em IS 'Quando alguém conferiu o lançamento à mão (Conferida ≠ Conciliada: a conciliação exige vínculo com o banco). Nulo no histórico.';
COMMENT ON COLUMN public.fin_lancamentos.conferido_por IS 'Quem conferiu à mão.';

-- ── 3) preenchimento inicial: uma linha para cada marca existente ─────────────────────────────────────────────────
-- (antes do gatilho existir: não há nada a recusar; ON CONFLICT DO NOTHING só por segurança — o ensaio confere que entraram TODAS)
INSERT INTO public.fin_extrato_vinculos (conta_id, fitid, origem, lancamento_id, obrigacao_id, vinculado_em, vinculado_por, nota)
SELECT l.conta_id, m.fitid, CASE WHEN m.fitid LIKE 'PDF:%' THEN 'pdf' ELSE 'ofx' END, l.id, COALESCE(l.obrigacao_id, l.id),
       COALESCE(l.created_at, now()), l.audit_user_id,
       'Preenchido a partir da marca [ofx:…] que já existia (migration 20261013120000); a data é a da criação do lançamento — aproximada.'
  FROM public.fin_lancamentos l
 CROSS JOIN LATERAL (SELECT (regexp_matches(l.observacoes, '\[ofx:([^\]]+)\]', 'g'))[1] AS fitid) m
 WHERE l.observacoes LIKE '%[ofx:%'
ON CONFLICT DO NOTHING;

-- ── 4) os gatilhos ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_marcas_do_extrato(obs text) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $f$ SELECT COALESCE(array_agg(m[1]), '{}') FROM regexp_matches(COALESCE(obs, ''), '\[ofx:([^\]]+)\]', 'g') AS m $f$;

CREATE OR REPLACE FUNCTION public.fin_vinculos_apos_gravar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  novas text[] := fin_marcas_do_extrato(NEW.observacoes);
  f text; h record;
BEGIN
  -- fecha o que saiu: a marca foi retirada da observação (ou a despesa mudou de conta). O registro FICA, fechado.
  UPDATE public.fin_extrato_vinculos
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = 'A marca do extrato saiu da despesa (ou ela mudou de conta)'
   WHERE lancamento_id = NEW.id AND desfeito_em IS NULL AND (conta_id <> NEW.conta_id OR NOT (fitid = ANY (novas)));

  -- abre o que entrou — e RECUSA se a linha do banco já pertence a outra despesa
  FOREACH f IN ARRAY novas LOOP
    IF EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = NEW.conta_id AND v.fitid = f AND v.desfeito_em IS NULL AND v.lancamento_id = NEW.id) THEN
      CONTINUE;
    END IF;
    SELECT v.id, v.lancamento_id, v.vinculado_em, l.descricao, l.data, l.valor, l.status INTO h
      FROM public.fin_extrato_vinculos v LEFT JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
     WHERE v.conta_id = NEW.conta_id AND v.fitid = f AND v.desfeito_em IS NULL
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Esta linha do banco (%) já está ligada a outra despesa: % — % de %, R$ % (lançamento %). Uma linha do extrato só pode pertencer a uma despesa.',
        f, COALESCE(h.descricao, '(sem descrição)'), COALESCE(h.status::text, '?'), to_char(h.data, 'DD/MM/YYYY'), COALESCE(h.valor::text, '?'), h.lancamento_id
        USING HINT = 'Desfaça o vínculo anterior (ou use a despesa que já está ligada) antes de ligar esta linha do banco a outra despesa.';
    END IF;
    INSERT INTO public.fin_extrato_vinculos (conta_id, fitid, origem, lancamento_id, obrigacao_id, vinculado_por)
    VALUES (NEW.conta_id, f, CASE WHEN f LIKE 'PDF:%' THEN 'pdf' ELSE 'ofx' END, NEW.id, COALESCE(NEW.obrigacao_id, NEW.id), auth.uid());
  END LOOP;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_vinculos_antes_de_apagar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- a despesa vai embora; o vínculo fica na história (a FK zera lancamento_id, o obrigacao_id e a linha do banco continuam registrados)
  UPDATE public.fin_extrato_vinculos
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = 'A despesa foi excluída (ou fundida a outra)'
   WHERE lancamento_id = OLD.id AND desfeito_em IS NULL;
  RETURN OLD;
END
$fn$;

-- (o WHEN de um gatilho de INSERT não pode olhar OLD: são dois gatilhos para a mesma função — só roda quando há marca, então o custo nas outras gravações é zero)
DROP TRIGGER IF EXISTS fin_lanc_vinculos_gravar ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_vinculos_inserir ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_vinculos_atualizar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_vinculos_inserir AFTER INSERT ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_apos_gravar();
CREATE TRIGGER fin_lanc_vinculos_atualizar AFTER UPDATE OF observacoes, conta_id ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.observacoes LIKE '%[ofx:%' OR OLD.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_apos_gravar();
DROP TRIGGER IF EXISTS fin_lanc_vinculos_apagar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_vinculos_apagar BEFORE DELETE ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_antes_de_apagar();

-- ── 5) vw_fin_ciclo lê o vínculo da tabela (mesmo resultado) e mostra a conferência ───────────────────────────────
-- (colunas novas só no FIM: CREATE OR REPLACE VIEW não aceita mudar nome, tipo ou ordem das existentes)
CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC
),
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo <> 'comprovante'
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
vinculos AS (
  SELECT DISTINCT ON (lancamento_id) lancamento_id, origem, fitid
    FROM public.fin_extrato_vinculos
   WHERE desfeito_em IS NULL AND lancamento_id IS NOT NULL
   ORDER BY lancamento_id, vinculado_em
),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (vc.lancamento_id IS NOT NULL) AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje,
         l.conferido_em, l.conferido_por, vc.origem AS vinculo_origem, vc.fitid AS vinculo_fitid
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    CROSS JOIN hoje h
   WHERE l.tipo = 'saida' AND l.origem <> 'transferencia'
),
fatos AS (
  SELECT b.*,
         (b.status IN ('realizado', 'conciliado')) AS paga,
         CASE WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;
