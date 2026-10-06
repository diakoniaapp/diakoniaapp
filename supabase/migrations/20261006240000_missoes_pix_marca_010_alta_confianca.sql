-- ─── Missões — 4 Pix com a marca ",10" para "Ofertas para Missões" (confirmado por ela em 06/10/2026) ───
--
-- A tesouraria usa o valor terminado em ",10" de propósito para identificar oferta missionária recebida por Pix
-- (informação operacional dela). Dos 12 Pix ",10" fora do fundo, ela CONFIRMOU os 4 de alta confiança
-- (docs/auditoria-missoes/INVESTIGACAO_MUNDIAIS_2025_FASE3_MARCA_010.md, §6). Esta migration só reclassifica; não cria
-- ajuste, compensação nem saldo. Os outros 8 (média e baixa confiança) NÃO são tocados.
--
--   id                                    data        valor     hoje      → vai para
--   bc001639-2399-4c93-8ad6-c5e42b412ef6  25/09/2024    50,10   Ofertas   → Ofertas para Missões · Nacionais
--   9e2d4e16-1990-43f7-8438-d34a045523d2  29/05/2025 2.000,10   Dizimos   → Ofertas para Missões · Mundiais
--   26e5b39c-7b22-4a10-99c5-76c839e297c0  02/06/2025   600,10   Dizimos   → Ofertas para Missões · Mundiais
--   4f87f5f7-0292-4d38-b7a1-3ecba9c8f0e7  27/06/2025   500,10   Dizimos   → Ofertas para Missões · Mundiais
--
-- A campanha segue o ciclo (a próxima remessa fechadora): 25/09/2024 → Nacionais 2024; maio–jun/2025 → a remessa de
-- 22/07/2025 à Junta Mundial. O ano da campanha vem da data (não há campo de ano).
--
-- O QUE NÃO MUDA: o centro de custo (os 4 estão sem centro, como 418 das 648 entradas do fundo), a data, o valor, a
-- conta, o status, a conciliação. A categoria é a única coisa que sai de Dízimos/Ofertas.
--
-- EFEITO ESPERADO: Fundo Missionário (entradas) +3.150,40; saldo registrado sobe os mesmos 3.150,40; Mundiais 2025
-- fica R$ 3.100,30 mais perto de fechar; Nacionais 2024 sobe R$ 50,10. Dízimos 2025 cai R$ 3.100,30; Ofertas 2024, R$ 50,10.
--
-- COMO DESFAZER (se algum dia for preciso): para cada id, voltar categoria_id para "Dizimos" (os 3 de 2025) ou
-- "Ofertas" (o de 2024), campanha_missionaria = NULL e apagar a última linha de observacoes ("[auditoria-missoes …]").
--
-- Guardado por id + valor + estado antigo (rodar de novo não faz nada), com verificação final. NÃO ENSAIADA com
-- BEGIN/ROLLBACK (o token de gerenciamento está sem acesso): rode primeiro dentro de uma transação e confira o resultado.

DO $$
DECLARE
  cat_missoes uuid; n int;
BEGIN
  SELECT id INTO cat_missoes FROM public.fin_categorias WHERE nome = 'Ofertas para Missões' AND tipo = 'entrada';
  IF cat_missoes IS NULL THEN
    RAISE EXCEPTION 'Categoria "Ofertas para Missões" (entrada) não encontrada.';
  END IF;

  UPDATE public.fin_lancamentos AS l
     SET categoria_id = cat_missoes,
         campanha_missionaria = v.campanha,
         observacoes = concat_ws(E'\n', NULLIF(l.observacoes, ''),
           '[auditoria-missoes 06/10/2026] reclassificado para Ofertas para Missões (convenção ",10" da tesouraria, confirmado por ela)')
    FROM (VALUES
      ('bc001639-2399-4c93-8ad6-c5e42b412ef6'::uuid,   50.10, 'nacionais'),
      ('9e2d4e16-1990-43f7-8438-d34a045523d2'::uuid, 2000.10, 'mundiais'),
      ('26e5b39c-7b22-4a10-99c5-76c839e297c0'::uuid,  600.10, 'mundiais'),
      ('4f87f5f7-0292-4d38-b7a1-3ecba9c8f0e7'::uuid,  500.10, 'mundiais')
    ) AS v(id, valor, campanha)
   WHERE l.id = v.id
     AND l.valor = v.valor
     AND l.tipo = 'entrada'
     AND l.categoria_id IS DISTINCT FROM cat_missoes;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 4) THEN
    RAISE EXCEPTION 'Esperava 4 lançamentos (ou 0, se já rodou); atualizei % — desfazendo.', n;
  END IF;

  -- Verificação final: os 4 estão em Ofertas para Missões, com a campanha certa.
  SELECT count(*) INTO n
    FROM public.fin_lancamentos l
    JOIN (VALUES
      ('bc001639-2399-4c93-8ad6-c5e42b412ef6'::uuid, 'nacionais'),
      ('9e2d4e16-1990-43f7-8438-d34a045523d2'::uuid, 'mundiais'),
      ('26e5b39c-7b22-4a10-99c5-76c839e297c0'::uuid, 'mundiais'),
      ('4f87f5f7-0292-4d38-b7a1-3ecba9c8f0e7'::uuid, 'mundiais')
    ) AS v(id, campanha) ON v.id = l.id
   WHERE l.categoria_id = cat_missoes AND l.campanha_missionaria::text = v.campanha;
  IF n <> 4 THEN RAISE EXCEPTION 'Verificação falhou (% de 4) — desfazendo.', n; END IF;
END $$;
