-- Pedido da Telma (22/09/2026): sugestão automática de Centro de Custo e
-- Subcentro ao escolher uma Categoria, aprendendo do histórico real — SEM
-- IA, SEM machine learning, SEM serviço de terceiro, e SEM exemplo fixo no
-- código (ela deu "Prebenda → Min. Pastoral", "Salários → Administração >
-- Pessoal" etc. como ILUSTRAÇÃO do que queria, não como regra pra copiar).
--
-- AUDITORIA (pedida explicitamente, feita antes de escrever qualquer
-- linha): mapeei categoria → centro mais usado em toda a produção.
-- Primeiro achado, medido: a MAIORIA dos 13.158 lançamentos realizados/
-- conciliados não tem `centro_custo_id` nenhum (ex.: Prebenda só tem
-- centro em 14 dos 114; Salários em 4 dos 99). Olhar a frequência
-- contando os vazios não revela padrão nenhum — só reflete que centro de
-- custo é opcional. Refeita a conta olhando só quem JÁ tem centro
-- escolhido (508 lançamentos, fora transferência): aí sim aparece padrão
-- em 31 categorias, incluindo bate exato com o que ela descreveu —
-- "Salários" 4/4 pra "Administração · Pessoal", "Dizimos" 85/85 pra
-- "Min. Administração" — e alguns que NÃO batem com o exemplo dela:
-- "Energia Elétrica" e "Água e Esgoto" vão pra "Administração ·
-- Infraestrutura" no histórico real, não "Patrimônio"; "Software e
-- Sistemas" tem maioria em "Min. Música" (7 de 9 — amostra pequena,
-- provavelmente um lançamento específico puxando a média, não uma regra).
-- Isso é o motivo de existir a Prioridade 1 abaixo: quando o histórico é
-- pequeno ou ambíguo, ela cadastra o padrão que QUER na tela de
-- Categoria, sem depender da estatística.
--
-- Estrutura da sugestão (sem tabela nova — os dados já existem):
-- `fin_centros_custo` já é auto-referenciada (`centro_pai_id`); um
-- "Centro" é uma linha com `centro_pai_id` nulo, um "Subcentro" é uma
-- linha com `centro_pai_id` apontando pro centro. Uma única coluna
-- `centro_custo_padrao_id` (podendo apontar pra qualquer um dos dois
-- níveis) já cobre "Centro: Min. Pastoral, Subcentro: (vazio)" e "Centro:
-- Administração, Subcentro: Tecnologia" ao mesmo tempo — é exatamente o
-- mesmo desenho que `fin_fornecedores.centro_custo_padrao_id` já usa
-- desde 15/09/2026 pro par Fornecedor → Categoria/Centro padrão; este
-- migration é o mesmo mecanismo um nível acima, Categoria → Centro
-- padrão.

alter table public.fin_categorias
  add column if not exists centro_custo_padrao_id uuid references public.fin_centros_custo(id) on delete set null;

-- Converte a regra fixa da migration anterior (20260922050000: "Dizimos"/
-- "Ofertas" sempre sugeriam "Min. Administração", hardcoded na função)
-- pra CADASTRO — é o mecanismo genérico que a substitui. Continua
-- editável dali em diante, como qualquer categoria, pela tela.
update public.fin_categorias c
set centro_custo_padrao_id = cc.id
from public.fin_centros_custo cc
where c.nome in ('Dizimos', 'Ofertas')
  and cc.nome = 'Min. Administração'
  and cc.ativo
  and c.centro_custo_padrao_id is null;

-- Reescreve a sugestão: 1º cadastro na categoria, 2º histórico de USO
-- REAL (nunca conta os lançamentos sem centro — ver auditoria acima), 3º
-- nada. Removida a exceção hardcoded de Dizimos/Ofertas (virou dado, na
-- UPDATE acima) e removida a janela de 180 dias do histórico: medido que
-- 340 dos 508 lançamentos com centro preenchido caem nela — com amostra
-- já pequena por categoria, uma janela menor derruba ainda mais sem
-- ganho (a lista de centros de custo em si não muda com frequência).
CREATE OR REPLACE FUNCTION public.fin_sugerir_centro_por_categoria(p_categoria_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select coalesce(
    -- 1º: padrão cadastrado na categoria (tela de Categoria Financeira).
    (select c.centro_custo_padrao_id from public.fin_categorias c where c.id = p_categoria_id),
    -- 2º: centro mais usado nesta categoria, entre os lançamentos que já
    -- tiveram um centro escolhido (exclui `vinculo_tipo='geral'` — centro
    -- catch-all, não é uma sugestão útil; exclui transferência, que
    -- estruturalmente não tem categoria).
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
