-- ---------------------------------------------------------------------------
-- Coordenadas da familia
-- ---------------------------------------------------------------------------
--
-- POR QUE EM `familias` E NAO EM `membros`
--
-- As colunas latitude/longitude ja existem em `membros` — e tem TRES valores
-- preenchidos em 281 pessoas. Um mapa a partir dali mostraria tres pinos.
--
-- Em `familias` a situacao se inverte: 29 das 40 tem endereco, 29 tem CEP e 28
-- tem endereco com numero. Essas 28 reunem 86 pessoas. E o endereco mora na
-- familia porque e ali que ele faz sentido: uma casa com cinco moradores e um
-- endereco, nao cinco.
--
-- Um pino por familia tambem e o desenho certo do mapa. Cinco alfinetes
-- empilhados no mesmo telhado nao informam mais que um.
--
-- COMO SAO PREENCHIDAS
--
-- Geocodificacao pelo Nominatim (OpenStreetMap): gratuito, sem chave, com
-- limite de um endereco por segundo. As 28 levam 28 segundos, rodam uma vez, e
-- so precisam rodar de novo quando um endereco mudar.
--
-- `geocodificado_em` existe para responder "esta coordenada ainda vale?". Sem
-- ela, um endereco corrigido em 2027 continuaria com o pino de 2026 e ninguem
-- teria como saber.
-- ---------------------------------------------------------------------------

ALTER TABLE public.familias
  ADD COLUMN IF NOT EXISTS latitude         double precision,
  ADD COLUMN IF NOT EXISTS longitude        double precision,
  ADD COLUMN IF NOT EXISTS geocodificado_em timestamptz,
  ADD COLUMN IF NOT EXISTS geo_precisao     text
    CHECK (geo_precisao IS NULL OR geo_precisao IN ('rua', 'bairro'));

COMMENT ON COLUMN public.familias.latitude IS
  'Latitude do endereco da familia. Preenchida por geocodificacao (Nominatim/OSM).';
COMMENT ON COLUMN public.familias.longitude IS
  'Longitude do endereco da familia. Preenchida por geocodificacao (Nominatim/OSM).';
COMMENT ON COLUMN public.familias.geocodificado_em IS
  'Quando a coordenada foi obtida. Se o endereco mudou depois disto, a coordenada esta velha.';
COMMENT ON COLUMN public.familias.geo_precisao IS
  'Quao exata e a coordenada. "rua" = ponto da rua (o OSM brasileiro raramente tem '
  'numero de casa, entao familias da mesma rua compartilham o ponto). "bairro" = '
  'centro do bairro, usado quando a rua nao foi encontrada — serve para ver a regiao, '
  'NAO para medir distancia entre familias.';

-- Indice parcial: toda consulta do mapa pede "as que tem coordenada", e com 40
-- linhas isso e irrelevante hoje — existe para nao virar varredura quando a
-- igreja tiver centenas de familias.
CREATE INDEX IF NOT EXISTS idx_familias_coordenada
  ON public.familias (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
