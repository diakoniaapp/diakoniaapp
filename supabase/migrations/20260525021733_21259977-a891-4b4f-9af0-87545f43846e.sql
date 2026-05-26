CREATE TABLE IF NOT EXISTS public.acolhimento_tarefas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitante_id  UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  data          DATE NOT NULL,
  concluida     BOOLEAN NOT NULL DEFAULT false,
  data_conclusao TIMESTAMP WITH TIME ZONE,
  criado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.acolhimento_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view acolhimento_tarefas"
  ON public.acolhimento_tarefas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert acolhimento_tarefas"
  ON public.acolhimento_tarefas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update acolhimento_tarefas"
  ON public.acolhimento_tarefas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete acolhimento_tarefas"
  ON public.acolhimento_tarefas FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_acolhimento_tarefas_visitante ON public.acolhimento_tarefas(visitante_id);
CREATE INDEX IF NOT EXISTS idx_acolhimento_tarefas_data ON public.acolhimento_tarefas(data);

ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS visitante_id UUID REFERENCES public.membros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eventos_visitante ON public.eventos(visitante_id);