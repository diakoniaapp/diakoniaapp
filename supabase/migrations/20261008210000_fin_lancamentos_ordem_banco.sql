-- ─── A ordem do extrato do BANCO, guardada em cada lançamento (`ordem_banco`) ─────────────────────────────────────────────────────────────
-- Pedido (08/10/2026): "o extrato do sistema na mesma sequência do extrato do banco — conferir linha por linha, dia por dia". O sistema ordenava por
-- data → entrada antes de saída → created_at → id; dentro do mesmo tipo isso é arbitrário. O banco (OFX e PDF) traz a sequência certa de cada dia;
-- aqui se guarda a POSIÇÃO da linha dentro do dia (1 = a primeira) no lançamento a que ela corresponde. Quem preenche é a sincronização do app
-- (mesmo pareamento banco × sistema da Auditoria do Extrato); sem preenchimento, nada muda: o extrato segue a regra de sempre.
--
-- 1) coluna `ordem_banco` (aditiva, opcional).
-- 2) `fin_gravar_ordem_banco(jsonb)`: grava a ordem de centenas de lançamentos numa chamada, SEM contornar a RLS (security invoker). Devolve
--    {alvos, alterados}: `alvos` = quantos dos ids enviados a pessoa conseguiu enxergar (menos que os enviados = a RLS barrou), `alterados` = quantos mudaram.
-- 3) `fin_atualiza_saldo`: o UPDATE só recalcula o saldo da conta quando muda algo que MEXE no saldo (status, valor, tipo, conta). Antes, QUALQUER edição
--    de um lançamento realizado/conciliado (observação, categoria, ordem…) refazia a soma da conta inteira — gravar a ordem de 400 linhas seriam 400
--    varreduras do Bradesco. O saldo é saldo_inicial + Σ(realizado/conciliado, por tipo e valor): data, descrição, categoria e ordem não entram nele.
-- Reversível: DROP FUNCTION fin_gravar_ordem_banco; ALTER TABLE fin_lancamentos DROP COLUMN ordem_banco; e a função anterior de fin_atualiza_saldo
-- (docs/ORDEM_DO_EXTRATO_ROLLBACK.sql).
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS ordem_banco integer;
COMMENT ON COLUMN public.fin_lancamentos.ordem_banco IS 'Posição da linha dentro do dia no extrato do BANCO (1 = primeira). Preenchida pela sincronização com o OFX/PDF; null = ainda sem extrato para comparar.';

CREATE OR REPLACE FUNCTION public.fin_gravar_ordem_banco(p_itens jsonb) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE alvos integer; alterados integer;
BEGIN
  IF jsonb_typeof(p_itens) <> 'array' THEN RAISE EXCEPTION 'Informe uma lista de {id, ordem}.'; END IF;
  WITH it AS (SELECT (x->>'id')::uuid AS id, (x->>'ordem')::integer AS ordem FROM jsonb_array_elements(p_itens) x),
       vis AS (SELECT count(*) AS c FROM it JOIN public.fin_lancamentos l ON l.id = it.id),
       up AS (UPDATE public.fin_lancamentos l SET ordem_banco = it.ordem
                FROM it WHERE l.id = it.id AND l.ordem_banco IS DISTINCT FROM it.ordem
              RETURNING 1)
  SELECT (SELECT c FROM vis), (SELECT count(*) FROM up) INTO alvos, alterados;
  RETURN jsonb_build_object('alvos', alvos, 'alterados', alterados);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_gravar_ordem_banco(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_gravar_ordem_banco(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_atualiza_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status in ('realizado','conciliado') then
      perform public.fin_recalc_saldo_conta(new.conta_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.status in ('realizado','conciliado') or new.status in ('realizado','conciliado'))
       and (old.status is distinct from new.status or old.valor is distinct from new.valor
            or old.tipo is distinct from new.tipo or old.conta_id is distinct from new.conta_id) then
      perform public.fin_recalc_saldo_conta(new.conta_id);
      if old.conta_id <> new.conta_id then
        perform public.fin_recalc_saldo_conta(old.conta_id);
      end if;
    end if;
  else -- DELETE
    if old.status in ('realizado','conciliado') then
      perform public.fin_recalc_saldo_conta(old.conta_id);
    end if;
  end if;
  return null;
end;$function$;
