-- ─── Histórico de envios da Central de Comunicação (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
--
-- Decisão dela (27/10/2026): o pastor recebe por e-mail o relatório AGREGADO de contribuições. Um e-mail de relatório sob demanda precisa deixar rastro: quem pediu, para quem foi, quando, com que
-- resultado — hoje o sistema só sabe quando o agendador do resumo semanal rodou (`cron.job_run_details`), sem solicitante nem destinatários.
--
-- O QUE ESTA MIGRATION FAZ:
--   · `comunicacao_envios` — trilha IMUTÁVEL (só acrescenta, como `fin_lancamento_historico` e `contribuicoes_acessos`): tipo, origem (sob demanda ou teste), solicitante (identificador + nome na hora),
--     remetente, reply-to, destinatários com o resultado de CADA um, parâmetros (o período), resumo agregado, assunto, resultado geral e os ids do Resend.
--     NÃO guarda o corpo do e-mail nem anexo: guarda o que foi pedido e os números que foram. Relatório só com agregados, então nenhum nome de pessoa chega aqui.
--   · Sem política de INSERT/UPDATE/DELETE: quem grava é a Edge Function (chave de serviço). O gatilho recusa alterar ou apagar.
--   · Leitura: só admin e diakonia (a administração e o pastor titular fiscalizam; a tesouraria não).
--
-- NADA muda no que já existe. Sem esta migration a função `contribuicoes-enviar` ainda ENVIA, mas responde com um aviso de que o histórico não foi gravado.
-- Ordem: 1º esta migration; 2º implantar `contribuicoes-enviar` (docs/CONTRIBUICOES_EMAIL_IMPLANTACAO.md). Reverter: docs/COMUNICACAO_ENVIOS_ROLLBACK.sql.

CREATE TABLE IF NOT EXISTS public.comunicacao_envios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  em            timestamptz NOT NULL DEFAULT clock_timestamp(),
  tipo          text NOT NULL CHECK (tipo IN ('relatorio_contribuicoes')),
  origem        text NOT NULL CHECK (origem IN ('sob_demanda', 'teste')),
  solicitante   uuid,
  solicitante_nome text,                                  -- o nome na hora: a tabela de perfis só deixa cada um ler o próprio
  remetente     text,
  reply_to      text,
  assunto       text,
  destinatarios jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ "email": "...", "ok": true, "erro": null }]
  parametros    jsonb NOT NULL DEFAULT '{}'::jsonb,       -- o pedido: período (ini, fim)
  resumo        jsonb NOT NULL DEFAULT '{}'::jsonb,       -- números agregados que foram no e-mail (nunca nomes)
  resultado     text NOT NULL CHECK (resultado IN ('enviado', 'parcial', 'falhou')),
  resend_ids    jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS comunicacao_envios_em_idx ON public.comunicacao_envios (em DESC);
CREATE INDEX IF NOT EXISTS comunicacao_envios_solicitante_idx ON public.comunicacao_envios (solicitante, em DESC);
COMMENT ON TABLE public.comunicacao_envios IS 'Trilha imutável (só acrescenta) dos e-mails sob demanda da Central de Comunicação: quem pediu, para quem, quando, parâmetros, resumo agregado e resultado por destinatário. Não guarda o corpo do e-mail.';

CREATE OR REPLACE FUNCTION public.comunicacao_envios_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'O histórico de envios só acrescenta: não se altera nem se apaga.'; END $fn$;
DROP TRIGGER IF EXISTS comunicacao_envios_imutavel ON public.comunicacao_envios;
CREATE TRIGGER comunicacao_envios_imutavel BEFORE UPDATE OR DELETE ON public.comunicacao_envios FOR EACH ROW EXECUTE FUNCTION public.comunicacao_envios_imutavel();

ALTER TABLE public.comunicacao_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comunicacao_envios_leitura ON public.comunicacao_envios;
CREATE POLICY comunicacao_envios_leitura ON public.comunicacao_envios FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role]));
-- sem política de INSERT/UPDATE/DELETE: só a Edge Function (chave de serviço) grava
