-- ─── Defeito meu, na correção de ontem ─────────────────────────────────────
--
-- `proximo_aniversario` nasceu com dois problemas na mesma linha:
--
--     coalesce(p_ano, date_part('year', current_date)::int)
--
-- 1. IMMUTABLE E LENDO current_date
--
--    IMMUTABLE é uma promessa ao planejador: "para as mesmas entradas, sempre
--    o mesmo resultado, para sempre". Uma função que lê current_date não
--    cumpre isso — o resultado muda à meia-noite. Com essa promessa o
--    PostgreSQL pode dobrar a chamada em constante no momento do plano e
--    reaproveitar o valor depois, e um sistema de lembretes que precisa virar
--    o dia à meia-noite é exatamente onde isso dói.
--
--    STABLE é o que a função é de verdade: constante dentro de uma consulta,
--    livre para mudar entre consultas.
--
-- 2. FICOU DE FORA DO AJUSTE DE FUSO
--
--    O laço da migração 20260818060000 fixou o fuso nas 45 funções que usavam
--    CURRENT_DATE. Esta foi criada depois, na 20260818090000, e ficou como a
--    46ª — sem fuso.
--
--    Chamada de dentro de `agenda_pastoral_proximos_dias` ela herda o fuso da
--    função que a chamou, e por isso a agenda estava certa. Mas a view
--    `vw_agenda_pastoral` também é legível direto pela API, e aí não há quem
--    herdar: entre 21h e a meia-noite ela usaria o ANO em UTC. Só quebra na
--    virada do ano — 31/12 às 22h, quando o lembrete de 1º de janeiro é o que
--    mais importa acertar.
--
-- Conferido: 46 de 46 funções com CURRENT_DATE passam a ter o fuso fixado.

create or replace function public.proximo_aniversario(p_data date, p_ano int default null)
returns date
language sql
stable                                        -- era IMMUTABLE, e lê current_date
set search_path to 'public'
set "TimeZone" to 'America/Sao_Paulo'         -- ficou de fora do laço da 20260818060000
as $$
  select make_date(
    coalesce(p_ano, date_part('year', current_date)::int),
    date_part('month', p_data)::int,
    least(
      date_part('day', p_data)::int,
      -- último dia daquele mês naquele ano: protege 29/02 em ano comum
      date_part('day',
        (make_date(coalesce(p_ano, date_part('year', current_date)::int),
                   date_part('month', p_data)::int, 1) + interval '1 month - 1 day')
      )::int
    )
  );
$$;

comment on function public.proximo_aniversario(date, int) is
  'Data da efeméride no ano indicado (padrão: ano corrente, no fuso da igreja). Usa dia e mês, não dia do ano — doy desloca em um dia quem tem data em ano bissexto depois de fevereiro. STABLE, não IMMUTABLE: lê current_date.';

revoke execute on function public.proximo_aniversario(date, int) from public, anon;
grant  execute on function public.proximo_aniversario(date, int) to authenticated, service_role;
