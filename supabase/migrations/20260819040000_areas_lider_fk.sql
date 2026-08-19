-- ─── A chave que faltava, e que apagava as áreas da tela ───────────────────
--
-- Organograma e Estrutura da Igreja pedem o líder de cada área assim:
--
--     .from("areas").select("id, nome, lider:membros(id, nome_completo)")
--
-- e o PostgREST recusa a consulta INTEIRA com 400:
--
--     Could not find a relationship between 'areas' and 'membros'
--
-- Não é erro de escrita da consulta. É que `areas.lider_id` nunca teve chave
-- estrangeira para `membros`, e o PostgREST só sabe fazer o embed quando a
-- relação existe declarada no banco.
--
-- Que é descuido, e não decisão de modelagem, dá para provar: as duas tabelas
-- vizinhas têm a chave.
--
--     ministerios_lider_id_fkey        FOREIGN KEY (lider_id) → membros(id)
--     ministerios_vice_lider_id_fkey   FOREIGN KEY (vice_lider_id) → membros(id)
--     setores_lider_id_fkey            FOREIGN KEY (lider_id) → membros(id)
--     areas                            —— nada ——
--
-- O efeito: o nível do MEIO da estrutura sumia das duas telas. São 10 áreas,
-- todas com líder, e 112 vínculos de voluntário pendurados nelas. A igreja
-- inteira do meio para baixo, invisível, por causa de uma linha de DDL.
--
-- ON DELETE SET NULL igual às vizinhas: apagar uma pessoa não pode derrubar a
-- área que ela liderava — a área continua existindo, sem líder, esperando
-- alguém. O contrário apagaria o Bazar junto com quem cuidava dele.
--
-- Conferido antes de aplicar: 10 de 10 áreas com líder, 4 com co-líder, e
-- ZERO apontando para pessoa que não existe. A restrição entra sem recusar
-- nenhuma linha.

alter table public.areas
  add constraint areas_lider_id_fkey
  foreign key (lider_id) references public.membros(id) on delete set null;

alter table public.areas
  add constraint areas_co_lider_id_fkey
  foreign key (co_lider_id) references public.membros(id) on delete set null;
