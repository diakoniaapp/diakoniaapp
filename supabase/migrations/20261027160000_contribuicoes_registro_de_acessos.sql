-- ─── Registro de quem VÊ a lista nominal de contribuições (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
--
-- Decisão dela (27/10/2026): o pastor recebe por e-mail só o relatório AGREGADO; a lista com NOMES fica só dentro do sistema, para usuários autorizados, "com auditoria de quem visualizou".
-- Contribuição individual é dado financeiro e, indiretamente, de convicção religiosa (LGPD, dado sensível); a lista de quem NÃO contribuiu é tão sensível quanto a de quem contribui.
--
-- O DEFEITO QUE ISTO FECHA: hoje as telas Doadores/Detalhe mostram nome e valor de cada pessoa a admin, diakonia e tesouraria e NADA registra que alguém abriu. A tela nova (painel, lista de
-- pessoas, "Não contribuíram no período") grava uma linha por consulta nominal e por exportação.
--
-- O QUE ESTA MIGRATION FAZ:
--   · `contribuicoes_acessos` — trilha IMUTÁVEL (só acrescenta, como `fin_lancamento_historico`): quem (identificador + nome na hora), o quê (ação), com quais filtros, quantas pessoas apareceram, quando.
--     NÃO guarda nomes nem valores: só que a lista foi vista e com que recorte.
--   · `contribuicoes_registrar_acesso(acao, filtros, total)` — a ÚNICA porta de escrita (SECURITY DEFINER): confere o papel (admin, diakonia, tesouraria), carimba `auth.uid()` e o nome; o cliente
--     não escolhe "quem". A tabela não tem política de INSERT: ninguém grava por fora da função.
--   · Leitura: só admin e diakonia (o pastor titular e a administração fiscalizam; a tesouraria não lê o próprio rastro).
--
-- NADA muda no que já existe. Sem esta migration a tela nova avisa que o registro está indisponível (ver `contribuicoesService`).
-- Ordem: 1º esta migration; 2º publicar o app (já publicado funciona: sem a função, a lista nominal mostra o aviso). Reverter: docs/CONTRIBUICOES_REGISTRO_ROLLBACK.sql.

CREATE TABLE IF NOT EXISTS public.contribuicoes_acessos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  em         timestamptz NOT NULL DEFAULT clock_timestamp(),
  por        uuid NOT NULL,
  por_nome   text,                                      -- o nome na hora: a tabela de perfis só deixa cada um ler o próprio
  acao       text NOT NULL CHECK (acao IN ('ver_pessoas', 'ver_nao_contribuiram', 'exportar_pessoas', 'exportar_nao_contribuiram', 'ver_pessoa')),
  filtros    jsonb NOT NULL DEFAULT '{}'::jsonb,        -- período, categoria, grupo…: o RECORTE, nunca nomes
  total      integer CHECK (total IS NULL OR total >= 0)   -- quantas pessoas apareceram
);
CREATE INDEX IF NOT EXISTS contribuicoes_acessos_em_idx  ON public.contribuicoes_acessos (em DESC);
CREATE INDEX IF NOT EXISTS contribuicoes_acessos_por_idx ON public.contribuicoes_acessos (por, em DESC);
COMMENT ON TABLE public.contribuicoes_acessos IS 'Trilha imutável (só acrescenta) de quem viu ou exportou a lista NOMINAL de contribuições e de quem não contribuiu: quem, ação, recorte (filtros), quantas pessoas, quando. Não guarda nomes nem valores.';

CREATE OR REPLACE FUNCTION public.contribuicoes_acessos_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'O registro de acessos às contribuições só acrescenta: não se altera nem se apaga.'; END $fn$;
DROP TRIGGER IF EXISTS contribuicoes_acessos_imutavel ON public.contribuicoes_acessos;
CREATE TRIGGER contribuicoes_acessos_imutavel BEFORE UPDATE OR DELETE ON public.contribuicoes_acessos FOR EACH ROW EXECUTE FUNCTION public.contribuicoes_acessos_imutavel();

ALTER TABLE public.contribuicoes_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contribuicoes_acessos_leitura ON public.contribuicoes_acessos;
CREATE POLICY contribuicoes_acessos_leitura ON public.contribuicoes_acessos FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role]));
-- sem política de INSERT/UPDATE/DELETE: só a função abaixo grava

CREATE OR REPLACE FUNCTION public.contribuicoes_registrar_acesso(p_acao text, p_filtros jsonb DEFAULT '{}'::jsonb, p_total integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT has_any_role(v_uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para consultar contribuições.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contribuicoes_acessos (por, por_nome, acao, filtros, total)
  VALUES (v_uid, public.fin_nome_do_usuario(v_uid), p_acao, COALESCE(p_filtros, '{}'::jsonb), p_total);
END
$fn$;
REVOKE ALL ON FUNCTION public.contribuicoes_registrar_acesso(text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contribuicoes_registrar_acesso(text, jsonb, integer) TO authenticated;
