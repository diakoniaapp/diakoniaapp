-- ═══════════════════════════════════════════════════════════════════════════
-- Solicitações de membresia são estatutárias
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B·2, quinto e último lote — 3 políticas, e fecha o lote inteiro.
--
-- `solicitacoes_membresia`, `solicitacoes_documentos` (as cartas anexadas) e
-- `solicitacoes_historico` (o rastro de quem fez o quê) davam a qualquer
-- `lideranca` ALL sem condição — motivo do pedido, observação de aprovação
-- ou rejeição, carta de transferência, quem assinou como pastor e como
-- secretaria. Nenhuma das três tem `area_id` nem `ministerio_id`: é processo
-- estatutário de admissão/transferência de membro, da igreja inteira, não
-- de uma área.
--
-- O sinal que decide: a tabela irmã do mesmo domínio, `solicitacoes_lgpd`,
-- já era só admin/secretaria — sem `lideranca` nenhuma, e sem que este
-- lote precisasse tocá-la. Mesma forma de `liderancas`/`historico_
-- lideranca` no lote de Estrutura: registro administrativo, `lideranca`
-- sai por completo, sem política substituta. Diferente de governança
-- (onde a igreja pediu explicitamente "liderança vê"), aqui não houve
-- pedido equivalente — e o precedente da tabela irmã pesa mais que
-- inventar um recorte de leitura que ninguém pediu.

BEGIN;

ALTER POLICY "solicitacoes_membresia_equipe" ON public.solicitacoes_membresia
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));

ALTER POLICY "solicitacoes_documentos_equipe" ON public.solicitacoes_documentos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));

ALTER POLICY "solicitacoes_historico_equipe" ON public.solicitacoes_historico
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));

COMMIT;
