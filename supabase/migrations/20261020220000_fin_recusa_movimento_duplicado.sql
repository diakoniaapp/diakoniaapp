-- ─── O banco recusa o lançamento do extrato que JÁ existe sob outro identificador do banco ──────────────────────────────────────────────────────────
-- Decisão dela (20/10/2026): "Gatilho de proteção no banco". Complementa a guarda que já vive em `registrarLote` (código) — esta vale para QUALQUER tela
-- ou script que grave um movimento do OFX, inclusive uma versão antiga do app ainda aberta no celular.
--
-- ── O DEFEITO (medido em 20/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O FITID do Bradesco muda a cada exportação (numera pela posição da linha no arquivo: o PIX de R$ 760 de 02/10 é N11D35 no arquivo de 08/10 e N10335 no de
-- 20/10). O índice único de `fin_extrato_vinculos` (conta + FITID) só barra o MESMO identificador; reimportar um arquivo que se sobrepõe ao anterior gravou 52
-- movimentos em duplicidade (12 saídas R$ 13.109,50 · 40 entradas R$ 19.039,68) e o saldo ficou R$ 8.745,78 acima do banco.
--
-- ── A REGRA ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Ao INSERIR um lançamento com marca [ofx:…] (origem importado_ofx ou transferencia), é recusado se já existe, na MESMA conta, um lançamento não previsto com o
-- mesmo sentido, o mesmo valor e o mesmo dia (dia do pagamento ou data), que tenha vínculo ATIVO com o banco por OUTRO identificador — a não ser que:
--   · a marca [motivo-novo:…] esteja no lançamento (a tesouraria disse "é outro pagamento", com o motivo — a tela exige isso quando há candidata);
--   · o vínculo do gêmeo seja RECENTE (menos de 4 horas): dois PIX iguais no mesmo dia, do MESMO arquivo, são confirmados em sequência e não se recusam
--     entre si. É também o limite desta proteção: reimportar um arquivo nas 4 horas seguintes ao anterior não é pego aqui (a guarda do código pega);
--   · o gêmeo seja uma obrigação ainda PREVISTA (essa é liquidada, não duplicada) ou só tenha marca do PDF do Invest Fácil.
-- O vínculo com o MESMO identificador continua sendo barrado por `fin_extrato_vinculos_ativo_idx` (20261013120000).
--
-- Nenhum dado existente é alterado. Se `fin_extrato_vinculos` não existir, a função deixa passar (nunca bloqueia por falta de tabela).
--
-- ORDEM DE USO (importa): 1) publicar o código (o app passa a mandar [motivo-novo:…] quando precisa); 2) aplicar esta migration.
-- Reversível: docs/RECUSA_DUPLICADO_ROLLBACK.sql (remove o gatilho e a função; nenhum lançamento muda).

CREATE OR REPLACE FUNCTION public.fin_recusa_movimento_duplicado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  novas  text[];
  dia    date := COALESCE(NEW.data_pagamento, NEW.data);
  janela interval := interval '4 hours';
  g      record;
BEGIN
  IF NEW.observacoes LIKE '%[motivo-novo:%' THEN RETURN NEW; END IF;
  IF to_regclass('public.fin_extrato_vinculos') IS NULL THEN RETURN NEW; END IF;

  novas := ARRAY(SELECT m FROM unnest(public.fin_marcas_do_extrato(NEW.observacoes)) AS m WHERE m NOT LIKE 'PDF:%');
  IF cardinality(novas) = 0 THEN RETURN NEW; END IF;

  SELECT l.id, l.descricao, l.data, l.valor, l.origem, v.fitid AS fitid_antigo INTO g
    FROM public.fin_lancamentos l
    JOIN public.fin_extrato_vinculos v ON v.lancamento_id = l.id AND v.desfeito_em IS NULL AND v.origem = 'ofx'
   WHERE l.conta_id = NEW.conta_id AND l.tipo = NEW.tipo AND l.valor = NEW.valor
     AND l.status <> 'previsto' AND l.id <> NEW.id
     AND (COALESCE(l.data_pagamento, l.data) = dia OR l.data = NEW.data)
     AND NOT EXISTS (
       SELECT 1 FROM public.fin_extrato_vinculos v2
        WHERE v2.lancamento_id = l.id AND v2.desfeito_em IS NULL
          AND (v2.fitid = ANY (novas) OR v2.vinculado_em > now() - janela))
   ORDER BY v.vinculado_em
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Este movimento do banco (%) já parece estar registrado: % — % de %, R$ % (lançamento %), ligado ao identificador %. O banco numera cada exportação de um jeito; uma cópia gerada por outro arquivo duplicaria o saldo.',
      novas[1], COALESCE(g.descricao, '(sem descrição)'), g.origem, to_char(g.data, 'DD/MM/YYYY'), g.valor::text, g.id, g.fitid_antigo
      USING HINT = 'Vincule a linha do extrato ao lançamento que já existe (botão "Vincular"); se for mesmo outro pagamento, informe o motivo na tela.',
            ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_recusa_duplicado ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_recusa_duplicado BEFORE INSERT ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.origem IN ('importado_ofx', 'transferencia') AND NEW.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_recusa_movimento_duplicado();
