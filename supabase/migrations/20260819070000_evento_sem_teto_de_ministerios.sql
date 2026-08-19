-- ─── Um evento pode envolver mais de dois ministérios ──────────────────────
--
-- O teto estava aqui, e não só na tela:
--
--     IF v_total > 2 THEN
--       RAISE EXCEPTION 'Evento pode ter no máximo 2 ministérios';
--     END IF;
--
-- Dois não dá conta do que a igreja faz. Uma festa junina envolve Cantina,
-- Ornamentação, Louvor e Recepção ao mesmo tempo; com o teto, alguém tinha de
-- escolher dois e deixar os outros de fora — e o evento passava a dizer que
-- ministério nenhum era responsável por metade do trabalho.
--
-- O limite natural é a própria lista de ministérios ativos da igreja, e a tela
-- já respeita isso: o botão "Adicionar" desabilita quando todos já estão no
-- evento, com o motivo no title.
--
-- ── A REGRA QUE FALTAVA, E QUE AGORA IMPORTA ──────────────────────────────
--
-- A função contava os principais numa variável e nunca a usava:
--
--     v_principais int;   -- calculada, e nada feito com ela
--
-- `eventos.ministerio_principal_id` é UMA coluna. Com dois marcados como
-- principal, o segundo era descartado em silêncio ao salvar. Com dois
-- ministérios no máximo isso já podia acontecer; com onze, passa a ser fácil
-- de fazer sem perceber.
--
-- Agora a regra existe dos dois lados: na tela, marcar "Principal" rebaixa os
-- outros para apoio; aqui, mais de um principal é recusado. A tela evita o
-- erro; o banco garante que ele não entre por outro caminho.

create or replace function public.validate_evento_ministerios()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_evento uuid;
  v_principais int;
begin
  if tg_op = 'DELETE' then
    v_evento := old.evento_id;
  else
    v_evento := new.evento_id;
  end if;

  select count(*) filter (where responsabilidade = 'principal')
    into v_principais
  from public.evento_ministerios
  where evento_id = v_evento;

  -- Sem teto de quantidade: quem limita é a lista de ministérios da igreja.
  if v_principais > 1 then
    raise exception 'Um evento tem um ministério principal. Os demais entram como apoio.';
  end if;

  return coalesce(new, old);
end;
$$;
