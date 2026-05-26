-- Função normalizadora
CREATE OR REPLACE FUNCTION public.normalize_nome_familia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nome_familia IS NOT NULL THEN
    NEW.nome_familia := btrim(regexp_replace(NEW.nome_familia, '^\s*fam[ií]lia\s+', '', 'i'));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_nome_familia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_normalize_nome_familia ON public.familias;
CREATE TRIGGER trg_normalize_nome_familia
BEFORE INSERT OR UPDATE OF nome_familia ON public.familias
FOR EACH ROW EXECUTE FUNCTION public.normalize_nome_familia();

-- Corrigir registros existentes
UPDATE public.familias
SET nome_familia = btrim(regexp_replace(nome_familia, '^\s*fam[ií]lia\s+', '', 'i'))
WHERE nome_familia ~* '^\s*fam[ií]lia\s+';