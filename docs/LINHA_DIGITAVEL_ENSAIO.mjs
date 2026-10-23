// Ensaio (Postgres embutido) da migration 20261023140000_linha_digitavel_no_lancamento.sql — parte do ensaio do resumo diário (mesmo esquema mínimo e mesmos dados). Prova: a coluna nasce nula e nada do que existe muda; a CHECK aceita 44, 47 e 48 dígitos e recusa o resto; o resumo diário passa a trazer `linha_digitavel` em cada item (a chave nova é a ÚNICA mudança), com espaços cortados e vazio virando nulo; só service_role executa.
// Ensaio (Postgres embutido) da migration 20261022210000_resumo_diario_tesouraria.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Esquema mínimo + um pg_cron de mentira. Prova: o job nasce DESLIGADO; quem não é admin/diakonia não configura; ligar sem destinatário é recusado; salvar remarca o cron certo (inclusive quando o horário
// cruza a meia-noite em UTC) e liga/desliga o job; a lista de destinatários é substituída por inteiro e sem duplicata; uma validação que falha desfaz tudo; os dados do dia respeitam as regras de quem entra.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data14';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5485, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5485, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const ADMIN = '00000000-0000-0000-0000-0000000000a1', COMUM = '00000000-0000-0000-0000-0000000000b2';
const como = async (uid) => { await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); };
const recusa = async (sql, p) => { try { await c.query(sql, p); return null; } catch (e) { return e.message; } };

await c.query(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create type app_role as enum ('admin','diakonia','pastor','secretaria','tesouraria','outro');
 create table user_roles (user_id uuid, role app_role);
 create function has_role(u uuid, r app_role) returns boolean language sql stable security definer as $$ select exists (select 1 from user_roles where user_id = u and role = r) $$;
 -- pg_cron de mentira
 create schema cron;
 create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true);
 create table cron.job_run_details (jobid bigint, start_time timestamptz, status text, return_message text);
 create function cron.schedule(n text, s text, cmd text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, cmd) returning jobid $$;
 create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
 create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null) returns void language plpgsql as
   $$ begin update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), active = coalesce(alter_job.active, j.active) where j.jobid = alter_job.job_id; end $$;
 -- negócio
 create table membros (id uuid primary key default gen_random_uuid(), nome_completo text);
 create table fin_fornecedores (id uuid primary key default gen_random_uuid(), nome text, chave_pix text, tipo_chave_pix text);
 create table fin_categorias (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_centros_custo (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), tipo text, status text, data date, valor numeric, fornecedor_id uuid, pessoa_id uuid, descricao text, origem text, forma_liquidacao text, obrigacao_id uuid, categoria_id uuid, centro_custo_id uuid);
 create table fin_lancamento_anexos (id uuid primary key default gen_random_uuid(), lancamento_id uuid, tipo text, nome text, dados_extraidos jsonb, enviado_em timestamptz default now());
 create table vw_fin_quitacao (obrigacao_id uuid, intencao text);
 insert into user_roles values ('${ADMIN}', 'admin'), ('${COMUM}', 'tesouraria');
`);
const F = 'f0000000-0000-0000-0000-000000000001', F2 = 'f0000000-0000-0000-0000-000000000002';
await c.query(`insert into fin_fornecedores values ('${F}', 'Light', '21999990000', 'telefone'), ('${F2}', 'Cedae', null, null)`);

await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022210000_resumo_diario_tesouraria.sql', 'utf8'));
confere('a migration aplica', true);
const job = (await q(`select * from cron.job where jobname = 'resumo-diario'`))[0];
confere('o job nasce DESLIGADO, seg–sex 10h UTC (7h em Brasília)', job && job.active === false && job.schedule === '0 10 * * 1-5', JSON.stringify(job));
const cfg0 = (await q(`select * from resumo_diario_config`))[0];
confere('os sigilosos (prebenda, folha…) ENTRAM por padrão — decisão dela', cfg0.incluir_sigilosos === true);
confere('a configuração nasce desligada, 7h, seg–sex, só o dia, sem enviar vazio', cfg0.ativo === false && cfg0.hora === 7 && cfg0.minuto === 0 && cfg0.janela_dias === 0 && cfg0.enviar_sem_pagamentos === false && cfg0.dias_semana.join() === '1,2,3,4,5');
confere('rodar a migration de novo é inofensivo (idempotente)', await (async () => { await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022210000_resumo_diario_tesouraria.sql', 'utf8')); return (await q(`select count(*)::int n from cron.job where jobname='resumo-diario'`))[0].n === 1; })());

// permissões
await c.query(`set role authenticated`); await como(COMUM);
confere('quem não é admin/diakonia não vê o status', /Sem permissão/.test(await recusa(`select sistema_resumo_diario_status()`) ?? ''));
confere('quem não é admin/diakonia não salva', /Sem permissão/.test(await recusa(`select sistema_resumo_diario_salvar('{}', '[]')`) ?? ''));
confere('os dados do dia são só para service_role', /permission denied/.test(await recusa(`select resumo_diario_dados()`) ?? ''));
await c.query(`reset role`);

// salvar
await c.query(`set role authenticated`); await como(ADMIN);
const cfg = (o = {}) => JSON.stringify({ ativo: true, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, ...o });
const dest = (...xs) => JSON.stringify(xs.map(([nome, email]) => ({ nome, email })));
confere('ligar SEM destinatário é recusado, e nada muda', /ao menos um destinatário/.test(await recusa(`select sistema_resumo_diario_salvar($1::jsonb, '[]')`, [cfg()]) ?? '') && (await q(`select ativo from resumo_diario_config`))[0].ativo === false);
confere('e-mail inválido é recusado em português', /E-mail inválido/.test(await recusa(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg(), dest(['Bruno', 'bruno-sem-arroba'])]) ?? ''));
confere('dia da semana fora de 0–6 é recusado', /ao menos um dia/.test(await recusa(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg({ dias_semana: [9] }), dest(['Bruno', 'bruno@x.org'])]) ?? ''));
confere('janela fora de 0–14 é recusada', /janela/.test(await recusa(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg({ janela_dias: 30 }), dest(['Bruno', 'bruno@x.org'])]) ?? ''));

await q(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg(), dest(['Bruno', 'bruno@x.org'], ['Caio', 'caio@x.org'])]);
await c.query(`reset role`);
let j = (await q(`select * from cron.job where jobname = 'resumo-diario'`))[0];
confere('salvar LIGA o job e mantém seg–sex às 10h UTC', j.active === true && j.schedule === '0 10 * * 1,2,3,4,5', JSON.stringify(j));
confere('os dois destinatários gravados', (await q(`select count(*)::int n from resumo_diario_destinatarios`))[0].n === 2);

await c.query(`set role authenticated`); await como(ADMIN);
await q(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg({ dias_semana: [5], hora: 22, minuto: 30, incluir_sigilosos: false }), dest(['Bruno', 'BRUNO@x.org'])]);
await c.query(`reset role`);
confere('salvar guarda a escolha de incluir (ou não) os sigilosos', (await q(`select incluir_sigilosos from resumo_diario_config`))[0].incluir_sigilosos === false);
j = (await q(`select * from cron.job where jobname = 'resumo-diario'`))[0];
confere('22h30 de sexta em Brasília = 01h30 de SÁBADO em UTC (o dia vira junto)', j.schedule === '30 1 * * 6', j.schedule);
const dd = await q(`select nome, email from resumo_diario_destinatarios`);
confere('a lista é SUBSTITUÍDA (Caio saiu) e e-mail com maiúscula não duplica Bruno', dd.length === 1 && dd[0].email.toLowerCase() === 'bruno@x.org', JSON.stringify(dd));

await c.query(`set role authenticated`); await como(ADMIN);
await q(`select sistema_resumo_diario_salvar($1::jsonb, $2::jsonb)`, [cfg({ ativo: false }), dest(['Bruno', 'bruno@x.org'])]);
const st = (await q(`select sistema_resumo_diario_status() s`))[0].s;
await c.query(`reset role`);
confere('desligar DESLIGA o job', (await q(`select active from cron.job where jobname='resumo-diario'`))[0].active === false);
confere('o status traz configuração, destinatários e o estado do agendamento', st.config.ativo === false && st.destinatarios.length === 1 && st.agendamento_existe === true && st.agendamento_ativo === false && Array.isArray(st.execucoes), JSON.stringify(st).slice(0, 160));

// dados do dia
await c.query(`
 insert into fin_categorias (id, nome) values ('c0000000-0000-0000-0000-000000000001', 'Energia Elétrica');
 insert into fin_centros_custo (id, nome) values ('e0000000-0000-0000-0000-000000000001', 'Administração');
 insert into fin_lancamentos (id, tipo, status, data, valor, fornecedor_id, origem, forma_liquidacao, categoria_id, centro_custo_id, descricao) values
   ('10000000-0000-0000-0000-000000000001', 'saida', 'previsto', current_date - 5, 100, '${F}', 'manual', 'manual', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Atrasada'),
   ('10000000-0000-0000-0000-000000000002', 'saida', 'previsto', current_date,     50,  '${F2}', 'manual', 'boleto_fatura', null, null, 'Hoje'),
   ('10000000-0000-0000-0000-000000000003', 'saida', 'previsto', current_date + 3, 70,  '${F}', 'manual', 'manual', null, null, 'Daqui a 3 dias'),
   ('10000000-0000-0000-0000-000000000004', 'saida', 'previsto', current_date - 1, 300, '${F}', 'manual', 'debito_automatico', null, null, 'Automático'),
   ('10000000-0000-0000-0000-000000000005', 'saida', 'previsto', current_date - 2, 400, '${F}', 'manual', 'manual', null, null, 'Reembolso'),
   ('10000000-0000-0000-0000-000000000006', 'saida', 'previsto', current_date - 2, 500, '${F}', 'transferencia', 'manual', null, null, 'Transferência'),
   ('10000000-0000-0000-0000-000000000007', 'saida', 'realizado', current_date - 2, 600, '${F}', 'manual', 'manual', null, null, 'Já paga'),
   ('10000000-0000-0000-0000-000000000008', 'entrada', 'previsto', current_date - 2, 700, null, 'manual', 'manual', null, null, 'Entrada');
 insert into vw_fin_quitacao values ('10000000-0000-0000-0000-000000000005', 'reembolso');
 insert into fin_lancamento_anexos (lancamento_id, tipo, nome, dados_extraidos) values
   ('10000000-0000-0000-0000-000000000001', 'boleto', 'b.pdf', '{"versao":1,"linhaDigitavel":"23793381286000782713695000063305975520000010000","valor":100}'),
   ('10000000-0000-0000-0000-000000000001', 'comprovante', 'c.pdf', null);
 insert into resumo_diario_enviados (lancamento_id, enviado_em, valor, vencimento, destinatarios) values ('10000000-0000-0000-0000-000000000001', now() - interval '1 day', 100, current_date - 5, 1), ('10000000-0000-0000-0000-000000000001', now() - interval '2 day', 100, current_date - 5, 1);
`);
let dados = (await q(`select resumo_diario_dados() d`))[0].d;
const ids = dados.itens.map(i => i.descricao);
confere('entram a atrasada e a de hoje — e só elas (janela 0)', ids.join() === 'Atrasada,Hoje', ids.join());
confere('fora: automático, reembolso, transferência, já paga, entrada e a de daqui a 3 dias', !['Automático', 'Reembolso', 'Transferência', 'Já paga', 'Entrada', 'Daqui a 3 dias'].some(x => ids.includes(x)));
const atr = dados.itens[0];
confere('a atrasada traz dias_para_vencer negativo, favorecido, Pix do cadastro, categoria e centro', atr.dias_para_vencer === -5 && atr.fornecedor_nome === 'Light' && atr.chave_pix === '21999990000' && atr.tipo_chave_pix === 'telefone' && atr.categoria === 'Energia Elétrica' && atr.centro === 'Administração');
confere('traz os anexos com a leitura guardada', atr.anexos.length === 2 && atr.anexos.some(a => a.tipo === 'boleto' && a.dados.linhaDigitavel));
confere('traz o ÚLTIMO envio (para o aviso "já enviado em …")', !!atr.ultimo_envio && dados.itens[1].ultimo_envio === null);
confere('traz o último envio geral (para não repetir o envio se o agendamento disparar duas vezes)', !!dados.ultimo_envio_geral);
confere('traz hoje, o dia da semana e os destinatários', /^\d{4}-\d{2}-\d{2}$/.test(dados.hoje) && Number.isInteger(dados.dow) && dados.destinatarios.length === 1 && dados.config.ativo === false);
await c.query(`update resumo_diario_config set janela_dias = 3`);
dados = (await q(`select resumo_diario_dados() d`))[0].d;
confere('com janela de 3 dias entra também a de daqui a 3 dias', dados.itens.map(i => i.descricao).join() === 'Atrasada,Hoje,Daqui a 3 dias');


// ── a migration da linha digitável informada ──
await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261023140000_linha_digitavel_no_lancamento.sql', 'utf8'));
await c.query(`update resumo_diario_config set janela_dias = 0`);
dados = (await q(`select resumo_diario_dados() d`))[0].d;
const antes = dados.itens.map(i => i.descricao).join();
confere('a coluna nasce nula: nenhum item traz linha informada', dados.itens.every(i => i.linha_digitavel === null) && antes === 'Atrasada,Hoje', antes);
const L47 = '23793381286000782713695000063305975520000010000';
await c.query(`update fin_lancamentos set linha_digitavel = $1 where descricao = 'Hoje'`, [L47]);
dados = (await q(`select resumo_diario_dados() d`))[0].d;
confere('o item traz a linha informada, só dígitos', dados.itens.find(i => i.descricao === 'Hoje').linha_digitavel === L47);
confere('as outras chaves do item continuam as mesmas', ['id', 'data', 'valor', 'dias_para_vencer', 'fornecedor_id', 'fornecedor_nome', 'pessoa_nome', 'descricao', 'categoria', 'centro', 'chave_pix', 'tipo_chave_pix', 'ultimo_envio', 'anexos'].every(k => k in dados.itens[0]));
confere('44, 47 e 48 dígitos entram', await (async () => { for (const n of [44, 47, 48]) await c.query(`update fin_lancamentos set linha_digitavel = $1 where descricao = 'Atrasada'`, ['1'.repeat(n)]); return true; })());
for (const ruim of ['123', '1'.repeat(46), '1'.repeat(49), '2379338128600078271369500006330597552000001000a', '23793 38128']) {
  const e = await (async () => { try { await c.query(`update fin_lancamentos set linha_digitavel = $1 where descricao = 'Atrasada'`, [ruim]); return null; } catch (x) { return x.message; } })();
  confere('a CHECK recusa "' + ruim.slice(0, 12) + '…" (' + ruim.length + ')', !!e && /linha_digitavel_formato/.test(e), e ?? '');
}
await c.query(`update fin_lancamentos set linha_digitavel = null where descricao = 'Atrasada'`);
confere('apagar volta a nulo', (await q(`select count(*)::int n from fin_lancamentos where linha_digitavel is not null`))[0].n === 1);
await c.query('set role anon');
const eAnon = await (async () => { try { await c.query('select resumo_diario_dados()'); return null; } catch (x) { return x.message; } })();
await c.query('reset role');
confere('a função continua só de service_role', !!eAnon && /permission denied/.test(eAnon), eAnon ?? '');
confere('rodar a migration de novo é inofensivo', await (async () => { await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261023140000_linha_digitavel_no_lancamento.sql', 'utf8')); return true; })());

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
