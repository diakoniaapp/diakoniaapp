-- APLICAR 1 de 2 — o tipo da conta neutra. Rode SOZINHO e espere terminar antes do passo 2.
ALTER TYPE public.fin_conta_tipo ADD VALUE IF NOT EXISTS 'nao_aplicavel';

-- conferência: deve devolver 1 linha
SELECT e.enumlabel AS tipo_novo FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'fin_conta_tipo' AND e.enumlabel = 'nao_aplicavel';
