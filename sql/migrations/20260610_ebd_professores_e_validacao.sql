-- ─── EBD: tabela professores + validação na exclusão de classes ─────────────

CREATE TABLE IF NOT EXISTS public.ebd_professores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id   uuid NOT NULL REFERENCES public.ebd_classes(id) ON DELETE CASCADE,
  pessoa_id   uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  tipo        text NOT NULL DEFAULT 'principal' CHECK (tipo IN ('principal','auxiliar','substituto')),
  ativo       boolean NOT NULL DEFAULT true,
  desde       date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ebd_professor_ativo
  ON public.ebd_professores(classe_id, pessoa_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS ix_ebd_professor_classe
  ON public.ebd_professores(classe_id) WHERE ativo = true;

ALTER TABLE public.ebd_professores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ebd_prof_select  ON public.ebd_professores;
DROP POLICY IF EXISTS ebd_prof_modify  ON public.ebd_professores;

CREATE POLICY ebd_prof_select ON public.ebd_professores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ebd_prof_modify ON public.ebd_professores
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid()
               AND ur.role::text IN ('admin','secretaria','pastor','diakonia','lideranca'))
  )
  WITH CHECK (true);

-- ── Validação: não excluir classe com matriculados ou aulas ─────────────
CREATE OR REPLACE FUNCTION public.fn_ebd_proteger_classe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mat int;
  v_aul int;
BEGIN
  SELECT COUNT(*) INTO v_mat FROM public.ebd_matriculas WHERE classe_id = OLD.id AND ativo = true;
  SELECT COUNT(*) INTO v_aul FROM public.ebd_aulas      WHERE classe_id = OLD.id;
  IF v_mat > 0 THEN
    RAISE EXCEPTION 'Nao eh possivel excluir: a classe % tem % aluno(s) matriculado(s). Desmatricule antes ou desative a classe.', OLD.nome, v_mat;
  END IF;
  IF v_aul > 0 THEN
    RAISE EXCEPTION 'Nao eh possivel excluir: a classe % tem % aula(s) registrada(s). Desative em vez de excluir.', OLD.nome, v_aul;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_ebd_proteger_classe ON public.ebd_classes;
CREATE TRIGGER tg_ebd_proteger_classe
  BEFORE DELETE ON public.ebd_classes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ebd_proteger_classe();

-- ── Validação: nome unico ja garantido pela UNIQUE(nome) ────────────────
-- ── Validação: idade_min <= idade_max ──────────────────────────────────
ALTER TABLE public.ebd_classes
  DROP CONSTRAINT IF EXISTS ebd_classes_idade_ok;
ALTER TABLE public.ebd_classes
  ADD CONSTRAINT ebd_classes_idade_ok
  CHECK (idade_min IS NULL OR idade_max IS NULL OR idade_min <= idade_max);

NOTIFY pgrst, 'reload schema';
