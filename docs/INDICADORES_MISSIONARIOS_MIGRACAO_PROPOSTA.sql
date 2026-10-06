-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSTA PARA REVISÃO — NÃO É UMA MIGRATION ATIVA (fica em docs/, fora de
-- supabase/migrations/, de propósito). Depois da aprovação ela vira
-- 2026100xxxxxxx_missoes_modelagem.sql, em três arquivos (Parte 1, 2 e 3).
--
-- Escrita em 06/10/2026 a partir de medição só-leitura em produção. Contagens
-- citadas abaixo são as medidas nessa data; cada bloco confere a sua com um
-- ASSERT e ABORTA se o banco estiver diferente do que foi revisado.
-- Modelagem, impacto e perguntas: docs/INDICADORES_MISSIONARIOS_MODELAGEM.md
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — ADITIVA. Só cria; não altera nem move nenhum lançamento existente.
-- Segura e reversível (DROP COLUMN / DROP TABLE). A tela funciona antes e depois.
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 A dimensão "Campanha Missionária". NULL = Nenhuma. O ANO NÃO é gravado:
--     vem da data do lançamento (data_pagamento ?? data).
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS campanha_missionaria text
  CHECK (campanha_missionaria IS NULL OR campanha_missionaria IN ('mundiais', 'nacionais', 'especial'));

CREATE INDEX IF NOT EXISTS idx_fin_lanc_campanha_missionaria
  ON public.fin_lancamentos (campanha_missionaria) WHERE campanha_missionaria IS NOT NULL;

COMMENT ON COLUMN public.fin_lancamentos.campanha_missionaria IS
  'Dimensão analítica de missões: mundiais | nacionais | especial (NULL = nenhuma). O ano da campanha é o da data do lançamento — não há cadastro por exercício.';

-- 1.2 Meta por campanha e ano. UMA linha por campanha/ano, opcional: sem ela o
--     painel mostra só o arrecadado. É um número por ano, não um cadastro de projeto.
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

-- 1.3 Ajustes históricos do Fundo Missionário — VISÃO GERENCIAL. Nada aqui toca
--     fin_lancamentos, extratos, contabilidade ou prestação de contas: é uma lista
--     de acertos conhecidos, cada um com motivo, somada ao saldo registrado.
--     valor > 0 aumenta o saldo ajustado; valor < 0 reduz. Nunca se apaga: desativa-se.
CREATE TABLE IF NOT EXISTS public.fin_ajustes_fundo_missionario (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  descricao      text NOT NULL CHECK (length(btrim(descricao)) > 0),
  valor          numeric(14,2) NOT NULL CHECK (valor <> 0),
  justificativa  text,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.fin_ajustes_fundo_missionario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_ajustes_fundo_missionario_equipe ON public.fin_ajustes_fundo_missionario;
CREATE POLICY fin_ajustes_fundo_missionario_equipe ON public.fin_ajustes_fundo_missionario
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
COMMENT ON TABLE public.fin_ajustes_fundo_missionario IS
  'Ajustes gerenciais do saldo do Fundo Missionário (histórico anterior ao Omie etc.). Não altera lançamentos, extratos nem contabilidade.';

-- 1.4 Marca de projeto missionário (painel "Projetos Missionários"). Projetos
--     continuam existindo só para o que é de fato temporário (ex.: construção de
--     templo missionário) — campanhas NÃO são projetos.
ALTER TABLE public.fin_projetos ADD COLUMN IF NOT EXISTS missionario boolean NOT NULL DEFAULT false;

-- 1.5 Os três subcentros novos, filhos de "Min. Evangelismo e Missões" (o centro
--     único de missões que já existe — o nome oficial NÃO é trocado).
INSERT INTO public.fin_centros_custo (nome, vinculo_tipo, centro_pai_id, cor, ativo, descricao)
SELECT v.nome, 'subgrupo_administracao'::public.fin_centro_vinculo, p.id, p.cor, true, v.descricao
  FROM public.fin_centros_custo p
 CROSS JOIN (VALUES
   ('Evangelismo e Missões · Sustento Missionário',   'Investimento permanente da igreja: pastor missionário, parcerias mensais, missionários sustentados, convênios. NÃO faz parte do Fundo Missionário.'),
   ('Evangelismo e Missões · Envios Missionários',    'Repasses das campanhas às Juntas e agências (Fundo Missionário).'),
   ('Evangelismo e Missões · Mobilização Missionária','Conferências, congressos, eventos missionários, hospedagem e passagens de preletores, apoio a palestrantes.')
 ) AS v(nome, descricao)
 WHERE p.nome = 'Min. Evangelismo e Missões'
   AND NOT EXISTS (SELECT 1 FROM public.fin_centros_custo x WHERE x.nome = v.nome);


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — REMAPEAMENTO DE CENTROS. Move 54 lançamentos de saída e os padrões de 4 categorias e 2 fornecedores.
-- Só rodar depois de a Parte 1 estar aplicada e de ela aprovar o mapa abaixo.
--
--   Pastor Missionário (11 saídas, 24.814,25)            → Sustento Missionário
--   Ofertas Missionárias, SAÍDAS (30, 8.850,00)          → Sustento Missionário
--   Missões Mundiais, SAÍDAS (8, 108.541,31)             → Envios Missionários
--   Missões Nacionais, SAÍDAS (5, 54.013,58)             → Envios Missionários
--
-- NÃO move as ENTRADAS (225 em "Missões Mundiais" + 5 em "Ofertas Missionárias"):
-- entrada não é custo; a campanha delas vai pelo campo novo (Parte 3), e o centro
-- antigo "Missões Mundiais" continua ativo até ela decidir o que fazer com elas.
-- NÃO mexe no lançamento de R$ 300 em "Segurança e Monitoramento" (provável erro de
-- categoria — ver o documento de modelagem).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  c_sust uuid; c_env uuid;
  c_pastor constant uuid := 'ae0365b8-adf8-49d9-bcfb-df7cfc63451c';  -- Pastor Missionário
  c_ofmis  constant uuid := 'fce184f5-46ff-4201-9778-f8576e06b418';  -- Ofertas Missionárias
  c_mund   constant uuid := '0f677a79-aa6f-4342-b1d9-d96d65ae9949';  -- Missões Mundiais
  c_nac    constant uuid := 'bec7c1e9-f524-4902-b336-07ce38ae198b';  -- Missões Nacionais
  n int;
BEGIN
  SELECT id INTO c_sust FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Sustento Missionário';
  SELECT id INTO c_env  FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Envios Missionários';
  IF c_sust IS NULL OR c_env IS NULL THEN RAISE EXCEPTION 'Rode a Parte 1 antes (subcentros novos não existem).'; END IF;

  -- conferência do que foi revisado
  SELECT count(*) INTO n FROM public.fin_lancamentos
   WHERE tipo = 'saida' AND centro_custo_id IN (c_pastor, c_ofmis, c_mund, c_nac);
  IF n <> 54 THEN RAISE EXCEPTION 'Esperava 54 saídas nos 4 centros antigos (11+30+8+5); achei %.', n; END IF;

  UPDATE public.fin_lancamentos SET centro_custo_id = c_sust
   WHERE tipo = 'saida' AND centro_custo_id IN (c_pastor, c_ofmis);
  UPDATE public.fin_lancamentos SET centro_custo_id = c_env
   WHERE tipo = 'saida' AND centro_custo_id IN (c_mund, c_nac);

  -- Padrões (centro padrão por categoria / fornecedor) que apontavam para os antigos:
  UPDATE public.fin_categorias SET centro_custo_padrao_id = c_env  WHERE nome = 'Repasses Missionários';
  UPDATE public.fin_categorias SET centro_custo_padrao_id = (SELECT id FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Mobilização Missionária')
   WHERE nome = 'Ofertas à Preletores';
  -- "Ofertas para Missões" (entrada) e "Doações e Contribuições" (saída genérica):
  -- passam a ter o centro-pai, para não rotular de "sustento" uma doação qualquer.
  UPDATE public.fin_categorias SET centro_custo_padrao_id = (SELECT id FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões')
   WHERE nome IN ('Ofertas para Missões', 'Doações e Contribuições');
  UPDATE public.fin_fornecedores SET centro_custo_padrao_id = c_sust
   WHERE nome = 'Alexandre Lourenço Silva';                       -- pastor missionário
  UPDATE public.fin_fornecedores SET centro_custo_padrao_id = NULL
   WHERE nome LIKE 'Junta de Missoes Nacionais%';                 -- recebe parceria (Sustento) E repasse (Envios): a categoria decide

  -- Desativa (não apaga) os antigos que ficaram sem NENHUM lançamento. "Missões Mundiais"
  -- continua ativo: ainda guarda 225 entradas.
  -- "Ofertas Missionárias" também continua ativo: ainda guarda 5 ENTRADAS (547,00).
  UPDATE public.fin_centros_custo SET ativo = false WHERE id IN (c_pastor, c_nac);

  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE centro_custo_id IN (c_pastor, c_nac);
  IF n <> 0 THEN RAISE EXCEPTION 'Sobraram % lançamentos nos centros desativados.', n; END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — CAMPANHA DAS REMESSAS (13) E AJUSTE HISTÓRICO. Cada linha é uma decisão
-- DELA: confira a coluna "campanha" e o motivo; troque o que discordar.
-- As ENTRADAS (648) NÃO são classificadas aqui: ela pediu que não fossem classificadas
-- automaticamente. Elas aparecem no painel "Ofertas Missionárias sem classificação"
-- e vão em lote pela tela, com a regra do ciclo como SUGESTÃO a confirmar.
-- ───────────────────────────────────────────────────────────────────────────
-- Remessa       data        valor      destino (Junta)  centro atual   campanha proposta
-- 2024-07-12   10.327,58   Nacionais        Mundiais       nacionais  (JMN; sem arrecadação de 2024 — ver ajuste)
-- 2024-07-12    1.551,32   Mundiais         Mundiais       mundiais   (CONFIRMADA pela Junta Mundial)
-- 2024-08-27   25.955,20   Mundiais         Mundiais       mundiais
-- 2024-12-19    4.050,00   Nacionais        Nacionais      nacionais
-- 2024-12-30   20.000,00   Nacionais        Nacionais      nacionais
-- 2025-02-27    5.000,00   Nacionais        Mundiais       nacionais  (destino é a Junta Nacional; o centro divergia)
-- 2025-05-27    4.493,56   Nacionais        Mundiais       nacionais  (idem; descrição "repasse campanha")
-- 2025-07-08      337,00   Nacionais        Mundiais       NENHUMA — não é remessa (NF-e de revistas; ver Parte 3b)
-- 2025-07-22   34.216,42   Mundiais         Mundiais       mundiais
-- 2025-09-19      783,58   Mundiais         Nacionais      mundiais   (destino é a Junta Mundial; o centro divergia)
-- 2025-12-10    1.000,00   Nacionais        Nacionais      especial   (oferta à JMN, panetones da Cristolândia; ver Parte 3b)
-- 2025-12-29   28.180,00   Nacionais        Nacionais      nacionais
-- 2026-07-07   26.660,23   Mundiais         Mundiais       mundiais
--
-- As 3 linhas "divergia" acima são a MINHA proposta (campanha pela Junta de destino, não
-- pelo centro gravado) — é a decisão nº 4 do documento. O UPDATE abaixo usa os ids
-- completos, lidos do banco em 06/10/2026.
--
-- UPDATE (rodar só depois da decisão nº 4; ids completos conferidos na hora):
--   UPDATE public.fin_lancamentos SET campanha_missionaria = v.campanha
--   FROM (VALUES
--     ('0cbe1da1-5e24-4486-8a53-a184be368a2f'::uuid, 'nacionais'),
--     ('7f39009c-5035-4fdf-928a-357ecaee1ba1'::uuid, 'mundiais'),
--     ('fa5a0467-efa4-4d87-aac9-9b68d1b790b7'::uuid, 'mundiais'),
--     ('6e8decd5-8559-4e13-bf6e-97d9631f7f53'::uuid, 'nacionais'),
--     ('e65db633-e3eb-4ad8-addf-1d729f0ed06d'::uuid, 'nacionais'),
--     ('9f172950-bea8-4de6-a109-53491741bd6d'::uuid, 'nacionais'),
--     ('e96d4253-8e88-4ded-b404-98bb323f9bd3'::uuid, 'nacionais'),
--     ('2641f689-bd6f-403e-b441-22c29fcd7c29'::uuid, 'mundiais'),
--     ('623c289f-1572-4cac-a6d7-6f552676a55d'::uuid, 'mundiais'),
--     ('5ecb5c32-a261-4fcf-bc1a-2d0157b21104'::uuid, 'especial'),
--     ('77b88b7f-b5f3-4d5f-a294-104b02978ffb'::uuid, 'nacionais'),
--     ('98abdceb-ec82-4ff6-a968-5027d94b9928'::uuid, 'mundiais')
--   ) AS v(id, campanha) WHERE fin_lancamentos.id = v.id;
--   (campanha pelo FORNECEDOR/Junta de destino — o centro gravado diverge em 5 das 13;
--    a Junta Mundial confirma 4 das remessas dela e prova que as 4 de centro divergente
--    pagas à JMN não foram para ela. Ver docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md)
--
-- AJUSTE HISTÓRICO sugerido (decisão nº 3 — ela confirma o valor e o texto):
--   INSERT INTO public.fin_ajustes_fundo_missionario (data_referencia, descricao, valor, justificativa)
--   VALUES ('2024-07-12',
--           'Remessas de 12/07/2024 de campanhas anteriores ao Omie',
--           12032.69,
--           'Primeiro ciclo de 2024: remessas de jul–ago/2024 (JMM 27.506,52 + JMN 10.327,58 = 37.834,10) excedem as ofertas registradas desde 02/01/2024 (25.801,41). Compatível com saldo da campanha de 2023 (anterior ao Omie, não importado). JMM confirma que nada de Mundiais estava pendente; a parcela da JMN (10.327,58) depende de confirmação da Junta Nacional.');
--   → Saldo registrado −16.607,80 + ajuste 12.032,69 = saldo ajustado −4.575,11 (NÃO zero).
--   Para chegar a 0,00 seria preciso 16.607,80 — mas as evidências só sustentam 12.032,69.
--   Valor SUGERIDO, a confirmar por ela; nada é gravado sem a aprovação.

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3b — RECLASSIFICAÇÕES PROVADAS POR COMPROVANTE (06/10/2026). Revisar; não rodar sem o "sim".
-- Comprovantes: ver docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md §8.
-- ───────────────────────────────────────────────────────────────────────────
-- (a) R$ 337,00 de 08/07/2025 NÃO é remessa: NF-e 83744 da JMN (17 revistas "Visão Missionária 3T25").
--     Vira consumo, centro Min. Educação Cristã. Sai do Envio Oficial e do Esforço Total.
--     Categoria proposta: "Material de Consumo" (a única de material existente) — ela confirma.
--   UPDATE public.fin_lancamentos
--      SET categoria_id    = (SELECT id FROM public.fin_categorias WHERE nome = 'Material de Consumo' AND tipo = 'saida'),
--          centro_custo_id = (SELECT id FROM public.fin_centros_custo WHERE nome = 'Min. Educação Cristã'),
--          campanha_missionaria = NULL,
--          descricao       = 'Revista Visão Missionária 3T25 (17 un.) — NF-e 83744, Junta de Missões Nacionais'
--    WHERE id = '0a0ce3a2-32d0-4fc3-bf20-15521334456f' AND valor = 337.00;
-- (b) R$ 4.493,56 de 27/05/2025: "REPASSE CAMPANHA JMN" → nacionais.
--   UPDATE public.fin_lancamentos SET campanha_missionaria = 'nacionais'
--    WHERE id = 'e96d4253-8e88-4ded-b404-98bb323f9bd3' AND valor = 4493.56;
-- (c) R$ 1.000,00 de 10/12/2025: oferta à JMN (panetones da Cristolândia) → campanha avulsa, NÃO Nacionais.
--   UPDATE public.fin_lancamentos SET campanha_missionaria = 'especial'   -- rótulo na tela: "Campanha avulsa"
--    WHERE id = '5ecb5c32-a261-4fcf-bc1a-2d0157b21104' AND valor = 1000.00;
-- (d) R$ 5.000,00 de 27/02/2025: o boleto não diz a campanha; ELA CONFIRMOU (06/10/2026): Missões Nacionais.
--   UPDATE public.fin_lancamentos SET campanha_missionaria = 'nacionais'
--    WHERE id = '9f172950-bea8-4de6-a109-53491741bd6d' AND valor = 5000.00;
