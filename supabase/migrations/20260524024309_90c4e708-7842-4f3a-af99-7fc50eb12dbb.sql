-- VISITAS (histórico de comparecimentos)
CREATE TABLE public.visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  origem text,
  acompanhado_por text,
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_visitas_membro ON public.visitas(membro_id, data DESC);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas FORCE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon" ON public.visitas AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Staff leem visitas" ON public.visitas FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role,'diakonia'::app_role]));
CREATE POLICY "Admin/Sec gerenciam visitas" ON public.visitas FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

-- ACOMPANHAMENTOS PASTORAIS DE VISITANTES
CREATE TYPE acompanhamento_status AS ENUM ('pendente','em_andamento','concluido','sem_retorno');

CREATE TABLE public.acompanhamentos_visitante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL,
  status acompanhamento_status NOT NULL DEFAULT 'pendente',
  contato_feito boolean NOT NULL DEFAULT false,
  data_contato date,
  visita_realizada boolean NOT NULL DEFAULT false,
  data_visita date,
  responsavel_id uuid,
  proximo_passo text,
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_acomp_membro ON public.acompanhamentos_visitante(membro_id, created_at DESC);

CREATE TRIGGER trg_acomp_updated_at
  BEFORE UPDATE ON public.acompanhamentos_visitante
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.acompanhamentos_visitante ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acompanhamentos_visitante FORCE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon" ON public.acompanhamentos_visitante AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Staff leem acompanhamentos" ON public.acompanhamentos_visitante FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role,'diakonia'::app_role]));
CREATE POLICY "Admin/Sec gerenciam acompanhamentos" ON public.acompanhamentos_visitante FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

-- TRIGGER: registrar conversão de tipo_pessoa no histórico
CREATE OR REPLACE FUNCTION public.log_tipo_pessoa_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_pessoa IS DISTINCT FROM OLD.tipo_pessoa THEN
    INSERT INTO public.historico_membro (membro_id, tipo, descricao, data, registrado_por)
    VALUES (
      NEW.id,
      'conversao_tipo',
      'Tipo alterado de ' || OLD.tipo_pessoa::text || ' para ' || NEW.tipo_pessoa::text,
      CURRENT_DATE,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_tipo_pessoa
  AFTER UPDATE OF tipo_pessoa ON public.membros
  FOR EACH ROW EXECUTE FUNCTION public.log_tipo_pessoa_change();