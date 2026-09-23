-- ─── fin_contas — saldo_atual não seguia saldo_inicial ao editar a conta ──
--
-- BUG CRÍTICO DE CONFIABILIDADE (23/09/2026), achado pela Telma: "altero o
-- saldo inicial da Caixinha Administrativo e o saldo exibido não muda".
--
-- CAUSA RAIZ, medida direto no catálogo do banco antes de escrever
-- qualquer linha: `fin_contas.saldo_atual` é mantido por UM gatilho só,
-- `fin_lanc_saldo`, em CIMA DE `fin_lancamentos` (dispara a cada
-- lançamento gravado). `fin_contas` em si NUNCA teve gatilho nenhum — só
-- existia `fin_recalc_saldo_conta(conta_id)`, a função que faz a conta de
-- verdade (`saldo_inicial + soma de entradas/saídas realizadas`), chamada
-- SÓ pelo lado de `fin_lancamentos`. Editar `saldo_inicial` pela tela
-- (`ContaForm.tsx` → `atualizarConta()`) grava a coluna certinho — o medo
-- dela de "não estar salvando" não se confirmou — mas nada disparava um
-- recálculo, então `saldo_atual` ficava travado no valor de antes até o
-- PRÓXIMO lançamento daquela conta (que podia nunca vir).
--
-- Já tínhamos pego ESTE MESMO defeito uma vez (13/09/2026, comentário em
-- `omieImportService.ts`: Caixa de Envelopes mostrando -R$928 por causa da
-- ordem lançamento-antes-do-saldo-inicial) — mas o conserto daquela vez
-- foi só no import da Omie, um curativo num chamador, não a causa raiz.
-- Ela voltou a aparecer agora em outra conta, editando pela tela normal —
-- prova de que o defeito nunca tinha sido fechado de verdade.
--
-- CONFERIDO ao vivo ANTES desta migration, comparando `saldo_atual`
-- armazenado com `saldo_inicial + lançamentos` calculado na hora, pras 5
-- contas reais:
--   Bradesco               armazenado R$    1,00 = devido R$    1,00  OK
--   Caixa de Envelopes     armazenado R$    0,00 = devido R$    0,00  OK
--   Cartão de Crédito      armazenado R$    0,00 = devido R$    0,00  OK
--   Caixa de Aplicação     armazenado R$2.994,61 ≠ devido R$    0,00  ERRADO
--   Caixinha Administrativo armazenado R$2.317,46 ≠ devido R$    0,00  ERRADO
--
-- CORREÇÃO, em duas partes:
--
-- 1) Gatilho novo em `fin_contas`, espelhando o padrão já usado em
--    `fin_lanc_saldo` — dispara em INSERT (conta nova com saldo inicial
--    diferente de zero — mesmo defeito, `saldo_atual` nasce em 0 pelo
--    DEFAULT da coluna, não em `saldo_inicial`) e em UPDATE OF
--    saldo_inicial (o caso que ela achou). Reaproveita
--    `fin_recalc_saldo_conta`, a MESMA função de sempre — nenhuma fórmula
--    nova, só o gatilho que faltava no lado de `fin_contas`.
--
-- 2) Recalcula as 2 contas que JÁ estão erradas em produção agora — não é
--    um valor novo inventado, é rodar a própria função oficial do sistema
--    sobre o `saldo_inicial` que já está gravado, pra saldo_atual voltar
--    a bater com ele.
CREATE OR REPLACE FUNCTION public.fin_contas_recalc_saldo_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  perform public.fin_recalc_saldo_conta(new.id);
  return null;
end;
$function$;

CREATE TRIGGER fin_contas_saldo_inicial
  AFTER INSERT OR UPDATE OF saldo_inicial ON public.fin_contas
  FOR EACH ROW EXECUTE FUNCTION public.fin_contas_recalc_saldo_trigger();

COMMENT ON TRIGGER fin_contas_saldo_inicial ON public.fin_contas IS
  'Mantém saldo_atual em dia quando saldo_inicial muda (edição de conta) ou quando uma conta nasce com saldo_inicial != 0. Par do gatilho fin_lanc_saldo, que cobre o lado de fin_lancamentos.';

-- Backfill das 2 contas já divergentes — mesma função, sem valor
-- inventado.
SELECT public.fin_recalc_saldo_conta(id) FROM public.fin_contas;
