-- ─── O banco vivia três horas no futuro ────────────────────────────────────
--
-- Reportado assim: "ações de hoje trouxe um aniversário de amanhã".
--
-- Reproduzido às 22h09 de 18/08/2026, horário de Brasília:
--
--     now()                                    → 2026-08-19 01:09 +00
--     current_date                             → 2026-08-19   ← o banco
--     (now() at time zone 'America/Sao_Paulo')  → 2026-08-18   ← a igreja
--
--   agenda_pastoral_proximos_dias(7) devolvia:
--     dias_ate_evento = 0 | 2026-08-19 | Joseana Viegas de Souza
--
-- Joseana faz aniversário AMANHÃ. O widget não errou a conta: ele perguntou ao
-- banco que dia é hoje, e o banco respondeu em UTC.
--
-- Todo dia, das 21h à meia-noite, o sistema inteiro vira o calendário cedo
-- demais. Nessas três horas o aniversariante de amanhã aparece como se fosse
-- hoje, e o de hoje — que ainda pode não ter recebido mensagem de ninguém —
-- some da lista antes de o dia acabar. No horário de verão seriam duas horas;
-- o erro é o mesmo.
--
-- ── POR QUE MUDAR O BANCO, E NÃO A FUNÇÃO ─────────────────────────────────
--
-- Não é defeito de um widget. São 50 funções do schema public usando
-- CURRENT_DATE, e todas herdam o mesmo engano:
--
--   agenda_pastoral_proximos_dias   assuntos_alertas       fiscal_alertas_proximos
--   agenda_pastoral_mes             secretaria_alertas     fiscal_inconsistencias
--   resumo_painel_pastoral          gov_alertas            fin_previsao_caixa
--   ebd_chamada_view                pgm_alertas_ausencia   fin_alertas_financeiros
--   … e outras 38
--
-- Corrigir uma a uma seria consertar o sintoma cinquenta vezes e ainda deixar
-- a próxima função nova nascer errada. CURRENT_DATE lê o fuso da sessão; o
-- ajuste certo é dizer ao banco onde a igreja fica.
--
-- ── RISCO MEDIDO ───────────────────────────────────────────────────────────
--
-- 227 colunas são `timestamp with time zone`: guardam o instante absoluto e
-- não mudam de valor — muda só como são escritas em texto.
--
-- As 10 colunas `timestamp without time zone` são as que passariam a gravar
-- hora local. Sete das tabelas estão vazias (bazar_reservas, fin_solicitacoes,
-- pdv_caixa, pdv_estoque, pdv_fechamento, pdv_vendas); a oitava,
-- consentimento, tem 25 linhas — que não mudam, porque o passado já está
-- gravado. Daqui em diante elas registram a hora que a pessoa viu no relógio,
-- que é a que se quer num termo de consentimento.
--
-- ── DEPOIS DE APLICAR ──────────────────────────────────────────────────────
--
-- O ajuste vale para conexões novas. As sessões abertas do PostgREST seguem em
-- UTC até serem recicladas — reiniciar a API do projeto no painel do Supabase
-- faz valer na hora. Conferir com:
--
--     select current_setting('TimeZone'), current_date;
--
-- Para desfazer:
--
--     alter database postgres set timezone to 'UTC';

alter database postgres set timezone to 'America/Sao_Paulo';

-- ── E POR QUE UM AJUSTE NO BANCO NÃO BASTOU ───────────────────────────────
--
-- Aplicado o `alter database`, uma sessão nova já respondia 2026-08-18. Mas o
-- PostgREST mantém um pool de conexões abertas, e elas continuaram em UTC: a
-- API seguiu devolvendo `dias_ate_evento = 0` para o aniversário de amanhã.
-- Valeria depois de reiniciar a API — ou seja, com a igreja fora do ar por
-- alguns segundos, para consertar um erro que só aparece à noite.
--
-- Fixar o fuso NA FUNÇÃO resolve na chamada seguinte, sem reconectar nada, e
-- é mais forte: a função passa a responder o dia da igreja independentemente
-- de quem a chamou e de como aquela sessão está configurada.
--
-- Não é lógica duplicada em 45 lugares — é a mesma linha aplicada de uma vez
-- pelo laço abaixo. Função nova nasce coberta pelo ajuste do banco; se algum
-- dia o pool voltar a atrapalhar, é rodar isto de novo.
--
-- Conferido depois de aplicar, pela API, às 22h22 de 18/08 (01h22 UTC):
--   antes: dias=0 → 2026-08-19 Joseana | dias=6 → 2026-08-25 Tito
--   depois: dias=1 → 2026-08-19 Joseana | dias=7 → 2026-08-25 Tito

do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public'
       and p.prokind = 'f'
       and upper(p.prosrc) like '%CURRENT_DATE%'
  loop
    execute format('alter function %s set "TimeZone" to ''America/Sao_Paulo''', r.assinatura);
    n := n + 1;
  end loop;
  raise notice 'funcoes com fuso fixado: %', n;   -- 45 na aplicação
end $$;
