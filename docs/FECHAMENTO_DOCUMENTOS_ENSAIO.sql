-- ENSAIO — documentos do fechamento. NADA FICA GRAVADO: o bloco termina de propósito com um erro ("RESULTADO DO ENSAIO ..."), que desfaz tudo. Cole a mensagem de volta.
DO $ens$
DECLARE
  rel text := ''; ok boolean := true; falhou boolean; msg text; d1 uuid; n int; t_antes bigint;
  h1 constant text := repeat('a', 64); h2 constant text := repeat('b', 64);
BEGIN
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
  

  -- 1) a estrutura
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('fin_fechamento_documentos', 'fin_fechamento_docs_dispensas') AND rowsecurity;
  IF n = 2 THEN rel := rel || ' 1 ok (2 tabelas com RLS).'; ELSE ok := false; rel := rel || ' FALHOU 1: tabelas/RLS.'; END IF;
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'fin-fechamento-docs' AND public = false;
  IF n = 1 THEN rel := rel || ' 2 ok (bucket privado).'; ELSE ok := false; rel := rel || ' FALHOU 2: bucket.'; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'fin_fechamento_docs_storage_%';
  IF n = 3 THEN rel := rel || ' 3 ok (3 políticas no storage).'; ELSE ok := false; rel := rel || ' FALHOU 3: ' || n || ' políticas.'; END IF;

  -- 2) incluir um documento do mês
  INSERT INTO public.fin_fechamento_documentos (ano, mes, tipo, arquivo_nome, storage_path, tamanho_bytes, arquivo_hash, mime_type)
  VALUES (2026, 9, 'extrato_bancario', 'extrato.pdf', 'ensaio/2026-09/a.pdf', 100, h1, 'application/pdf') RETURNING id INTO d1;
  SELECT count(*) INTO n FROM public.fin_fechamento_documentos WHERE id = d1 AND incluido_em IS NOT NULL AND removido_em IS NULL;
  IF n = 1 THEN rel := rel || ' 4 ok (documento incluído, com data e hora).'; ELSE ok := false; rel := rel || ' FALHOU 4.'; END IF;

  -- 3) o mesmo arquivo não entra duas vezes no mês; em outro mês, sim
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_documentos (ano, mes, tipo, arquivo_nome, storage_path, tamanho_bytes, arquivo_hash) VALUES (2026, 9, 'ofx', 'copia.pdf', 'ensaio/2026-09/b.pdf', 100, h1); EXCEPTION WHEN unique_violation THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 5 ok (arquivo repetido no mês é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 5.'; END IF;
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_documentos (ano, mes, tipo, arquivo_nome, storage_path, tamanho_bytes, arquivo_hash) VALUES (2026, 10, 'extrato_bancario', 'extrato.pdf', 'ensaio/2026-10/a.pdf', 100, h1); EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF NOT falhou THEN rel := rel || ' 6 ok (o mesmo arquivo em outro mês é aceito).'; ELSE ok := false; rel := rel || ' FALHOU 6.'; END IF;

  -- 4) tipo inválido
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_documentos (ano, mes, tipo, arquivo_nome, storage_path, tamanho_bytes, arquivo_hash) VALUES (2026, 9, 'despesa', 'x.pdf', 'ensaio/x', 1, h2); EXCEPTION WHEN check_violation THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 7 ok (tipo inválido é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 7.'; END IF;

  -- 5) o arquivo não se edita
  falhou := false; BEGIN UPDATE public.fin_fechamento_documentos SET arquivo_nome = 'outro.pdf' WHERE id = d1; EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 8 ok (editar o documento é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 8.'; END IF;

  -- 6) excluir = marcar removido, com motivo
  falhou := false; BEGIN UPDATE public.fin_fechamento_documentos SET removido_em = now() WHERE id = d1; EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 9 ok (excluir sem motivo é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 9.'; END IF;
  UPDATE public.fin_fechamento_documentos SET removido_em = now(), removido_motivo = 'arquivo do mês errado' WHERE id = d1;
  SELECT count(*) INTO n FROM public.fin_fechamento_documentos WHERE id = d1 AND removido_em IS NOT NULL AND removido_motivo = 'arquivo do mês errado';
  IF n = 1 THEN rel := rel || ' 10 ok (exclusão registrada, com motivo e hora).'; ELSE ok := false; rel := rel || ' FALHOU 10.'; END IF;
  falhou := false; BEGIN UPDATE public.fin_fechamento_documentos SET removido_motivo = 'mudei de ideia agora' WHERE id = d1; EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 11 ok (documento removido não se altera).'; ELSE ok := false; rel := rel || ' FALHOU 11.'; END IF;
  falhou := false; BEGIN DELETE FROM public.fin_fechamento_documentos WHERE id = d1; EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 12 ok (apagar o histórico é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 12.'; END IF;
  -- depois de removido, o mesmo arquivo pode entrar de novo
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_documentos (ano, mes, tipo, arquivo_nome, storage_path, tamanho_bytes, arquivo_hash) VALUES (2026, 9, 'extrato_bancario', 'extrato.pdf', 'ensaio/2026-09/c.pdf', 100, h1); EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF NOT falhou THEN rel := rel || ' 13 ok (depois de excluído, o mesmo arquivo pode ser anexado de novo).'; ELSE ok := false; rel := rel || ' FALHOU 13.'; END IF;

  -- 7) "não se aplica neste mês"
  INSERT INTO public.fin_fechamento_docs_dispensas (ano, mes, grupo, motivo) VALUES (2026, 9, 'cartao', 'nenhum cartão usado em setembro');
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_docs_dispensas (ano, mes, grupo, motivo) VALUES (2026, 9, 'cartao', 'de novo o mesmo motivo'); EXCEPTION WHEN unique_violation THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 14 ok (dispensa repetida é recusada).'; ELSE ok := false; rel := rel || ' FALHOU 14.'; END IF;
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_docs_dispensas (ano, mes, grupo, motivo) VALUES (2026, 9, 'ofx', 'cur'); EXCEPTION WHEN check_violation THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 15 ok (dispensa sem motivo é recusada).'; ELSE ok := false; rel := rel || ' FALHOU 15.'; END IF;
  UPDATE public.fin_fechamento_docs_dispensas SET desfeita_em = now() WHERE ano = 2026 AND mes = 9 AND grupo = 'cartao';
  falhou := false; BEGIN INSERT INTO public.fin_fechamento_docs_dispensas (ano, mes, grupo, motivo) VALUES (2026, 9, 'cartao', 'agora usou, depois dispensou'); EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF NOT falhou THEN rel := rel || ' 16 ok (desfeita a dispensa, outra pode ser registrada).'; ELSE ok := false; rel := rel || ' FALHOU 16.'; END IF;
  falhou := false; BEGIN DELETE FROM public.fin_fechamento_docs_dispensas; EXCEPTION WHEN OTHERS THEN falhou := true; END;
  IF falhou THEN rel := rel || ' 17 ok (apagar o histórico das dispensas é recusado).'; ELSE ok := false; rel := rel || ' FALHOU 17.'; END IF;

  RAISE EXCEPTION 'RESULTADO DO ENSAIO (nada foi gravado): %', CASE WHEN ok THEN 'TUDO OK.' ELSE 'HÁ FALHAS.' END || rel;
END
$ens$;
