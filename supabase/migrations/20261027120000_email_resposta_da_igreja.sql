-- ─── Reply-To dos e-mails automáticos: o endereço para onde vai a RESPOSTA, configurável pela igreja (27/10/2026) ──────────────────────────────────────────────
--
-- Pedido dela (27/10/2026): "From: resumo@diakoniaapp.com.br · Reply-To: configurável pela igreja" (tesouraria@…, administracao@… ou o e-mail dela) e NUNCA `nao-responda@`.
--
-- O DEFEITO: os resumos e alertas saem de `Diakonia <resumo@diakoniaapp.com.br>` (escrito em 7 Edge Functions) e nenhum tinha Reply-To. O domínio `diakoniaapp.com.br` entrega no Google Workspace
-- (MX medido em 27/10/2026): se `resumo@` não tiver caixa, quem responde recebe "endereço não encontrado" e a resposta se perde; se tiver, ninguém é avisado de que existe.
--
-- O QUE ESTA MIGRATION FAZ (uma coluna, opcional, nula no que já existe):
--   · `identidade_igreja.email_resposta` — o Reply-To dos e-mails automáticos. As Edge Functions o leem pela Identidade da Igreja (fonte única do que é institucional), caindo para
--     `email_contato` (o contato que já existe) quando em branco; sem nenhum dos dois, o e-mail sai sem Reply-To e o rodapé pede para não responder.
--   · Nada muda nos e-mails enquanto o campo estiver vazio e as funções não forem reimplantadas.
--
-- ORDEM: 1º esta migration; 2º publicar o app (o campo aparece em Identidade quando a coluna existe); 3º reimplantar as 7 funções (ver docs/EMAIL_RESPOSTA_E_SALDO_IMPLANTACAO.md); 4º preencher o campo.
-- Reverter: docs/EMAIL_RESPOSTA_ROLLBACK.sql.

ALTER TABLE public.identidade_igreja
  ADD COLUMN IF NOT EXISTS email_resposta text CHECK (email_resposta IS NULL OR length(email_resposta) <= 160);

COMMENT ON COLUMN public.identidade_igreja.email_resposta IS
  'Reply-To dos e-mails automáticos (resumos e alertas): para onde vai a resposta de quem responde. Em branco: vale email_contato; sem nenhum, o e-mail sai sem Reply-To e o rodapé pede para não responder.';
