-- ─── Sincronização de centros de custo passa a criar só ministério ─────────
--
-- Pedido da Telma (13-15/09/2026): manter `fin_centros_custo` só com o que
-- está nos 4 relatórios trimestrais oficiais (Plano de Contas Oficial — ver
-- docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md) — 11 ministérios + 5
-- subgrupos de Administração. Os passos 2-5 de `fin_seed_centros_custo()`
-- (área / classe EBD / grupo PGM / campanha) criavam automaticamente um
-- eixo OPERACIONAL diferente (quem gastou, não como o gasto se classifica
-- contabilmente) — não é lixo de teste digitado à mão, é um recurso que já
-- rodou de verdade (~19 centros criados), mas que ela decidiu não usar.
--
-- Sem esta migration, apagar manualmente esses ~19 centros pela tela nova
-- (Configurações financeiras → Centros de custo, 13/09/2026) não resolveria
-- nada: o botão "Sincronizar com ministérios" em `/financas/centro` chama
-- esta MESMA função, que lê direto das tabelas reais (`areas`,
-- `ebd_classes`, `pgm_grupos`, `ebd_campanhas`, todas ainda ativas) e
-- recriaria os centros apagados no próximo clique.
--
-- O que muda: a função fica só com o passo 1 (ministérios). Passos 2-5
-- REMOVIDOS, não comentados — comentar deixaria código morto que alguém
-- reativaria sem entender por quê. O porquê fica registrado aqui e a
-- versão original (histórica) em `Financeiro_F7_CentrosCusto.sql`, fora
-- deste repositório.
--
-- Conferido antes de escrever esta migration: `pg_get_functiondef` na
-- função ao vivo bate, palavra por palavra (fora formatação), com o
-- arquivo `Financeiro_F7_CentrosCusto.sql` — nenhuma migration deste
-- repositório havia alterado a função desde a criação original.
--
-- Alternativa descartada: apagar os ~19 centros e deixar a função como
-- está, só avisando pra nunca clicar em "Sincronizar". Rejeitada — depende
-- de ninguém esquecer, e o botão continua ali convidando o erro.

BEGIN;

CREATE OR REPLACE FUNCTION public.fin_seed_centros_custo()
 RETURNS TABLE(criados integer, ja_existiam integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_criados int := 0;
  v_existiam int := 0;
  rec record;
begin
  -- 1) Ministérios → centro raiz
  for rec in select id, nome from public.ministerios where ativo loop
    if not exists (
      select 1 from public.fin_centros_custo
      where vinculo_tipo = 'ministerio' and vinculo_id = rec.id
    ) then
      insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome)
      values ('Min. ' || rec.nome, 'ministerio', rec.id, rec.nome);
      v_criados := v_criados + 1;
    else
      v_existiam := v_existiam + 1;
    end if;
  end loop;

  return query select v_criados, v_existiam;
end;$function$;

COMMIT;
