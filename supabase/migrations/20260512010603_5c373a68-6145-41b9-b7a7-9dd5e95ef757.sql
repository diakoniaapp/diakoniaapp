-- 1) Documentar congregacoes como reservada (uso futuro)
COMMENT ON TABLE public.congregacoes IS
  'RESERVADA — não exibir na interface. Estrutura preparada para futura gestão multi-congregação. Não usar em novos fluxos sem aprovação institucional.';

-- 2) Histórico de Liderança (substitui qualquer ambiguidade da antiga "historico_ca")
CREATE TABLE IF NOT EXISTS public.historico_lideranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL CHECK (entidade IN ('ministerio','area')),
  entidade_id uuid NOT NULL,
  cargo text NOT NULL CHECK (cargo IN ('lider','co_lider')),
  acao text NOT NULL CHECK (acao IN ('assumiu','encerrou','substituiu')),
  membro_anterior_id uuid,
  membro_novo_id uuid,
  data date NOT NULL DEFAULT CURRENT_DATE,
  registrado_por uuid,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.historico_lideranca IS
  'Histórico institucional de trocas de Líder e Co-líder em Ministérios e Áreas. Nunca apagar registros — preserva memória de governança.';

CREATE INDEX IF NOT EXISTS idx_hist_lid_entidade ON public.historico_lideranca (entidade, entidade_id, data DESC);

ALTER TABLE public.historico_lideranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_lideranca FORCE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem historico_lideranca"
  ON public.historico_lideranca FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Sec gerenciam historico_lideranca"
  ON public.historico_lideranca FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

CREATE POLICY "Bloqueia anon" ON public.historico_lideranca
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

REVOKE ALL ON public.historico_lideranca FROM anon;

-- 3) Função e triggers que alimentam o histórico automaticamente
CREATE OR REPLACE FUNCTION public.log_lideranca_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entidade text := TG_ARGV[0]; -- 'ministerio' ou 'area'
  v_user uuid := auth.uid();
BEGIN
  IF NEW.lider_id IS DISTINCT FROM OLD.lider_id THEN
    INSERT INTO public.historico_lideranca (entidade, entidade_id, cargo, acao, membro_anterior_id, membro_novo_id, registrado_por)
    VALUES (
      v_entidade, NEW.id, 'lider',
      CASE
        WHEN OLD.lider_id IS NULL THEN 'assumiu'
        WHEN NEW.lider_id IS NULL THEN 'encerrou'
        ELSE 'substituiu'
      END,
      OLD.lider_id, NEW.lider_id, v_user
    );
  END IF;

  IF NEW.co_lider_id IS DISTINCT FROM OLD.co_lider_id THEN
    INSERT INTO public.historico_lideranca (entidade, entidade_id, cargo, acao, membro_anterior_id, membro_novo_id, registrado_por)
    VALUES (
      v_entidade, NEW.id, 'co_lider',
      CASE
        WHEN OLD.co_lider_id IS NULL THEN 'assumiu'
        WHEN NEW.co_lider_id IS NULL THEN 'encerrou'
        ELSE 'substituiu'
      END,
      OLD.co_lider_id, NEW.co_lider_id, v_user
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_lideranca_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_lideranca_ministerio ON public.ministerios;
CREATE TRIGGER trg_log_lideranca_ministerio
AFTER UPDATE OF lider_id, co_lider_id ON public.ministerios
FOR EACH ROW EXECUTE FUNCTION public.log_lideranca_change('ministerio');

DROP TRIGGER IF EXISTS trg_log_lideranca_area ON public.areas;
CREATE TRIGGER trg_log_lideranca_area
AFTER UPDATE OF lider_id, co_lider_id ON public.areas
FOR EACH ROW EXECUTE FUNCTION public.log_lideranca_change('area');