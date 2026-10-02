-- ─── Cores reais por Centro de Custo (migration de DADOS, não de schema) ──
--
-- Pedido dela (02/10/2026, evolução de UX da grade de lançamentos):
-- "permitir identificação rápida dos gastos apenas pela cor" — cada
-- centro-raiz com uma cor fixa, pra reconhecer de longe sem ler o texto.
--
-- Medido antes de escrever: a coluna `fin_centros_custo.cor` JÁ EXISTE —
-- não precisa de schema novo. Mas os 40 centros ativos tinham TODOS o
-- mesmo valor, "#888" — nunca foi diferenciada, e nenhuma tela do
-- sistema lia esse campo até agora (medido com grep em src/, zero
-- ocorrências de leitura de `centro.*cor`). É dado parado, não
-- funcionalidade faltando.
--
-- Os 11 centros-raiz (centro_pai_id is null) ganham cor própria; os 29
-- subcentros herdam a cor do pai (mesmo UPDATE, via self-join) — pra um
-- lançamento num subcentro mostrar a mesma cor do centro-mãe, sem o
-- front precisar subir a hierarquia pra descobrir isso toda vez.
with paleta(nome_raiz, cor) as (
  values
    ('Min. Administração',                     '#3b82f6'),  -- azul
    ('Min. Pastoral',                           '#22c55e'),  -- verde
    ('Min. Música',                             '#a855f7'),  -- roxo
    ('Min. Comunicação',                        '#f97316'),  -- laranja
    ('Min. Evangelismo e Missões',              '#ef4444'),  -- vermelho
    ('Min. Diaconia e Ação Social',             '#eab308'),  -- amarelo
    ('Min. Educação Cristã',                    '#06b6d4'),  -- ciano
    ('Min. Famílias',                           '#ec4899'),  -- rosa
    ('Min. Celebrando a Transformação',         '#6366f1'),  -- índigo
    ('Min. Comunhão, Integração e Crescimento', '#14b8a6'),  -- teal
    ('Min. Oração',                             '#84cc16')   -- lima
)
update public.fin_centros_custo cc
set cor = p.cor
from paleta p
join public.fin_centros_custo raiz on raiz.nome = p.nome_raiz and raiz.centro_pai_id is null
where cc.id = raiz.id or cc.centro_pai_id = raiz.id;
