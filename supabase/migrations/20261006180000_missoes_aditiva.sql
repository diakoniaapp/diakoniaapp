-- ─── Missões, parte 1 de 3 — ADITIVA: campo de campanha, metas, ajustes e subcentros novos ───
--
-- Pedido da Telma (06/10/2026): os Indicadores Missionários misturavam Fundo Missionário,
-- campanhas, sustento e envios. Modelagem aprovada por ela (docs/INDICADORES_MISSIONARIOS_MODELAGEM.md):
-- campanha vira uma DIMENSÃO do lançamento (sem projeto por exercício), o ajuste do saldo é
-- uma visão gerencial à parte, e o centro "Min. Evangelismo e Missões" ganha 3 subcentros.
--
-- Esta parte só CRIA. Não altera nem move nenhum lançamento — segura e reversível
-- (DROP COLUMN / DROP TABLE). A tela funciona antes e depois.
--
-- Medido em produção (06/10/2026) antes de escrever: 13 saídas em "Repasses Missionários",
-- 648 entradas em "Ofertas para Missões", 0 linhas de orçamento/recorrência/rateio nos centros
-- de missões, e 1 projeto (120 Anos, não missionário).

-- Campanha: NULL = Nenhuma. O ANO não é gravado: vem da data do lançamento. A opção "especial"
-- aparece na tela como "Campanha avulsa" (a Junta chama a oferta de Mundiais de "Dia Especial").
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS campanha_missionaria text
  CHECK (campanha_missionaria IS NULL OR campanha_missionaria IN ('mundiais', 'nacionais', 'especial'));

CREATE INDEX IF NOT EXISTS idx_fin_lanc_campanha_missionaria
  ON public.fin_lancamentos (campanha_missionaria) WHERE campanha_missionaria IS NOT NULL;

COMMENT ON COLUMN public.fin_lancamentos.campanha_missionaria IS
  'Dimensão analítica de missões: mundiais | nacionais | especial (campanha avulsa); NULL = nenhuma. O ano é o da data do lançamento.';

-- Meta por campanha e ano: UMA linha, opcional. Sem ela o painel mostra só o arrecadado.
CREATE TABLE IF NOT EXISTS public.fin_metas_campanha (
  campanha       text    NOT NULL CHECK (campanha IN ('mundiais', 'nacionais', 'especial')),
  ano            integer NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  valor          numeric(14,2) NOT NULL CHECK (valor > 0),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (campanha, ano)
);
ALTER TABLE public.fin_metas_campanha ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_metas_campanha_equipe ON public.fin_metas_campanha;
CREATE POLICY fin_metas_campanha_equipe ON public.fin_metas_campanha
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
COMMENT ON TABLE public.fin_metas_campanha IS 'Meta de arrecadação por campanha missionária e ano. Opcional.';

-- Ajustes históricos do Fundo Missionário — VISÃO GERENCIAL. Não toca lançamentos, extratos,
-- contabilidade nem prestação de contas. valor > 0 aumenta o saldo ajustado. Nunca se apaga: desativa-se.
CREATE TABLE IF NOT EXISTS public.fin_ajustes_fundo_missionario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  descricao       text NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor           numeric(14,2) NOT NULL CHECK (valor <> 0),
  justificativa   text,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por      uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.fin_ajustes_fundo_missionario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_ajustes_fundo_missionario_equipe ON public.fin_ajustes_fundo_missionario;
CREATE POLICY fin_ajustes_fundo_missionario_equipe ON public.fin_ajustes_fundo_missionario
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
COMMENT ON TABLE public.fin_ajustes_fundo_missionario IS
  'Ajustes gerenciais do saldo do Fundo Missionário (histórico anterior ao Omie etc.). Não altera lançamentos, extratos nem contabilidade.';

-- Projeto missionário (painel "Projetos Missionários"): só para o que é de fato temporário
-- (ex.: construção de templo missionário). Campanhas NÃO são projetos.
ALTER TABLE public.fin_projetos ADD COLUMN IF NOT EXISTS missionario boolean NOT NULL DEFAULT false;

-- Os 3 subcentros novos, filhos de "Min. Evangelismo e Missões" (o nome oficial NÃO é trocado).
INSERT INTO public.fin_centros_custo (nome, vinculo_tipo, centro_pai_id, cor, ativo, descricao)
SELECT v.nome, 'subgrupo_administracao'::public.fin_centro_vinculo, p.id, p.cor, true, v.descricao
  FROM public.fin_centros_custo p
 CROSS JOIN (VALUES
   ('Evangelismo e Missões · Sustento Missionário',    'Investimento permanente da igreja: pastor missionário, parcerias mensais, missionários sustentados, convênios. NÃO faz parte do Fundo Missionário.'),
   ('Evangelismo e Missões · Envios Missionários',     'Repasses das campanhas às Juntas e agências (Fundo Missionário).'),
   ('Evangelismo e Missões · Mobilização Missionária', 'Conferências, congressos, eventos missionários, hospedagem e passagens de preletores, apoio a palestrantes.')
 ) AS v(nome, descricao)
 WHERE p.nome = 'Min. Evangelismo e Missões'
   AND NOT EXISTS (SELECT 1 FROM public.fin_centros_custo x WHERE x.nome = v.nome);
