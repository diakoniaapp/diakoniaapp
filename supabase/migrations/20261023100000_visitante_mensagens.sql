-- ─── Mensagens ao visitante: configuráveis, por situação e canal, com blocos e variações — 22/10/2026 ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: a mensagem enviada ao visitante de primeira vez era simples e fixa no código (visitantesFluxo.ts / FilaPastoralQr). Passa a ser uma ferramenta de acolhimento e relacionamento: texto de
-- boas-vindas, texto pastoral, convite para retorno, assinatura, contatos, redes, próximos eventos da agenda, pedido de oração e plano de leitura — tudo editável numa área administrativa
-- (/admin/mensagens-visitante), com variações por momento e a MESMA estrutura para WhatsApp, e-mail e (futuro) SMS.
--
-- A IDENTIDADE DA IGREJA É A FONTE ÚNICA (decisão dela, 22/10/2026, ao revisar a arquitetura do acolhimento): nome, site, redes sociais (inclui WhatsApp e Spotify), endereço, telefone e e-mail vêm de
-- `identidade_igreja`. Antes desta revisão a configuração das mensagens guardava a sua própria cópia das redes e dos contatos — a terceira cópia (as outras duas: Identidade e a tela de Boas-vindas);
-- como esta migration ainda não tinha sido aplicada, ela foi reformulada em vez de remendada depois.
--
-- Desenho (e por quê):
--   • `identidade_igreja` ganha 3 colunas, todas opcionais e nulas no que já existe: `endereco`, `telefone`, `email_contato` (a Identidade tinha nome, site e redes, mas não onde a igreja fica nem como falar com ela).
--     Nenhuma linha existente é alterada.
--   • `visitante_mensagem_config` — UMA linha (id boolean fixo): só o que é DAS MENSAGENS — assinatura, links de pedido de oração e de plano de leitura, título da lista de eventos, prazo de "não retornou"
--     (15 dias), quantos eventos entram e `redes_ocultas` (redes que existem na Identidade mas a mensagem não mostra; vazio = mostra todas as que têm endereço).
--   • `visitante_mensagem_modelos` — uma linha por (situação, canal): abertura, texto pastoral, convite de retorno, fechamento, assunto (e-mail) e as sete chaves de bloco. Semeadas 7 situações × WhatsApp
--     e E-mail (SMS fica previsto na CHECK e sem linhas: é futuro). Os textos de partida são os de supabase/functions/_shared/mensagensVisitante/padroes.ts (um teste confere que são os mesmos). A assinatura
--     de partida usa a marca {{igreja}}, o nome da Identidade.
--   • Os PRÓXIMOS EVENTOS não são copiados: vêm de `visitante_boasvindas()` (a lista que já lê a agenda e some sozinha quando a data passa). Uma fonte só.
--   • Quem lê para ENVIAR (a equipe de acolhimento, qualquer usuário logado) chama `visitante_mensagens()` — config + modelos + identidade + eventos num só jsonb; as tabelas de mensagens só a administração
--     (admin, diakonia, secretaria) lê e escreve, como a config de Boas-vindas. Anon não tem acesso a nada daqui. Nenhum dado de visitante é guardado nestas tabelas.
-- Nada é enviado por esta migration. Reverter: DROP FUNCTION public.visitante_mensagens(); DROP TABLE public.visitante_mensagem_modelos, public.visitante_mensagem_config;
-- (e, se quiser, ALTER TABLE public.identidade_igreja DROP COLUMN endereco, DROP COLUMN telefone, DROP COLUMN email_contato — só depois de conferir que ninguém preencheu).

-- ── 1) a Identidade passa a ter onde a igreja fica e como falar com ela ──────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.identidade_igreja
  ADD COLUMN IF NOT EXISTS endereco      text CHECK (endereco IS NULL OR length(endereco) <= 300),
  ADD COLUMN IF NOT EXISTS telefone      text CHECK (telefone IS NULL OR length(telefone) <= 40),
  ADD COLUMN IF NOT EXISTS email_contato text CHECK (email_contato IS NULL OR length(email_contato) <= 160);
COMMENT ON COLUMN public.identidade_igreja.endereco IS 'Onde a igreja fica (uma linha). Alimenta as mensagens ao visitante.';
COMMENT ON COLUMN public.identidade_igreja.telefone IS 'Telefone de contato da igreja. Alimenta as mensagens ao visitante.';
COMMENT ON COLUMN public.identidade_igreja.email_contato IS 'E-mail de contato da igreja (não é o e-mail de login de ninguém). Alimenta as mensagens ao visitante.';

-- ── 2) o que é DAS MENSAGENS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_mensagem_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  assinatura         text NOT NULL DEFAULT 'Com carinho,
Equipe de Acolhimento
{{igreja}}' CHECK (length(assinatura) <= 400),
  link_pedido_oracao text NOT NULL DEFAULT '' CHECK (link_pedido_oracao = '' OR link_pedido_oracao ~* '^https?://[^\s<>"'']+$'),
  link_plano_leitura text NOT NULL DEFAULT '' CHECK (link_plano_leitura = '' OR link_plano_leitura ~* '^https?://[^\s<>"'']+$'),
  titulo_eventos     text NOT NULL DEFAULT 'Próximos eventos' CHECK (length(btrim(titulo_eventos)) BETWEEN 1 AND 80),
  dias_sem_retorno   smallint NOT NULL DEFAULT 15 CHECK (dias_sem_retorno BETWEEN 3 AND 90),
  eventos_max        smallint NOT NULL DEFAULT 4 CHECK (eventos_max BETWEEN 1 AND 10),
  redes_ocultas      text[] NOT NULL DEFAULT '{}' CHECK (redes_ocultas <@ ARRAY['instagram', 'facebook', 'youtube', 'tiktok', 'spotify', 'telegram', 'site']),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por     uuid DEFAULT auth.uid()
);
COMMENT ON TABLE public.visitante_mensagem_config IS 'Configuração (uma linha) das mensagens ao visitante: assinatura, links de oração e leitura, prazo de "não retornou", quantos eventos e quais redes ocultar. Nome, redes, endereço e contatos vêm da Identidade da Igreja.';

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

INSERT INTO public.visitante_mensagem_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ── 3) os 14 modelos de partida (7 situações × WhatsApp e E-mail): os textos de padroes.ts ─────────────────────────────────────────────────────────────────────────────────
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

-- ── 4) a leitura para quem ENVIA: config + modelos + IDENTIDADE + próximos eventos (da agenda, via visitante_boasvindas) num só jsonb ───────────────────────────────────────
-- 'igreja' é a Identidade ATIVA mais antiga (a mesma que a tela de Boas-vindas usou para semear os canais). Sem Identidade cadastrada, 'igreja' vem vazio e o app usa o nome padrão.
CREATE OR REPLACE FUNCTION public.visitante_mensagens()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT jsonb_build_object(
    'config', to_jsonb(c) - 'id' - 'atualizado_por',
    'modelos', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'atualizado_por' ORDER BY m.situacao, m.canal) FROM public.visitante_mensagem_modelos m), '[]'::jsonb),
    'igreja', COALESCE((
       SELECT jsonb_build_object('nome', i.nome_igreja, 'site', COALESCE(i.site_oficial, ''), 'redes', COALESCE(i.redes_sociais, '[]'::jsonb),
                                 'endereco', COALESCE(i.endereco, ''), 'telefone', COALESCE(i.telefone, ''), 'email', COALESCE(i.email_contato, ''),
                                 'resumo', COALESCE(i.resumo, ''), 'missao', COALESCE(i.missao, ''))
         FROM public.identidade_igreja i WHERE i.ativa ORDER BY i.created_at LIMIT 1), '{}'::jsonb),
    'eventos', COALESCE(public.visitante_boasvindas() -> 'eventos', '[]'::jsonb)
  )
  FROM public.visitante_mensagem_config c WHERE c.id
$f$;
COMMENT ON FUNCTION public.visitante_mensagens IS 'Config, modelos, Identidade da Igreja e próximos eventos das mensagens ao visitante, para quem envia (usuário logado) e para as Edge Functions. Não contém dado de visitante.';
REVOKE ALL ON FUNCTION public.visitante_mensagens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitante_mensagens() TO authenticated, service_role;
