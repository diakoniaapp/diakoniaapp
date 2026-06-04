-- ============================================================
-- 20260604000000_storage_documentos.sql
-- Bucket de storage para documentos institucionais
-- Adiciona campos de ingestão na tabela documentos
-- ============================================================

-- 1. Criar bucket "documentos" (publico=false, tamanho max 20MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Politicas de acesso ao bucket
-- Admin e Secretaria podem fazer upload, download e delete
CREATE POLICY "Admin/Sec upload documentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

CREATE POLICY "Admin/Sec download documentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

CREATE POLICY "Admin/Sec delete documentos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

CREATE POLICY "Admin/Sec update documentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

-- 3. Adicionar colunas de ingestao na tabela documentos
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS arquivo_storage_path text,
  ADD COLUMN IF NOT EXISTS arquivo_nome          text,
  ADD COLUMN IF NOT EXISTS arquivo_mime          text,
  ADD COLUMN IF NOT EXISTS arquivo_tamanho_bytes bigint,
  ADD COLUMN IF NOT EXISTS texto_extraido        text,
  ADD COLUMN IF NOT EXISTS ingestao_status       text DEFAULT 'pendente'
    CHECK (ingestao_status IN ('pendente', 'processando', 'concluido', 'erro')),
  ADD COLUMN IF NOT EXISTS ingestao_erro         text,
  ADD COLUMN IF NOT EXISTS ingestao_em           timestamptz;

COMMENT ON COLUMN public.documentos.arquivo_storage_path IS 'Caminho no bucket documentos';
COMMENT ON COLUMN public.documentos.texto_extraido IS 'Texto completo extraido do PDF/DOCX para busca e parser';
COMMENT ON COLUMN public.documentos.ingestao_status IS 'pendente | processando | concluido | erro';
