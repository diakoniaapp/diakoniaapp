-- ─── Mensagens ao visitante: configuráveis, por situação e canal, com blocos e variações — 22/10/2026 ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: a mensagem enviada ao visitante de primeira vez era simples e fixa no código (visitantesFluxo.ts / FilaPastoralQr). Passa a ser uma ferramenta de acolhimento e relacionamento: texto de
-- boas-vindas, texto pastoral, convite para retorno, assinatura, contatos, redes, próximos eventos da agenda, pedido de oração e plano de leitura — tudo editável numa área administrativa
-- (/admin/mensagens-visitante), com variações por momento e a MESMA estrutura para WhatsApp, e-mail e (futuro) SMS.
--
-- Desenho (e por quê):
--   • `visitante_mensagem_config` — UMA linha (id boolean fixo): nome da igreja, assinatura, endereço, telefone, WhatsApp, e-mail, links de pedido de oração e plano de leitura, título da lista de eventos, prazo
--     de "não retornou" (15 dias) e quantos eventos entram. As REDES (Instagram, Facebook, YouTube, Spotify, Site) ficam aqui, num jsonb [{tipo, url, ativo}], semeadas a partir da config de Boas-vindas ao
--     Visitante (que não tem Spotify nem é a mesma escolha: a mensagem pode mostrar redes diferentes da tela de agradecimento).
--   • `visitante_mensagem_modelos` — uma linha por (situação, canal): abertura, texto pastoral, convite de retorno, fechamento, assunto (e-mail) e as sete chaves de bloco. Semeadas 7 situações × WhatsApp e E-mail
--     (SMS fica previsto na CHECK e sem linhas: é futuro). Os textos de partida são os de supabase/functions/_shared/mensagensVisitante/padroes.ts (um teste confere que são os mesmos).
--   • Os PRÓXIMOS EVENTOS não são copiados: vêm de `visitante_boasvindas()` (a lista que já lê a agenda e some sozinha quando a data passa). Uma fonte só.
--   • Quem lê para ENVIAR (a equipe de acolhimento, qualquer usuário logado) chama `visitante_mensagens()` — config + modelos + eventos num só jsonb; as tabelas em si só a administração (admin, diakonia,
--     secretaria) lê e escreve, como a config de Boas-vindas. Anon não tem acesso a nada daqui. Nenhum dado de visitante é guardado nestas tabelas.
-- Nada é enviado por esta migration. Reverter: DROP FUNCTION public.visitante_mensagens(); DROP TABLE public.visitante_mensagem_modelos, public.visitante_mensagem_config;

CREATE TABLE IF NOT EXISTS public.visitante_mensagem_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  igreja_nome        text NOT NULL DEFAULT 'Quarta Igreja Batista do Rio de Janeiro' CHECK (length(btrim(igreja_nome)) BETWEEN 1 AND 120),
  assinatura         text NOT NULL DEFAULT 'Com carinho,
Equipe de Acolhimento
Quarta Igreja Batista do Rio de Janeiro' CHECK (length(assinatura) <= 400),
  endereco           text NOT NULL DEFAULT '' CHECK (length(endereco) <= 300),
  telefone           text NOT NULL DEFAULT '' CHECK (length(telefone) <= 40),
  whatsapp           text NOT NULL DEFAULT '' CHECK (length(whatsapp) <= 30),
  email_contato      text NOT NULL DEFAULT '' CHECK (length(email_contato) <= 160),
  link_pedido_oracao text NOT NULL DEFAULT '' CHECK (link_pedido_oracao = '' OR link_pedido_oracao ~* '^https?://[^\s<>"'']+$'),
  link_plano_leitura text NOT NULL DEFAULT '' CHECK (link_plano_leitura = '' OR link_plano_leitura ~* '^https?://[^\s<>"'']+$'),
  titulo_eventos     text NOT NULL DEFAULT 'Próximos eventos' CHECK (length(btrim(titulo_eventos)) BETWEEN 1 AND 80),
  dias_sem_retorno   smallint NOT NULL DEFAULT 15 CHECK (dias_sem_retorno BETWEEN 3 AND 90),
  eventos_max        smallint NOT NULL DEFAULT 4 CHECK (eventos_max BETWEEN 1 AND 10),
  redes              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(redes) = 'array' AND jsonb_array_length(redes) <= 10),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por     uuid DEFAULT auth.uid()
);
COMMENT ON TABLE public.visitante_mensagem_config IS 'Configuração (uma linha) das mensagens ao visitante: nome da igreja, assinatura, contatos, links, redes e o prazo de "não retornou".';

CREATE TABLE IF NOT EXISTS public.visitante_mensagem_modelos (
  situacao         text NOT NULL CHECK (situacao IN ('primeira_visita', 'segunda_visita', 'nao_retornou', 'interesse_membresia', 'infantil', 'jovem', 'indicado_ministerio')),
  canal            text NOT NULL CHECK (canal IN ('whatsapp', 'email', 'sms')),
  ativo            boolean NOT NULL DEFAULT true,
  assunto          text NOT NULL DEFAULT '' CHECK (length(assunto) <= 160),
  abertura         text NOT NULL DEFAULT '' CHECK (length(abertura) <= 600),
  texto_pastoral   text NOT NULL DEFAULT '' CHECK (length(texto_pastoral) <= 1200),
  convite_retorno  text NOT NULL DEFAULT '' CHECK (length(convite_retorno) <= 400),
  fechamento       text NOT NULL DEFAULT '' CHECK (length(fechamento) <= 300),
  incluir_eventos  boolean NOT NULL DEFAULT true,
  incluir_redes    boolean NOT NULL DEFAULT true,
  incluir_endereco boolean NOT NULL DEFAULT true,
  incluir_contato  boolean NOT NULL DEFAULT true,
  incluir_whatsapp boolean NOT NULL DEFAULT true,
  incluir_oracao   boolean NOT NULL DEFAULT true,
  incluir_leitura  boolean NOT NULL DEFAULT false,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid DEFAULT auth.uid(),
  PRIMARY KEY (situacao, canal)
);
COMMENT ON TABLE public.visitante_mensagem_modelos IS 'Um modelo de mensagem por situação (primeira visita, segunda visita, não retornou, membresia, infantil, jovem, indicado por ministério) e canal (WhatsApp, e-mail, SMS futuro).';

ALTER TABLE public.visitante_mensagem_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitante_mensagem_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.visitante_mensagem_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitante_mensagem_modelos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitante_mensagem_config, public.visitante_mensagem_modelos FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Bloqueia anon" ON public.visitante_mensagem_config;
CREATE POLICY "Bloqueia anon" ON public.visitante_mensagem_config AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Bloqueia anon" ON public.visitante_mensagem_modelos;
CREATE POLICY "Bloqueia anon" ON public.visitante_mensagem_modelos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Administracao" ON public.visitante_mensagem_config;
CREATE POLICY "Administracao" ON public.visitante_mensagem_config FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
DROP POLICY IF EXISTS "Administracao" ON public.visitante_mensagem_modelos;
CREATE POLICY "Administracao" ON public.visitante_mensagem_modelos FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
GRANT SELECT, INSERT, UPDATE ON public.visitante_mensagem_config, public.visitante_mensagem_modelos TO authenticated;

-- ── a linha inicial: o nome da igreja da Identidade e as redes que a tela de Boas-vindas já tem (ativas só se tinham endereço) + Spotify vazio e desligado ──────────────────
INSERT INTO public.visitante_mensagem_config (id, igreja_nome, redes)
SELECT true,
       COALESCE((SELECT nullif(btrim(nome_igreja), '') FROM public.identidade_igreja WHERE ativa ORDER BY created_at LIMIT 1), 'Quarta Igreja Batista do Rio de Janeiro'),
       jsonb_build_array(
         jsonb_build_object('tipo', 'instagram', 'url', COALESCE(c.instagram, ''), 'ativo', COALESCE(c.instagram, '') ~* '^https?://'),
         jsonb_build_object('tipo', 'facebook',  'url', COALESCE(c.facebook, ''),  'ativo', COALESCE(c.facebook, '')  ~* '^https?://'),
         jsonb_build_object('tipo', 'youtube',   'url', COALESCE(c.youtube, ''),   'ativo', COALESCE(c.youtube, '')   ~* '^https?://'),
         jsonb_build_object('tipo', 'spotify',   'url', '', 'ativo', false),
         jsonb_build_object('tipo', 'site',      'url', COALESCE(c.site, ''),      'ativo', COALESCE(c.site, '')      ~* '^https?://'))
  FROM (SELECT (SELECT x->>'url' FROM jsonb_array_elements(b.canais) x WHERE x->>'tipo' = 'instagram' LIMIT 1) AS instagram,
               (SELECT x->>'url' FROM jsonb_array_elements(b.canais) x WHERE x->>'tipo' = 'facebook'  LIMIT 1) AS facebook,
               (SELECT x->>'url' FROM jsonb_array_elements(b.canais) x WHERE x->>'tipo' = 'youtube'   LIMIT 1) AS youtube,
               (SELECT x->>'url' FROM jsonb_array_elements(b.canais) x WHERE x->>'tipo' = 'site'      LIMIT 1) AS site
          FROM (SELECT canais FROM public.visitante_boasvindas WHERE id UNION ALL SELECT '[]'::jsonb LIMIT 1) b) c
ON CONFLICT (id) DO NOTHING;

-- ── os 14 modelos de partida (7 situações × WhatsApp e E-mail): os textos de padroes.ts ─────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.visitante_mensagem_modelos
  (situacao, canal, ativo, assunto, abertura, texto_pastoral, convite_retorno, fechamento, incluir_eventos, incluir_redes, incluir_endereco, incluir_contato, incluir_whatsapp, incluir_oracao, incluir_leitura)
VALUES
  ('primeira_visita', 'whatsapp', true, 'Foi uma alegria receber você, {{nome}}!', 'Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!', 'Foi um privilégio ter você conosco. Deus conhece cada um de nós pelo nome, e queremos que você se sinta em casa. Se houver algo pelo qual possamos orar ou conversar com você, estamos à disposição.', 'Esperamos ver você de novo em breve. Veja o que vem por aí:', 'Que a graça e a paz de Cristo estejam com você!', true, true, true, true, true, true, false),
  ('primeira_visita', 'email', true, 'Foi uma alegria receber você, {{nome}}!', 'Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!', 'Foi um privilégio ter você conosco. Deus conhece cada um de nós pelo nome, e queremos que você se sinta em casa. Se houver algo pelo qual possamos orar ou conversar com você, estamos à disposição.', 'Esperamos ver você de novo em breve. Veja o que vem por aí:', 'Que a graça e a paz de Cristo estejam com você!', true, true, true, true, true, true, false),
  ('segunda_visita', 'whatsapp', true, 'Que bom ver você de novo, {{nome}}!', 'Olá, {{nome}}! 💙 Que alegria ver você de novo na {{igreja}}!', 'Sua presença nos alegra muito. Queremos caminhar com você: se quiser conhecer um pequeno grupo, a escola bíblica ou conversar com a nossa equipe, é só nos chamar.', 'Que tal participar também destes encontros?', 'Estamos juntos nessa caminhada!', true, true, true, true, true, true, false),
  ('segunda_visita', 'email', true, 'Que bom ver você de novo, {{nome}}!', 'Olá, {{nome}}! 💙 Que alegria ver você de novo na {{igreja}}!', 'Sua presença nos alegra muito. Queremos caminhar com você: se quiser conhecer um pequeno grupo, a escola bíblica ou conversar com a nossa equipe, é só nos chamar.', 'Que tal participar também destes encontros?', 'Estamos juntos nessa caminhada!', true, true, true, true, true, true, false),
  ('nao_retornou', 'whatsapp', true, 'Sentimos a sua falta, {{nome}}', 'Olá, {{nome}}! Sentimos a sua falta 💙', 'Faz um tempinho desde a sua visita à {{igreja}} e queríamos saber como você está. Estamos orando por você e pela sua família. Se precisar de algo, pode contar conosco.', 'As portas estão sempre abertas! Estes são os próximos encontros:', 'Será uma alegria receber você de novo.', true, true, true, true, true, true, false),
  ('nao_retornou', 'email', true, 'Sentimos a sua falta, {{nome}}', 'Olá, {{nome}}! Sentimos a sua falta 💙', 'Faz um tempinho desde a sua visita à {{igreja}} e queríamos saber como você está. Estamos orando por você e pela sua família. Se precisar de algo, pode contar conosco.', 'As portas estão sempre abertas! Estes são os próximos encontros:', 'Será uma alegria receber você de novo.', true, true, true, true, true, true, false),
  ('interesse_membresia', 'whatsapp', true, 'Seu interesse em fazer parte da {{igreja}}', 'Olá, {{nome}}! 🙏 Obrigado por demonstrar interesse em fazer parte da família da {{igreja}}!', 'Ser membro é caminhar junto, servir e crescer na fé em comunidade. Nossa equipe vai explicar com carinho como funciona o processo e tirar todas as suas dúvidas, sem pressa.', 'Para dar o próximo passo, fale com a nossa equipe ou venha a um dos encontros:', 'Será uma alegria caminhar com você!', true, true, true, true, true, true, false),
  ('interesse_membresia', 'email', true, 'Seu interesse em fazer parte da {{igreja}}', 'Olá, {{nome}}! 🙏 Obrigado por demonstrar interesse em fazer parte da família da {{igreja}}!', 'Ser membro é caminhar junto, servir e crescer na fé em comunidade. Nossa equipe vai explicar com carinho como funciona o processo e tirar todas as suas dúvidas, sem pressa.', 'Para dar o próximo passo, fale com a nossa equipe ou venha a um dos encontros:', 'Será uma alegria caminhar com você!', true, true, true, true, true, true, false),
  ('infantil', 'whatsapp', true, 'Foi uma alegria receber {{nome}} na {{igreja}}', 'Olá! 🧸 Foi uma alegria receber {{nome}} na {{igreja}}!', 'Temos um trabalho especial com as crianças, com ensino bíblico no nível delas, num ambiente seguro e acolhedor. Será um prazer receber a sua família de novo.', 'Veja as próximas programações:', 'Um abraço carinhoso para a sua família!', true, true, true, true, true, true, false),
  ('infantil', 'email', true, 'Foi uma alegria receber {{nome}} na {{igreja}}', 'Olá! 🧸 Foi uma alegria receber {{nome}} na {{igreja}}!', 'Temos um trabalho especial com as crianças, com ensino bíblico no nível delas, num ambiente seguro e acolhedor. Será um prazer receber a sua família de novo.', 'Veja as próximas programações:', 'Um abraço carinhoso para a sua família!', true, true, true, true, true, true, false),
  ('jovem', 'whatsapp', true, 'Bora de novo, {{nome}}?', 'E aí, {{nome}}! 😄 Que bom ter você na {{igreja}}!', 'Aqui os jovens têm espaço para fazer amizades, aprender a Bíblia e servir. Queremos conhecer você melhor e te chamar para o próximo encontro.', 'Bora de novo? Olha o que vem aí:', 'Conte com a gente!', true, true, true, true, true, true, false),
  ('jovem', 'email', true, 'Bora de novo, {{nome}}?', 'E aí, {{nome}}! 😄 Que bom ter você na {{igreja}}!', 'Aqui os jovens têm espaço para fazer amizades, aprender a Bíblia e servir. Queremos conhecer você melhor e te chamar para o próximo encontro.', 'Bora de novo? Olha o que vem aí:', 'Conte com a gente!', true, true, true, true, true, true, false),
  ('indicado_ministerio', 'whatsapp', true, 'Seja muito bem-vindo(a), {{nome}}!', 'Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!', 'Soubemos que você chegou até nós por meio de um dos nossos ministérios. Ele ficará feliz em saber da sua visita, e queremos que você se sinta acolhido(a) em toda a igreja.', 'Venha conhecer mais da nossa programação:', 'Deus abençoe você!', true, true, true, true, true, true, false),
  ('indicado_ministerio', 'email', true, 'Seja muito bem-vindo(a), {{nome}}!', 'Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!', 'Soubemos que você chegou até nós por meio de um dos nossos ministérios. Ele ficará feliz em saber da sua visita, e queremos que você se sinta acolhido(a) em toda a igreja.', 'Venha conhecer mais da nossa programação:', 'Deus abençoe você!', true, true, true, true, true, true, false)
ON CONFLICT (situacao, canal) DO NOTHING;

-- ── a leitura para quem ENVIA: config + modelos + próximos eventos (da agenda, via visitante_boasvindas) num só jsonb ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.visitante_mensagens()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT jsonb_build_object(
    'config', to_jsonb(c) - 'id' - 'atualizado_por',
    'modelos', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'atualizado_por' ORDER BY m.situacao, m.canal) FROM public.visitante_mensagem_modelos m), '[]'::jsonb),
    'eventos', COALESCE(public.visitante_boasvindas() -> 'eventos', '[]'::jsonb)
  )
  FROM public.visitante_mensagem_config c WHERE c.id
$f$;
COMMENT ON FUNCTION public.visitante_mensagens IS 'Config, modelos e próximos eventos das mensagens ao visitante, para quem envia (usuário logado) e para as Edge Functions. Não contém dado de visitante.';
REVOKE ALL ON FUNCTION public.visitante_mensagens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitante_mensagens() TO authenticated, service_role;
