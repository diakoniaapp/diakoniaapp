-- ─── DOCUMENTOS DO FECHAMENTO: o que se manda à contabilidade e NÃO é despesa, obrigação nem fornecedor (15/10/2026) ───────────────────────────────────────────────
--
-- Pedido dela: extratos bancários, OFX, faturas de cartão, relatórios Cielo e Rede, aplicações, rendimentos e outros documentos do mês pertencem ao FECHAMENTO DO MÊS, não a um lançamento.
-- Hoje não há onde guardá-los: `fin_lancamento_anexos` prende o arquivo a UM lançamento (e exige despesa), e o malote só leva documento de despesa.
--
-- O que esta migration cria (nada existente muda):
--   1. `fin_fechamento_documentos`: um arquivo por linha, do MÊS (ano, mes), com o tipo, a conta (opcional), a descrição, o hash (SHA-256) e QUEM incluiu e QUANDO (data e hora, pelo banco).
--      É uma TRILHA: não se apaga e não se edita; "excluir" marca o arquivo como removido, com motivo, quem e quando — o histórico de inclusão nunca some. O mesmo arquivo (mesmo hash) não entra duas vezes no mês.
--   2. `fin_fechamento_docs_dispensas`: "não se aplica neste mês" para um item do checklist (ex.: nenhum cartão usado), com motivo, quem e quando; desfazível. Sem isto o checklist nunca fecharia num mês sem cartão.
--   3. o bucket privado `fin-fechamento-docs` e as políticas do storage (as quatro equipes do financeiro).
-- Permissão: a de todas as tabelas financeiras desde 02/09/2026 — admin, diakonia, secretaria e tesouraria.
-- Alternativa descartada: reaproveitar `fin_lancamento_anexos` com um "lançamento do mês": inventaria um lançamento fictício e levaria o documento para dentro do ciclo da despesa (dossiê, ciclo, congelamento).
-- A tela funciona sem esta migration (a seção some, por sondagem). Rollback: docs/FECHAMENTO_DOCUMENTOS_ROLLBACK.sql.

-- ── 1) os documentos ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_fechamento_documentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano            int  NOT NULL CHECK (ano BETWEEN 2020 AND 2099),
  mes            int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo           text NOT NULL CHECK (tipo IN ('extrato_bancario', 'ofx', 'fatura_cartao', 'adquirente_cielo', 'adquirente_rede', 'aplicacao', 'rendimento', 'outro')),
  conta_id       uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  descricao      text,
  arquivo_nome   text NOT NULL CHECK (char_length(btrim(arquivo_nome)) > 0),
  storage_path   text NOT NULL UNIQUE,
  mime_type      text,
  tamanho_bytes  bigint NOT NULL CHECK (tamanho_bytes >= 0),
  arquivo_hash   text NOT NULL CHECK (char_length(arquivo_hash) = 64),
  incluido_em    timestamptz NOT NULL DEFAULT now(),
  incluido_por   uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  incluido_por_nome text,                       -- o NOME no momento (a tabela profiles só deixa cada um ler o próprio perfil)
  removido_em    timestamptz,
  removido_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removido_por_nome text,
  removido_motivo text,
  CONSTRAINT fin_fechamento_documentos_remocao_chk CHECK (removido_em IS NULL OR char_length(btrim(COALESCE(removido_motivo, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_fin_fechamento_documentos_mes ON public.fin_fechamento_documentos (ano, mes, incluido_em DESC);
-- o mesmo arquivo não entra duas vezes no mês (enquanto não removido)
CREATE UNIQUE INDEX IF NOT EXISTS fin_fechamento_documentos_hash_ativo_idx ON public.fin_fechamento_documentos (ano, mes, arquivo_hash) WHERE removido_em IS NULL;

CREATE OR REPLACE FUNCTION public.fin_fechamento_documentos_trilha() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'O histórico dos documentos do fechamento não se apaga. Para tirar um arquivo, use "Excluir" na tela (fica registrado quem, quando e por quê).';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.incluido_em := now();
    NEW.incluido_por := COALESCE(auth.uid(), NEW.incluido_por);   -- quem inclui é quem está logado, não o que a tela diz
    NEW.incluido_por_nome := (SELECT p.nome FROM public.profiles p WHERE p.id = NEW.incluido_por);
    NEW.removido_em := NULL; NEW.removido_por := NULL; NEW.removido_por_nome := NULL; NEW.removido_motivo := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE: só a remoção, uma vez; o arquivo e a inclusão são imutáveis
  IF OLD.removido_em IS NOT NULL THEN RAISE EXCEPTION 'Este documento já foi removido: o registro não se altera.'; END IF;
  IF (NEW.id, NEW.ano, NEW.mes, NEW.tipo, NEW.conta_id, NEW.descricao, NEW.arquivo_nome, NEW.storage_path, NEW.mime_type, NEW.tamanho_bytes, NEW.arquivo_hash, NEW.incluido_em, NEW.incluido_por, NEW.incluido_por_nome)
     IS DISTINCT FROM (OLD.id, OLD.ano, OLD.mes, OLD.tipo, OLD.conta_id, OLD.descricao, OLD.arquivo_nome, OLD.storage_path, OLD.mime_type, OLD.tamanho_bytes, OLD.arquivo_hash, OLD.incluido_em, OLD.incluido_por, OLD.incluido_por_nome) THEN
    RAISE EXCEPTION 'O documento do fechamento não se edita: exclua e anexe de novo, para o histórico mostrar o que aconteceu.';
  END IF;
  IF NEW.removido_em IS NULL THEN NEW.removido_por := NULL; NEW.removido_por_nome := NULL; NEW.removido_motivo := NULL; RETURN NEW; END IF;
  IF NEW.removido_motivo IS NULL OR char_length(btrim(NEW.removido_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da exclusão (pelo menos 5 caracteres).'; END IF;
  NEW.removido_em := now();
  NEW.removido_por := auth.uid();
  NEW.removido_por_nome := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_fechamento_documentos_trilha ON public.fin_fechamento_documentos;
CREATE TRIGGER fin_fechamento_documentos_trilha BEFORE INSERT OR UPDATE OR DELETE ON public.fin_fechamento_documentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_fechamento_documentos_trilha();

ALTER TABLE public.fin_fechamento_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_fechamento_documentos_equipe ON public.fin_fechamento_documentos;
CREATE POLICY fin_fechamento_documentos_equipe ON public.fin_fechamento_documentos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMENT ON TABLE public.fin_fechamento_documentos IS
  'Documentos do FECHAMENTO do mês (extratos, OFX, faturas de cartão, relatórios de adquirentes, aplicações, rendimentos…): pertencem ao mês, não a uma despesa. Trilha imutável: excluir = marcar removido, com motivo, quem e quando.';

-- ── 2) "não se aplica neste mês" (um item do checklist) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_fechamento_docs_dispensas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano         int  NOT NULL CHECK (ano BETWEEN 2020 AND 2099),
  mes         int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  grupo       text NOT NULL CHECK (grupo IN ('extrato', 'ofx', 'cartao', 'adquirente')),
  motivo      text NOT NULL CHECK (char_length(btrim(motivo)) >= 5),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por_nome text,
  desfeita_em timestamptz,
  desfeita_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  desfeita_por_nome text
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_fechamento_docs_dispensas_ativa_idx ON public.fin_fechamento_docs_dispensas (ano, mes, grupo) WHERE desfeita_em IS NULL;

CREATE OR REPLACE FUNCTION public.fin_fechamento_docs_dispensas_trilha() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'O histórico das dispensas do checklist não se apaga: use "Desfazer" na tela.'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.criado_em := now(); NEW.criado_por := COALESCE(auth.uid(), NEW.criado_por); NEW.desfeita_em := NULL; NEW.desfeita_por := NULL; NEW.desfeita_por_nome := NULL;
    NEW.criado_por_nome := (SELECT p.nome FROM public.profiles p WHERE p.id = NEW.criado_por);
    RETURN NEW;
  END IF;
  IF OLD.desfeita_em IS NOT NULL THEN RAISE EXCEPTION 'Esta dispensa já foi desfeita: o registro não se altera.'; END IF;
  IF (NEW.id, NEW.ano, NEW.mes, NEW.grupo, NEW.motivo, NEW.criado_em, NEW.criado_por, NEW.criado_por_nome) IS DISTINCT FROM (OLD.id, OLD.ano, OLD.mes, OLD.grupo, OLD.motivo, OLD.criado_em, OLD.criado_por, OLD.criado_por_nome) THEN
    RAISE EXCEPTION 'A dispensa não se edita: desfaça e registre outra.';
  END IF;
  IF NEW.desfeita_em IS NOT NULL THEN NEW.desfeita_em := now(); NEW.desfeita_por := auth.uid(); NEW.desfeita_por_nome := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid()); ELSE NEW.desfeita_por := NULL; NEW.desfeita_por_nome := NULL; END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_fechamento_docs_dispensas_trilha ON public.fin_fechamento_docs_dispensas;
CREATE TRIGGER fin_fechamento_docs_dispensas_trilha BEFORE INSERT OR UPDATE OR DELETE ON public.fin_fechamento_docs_dispensas
  FOR EACH ROW EXECUTE FUNCTION public.fin_fechamento_docs_dispensas_trilha();

ALTER TABLE public.fin_fechamento_docs_dispensas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_fechamento_docs_dispensas_equipe ON public.fin_fechamento_docs_dispensas;
CREATE POLICY fin_fechamento_docs_dispensas_equipe ON public.fin_fechamento_docs_dispensas
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMENT ON TABLE public.fin_fechamento_docs_dispensas IS
  'Itens do checklist de documentos do fechamento marcados como "não se aplica neste mês" (com motivo, quem e quando; desfazível).';

-- ── 3) o bucket privado e as políticas do storage ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fin-fechamento-docs', 'fin-fechamento-docs', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS fin_fechamento_docs_storage_ler ON storage.objects;
CREATE POLICY fin_fechamento_docs_storage_ler ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fin-fechamento-docs' AND has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_fechamento_docs_storage_enviar ON storage.objects;
CREATE POLICY fin_fechamento_docs_storage_enviar ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fin-fechamento-docs' AND has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_fechamento_docs_storage_apagar ON storage.objects;
CREATE POLICY fin_fechamento_docs_storage_apagar ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fin-fechamento-docs' AND has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
