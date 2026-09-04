-- ═══════════════════════════════════════════════════════════════════════════
-- A porta de entrada da Diaconia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido de 03/09/2026: cestas básicas, culto comunitário de terça (pessoas em
-- situação de rua) e jantar pós-culto de domingo atendem gente que às vezes
-- não é membro nem congregado — "sao pessoas que as vezes só estao na igreja
-- para buscar a cesta". A igreja quer ficha cadastral, ficha socioeconômica
-- enxuta, histórico de atendimento, e uma lista de confirmação igual à
-- chamada da EBD. Ver [[diaconia-porta-de-entrada]] na memória para o pedido
-- completo e a pesquisa que embasou o desenho.
--
-- ── POR QUE NÃO ENTRA EM `membros` ───────────────────────────────────────────
--
-- `tipo_pessoa` hoje é `membro, congregado, visitante, ex_membro` — e
-- "visitante" no sistema significa alguém a caminho de virar congregado, não
-- quem só busca cesta. Forçar aí seria inventar um sentido que o campo não
-- tem. Nasce uma família de tabelas própria, prefixo `diaconia_`.
--
-- ── QUANDO A PESSOA JÁ É MEMBRO OU CONGREGADO ────────────────────────────────
--
-- `diaconia_pessoas_assistidas.membro_id` linka a ficha existente — decidido
-- por ela: "sim, pode linkar". Mas `nome_completo` é sempre gravado aqui
-- também, e não por redundância preguiçosa: quem confirma presença (diácono
-- que serve na área, não necessariamente lideranca) não tem acesso a
-- `membros` — a política de `membros` é admin/secretaria, sem lideranca. Se o
-- nome só existisse lá, metade de quem precisa ver a lista não veria nome
-- nenhum.
--
-- ── DUAS PORTAS DE ACESSO, DE PROPÓSITO DIFERENTE ────────────────────────────
--
-- "Ministro e Líder deste ministério" leem a ficha socioeconômica —
-- `diaconia_lidera_area()`. "diaconos confirmam" a chamada, sem abrir a
-- ficha — `diaconia_posso_atender()`, mais larga, inclui quem serve na área
-- via `area_voluntarios` mesmo sem ser `lideranca`. A distinção existe
-- porque ela pediu as duas coisas em mensagens separadas, e são riscos
-- diferentes: a ficha carrega renda e situação de moradia; a chamada só diz
-- quem veio.
--
-- ── A CHAMADA COPIA O DESENHO DA EBD, NÃO INVENTA UM NOVO ────────────────────
--
-- `ebd_obter_ou_criar_aula` + `ebd_chamada_view` + `ebd_marcar_presenca` já
-- resolvem exatamente este problema — ocasião por data, lista com toque pra
-- confirmar, "+ novo" pra quem chega sem cadastro. `diaconia_ocasioes` +
-- `diaconia_atendimentos` são o mesmo par, e os nomes das RPCs seguem o
-- mesmo padrão para quem já conhece o EBD reconhecer de cara.
--
-- ── NENHUMA ÁREA NOVA CRIADA AQUI ────────────────────────────────────────────
--
-- Hoje só existe a área "Cestas Básicas" sob Diaconia e Ação Social (mais
-- "Projeto Social Professor José Augusto dos Santos", que já parece cobrir
-- parte disto). "Culto de Rua" e "Jantar Pós-Culto" não existem como área
-- ainda — decisão de organograma é dela ou da Laudete, não desta migration.
-- O desenho funciona com QUALQUER área do ministério, hoje ou as que vierem.
--
-- ── HISTÓRICO, NÃO EDIÇÃO ────────────────────────────────────────────────────
--
-- `diaconia_fichas_socioeconomicas` não tem UPDATE — cada atualização é uma
-- linha nova. A ficha de 2024 não pode sumir quando alguém atualiza em 2026.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.diaconia_pessoas_assistidas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id     uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  nome_completo text NOT NULL CHECK (btrim(nome_completo) <> ''),
  telefone      text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_diaconia_pessoas_updated_at
  BEFORE UPDATE ON public.diaconia_pessoas_assistidas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.diaconia_pessoas_assistidas IS
  'Quem a Diaconia assiste — membro ou não. nome_completo é sempre gravado aqui, mesmo quando membro_id aponta para uma ficha existente, porque quem confirma presença nem sempre pode ler `membros`.';

-- A "matrícula": em quais áreas a pessoa é atendida. Muitos-para-muitos —
-- a mesma pessoa pode receber cesta E ir ao jantar.
CREATE TABLE public.diaconia_vinculos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_assistida_id   uuid NOT NULL REFERENCES public.diaconia_pessoas_assistidas(id) ON DELETE CASCADE,
  area_id               uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  ativo                 boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pessoa_assistida_id, area_id)
);

-- Histórico, não ficha única: cada linha é uma triagem/atualização.
CREATE TABLE public.diaconia_fichas_socioeconomicas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_assistida_id      uuid NOT NULL REFERENCES public.diaconia_pessoas_assistidas(id) ON DELETE CASCADE,
  data_preenchimento       date NOT NULL DEFAULT current_date,
  composicao_familiar      smallint CHECK (composicao_familiar IS NULL OR composicao_familiar > 0),
  situacao_moradia         text CHECK (situacao_moradia IN
                              ('propria','alugada','cedida','situacao_de_rua','outra')),
  situacao_trabalho        text CHECK (situacao_trabalho IN
                              ('empregado','desempregado','informal','aposentado','outro')),
  recebe_beneficio_social  boolean,
  qual_beneficio           text,
  observacoes              text,
  preenchido_por           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.diaconia_fichas_socioeconomicas IS
  'Enxuta e qualitativa, por pedido dela — sem cálculo automático de vulnerabilidade. Uma leitura da ministra/líder, não um número que decide sozinho. Append-only: a triagem antiga não é apagada quando a situação muda.';

-- Uma ocasião por área+data — mesmo par que ebd_aulas.
CREATE TABLE public.diaconia_ocasioes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id      uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  data         date NOT NULL,
  observacoes  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, data)
);

-- A chamada — mesmo par que ebd_presencas.
CREATE TABLE public.diaconia_atendimentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocasiao_id            uuid NOT NULL REFERENCES public.diaconia_ocasioes(id) ON DELETE CASCADE,
  pessoa_assistida_id   uuid NOT NULL REFERENCES public.diaconia_pessoas_assistidas(id) ON DELETE CASCADE,
  confirmado            boolean NOT NULL DEFAULT true,
  confirmado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ocasiao_id, pessoa_assistida_id)
);

CREATE INDEX ON public.diaconia_vinculos (area_id) WHERE ativo;
CREATE INDEX ON public.diaconia_ocasioes (area_id, data);
CREATE INDEX ON public.diaconia_atendimentos (ocasiao_id);
CREATE INDEX ON public.diaconia_fichas_socioeconomicas (pessoa_assistida_id, data_preenchimento DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- AS DUAS PORTAS
-- ═══════════════════════════════════════════════════════════════════════════

-- A larga: ministra, líder da área, ou quem serve nela — inclui diácono sem
-- ser lideranca. Usada pra chamada/atendimento, nunca pra ficha socioeconômica.
CREATE OR REPLACE FUNCTION public.diaconia_posso_atender(p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[])
    OR (public.has_role((SELECT auth.uid()), 'lideranca')
        AND p_area_id IN (SELECT public.fn_minhas_areas()))
    OR EXISTS (
         SELECT 1 FROM public.area_voluntarios av
          WHERE av.membro_id = public.minha_pessoa_id()
            AND av.area_id = p_area_id AND av.status = 'ativa'
       );
$$;

-- A estrita: só ministra/líder/admin/secretaria — nunca diácono. A única
-- porta pra ficha socioeconômica.
CREATE OR REPLACE FUNCTION public.diaconia_lidera_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[])
    OR (public.has_role((SELECT auth.uid()), 'lideranca')
        AND p_area_id IN (SELECT public.fn_minhas_areas()));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- AS RPCs — todo escrever de quem não é admin/secretaria passa por aqui
-- ═══════════════════════════════════════════════════════════════════════════

-- Cadastra (ou reaproveita) a pessoa e a vincula à área — usada tanto na
-- triagem inicial quanto no "+ novo" durante a chamada.
CREATE OR REPLACE FUNCTION public.diaconia_criar_pessoa(
  p_area_id   uuid,
  p_nome      text,
  p_telefone  text DEFAULT NULL,
  p_membro_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_nome text := btrim(p_nome);
  v_id   uuid;
BEGIN
  IF NOT public.diaconia_posso_atender(p_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Escreva o nome da pessoa.';
  END IF;

  -- Se veio de uma ficha existente (membro/congregado), usa o nome de lá —
  -- uma fonte só, não duas que podem discordar.
  IF p_membro_id IS NOT NULL THEN
    SELECT nome_completo INTO v_nome FROM public.membros WHERE id = p_membro_id;
  END IF;

  INSERT INTO public.diaconia_pessoas_assistidas (membro_id, nome_completo, telefone)
       VALUES (p_membro_id, v_nome, nullif(btrim(p_telefone), ''))
    RETURNING id INTO v_id;

  INSERT INTO public.diaconia_vinculos (pessoa_assistida_id, area_id)
       VALUES (v_id, p_area_id)
  ON CONFLICT (pessoa_assistida_id, area_id) DO UPDATE SET ativo = true;

  RETURN v_id;
END;
$$;

-- Vincula alguém que já é assistido em outra área a uma área nova (a mesma
-- pessoa recebe cesta E vai ao jantar).
CREATE OR REPLACE FUNCTION public.diaconia_vincular_area(p_pessoa_assistida_id uuid, p_area_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.diaconia_posso_atender(p_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.diaconia_vinculos (pessoa_assistida_id, area_id)
       VALUES (p_pessoa_assistida_id, p_area_id)
  ON CONFLICT (pessoa_assistida_id, area_id) DO UPDATE SET ativo = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.diaconia_obter_ou_criar_ocasiao(p_area_id uuid, p_data date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.diaconia_posso_atender(p_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id FROM public.diaconia_ocasioes WHERE area_id = p_area_id AND data = p_data;
  IF v_id IS NULL THEN
    INSERT INTO public.diaconia_ocasioes (area_id, data) VALUES (p_area_id, p_data) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- A lista: quem está vinculado à área da ocasião (a "matrícula"), com o
-- estado de confirmação desta data.
CREATE OR REPLACE FUNCTION public.diaconia_chamada_view(p_ocasiao_id uuid)
RETURNS TABLE(pessoa_assistida_id uuid, nome_completo text, telefone text, confirmado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_area_id uuid;
BEGIN
  SELECT area_id INTO v_area_id FROM public.diaconia_ocasioes WHERE id = p_ocasiao_id;
  IF v_area_id IS NULL OR NOT public.diaconia_posso_atender(v_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome_completo, p.telefone,
           COALESCE(at.confirmado, false)
      FROM public.diaconia_vinculos v
      JOIN public.diaconia_pessoas_assistidas p ON p.id = v.pessoa_assistida_id AND p.ativo
      LEFT JOIN public.diaconia_atendimentos at
             ON at.ocasiao_id = p_ocasiao_id AND at.pessoa_assistida_id = p.id
     WHERE v.area_id = v_area_id AND v.ativo
     ORDER BY p.nome_completo;
END;
$$;

CREATE OR REPLACE FUNCTION public.diaconia_marcar_confirmado(
  p_ocasiao_id uuid, p_pessoa_assistida_id uuid, p_confirmado boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_area_id uuid; v_id uuid;
BEGIN
  SELECT area_id INTO v_area_id FROM public.diaconia_ocasioes WHERE id = p_ocasiao_id;
  IF v_area_id IS NULL OR NOT public.diaconia_posso_atender(v_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.diaconia_atendimentos (ocasiao_id, pessoa_assistida_id, confirmado, confirmado_por)
       VALUES (p_ocasiao_id, p_pessoa_assistida_id, p_confirmado, auth.uid())
  ON CONFLICT (ocasiao_id, pessoa_assistida_id) DO UPDATE
     SET confirmado = EXCLUDED.confirmado, confirmado_por = EXCLUDED.confirmado_por
   RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- A ficha — só quem lidera. Nunca UPDATE: cada chamada desta função é uma
-- linha nova no histórico.
CREATE OR REPLACE FUNCTION public.diaconia_salvar_ficha(
  p_pessoa_assistida_id     uuid,
  p_composicao_familiar     smallint DEFAULT NULL,
  p_situacao_moradia        text DEFAULT NULL,
  p_situacao_trabalho       text DEFAULT NULL,
  p_recebe_beneficio_social boolean DEFAULT NULL,
  p_qual_beneficio          text DEFAULT NULL,
  p_observacoes             text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pode boolean; v_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_lidera_area(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Só a liderança da Diaconia preenche a ficha.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.diaconia_fichas_socioeconomicas
    (pessoa_assistida_id, composicao_familiar, situacao_moradia, situacao_trabalho,
     recebe_beneficio_social, qual_beneficio, observacoes, preenchido_por)
  VALUES
    (p_pessoa_assistida_id, p_composicao_familiar, p_situacao_moradia, p_situacao_trabalho,
     p_recebe_beneficio_social, nullif(btrim(p_qual_beneficio), ''), nullif(btrim(p_observacoes), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — leitura pelas duas portas; escrita de quem não é admin/secretaria
-- só pelas RPCs acima (SECURITY DEFINER já checou; a tabela não precisa
-- de política de INSERT/UPDATE além da de admin).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.diaconia_pessoas_assistidas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaconia_vinculos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaconia_fichas_socioeconomicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaconia_ocasioes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaconia_atendimentos          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bloqueia_anon_diaconia_pessoas" ON public.diaconia_pessoas_assistidas
  FOR ALL TO anon USING (false);
CREATE POLICY "bloqueia_anon_diaconia_vinculos" ON public.diaconia_vinculos
  FOR ALL TO anon USING (false);
CREATE POLICY "bloqueia_anon_diaconia_fichas" ON public.diaconia_fichas_socioeconomicas
  FOR ALL TO anon USING (false);
CREATE POLICY "bloqueia_anon_diaconia_ocasioes" ON public.diaconia_ocasioes
  FOR ALL TO anon USING (false);
CREATE POLICY "bloqueia_anon_diaconia_atendimentos" ON public.diaconia_atendimentos
  FOR ALL TO anon USING (false);

CREATE POLICY "admin_gerencia_diaconia_pessoas" ON public.diaconia_pessoas_assistidas
  FOR ALL TO authenticated
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
CREATE POLICY "diaconia_le_pessoas_que_atende" ON public.diaconia_pessoas_assistidas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = id AND v.ativo AND public.diaconia_posso_atender(v.area_id)
  ));

CREATE POLICY "admin_gerencia_diaconia_vinculos" ON public.diaconia_vinculos
  FOR ALL TO authenticated
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
CREATE POLICY "diaconia_le_vinculos_da_propria_area" ON public.diaconia_vinculos
  FOR SELECT TO authenticated USING (public.diaconia_posso_atender(area_id));

CREATE POLICY "admin_gerencia_diaconia_fichas" ON public.diaconia_fichas_socioeconomicas
  FOR ALL TO authenticated
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
CREATE POLICY "diaconia_lideranca_le_fichas" ON public.diaconia_fichas_socioeconomicas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = pessoa_assistida_id AND v.ativo
       AND public.diaconia_lidera_area(v.area_id)
  ));

CREATE POLICY "admin_gerencia_diaconia_ocasioes" ON public.diaconia_ocasioes
  FOR ALL TO authenticated
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
CREATE POLICY "diaconia_le_ocasioes_da_propria_area" ON public.diaconia_ocasioes
  FOR SELECT TO authenticated USING (public.diaconia_posso_atender(area_id));

CREATE POLICY "admin_gerencia_diaconia_atendimentos" ON public.diaconia_atendimentos
  FOR ALL TO authenticated
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
CREATE POLICY "diaconia_le_atendimentos_da_propria_area" ON public.diaconia_atendimentos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.diaconia_ocasioes o
     WHERE o.id = ocasiao_id AND public.diaconia_posso_atender(o.area_id)
  ));

COMMIT;
