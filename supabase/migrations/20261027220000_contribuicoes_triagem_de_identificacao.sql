-- ─── Pendentes de Identificação: onde fica o que NÃO tem pessoa por escolha (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela (27/10/2026, Fase 3): a aba "Pendentes de Identificação" da tela Doadores transforma contribuições sem pessoa em fila de trabalho, com as ações Vincular pessoa, Vincular família, Aceitar
-- sugestão, Marcar como ANÔNIMO, IGNORAR e Desfazer, e taxa de identificação separada em Identificados / Anônimos / Ignorados / Pendentes (meta de 95%).
--
-- O DEFEITO: "vincular" já tem onde gravar (`fin_lancamentos.pessoa_id` e `familia_id`, e a trilha `fin_lancamento_historico` já registra quem mudou o quê). "Anônimo" e "ignorado" NÃO: uma contribuição
-- sem pessoa continua sem pessoa para sempre, então a fila nunca esvazia. Medido em 27/10/2026: 377 contribuições sem pessoa desde 01/01/2026 (R$ 63.829,88), 307 delas importadas do Omie com o nome do
-- remetente dentro de `observacoes` (truncado) e 16 manuais sem nenhum texto.
--
-- O QUE ESTA MIGRATION FAZ:
--   · `fin_contribuicao_triagem` — trilha IMUTÁVEL (só acrescenta) das decisões "anônimo", "ignorado" e "desfeita": qual lançamento, a decisão, o motivo, quem (identificador + nome na hora) e quando.
--     Desfazer é uma NOVA linha ("desfeita"), nunca um apagar. Sem chave estrangeira: apagar um lançamento (raro, só admin) não pode ser bloqueado por uma trilha imutável.
--   · `fin_contribuicao_triagem_atual` — a decisão VIGENTE de cada lançamento (a última linha; "desfeita" some). security_invoker: a RLS de quem consulta vale (as views financeiras já vazaram uma vez por isso).
--   · `contribuicao_triar(lancamento, decisao, motivo)` — a ÚNICA porta de escrita (SECURITY DEFINER): confere o papel (admin, diakonia, tesouraria), que o lançamento é uma contribuição realizada, de
--     entrada, SEM pessoa, e carimba quem fez. Sem política de INSERT: ninguém grava por fora dela.
--   · acrescenta a ação `ver_pendentes` ao registro de acessos (`contribuicoes_acessos`): a fila mostra o nome que veio do extrato junto do valor, então ver a fila fica registrado como ver a lista nominal.
--
-- NADA muda no que já existe. Sem esta migration a aba mostra a fila e deixa vincular pessoa, mas avisa que "anônimo" e "ignorado" ainda não estão disponíveis.
-- Ordem: 1º esta migration; 2º publicar o app. Reverter: docs/CONTRIBUICOES_TRIAGEM_ROLLBACK.sql.

CREATE TABLE IF NOT EXISTS public.fin_contribuicao_triagem (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  em            timestamptz NOT NULL DEFAULT clock_timestamp(),
  lancamento_id uuid NOT NULL,                       -- sem FK de propósito (ver cabeçalho)
  decisao       text NOT NULL CHECK (decisao IN ('anonimo', 'ignorado', 'desfeita')),
  motivo        text CHECK (motivo IS NULL OR length(motivo) <= 300),
  por           uuid NOT NULL,
  por_nome      text                                 -- o nome na hora: a tabela de perfis só deixa cada um ler o próprio
);
CREATE INDEX IF NOT EXISTS fin_contribuicao_triagem_lanc_idx ON public.fin_contribuicao_triagem (lancamento_id, em DESC);
COMMENT ON TABLE public.fin_contribuicao_triagem IS 'Trilha imutável (só acrescenta) das decisões de triagem de contribuições sem pessoa: anônimo, ignorado, desfeita. Quem, quando, motivo. Desfazer é uma nova linha.';

CREATE OR REPLACE FUNCTION public.fin_contribuicao_triagem_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'A triagem de contribuições só acrescenta: não se altera nem se apaga (para desfazer, registre "desfeita").'; END $fn$;
DROP TRIGGER IF EXISTS fin_contribuicao_triagem_imutavel ON public.fin_contribuicao_triagem;
CREATE TRIGGER fin_contribuicao_triagem_imutavel BEFORE UPDATE OR DELETE ON public.fin_contribuicao_triagem FOR EACH ROW EXECUTE FUNCTION public.fin_contribuicao_triagem_imutavel();

ALTER TABLE public.fin_contribuicao_triagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_contribuicao_triagem_leitura ON public.fin_contribuicao_triagem;
CREATE POLICY fin_contribuicao_triagem_leitura ON public.fin_contribuicao_triagem FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role]));
-- sem política de INSERT/UPDATE/DELETE: só a função abaixo grava

CREATE OR REPLACE VIEW public.fin_contribuicao_triagem_atual WITH (security_invoker = true) AS
  SELECT t.lancamento_id, t.decisao, t.motivo, t.por, t.por_nome, t.em
    FROM (SELECT DISTINCT ON (lancamento_id) lancamento_id, decisao, motivo, por, por_nome, em
            FROM public.fin_contribuicao_triagem ORDER BY lancamento_id, em DESC, id DESC) t
   WHERE t.decisao <> 'desfeita';
COMMENT ON VIEW public.fin_contribuicao_triagem_atual IS 'A decisão vigente de triagem de cada lançamento (a última linha da trilha; "desfeita" some). security_invoker: vale a RLS de quem consulta.';

CREATE OR REPLACE FUNCTION public.contribuicao_triar(p_lancamento uuid, p_decisao text, p_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  l public.fin_lancamentos%ROWTYPE;
  vigente text;
BEGIN
  IF v_uid IS NULL OR NOT has_any_role(v_uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para classificar contribuições.' USING ERRCODE = '42501';
  END IF;
  IF p_decisao NOT IN ('anonimo', 'ignorado', 'desfeita') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;

  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;

  SELECT decisao INTO vigente FROM public.fin_contribuicao_triagem_atual WHERE lancamento_id = p_lancamento;
  IF p_decisao = 'desfeita' THEN
    IF vigente IS NULL THEN RAISE EXCEPTION 'Este lançamento não tem classificação a desfazer.'; END IF;
  ELSE
    IF l.tipo::text <> 'entrada' OR l.status::text NOT IN ('realizado', 'conciliado') THEN RAISE EXCEPTION 'Só contribuição de entrada já realizada pode ser classificada.'; END IF;
    IF l.pessoa_id IS NOT NULL THEN RAISE EXCEPTION 'Este lançamento já tem pessoa: não é pendente de identificação.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fin_categorias c WHERE c.id = l.categoria_id AND (lower(c.nome) LIKE 'dizim%' OR lower(c.nome) LIKE 'oferta%')) THEN
      RAISE EXCEPTION 'Só dízimo, oferta ou oferta para missões entra na triagem.';
    END IF;
    IF vigente = p_decisao THEN RETURN; END IF;   -- já está assim: não grava linha repetida
  END IF;

  INSERT INTO public.fin_contribuicao_triagem (lancamento_id, decisao, motivo, por, por_nome)
  VALUES (p_lancamento, p_decisao, NULLIF(btrim(p_motivo), ''), v_uid, public.fin_nome_do_usuario(v_uid));
END
$fn$;
REVOKE ALL ON FUNCTION public.contribuicao_triar(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contribuicao_triar(uuid, text, text) TO authenticated;

-- o registro de acessos passa a cobrir também a fila de pendentes
ALTER TABLE public.contribuicoes_acessos DROP CONSTRAINT IF EXISTS contribuicoes_acessos_acao_check;
ALTER TABLE public.contribuicoes_acessos ADD CONSTRAINT contribuicoes_acessos_acao_check CHECK (acao IN (
  'ver_pessoas', 'ver_nao_contribuiram', 'exportar_pessoas', 'exportar_nao_contribuiram', 'ver_pessoa',
  'previa_relatorio', 'teste_relatorio', 'enviar_relatorio', 'ver_pendentes'
));
