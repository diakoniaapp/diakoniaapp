-- Diakonia App: geolocalização de membros para mapa pastoral
-- Migration: 20260530_membros_geolocalizacao.sql

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS estado            text,
  ADD COLUMN IF NOT EXISTS endereco_completo text,
  ADD COLUMN IF NOT EXISTS latitude          numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude         numeric(10, 7),
  ADD COLUMN IF NOT EXISTS geo_place_id      text,
  ADD COLUMN IF NOT EXISTS geo_fonte         text
    CHECK (geo_fonte IS NULL OR geo_fonte IN
      ('manual','viacep','nominatim','gps','google'));

-- Índices para performance em dashboards e mapas
CREATE INDEX IF NOT EXISTS idx_membros_lat_lng
  ON public.membros (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_membros_cidade
  ON public.membros (cidade, bairro)
  WHERE cidade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_membros_estado
  ON public.membros (estado)
  WHERE estado IS NOT NULL;

-- View: pessoas com coordenadas (base para mapa pastoral)
CREATE OR REPLACE VIEW public.v_membros_mapa AS
SELECT
  m.id,
  COALESCE(m.nome_social, m.nome_completo) AS nome_exibicao,
  m.tipo_pessoa, m.status,
  m.latitude, m.longitude,
  m.endereco_completo, m.bairro, m.cidade, m.estado, m.cep,
  m.telefone_celular, m.geo_fonte
FROM public.membros m
WHERE m.latitude  IS NOT NULL
  AND m.longitude IS NOT NULL
  AND m.status NOT IN ('falecido','inativo','transferido');

COMMENT ON COLUMN public.membros.latitude           IS 'Latitude WGS84 — geolocalização do endereço';
COMMENT ON COLUMN public.membros.longitude          IS 'Longitude WGS84 — geolocalização do endereço';
COMMENT ON COLUMN public.membros.endereco_completo  IS 'Endereço completo formatado';
COMMENT ON COLUMN public.membros.estado             IS 'UF (estado federativo, ex: SP, RJ)';
COMMENT ON COLUMN public.membros.geo_fonte          IS 'Como a coord. foi obtida: manual/viacep/nominatim/gps/google';
COMMENT ON COLUMN public.membros.geo_place_id       IS 'ID do lugar no OSM/Nominatim ou Google Places';
