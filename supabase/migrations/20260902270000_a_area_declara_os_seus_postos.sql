-- ═══════════════════════════════════════════════════════════════════════════
-- A área declara os seus postos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ESTAVA ERRADO ────────────────────────────────────────────────────
--
-- `area_voluntarios.funcao` é texto livre, e texto livre não decide nada. Os
-- 132 vínculos ativos, contados:
--
--   84  vazio ou "Voluntário"       ninguém disse nada
--   21  nome de ÁREA no campo       Recepção 16 · Vocal 4 · Introdução 1
--    9  "Líder" / "Co-líder"        já está em areas.lider_id
--   18  FUNÇÃO DE VERDADE           o que a coluna existia para guardar
--
-- Catorze por cento. O resto é ausência, ruído e duplicata — três coisas
-- diferentes numa coluna só, porque nunca se decidiu o que uma função é.
--
-- A pista mais fina: `Vocal` é o nome de uma ÁREA desta igreja. Ninguém
-- errou — faltava onde pôr posto, então inventaram uma área para isso. O
-- Diakonia tem dois níveis (ministério › área) onde o resto do mercado tem
-- três. O terceiro não some: vaza para o segundo.
--
-- ── O QUE OS OUTROS SISTEMAS FAZEM (verificado na documentação) ────────────
--
-- Planning Center Services:
--   "Before adding people to your teams, you must set up positions for them.
--    Positions denote the specific roles for which your team members can be
--    scheduled."
--   Time sem posto não escala ninguém. Uma pessoa pode ocupar mais de um.
--   Team Leaders é aba separada — liderança nunca é posto.
--
-- ChurchSuite:
--   "when signing up, ministry members can only select from their assigned
--    ministry roles"
--   O catálogo não é lista: é portão.
--
-- Breeze, Ministrary, Escala Igreja: o mesmo desenho. Não há contraexemplo.
--
-- ── ESTA MIGRATION É SÓ ADITIVA ────────────────────────────────────────────
--
-- `area_voluntarios.funcao` CONTINUA DE PÉ e continua sendo escrita pelas
-- telas de hoje. Ela sai quando a interface tiver migrado, noutra migration e
-- com outra conversa. Aqui não se apaga nada.
--
-- Fica anotado para essa hora: `area_voluntarios.habilidades` (text[]) está
-- em 0 de 135 vínculos, sem um único valor. Foi uma tentativa anterior de
-- resolver isto por array livre, abandonada. Uma coluna vazia que convida a
-- um quarto modelo para o mesmo fato deve sair — mas sair é destrutivo, e
-- destrutivo se combina antes.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O CATÁLOGO — os postos que existem em cada área
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.area_funcoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id         uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  descricao       text,
  -- Quantos desta função a escala precisa. O painel hoje diz "faltam
  -- voluntários"; com isto passa a dizer "falta baterista". Zero = a área
  -- ainda não disse, e não é o mesmo que não precisar.
  min_por_escala  integer NOT NULL DEFAULT 0 CHECK (min_por_escala >= 0),
  ordem           integer NOT NULL DEFAULT 0,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- As duas coisas que o texto livre deixava entrar e que agora não entram.
  -- Genérico não é função: "Voluntário" era a forma de dizer nada em 84
  -- linhas. Liderança não é função: é fato da ÁREA, em lider_id/co_lider_id,
  -- e ter duas fontes para o mesmo fato já produziu 12 líderes que não
  -- dizem que são.
  CONSTRAINT area_funcoes_nome_util CHECK (
    btrim(nome) <> '' AND lower(btrim(nome)) NOT IN (
      'voluntário','voluntario','membro','líder','lider','co-líder','co-lider'
    )
  )
);

-- Duas vezes o mesmo posto na mesma área é sempre erro de digitação.
-- Comparado sem caixa nem espaço, que é como as duplicatas nascem.
CREATE UNIQUE INDEX area_funcoes_sem_repetir
  ON public.area_funcoes (area_id, lower(btrim(nome)));

CREATE INDEX area_funcoes_por_area ON public.area_funcoes (area_id) WHERE ativo;

CREATE TRIGGER area_funcoes_updated_at
  BEFORE UPDATE ON public.area_funcoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- A terceira regra não cabe num CHECK, porque olha outra tabela: o posto não
-- pode chamar-se como a própria área. É exatamente o defeito dos 21 —
-- "Recepção" na área Recepção não diz nada que a linha já não dissesse.
CREATE OR REPLACE FUNCTION public.af_nome_nao_repete_a_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE nome_da_area text;
BEGIN
  SELECT a.nome INTO nome_da_area FROM public.areas a WHERE a.id = NEW.area_id;
  IF nome_da_area IS NOT NULL
     AND lower(btrim(nome_da_area)) = lower(btrim(NEW.nome)) THEN
    RAISE EXCEPTION
      'O posto nao pode repetir o nome da area (%). Diga o que a pessoa FAZ ali.',
      nome_da_area;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER area_funcoes_nome_nao_repete_area
  BEFORE INSERT OR UPDATE ON public.area_funcoes
  FOR EACH ROW EXECUTE FUNCTION public.af_nome_nao_repete_a_area();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A LIGAÇÃO — quem ocupa que posto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- N-para-N porque uma pessoa faz mais de uma coisa. Hoje existe um vínculo
-- escrito "Tecladista/Trompetista": uma pessoa, dois postos, uma barra no
-- meio de um texto porque não havia segunda linha para escrever.

CREATE TABLE public.area_voluntario_funcoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_voluntario_id  uuid NOT NULL REFERENCES public.area_voluntarios(id) ON DELETE CASCADE,
  -- RESTRICT e não CASCADE: apagar um posto do catálogo enquanto há gente
  -- nele tem de doer. Primeiro se tira a gente, depois o posto.
  area_funcao_id      uuid NOT NULL REFERENCES public.area_funcoes(id) ON DELETE RESTRICT,

  -- O Planning Center documenta a ressalva e ela vale herdar: permitir vários
  -- postos, mas marcar um como principal — em equipe grande, gente em várias
  -- posições atrapalha escalar tudo de uma vez.
  principal           boolean NOT NULL DEFAULT false,

  -- De onde veio a informação. O IDE Escalas resolve o preenchimento assim:
  -- o voluntário declara, a liderança confirma. Quem melhor sabe o que o
  -- Fulano faz na Recepção é o Fulano — são 86 pessoas respondendo uma
  -- pergunta, em vez de um líder digitando 84 vezes.
  origem              text NOT NULL DEFAULT 'lideranca'
                      CHECK (origem IN ('lideranca','autodeclarada')),

  -- Nulo enquanto pende. O que a liderança cadastra nasce confirmado — ela
  -- é a confirmação. Só a autodeclaração espera.
  confirmada_em       timestamptz,
  confirmada_por      uuid,

  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT avf_lideranca_nasce_confirmada CHECK (
    origem <> 'lideranca' OR confirmada_em IS NOT NULL
  )
);

CREATE UNIQUE INDEX avf_sem_repetir
  ON public.area_voluntario_funcoes (area_voluntario_id, area_funcao_id);

-- "Principal" só faz sentido se for uma.
CREATE UNIQUE INDEX avf_uma_principal_por_vinculo
  ON public.area_voluntario_funcoes (area_voluntario_id) WHERE principal;

CREATE INDEX avf_por_funcao ON public.area_voluntario_funcoes (area_funcao_id);

-- O posto tem de ser da MESMA área do vínculo. Sem isto, nada impediria
-- registar alguém como Baterista na Cantina — e a escala confiaria.
CREATE OR REPLACE FUNCTION public.avf_posto_e_da_area_do_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE area_do_vinculo uuid; area_do_posto uuid;
BEGIN
  SELECT av.area_id INTO area_do_vinculo
    FROM public.area_voluntarios av WHERE av.id = NEW.area_voluntario_id;
  SELECT af.area_id INTO area_do_posto
    FROM public.area_funcoes af WHERE af.id = NEW.area_funcao_id;

  IF area_do_vinculo IS DISTINCT FROM area_do_posto THEN
    RAISE EXCEPTION 'Este posto e de outra area. Um voluntario so ocupa postos da area em que serve.';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER avf_posto_da_area_certa
  BEFORE INSERT OR UPDATE ON public.area_voluntario_funcoes
  FOR EACH ROW EXECUTE FUNCTION public.avf_posto_e_da_area_do_vinculo();

COMMIT;
