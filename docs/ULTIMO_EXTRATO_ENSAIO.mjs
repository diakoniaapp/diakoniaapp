// Ensaio (Postgres embutido) da migration 20261022220000_ultimo_extrato_das_contas.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: a função devolve, por conta ATIVA, o dia da linha mais recente do banco (marca [ofx:…], inclusive [ofx:PDF:…], só realizado/conciliado) e a última conciliação (vínculo ativo mais recente);
// conta sem extrato vem com datas nulas; conta inativa não aparece; linha só prevista não conta; vínculo desfeito não conta; só service_role executa; o dia usa data_pagamento quando existe.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data11';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5481, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5481, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const recusa = async (sql) => { try { await c.query(sql); return null; } catch (e) { return e.message; } };

await c.query(`
 create role anon; create role authenticated; create role service_role;
 create table fin_contas (id uuid primary key default gen_random_uuid(), nome text, saldo_atual numeric, ordem int, ativo boolean default true);
 create type status_l as enum ('previsto','realizado','conciliado');
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), conta_id uuid, data date, data_pagamento date, status status_l, observacoes text);
 create table fin_extrato_vinculos (id uuid primary key default gen_random_uuid(), conta_id uuid, vinculado_em timestamptz, desfeito_em timestamptz);
`);
const [brad, inv, caixa, velha] = (await c.query(`
 insert into fin_contas (nome, saldo_atual, ordem, ativo) values ('Bradesco', 2058.01, 1, true), ('Bradesco Investimento', 1, 2, true), ('Caixa', 50, 3, true), ('Conta encerrada', 0, 4, false) returning id`)).rows.map(r => r.id);
await c.query(`
 insert into fin_lancamentos (conta_id, data, data_pagamento, status, observacoes) values
  ($1, '2026-10-10', '2026-10-10', 'realizado',  'x [ofx:AAA]'),
  ($1, '2026-10-20', '2026-10-21', 'conciliado', 'y [ofx:BBB]'),      -- vale o data_pagamento: 21
  ($1, '2026-10-30', null,         'previsto',   'z [ofx:CCC]'),      -- previsto não conta
  ($1, '2026-10-25', '2026-10-25', 'realizado',  'sem marca'),         -- sem marca não conta
  ($2, '2026-10-22', null,         'realizado',  '[ofx:PDF:2026-10-22:1]'),
  ($3, '2026-10-01', null,         'realizado',  '[ofx:OLD]')`, [brad, inv, velha]);
await c.query(`
 insert into fin_extrato_vinculos (conta_id, vinculado_em, desfeito_em) values
  ($1, '2026-10-21 18:00:00+00', null),
  ($1, '2026-10-15 12:00:00+00', null),
  ($1, '2026-10-22 09:00:00+00', '2026-10-22 10:00:00+00')`, [brad]);   // desfeito: não conta
await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022220000_ultimo_extrato_das_contas.sql', 'utf8'));

await c.query('set role service_role');
const r = (await c.query('select resumo_ultimo_extrato_das_contas() as j')).rows[0].j;
await c.query('reset role');
const por = Object.fromEntries(r.map(x => [x.nome, x]));
confere('só contas ativas, na ordem do cadastro', r.map(x => x.nome).join('|') === 'Bradesco|Bradesco Investimento|Caixa', r.map(x => x.nome).join('|'));
confere('Bradesco: o dia mais recente vem do data_pagamento (21), ignorando previsto e linha sem marca', por['Bradesco'].ultimo_movimento === '2026-10-21', por['Bradesco'].ultimo_movimento);
confere('Bradesco: última conciliação = vínculo ativo mais recente (o desfeito não conta)', new Date(por['Bradesco'].ultima_conciliacao).toISOString() === '2026-10-21T18:00:00.000Z', por['Bradesco'].ultima_conciliacao);
confere('Investimento: a marca do PDF conta como extrato', por['Bradesco Investimento'].ultimo_movimento === '2026-10-22', por['Bradesco Investimento'].ultimo_movimento);
confere('Investimento sem vínculo: conciliação nula', por['Bradesco Investimento'].ultima_conciliacao === null);
confere('Caixa sem extrato: datas nulas', por['Caixa'].ultimo_movimento === null && por['Caixa'].ultima_conciliacao === null);
confere('traz o saldo de cada conta', Number(por['Bradesco'].saldo) === 2058.01);

for (const papel of ['anon', 'authenticated']) {
  await c.query(`set role ${papel}`);
  const e = await recusa('select resumo_ultimo_extrato_das_contas()');
  await c.query('reset role');
  confere(`${papel} não executa`, e && /permission denied/i.test(e), e ?? '');
}
await c.query('drop function resumo_ultimo_extrato_das_contas()');
confere('reverter = DROP FUNCTION (nada mais foi criado)', (await c.query(`select count(*)::int n from pg_proc where proname = 'resumo_ultimo_extrato_das_contas'`)).rows[0].n === 0);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
