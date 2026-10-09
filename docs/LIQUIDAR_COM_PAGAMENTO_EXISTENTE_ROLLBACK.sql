-- DESFAZER a migration 20261008220000. Só remove a função; nenhum dado muda. As obrigações que já tiverem sido liquidadas por ela continuam liquidadas
-- (são liquidações comuns, que o app sabe desfazer). Um comando só.
DROP FUNCTION IF EXISTS public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean);
