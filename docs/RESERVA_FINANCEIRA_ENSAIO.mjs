// Ensaio (Postgres embutido) da migration 20261021150000_projeto_reserva_financeira.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: coluna nasce FALSE para o que já existe (120 Anos fica fora), os dois projetos nascem com a reserva ligada, rodar de novo não duplica, nada em fin_lancamentos muda,
// e o rollback só apaga projeto sem lançamento (o usado fica) e tira a coluna.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data4';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5474, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5474, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };

// o que a migration encontra em produção: a tabela de projetos (migration 20260917020000) com o 120 Anos, e lançamentos que apontam para projetos
await c.query(`
 create table fin_projetos (id uuid primary key default gen_random_uuid(), nome text not null, descricao text, meta_valor numeric(14,2), data_inicio date, data_fim date,
   status text not null default 'ativo' check (status in ('ativo','encerrado')), cor text, created_at timestamptz not null default now(), missionario boolean not null default false);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), projeto_id uuid references fin_projetos(id) on delete set null, valor numeric(14,2), tipo text);
 insert into fin_projetos (nome) values ('120 Anos');
 insert into fin_lancamentos (projeto_id, valor, tipo) select id, 100, 'entrada' from fin_projetos where nome = '120 Anos';
`);
const migration = fs.readFileSync(raiz + 'supabase/migrations/20261021150000_projeto_reserva_financeira.sql', 'utf8');
const antes = await q(`select count(*)::int n, sum(valor) v from fin_lancamentos`);
await c.query(migration);

const cols = await q(`select column_default, is_nullable, data_type from information_schema.columns where table_name='fin_projetos' and column_name='reserva_financeira'`);
confere('a coluna existe, boolean, NOT NULL, default false', cols.length === 1 && cols[0].data_type === 'boolean' && cols[0].is_nullable === 'NO' && /false/.test(cols[0].column_default));
const cento = await q(`select reserva_financeira from fin_projetos where nome = '120 Anos'`);
confere('o 120 Anos (já existia) fica FORA da reserva', cento.length === 1 && cento[0].reserva_financeira === false);
const novos = await q(`select nome, status, reserva_financeira from fin_projetos where nome like 'Retiro % 2027' order by nome`);
confere('os dois projetos foram criados, ativos e com a reserva ligada', novos.length === 2 && novos.every(p => p.status === 'ativo' && p.reserva_financeira) && novos[0].nome === 'Retiro Famílias 2027' && novos[1].nome === 'Retiro Juventude 2027');
const depois = await q(`select count(*)::int n, sum(valor) v from fin_lancamentos`);
confere('nenhum lançamento foi criado, apagado ou alterado', antes[0].n === depois[0].n && Number(antes[0].v) === Number(depois[0].v));

await c.query(migration);   // de novo
const total = await q(`select count(*)::int n from fin_projetos where nome like 'Retiro % 2027'`);
confere('rodar a migration de novo NÃO duplica os projetos', total[0].n === 2);

// rollback: o Juventude é usado por um lançamento; o Famílias não
const jid = (await q(`select id from fin_projetos where nome = 'Retiro Juventude 2027'`))[0].id;
await c.query(`insert into fin_lancamentos (projeto_id, valor, tipo) values ($1, 50, 'entrada')`, [jid]);
const rollback = fs.readFileSync(raiz + 'docs/RESERVA_FINANCEIRA_ROLLBACK.sql', 'utf8');
await c.query(rollback);
const restam = await q(`select nome from fin_projetos where nome like 'Retiro % 2027'`);
confere('rollback: o projeto SEM lançamento sai e o USADO fica (apagar soltaria o vínculo)', restam.length === 1 && restam[0].nome === 'Retiro Juventude 2027');
const col2 = await q(`select 1 from information_schema.columns where table_name='fin_projetos' and column_name='reserva_financeira'`);
confere('rollback: a coluna sai', col2.length === 0);
const lig = await q(`select count(*)::int n from fin_lancamentos where projeto_id = $1`, [jid]);
confere('rollback: o lançamento do projeto usado continua ligado a ele', lig[0].n === 1);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
