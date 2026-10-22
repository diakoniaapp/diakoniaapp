// Ensaio (Postgres embutido) da migration 20261022100000_fin_lancamentos_data_emissao.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: a coluna nasce NULL em tudo que já existe, nada de vencimento/pagamento/competência/valor muda, rodar de novo é inofensivo, a emissão grava e lê, e o rollback só tira a coluna.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data6';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5476, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5476, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };

await c.query(`
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), data date not null, data_pagamento date, data_competencia date, valor numeric(14,2), descricao text);
 create view vw_lanc as select * from fin_lancamentos;
 insert into fin_lancamentos (data, data_pagamento, data_competencia, valor, descricao) values ('2026-10-10','2026-10-11','2026-10-01',100,'F5'), ('2026-10-10',null,null,50,'previsto');
`);
const migration = fs.readFileSync(raiz + 'supabase/migrations/20261022100000_fin_lancamentos_data_emissao.sql', 'utf8');
const antes = JSON.stringify(await q(`select id, data, data_pagamento, data_competencia, valor, descricao from fin_lancamentos order by descricao`));
await c.query(migration);

const col = await q(`select data_type, is_nullable, column_default from information_schema.columns where table_name='fin_lancamentos' and column_name='data_emissao'`);
confere('a coluna existe, tipo date, aceita nulo, sem default', col.length === 1 && col[0].data_type === 'date' && col[0].is_nullable === 'YES' && col[0].column_default === null);
confere('tudo que já existia nasce sem emissão', (await q(`select count(*)::int n from fin_lancamentos where data_emissao is not null`))[0].n === 0);
const depois = JSON.stringify(await q(`select id, data, data_pagamento, data_competencia, valor, descricao from fin_lancamentos order by descricao`));
confere('vencimento, pagamento, competência e valor não mudaram', antes === depois);

await c.query(migration);
confere('rodar a migration de novo é inofensivo', (await q(`select count(*)::int n from fin_lancamentos`))[0].n === 2);

await c.query(`update fin_lancamentos set data_emissao = '2026-10-05' where descricao = 'F5'`);
const lido = await q(`select to_char(data_emissao,'YYYY-MM-DD') e, to_char(data,'YYYY-MM-DD') v, to_char(data_pagamento,'YYYY-MM-DD') p from fin_lancamentos where descricao='F5'`);
confere('emissão, vencimento e pagamento convivem e gravam cada um no seu campo', lido[0].e === '2026-10-05' && lido[0].v === '2026-10-10' && lido[0].p === '2026-10-11');

await c.query(fs.readFileSync(raiz + 'docs/DATA_EMISSAO_ROLLBACK.sql', 'utf8'));
confere('rollback: a coluna sai', (await q(`select 1 from information_schema.columns where table_name='fin_lancamentos' and column_name='data_emissao'`)).length === 0);
confere('rollback: as outras datas e os lançamentos continuam', JSON.stringify(await q(`select id, data, data_pagamento, data_competencia, valor, descricao from fin_lancamentos order by descricao`)) === antes);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
