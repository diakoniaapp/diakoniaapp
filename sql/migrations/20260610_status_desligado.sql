-- ─── Sugestão A: adicionar valor 'desligado' ao enum membro_status ──────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
     WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'membro_status')
       AND enumlabel = 'desligado'
  ) THEN
    ALTER TYPE membro_status ADD VALUE 'desligado';
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
