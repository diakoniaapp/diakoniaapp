-- ─── Boas-vindas ao Visitante: a administração também precisa LER o bucket do banner (APLICADA em 08/10/2026) ──────
-- Defeito achado no teste de ponta a ponta: o envio do banner funcionou, mas "Tirar banner" não apagava o arquivo do bucket.
-- O storage só remove um objeto que o próprio chamador consegue enxergar (SELECT em storage.objects), e a migration anterior
-- (20261008120000) deu à administração INSERT/UPDATE/DELETE mas não SELECT. A leitura pública do banner pela URL não passa por
-- essa política (o bucket é público); isto só vale para a API de gerenciamento de quem é da administração.
DROP POLICY IF EXISTS "boasvindas_visitante_leitura_equipe" ON storage.objects;
CREATE POLICY "boasvindas_visitante_leitura_equipe" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'boasvindas-visitante' AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]));
