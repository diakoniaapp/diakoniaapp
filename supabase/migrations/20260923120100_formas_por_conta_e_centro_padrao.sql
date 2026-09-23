-- ─── Formas por conta + hierarquia de centro de custo padrão ────────────
--
-- Fase 12, revisão de Formas por Conta e Centros de Custo Automáticos
-- (23/09/2026). Duas peças do mesmo pedido dela, uma migration só porque
-- as duas dependem do `cheque` acrescentado na migration anterior.
--
-- ── Formas por conta ──────────────────────────────────────────────────
-- MEDIDO antes de criar: `fin_contas` já tinha o precedente exato pro
-- tipo de regra ("esta conta aceita isto?") em `aceita_receitas`,
-- `aceita_despesas` etc. — mas todos em nível grosso (categoria de
-- movimento), nenhum em nível de FORMA. `LancamentoForm.tsx` é o ÚNICO
-- lugar do sistema que deixa escolher forma (conferido buscando em
-- components/financas e pages inteiros) — filtrar lá já cobre o
-- problema real que ela apontou ("qualquer conta aceita qualquer
-- forma").
--
-- Array, não 16 booleans (8 formas × 2 direções): um enum novo (como
-- este `cheque`, agora) nunca mais exige migration só pra abrir coluna.
-- `NULL` = "não configurado" = sem restrição — as 5 contas de produção
-- continuam exatamente como hoje, sem backfill nenhum.
ALTER TABLE public.fin_contas
  ADD COLUMN formas_entrada_permitidas fin_forma_pagamento[],
  ADD COLUMN formas_saida_permitidas   fin_forma_pagamento[],
  ADD COLUMN forma_entrada_padrao      fin_forma_pagamento,
  ADD COLUMN forma_saida_padrao        fin_forma_pagamento;

COMMENT ON COLUMN public.fin_contas.formas_entrada_permitidas IS
  'Formas de recebimento permitidas nesta conta. NULL = sem restrição (todas permitidas) — compatibilidade retroativa, sem backfill.';
COMMENT ON COLUMN public.fin_contas.formas_saida_permitidas IS
  'Formas de pagamento permitidas nesta conta. NULL = sem restrição (todas permitidas) — compatibilidade retroativa, sem backfill.';
COMMENT ON COLUMN public.fin_contas.forma_entrada_padrao IS
  'Forma sugerida automaticamente ao escolher esta conta num lançamento de entrada. NULL = nenhuma sugestão.';
COMMENT ON COLUMN public.fin_contas.forma_saida_padrao IS
  'Forma sugerida automaticamente ao escolher esta conta num lançamento de saída. NULL = nenhuma sugestão.';

-- ── Centro de custo padrão: acrescenta a hierarquia do fornecedor ───────
-- MEDIDO antes de mexer: `fin_sugerir_centro_por_categoria` já existia e
-- já implementava 2 dos 4 níveis pedidos (1º categoria padrão, 2º
-- histórico mais usado) — só faltava o 2º nível dela, "padrão do
-- fornecedor" (que `fin_fornecedores.centro_custo_padrao_id` já guarda,
-- também sem nenhuma tela usando pra isso). Parâmetro novo com DEFAULT
-- NULL — quem já chama a função com um argumento só continua funcionando
-- sem mudar nada.
CREATE OR REPLACE FUNCTION public.fin_sugerir_centro_por_categoria(
  p_categoria_id uuid,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select coalesce(
    -- 1º: padrão cadastrado na categoria (tela de Categoria Financeira).
    (select c.centro_custo_padrao_id from public.fin_categorias c where c.id = p_categoria_id),
    -- 2º: padrão cadastrado no fornecedor (tela de Fornecedor) — só entra
    -- se um fornecedor já foi escolhido no lançamento.
    (select f.centro_custo_padrao_id from public.fin_fornecedores f where f.id = p_fornecedor_id),
    -- 3º: centro mais usado nesta categoria, entre os lançamentos que já
    -- tiveram um centro escolhido (mesma regra de antes, intocada).
    (
      select l.centro_custo_id
      from public.fin_lancamentos l
      join public.fin_centros_custo cc on cc.id = l.centro_custo_id
      where l.categoria_id = p_categoria_id
        and l.centro_custo_id is not null
        and cc.vinculo_tipo <> 'geral'
        and l.status in ('realizado','conciliado')
        and l.origem <> 'transferencia'
      group by l.centro_custo_id
      order by count(*) desc
      limit 1
    )
  );
$function$;

-- ── O único valor que faltava dos 3 pedidos ("Dízimos" e "Ofertas" já
-- tinham "Min. Administração" cadastrado — conferido antes de mexer).
-- "Evangelismo e Missões" tem um subgrupo batizado exatamente pra isto
-- ("Evangelismo e Missões · Ofertas Missionárias") — usei o subcentro
-- específico, não o ministério inteiro, porque ela pediu "Centro/
-- Subcentro padrão" e o subcentro certo já existia pronto.
UPDATE public.fin_categorias
   SET centro_custo_padrao_id = 'fce184f5-46ff-4201-9778-f8576e06b418'
 WHERE nome = 'Ofertas para Missões';
