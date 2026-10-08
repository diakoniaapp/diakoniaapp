-- ─── Mesa de Conciliação: "Ignorar este lançamento" do extrato, que lembra a decisão ─────────────────────────────
-- O Omie oferece "Ignorar este lançamento"; o DiakoniaApp não tinha. Sem ela, uma linha do OFX que não deve virar lançamento
-- (movimento duplicado, valor devolvido, depósito que não é da igreja…) voltaria a aparecer em TODA importação do mesmo extrato.
-- Esta tabela guarda a decisão por conta + FITID (o identificador único do banco): a análise do OFX passa a tratar a linha como
-- "ignorada" e a Mesa a mantém recolhida, com opção de reativar. Não toca em nenhum lançamento nem em nenhum dado existente.
-- Escrita e leitura: a mesma malha do financeiro (admin, diakonia, secretaria, tesouraria).

CREATE TABLE IF NOT EXISTS public.fin_extrato_ignorados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id    uuid NOT NULL REFERENCES public.fin_contas(id) ON DELETE CASCADE,
  fitid       text NOT NULL CHECK (length(btrim(fitid)) > 0),
  motivo      text NOT NULL DEFAULT 'outro' CHECK (motivo IN ('duplicado', 'devolvido', 'nao_e_da_igreja', 'outro')),
  observacao  text CHECK (observacao IS NULL OR length(observacao) <= 300),
  -- o que a linha era, para a tesouraria reconhecer depois (o FITID sozinho não diz nada a ninguém)
  data        date,
  valor       numeric(14, 2),
  memo        text,
  criado_por  uuid DEFAULT auth.uid(),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_id, fitid)
);
CREATE INDEX IF NOT EXISTS fin_extrato_ignorados_conta_idx ON public.fin_extrato_ignorados (conta_id);

ALTER TABLE public.fin_extrato_ignorados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_extrato_ignorados FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_extrato_ignorados FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Bloqueia anon" ON public.fin_extrato_ignorados;
CREATE POLICY "Bloqueia anon" ON public.fin_extrato_ignorados AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Financeiro" ON public.fin_extrato_ignorados;
CREATE POLICY "Financeiro" ON public.fin_extrato_ignorados FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
