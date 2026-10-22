// Ensaio (Postgres embutido) da migration 20261022170000_views_financeiras_voltam_a_security_invoker.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Reproduz o defeito (view criada com a opção e REDEFINIDA sem ela → deixa de ser security_invoker) e prova: a migration religa a opção; um usuário SEM direito na tabela de base passa a
// receber vazio, e um COM direito vê os mesmos números; o rollback devolve ao estado anterior.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data8';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5478, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5478, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const NOMES = ['vw_fin_resumo_mes', 'vw_fin_centros_resumo', 'vw_fin_orcamento_vs_real', 'vw_fin_proximos_vencimentos'];
const invoker = async (v) => (await q(`select coalesce(reloptions::text,'') o from pg_class where relname=$1`, [v]))[0].o.includes('security_invoker=true');

await c.query(`
 create role tesouraria_t login; create role estranho_t login;
 create table fin_lancamentos (id serial primary key, valor numeric);
 insert into fin_lancamentos (valor) values (100), (250);
 alter table fin_lancamentos enable row level security;
 create policy so_tesouraria on fin_lancamentos for select to tesouraria_t using (true);
 grant select on fin_lancamentos to tesouraria_t, estranho_t;
`);
// 1ª definição COM a opção (como a 20260805130000) e depois a REDEFINIÇÃO sem ela (como as migrations posteriores)
for (const v of NOMES) {
  await c.query(`create view ${v} with (security_invoker = true) as select sum(valor) total from fin_lancamentos`);
  await c.query(`grant select on ${v} to tesouraria_t, estranho_t`);
}
for (const v of NOMES) await c.query(`create or replace view ${v} as select sum(valor) total from fin_lancamentos`);
const antes = await Promise.all(NOMES.map(invoker));
confere('o defeito se reproduz: CREATE OR REPLACE VIEW sem a opção ZERA o security_invoker nas quatro', antes.every(x => x === false));
await c.query(`set role estranho_t`);
confere('com o defeito, o usuário SEM direito lê o total do financeiro (vazamento)', Number((await q(`select total from vw_fin_resumo_mes`))[0].total) === 350);
await c.query(`reset role`);

await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022170000_views_financeiras_voltam_a_security_invoker.sql', 'utf8'));
const depois = await Promise.all(NOMES.map(invoker));
confere('a migration religa o security_invoker nas quatro views', depois.every(x => x === true));
await c.query(`set role estranho_t`);
confere('agora o usuário SEM direito recebe vazio', (await q(`select total from vw_fin_centros_resumo`))[0].total === null);
await c.query(`reset role`); await c.query(`set role tesouraria_t`);
confere('quem TEM direito (tesouraria) vê os mesmos números de antes', Number((await q(`select total from vw_fin_resumo_mes`))[0].total) === 350);
await c.query(`reset role`);
await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022170000_views_financeiras_voltam_a_security_invoker.sql', 'utf8'));
confere('rodar a migration de novo é inofensivo', (await Promise.all(NOMES.map(invoker))).every(x => x === true));

await c.query(fs.readFileSync(raiz + 'docs/VIEWS_SECURITY_INVOKER_ROLLBACK.sql', 'utf8'));
confere('rollback: volta ao estado anterior (sem a opção)', (await Promise.all(NOMES.map(invoker))).every(x => x === false));
confere('rollback: as views e os dados continuam', Number((await q(`select total from vw_fin_orcamento_vs_real`))[0].total) === 350);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
