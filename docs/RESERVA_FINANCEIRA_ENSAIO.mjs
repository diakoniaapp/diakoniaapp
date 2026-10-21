// Ensaio (Postgres embutido) da migration 20261021150000_projeto_reserva_financeira.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: a coluna nasce FALSE para o que já existe (120 Anos fica fora), a migration NÃO cria projeto nenhum, rodar de novo é inofensivo, nada em fin_lancamentos muda,
// um projeto marcado depois continua marcado, e o rollback só tira a coluna (projetos e vínculos dos lançamentos ficam).
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

// o que a migration encontra em produção: a tabela de projetos (migration 20260917020000) com o 120 Anos e o Retiro que ela criou, e lançamentos ligados a eles
await c.query(`
 create table fin_projetos (id uuid primary key default gen_random_uuid(), nome text not null, descricao text, meta_valor numeric(14,2), data_inicio date, data_fim date,
   status text not null default 'ativo' check (status in ('ativo','encerrado')), cor text, created_at timestamptz not null default now(), missionario boolean not null default false);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), projeto_id uuid references fin_projetos(id) on delete set null, valor numeric(14,2), tipo text);
 insert into fin_projetos (nome) values ('120 Anos'), ('Retiro Juventude 2026');
 insert into fin_lancamentos (projeto_id, valor, tipo) select id, 100, 'entrada' from fin_projetos;
`);
const migration = fs.readFileSync(raiz + 'supabase/migrations/20261021150000_projeto_reserva_financeira.sql', 'utf8');
const antes = await q(`select count(*)::int n, sum(valor) v from fin_lancamentos`);
const projetosAntes = (await q(`select count(*)::int n from fin_projetos`))[0].n;
await c.query(migration);

const cols = await q(`select column_default, is_nullable, data_type from information_schema.columns where table_name='fin_projetos' and column_name='reserva_financeira'`);
confere('a coluna existe, boolean, NOT NULL, default false', cols.length === 1 && cols[0].data_type === 'boolean' && cols[0].is_nullable === 'NO' && /false/.test(cols[0].column_default));
const existentes = await q(`select nome, reserva_financeira from fin_projetos order by nome`);
confere('os projetos que já existiam (120 Anos e o Retiro dela) nascem FORA da reserva', existentes.length === 2 && existentes.every(p => p.reserva_financeira === false));
confere('a migration NÃO cria projeto nenhum', (await q(`select count(*)::int n from fin_projetos`))[0].n === projetosAntes);
const depois = await q(`select count(*)::int n, sum(valor) v from fin_lancamentos`);
confere('nenhum lançamento foi criado, apagado ou alterado', antes[0].n === depois[0].n && Number(antes[0].v) === Number(depois[0].v));

await c.query(migration);   // de novo
confere('rodar a migration de novo é inofensivo', (await q(`select count(*)::int n from fin_projetos`))[0].n === projetosAntes);

await c.query(`update fin_projetos set reserva_financeira = true where nome = 'Retiro Juventude 2026'`);
await c.query(migration);
confere('um projeto marcado por ela continua marcado depois de rodar a migration outra vez', (await q(`select reserva_financeira from fin_projetos where nome='Retiro Juventude 2026'`))[0].reserva_financeira === true);

const rollback = fs.readFileSync(raiz + 'docs/RESERVA_FINANCEIRA_ROLLBACK.sql', 'utf8');
await c.query(rollback);
confere('rollback: a coluna sai', (await q(`select 1 from information_schema.columns where table_name='fin_projetos' and column_name='reserva_financeira'`)).length === 0);
confere('rollback: os projetos dela continuam, e os lançamentos continuam ligados a eles',
  (await q(`select count(*)::int n from fin_projetos`))[0].n === projetosAntes && (await q(`select count(*)::int n from fin_lancamentos where projeto_id is not null`))[0].n === 2);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
