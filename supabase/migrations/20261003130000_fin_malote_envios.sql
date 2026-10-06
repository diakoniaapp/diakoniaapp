-- ─── fin_malote_envios — o registro de que o malote foi ENVIADO à contabilidade ─
--
-- Pedido dela (03/10/2026), no checklist da aba "4 Fechamento":
--   5. ENVIO À CONTABILIDADE — "Último envio: 02/10/2026 · Status: Enviado".
--
-- MEDIDO antes de escrever: não existe nada no banco que registre o envio. A tabela
-- `fin_fechamentos_periodo` é outra coisa (travar o mês contra edição: aberto → fechado →
-- aprovado) e mesclar as duas misturaria "o mês está travado" com "o ZIP foi mandado".
-- O Pacote Contábil é gerado no navegador e baixado; ninguém avisava o sistema do envio.
--
-- Uma linha por envio (pode haver reenvio do mesmo mês — o "último" é o mais recente).
-- Guarda também o tamanho do que foi mandado (dossiês e saídas ainda sem documento),
-- para a tela dizer "enviado com 15 pendências" em vez de só "enviado".
--
-- Permissão: a mesma de todas as tabelas financeiras desde 02/09/2026
-- (`20260902210000`): admin, diakonia, secretaria e tesouraria. Liderança não opera o
-- financeiro.
--
-- A tela funciona sem esta tabela (mostra "registro de envio indisponível"), então
-- aplicar este SQL não é urgente nem quebra nada se atrasar.

CREATE TABLE IF NOT EXISTS public.fin_malote_envios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                  int  NOT NULL CHECK (ano BETWEEN 2020 AND 2099),
  mes                  int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  enviado_em           timestamptz NOT NULL DEFAULT now(),
  enviado_por          uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  dossies              int  NOT NULL DEFAULT 0 CHECK (dossies >= 0),
  pendencias_documentos int NOT NULL DEFAULT 0 CHECK (pendencias_documentos >= 0),
  observacao           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_malote_envios_periodo
  ON public.fin_malote_envios (ano, mes, enviado_em DESC);

ALTER TABLE public.fin_malote_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_malote_envios_equipe ON public.fin_malote_envios;
CREATE POLICY fin_malote_envios_equipe ON public.fin_malote_envios
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMENT ON TABLE public.fin_malote_envios IS
  'Registro de cada envio do Pacote/Malote Contábil à contabilidade (um por envio; o último do mês é o que a aba Fechamento mostra).';
