-- ─── (APLICADA em 08/10/2026 após ensaio) Boas-vindas ao Visitante: a tela depois do AutoCadastro vira acolhimento e integração ─────────────────────
-- Antes: "Cadastro realizado" e nada mais. Agora a tela mostra uma mensagem de boas-vindas, um banner, os canais oficiais da
-- igreja (Instagram, Facebook, YouTube, Site, WhatsApp), links e os próximos encontros — tudo configurável em
-- Configurações → Boas-vindas ao Visitante (/admin/boas-vindas-visitante), e cada canal é opcional: a administração decide.
--
-- Desenho (e por quê):
--   • UMA linha de configuração (`id boolean` fixo em true): só existe uma tela de boas-vindas por igreja.
--   • Canais, links e encontros ficam em jsonb dentro dessa linha: são listas curtas, editadas juntas, sem consulta por item.
--   • A página pública (anon) NÃO lê a tabela: chama `visitante_boasvindas()`, que devolve só o que é para ser público —
--     itens ativos, com endereço http(s) (nada de javascript:), encontros que ainda não passaram. Mesmo desenho do
--     `visitante_autocadastro`: o anônimo só tem EXECUTE.
--   • Os canais já cadastrados em Identidade da Igreja (site e redes) entram como ponto de partida, ativos, porque já são
--     os canais oficiais públicos; a administração pode desligar qualquer um. O WhatsApp nasce vazio e desligado: não há
--     número da igreja cadastrado em lugar nenhum.
--   • Banner: bucket público `boasvindas-visitante` (imagem, até 2 MB), escrita só da administração.
-- Alternativa descartada para os encontros: ler `eventos` direto. A agenda guarda cultos como UMA linha-base + regra de
-- recorrência, mistura reuniões internas e não tem marca de "público"; expor isso ao anônimo vazaria agenda interna.

-- ── 1) a configuração ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_boasvindas (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),             -- uma configuração só
  titulo         text    NOT NULL DEFAULT 'Cadastro realizado com sucesso' CHECK (length(titulo) BETWEEN 1 AND 120),
  mensagem       text    NOT NULL DEFAULT E'Seja muito bem-vindo à Quarta Igreja Batista do Rio de Janeiro.\nFoi uma alegria receber sua visita.'
                                  CHECK (length(mensagem) <= 800),
  banner_url     text,                                                    -- endereço público da imagem no bucket
  canais         jsonb   NOT NULL DEFAULT '[]'::jsonb,                    -- [{tipo, url, ativo}]  tipo: instagram|facebook|youtube|site|whatsapp
  links          jsonb   NOT NULL DEFAULT '[]'::jsonb,                    -- [{rotulo, url, ativo}]
  eventos_mostrar boolean NOT NULL DEFAULT true,
  eventos_titulo text    NOT NULL DEFAULT 'Venha nos visitar de novo' CHECK (length(eventos_titulo) BETWEEN 1 AND 80),
  eventos_max    smallint NOT NULL DEFAULT 4 CHECK (eventos_max BETWEEN 1 AND 10),
  eventos        jsonb   NOT NULL DEFAULT '[]'::jsonb,                    -- [{titulo, quando, data, local, link, ativo}]
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT auth.uid(),
  CONSTRAINT visitante_boasvindas_listas_ck CHECK (
    jsonb_typeof(canais) = 'array' AND jsonb_typeof(links) = 'array' AND jsonb_typeof(eventos) = 'array'
    AND jsonb_array_length(canais) <= 10 AND jsonb_array_length(links) <= 12 AND jsonb_array_length(eventos) <= 30)
);

ALTER TABLE public.visitante_boasvindas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitante_boasvindas FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitante_boasvindas FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Bloqueia anon" ON public.visitante_boasvindas;
CREATE POLICY "Bloqueia anon" ON public.visitante_boasvindas AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Administracao" ON public.visitante_boasvindas;
CREATE POLICY "Administracao" ON public.visitante_boasvindas FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));

-- a linha inicial: os canais que a igreja já cadastrou em Identidade (site e redes), mais o WhatsApp vazio e desligado
INSERT INTO public.visitante_boasvindas (id, canais)
SELECT true, jsonb_build_array(
    jsonb_build_object('tipo', 'instagram', 'url', coalesce((SELECT r->>'url' FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'instagram' LIMIT 1), ''),
                       'ativo', EXISTS (SELECT 1 FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'instagram' AND coalesce(r->>'url', '') <> '')),
    jsonb_build_object('tipo', 'facebook', 'url', coalesce((SELECT r->>'url' FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'facebook' LIMIT 1), ''),
                       'ativo', EXISTS (SELECT 1 FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'facebook' AND coalesce(r->>'url', '') <> '')),
    jsonb_build_object('tipo', 'youtube', 'url', coalesce((SELECT r->>'url' FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'youtube' LIMIT 1), ''),
                       'ativo', EXISTS (SELECT 1 FROM jsonb_array_elements(i.redes_sociais) r WHERE r->>'plataforma' = 'youtube' AND coalesce(r->>'url', '') <> '')),
    jsonb_build_object('tipo', 'site', 'url', coalesce(i.site_oficial, ''), 'ativo', coalesce(i.site_oficial, '') <> ''),
    jsonb_build_object('tipo', 'whatsapp', 'url', '', 'ativo', false))
  FROM (SELECT * FROM public.identidade_igreja WHERE ativa ORDER BY created_at LIMIT 1) i
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.visitante_boasvindas (id) VALUES (true) ON CONFLICT (id) DO NOTHING;   -- sem Identidade cadastrada: linha com os padrões

-- ── 2) o que o visitante (anônimo) pode ver ─────────────────────────────────────────────────────────────
-- Só itens ATIVOS com endereço http(s); encontros com data só até o dia (fuso de São Paulo); no máximo `eventos_max`.
CREATE OR REPLACE FUNCTION public.visitante_boasvindas()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT jsonb_build_object(
    'titulo',   b.titulo,
    'mensagem', b.mensagem,
    'banner_url', CASE WHEN b.banner_url ~* '^https?://' THEN b.banner_url END,
    'canais', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('tipo', c->>'tipo', 'url', btrim(c->>'url')) ORDER BY o)
         FROM jsonb_array_elements(b.canais) WITH ORDINALITY AS t(c, o)
        WHERE coalesce(c->>'ativo', 'false') = 'true' AND btrim(coalesce(c->>'url', '')) ~* '^https?://'
          AND c->>'tipo' IN ('instagram', 'facebook', 'youtube', 'site', 'whatsapp')), '[]'::jsonb),
    'links', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('rotulo', left(btrim(l->>'rotulo'), 60), 'url', btrim(l->>'url')) ORDER BY o)
         FROM jsonb_array_elements(b.links) WITH ORDINALITY AS t(l, o)
        WHERE coalesce(l->>'ativo', 'false') = 'true' AND btrim(coalesce(l->>'url', '')) ~* '^https?://' AND btrim(coalesce(l->>'rotulo', '')) <> ''), '[]'::jsonb),
    'eventos_titulo', b.eventos_titulo,
    'eventos', CASE WHEN NOT b.eventos_mostrar THEN '[]'::jsonb ELSE COALESCE((
       SELECT jsonb_agg(q.e ORDER BY q.o) FROM (
         SELECT o, jsonb_build_object('titulo', left(btrim(x->>'titulo'), 100), 'quando', left(btrim(coalesce(x->>'quando', '')), 80),
                  'local', left(btrim(coalesce(x->>'local', '')), 80),
                  'link', CASE WHEN btrim(coalesce(x->>'link', '')) ~* '^https?://' THEN btrim(x->>'link') END) AS e
           FROM jsonb_array_elements(b.eventos) WITH ORDINALITY AS t(x, o)
          WHERE coalesce(x->>'ativo', 'false') = 'true' AND btrim(coalesce(x->>'titulo', '')) <> ''
            AND ( coalesce(x->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (x->>'data')::date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date) )
          ORDER BY o LIMIT b.eventos_max) q), '[]'::jsonb) END
  )
  FROM public.visitante_boasvindas b WHERE b.id
$f$;
COMMENT ON FUNCTION public.visitante_boasvindas IS 'Conteúdo PÚBLICO da tela de boas-vindas do AutoCadastro: só itens ativos, só endereços http(s), só encontros que ainda não passaram.';
REVOKE ALL ON FUNCTION public.visitante_boasvindas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitante_boasvindas() TO anon, authenticated;

-- ── 3) o banner ──────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('boasvindas-visitante', 'boasvindas-visitante', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "boasvindas_visitante_escrita" ON storage.objects;
CREATE POLICY "boasvindas_visitante_escrita" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boasvindas-visitante' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
DROP POLICY IF EXISTS "boasvindas_visitante_troca" ON storage.objects;
CREATE POLICY "boasvindas_visitante_troca" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boasvindas-visitante' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]))
  WITH CHECK (bucket_id = 'boasvindas-visitante' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
DROP POLICY IF EXISTS "boasvindas_visitante_remocao" ON storage.objects;
CREATE POLICY "boasvindas_visitante_remocao" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boasvindas-visitante' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
