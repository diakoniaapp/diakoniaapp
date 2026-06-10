-- Tabela areas_ministerio está vazia e duplica conceito da tabela 'areas'.
-- Dropar para evitar confusão futura.
DROP TABLE IF EXISTS public.areas_ministerio CASCADE;
NOTIFY pgrst, 'reload schema';
