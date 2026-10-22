// Ensaio (Postgres embutido) da migration 20261022230000_reembolsos_a_pagar_nos_resumos.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: só entra o reembolso na fila `reembolso_a_pagar` (aprovado, com saldo); quem recebe vem de `membros` (pessoa) ou de `fin_fornecedores` (empresa/entidade); `quitou` é o fornecedor da despesa;
// o valor é o saldo a reembolsar (senão o valor da obrigação); a conta prevista é a da despesa — a da parcela em aberto, se houver; a conta estrutural das ofertas vira nula; `ultimo_envio` vem do registro
// do resumo diário; só service_role executa.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data12';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5482, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5482, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const recusa = async (sql) => { try { await c.query(sql); return null; } catch (e) { return e.message; } };

const NEUTRA = '00000000-0000-4000-8000-0000000000a1';
await c.query(`
 create role anon; create role authenticated; create role service_role;
 create table membros (id uuid primary key default gen_random_uuid(), nome_completo text);
 create table fin_fornecedores (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_contas (id uuid primary key, nome text);
 create type st as enum ('previsto','realizado','conciliado');
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), fornecedor_id uuid, descricao text, conta_id uuid, status st, obrigacao_id uuid, data date);
 -- a vw_fin_quitacao de mentira: só as colunas que a função lê
 create table vw_fin_quitacao (obrigacao_id uuid, responsavel_tipo text, responsavel_pessoa_id uuid, responsavel_fornecedor_id uuid, fila text, saldo_a_reembolsar numeric, valor_obrigacao numeric, data_despesa date);
 create table resumo_diario_enviados (id uuid primary key default gen_random_uuid(), lancamento_id uuid not null, enviado_em timestamptz not null default now());
`);
const id = async (sql, p) => (await c.query(sql, p)).rows[0].id;
const caixinha = '00000000-0000-0000-0000-00000000c001', bradesco = '00000000-0000-0000-0000-00000000c002';
await c.query(`insert into fin_contas values ($1,'Caixinha Administrativa'), ($2,'Bradesco'), ($3,'Não Aplicável (Compras Pagas por Terceiros)')`, [caixinha, bradesco, NEUTRA]);
const lucio = await id(`insert into membros (nome_completo) values ('Lúcio') returning id`);
const marta = await id(`insert into membros (nome_completo) values ('Marta') returning id`);
const leandro = await id(`insert into fin_fornecedores (nome) values ('Leandro') returning id`);
const padaria = await id(`insert into fin_fornecedores (nome) values ('Padaria Pão Quente') returning id`);
const empresa = await id(`insert into fin_fornecedores (nome) values ('Mercado Bom Ltda') returning id`);
const desp = async (forn, conta, data, descricao = null) => id(`insert into fin_lancamentos (fornecedor_id, conta_id, status, data, descricao) values ($1,$2,'previsto',$3,$4) returning id`, [forn, conta, data, descricao]);

// 1) Lúcio quitou Leandro: R$ 500, conta Caixinha
const d1 = await desp(leandro, caixinha, '2026-10-10');
await c.query(`insert into vw_fin_quitacao values ($1,'pessoa',$2,null,'reembolso_a_pagar',500,500,'2026-10-10')`, [d1, lucio]);
// 2) empresa quitou a despesa da padaria; saldo parcial 120 de 300; parcela em aberto na conta Bradesco (a raiz está na Caixinha)
const d2 = await desp(padaria, caixinha, '2026-10-12');
await c.query(`update fin_lancamentos set status='realizado' where id=$1`, [d2]);
await c.query(`insert into fin_lancamentos (fornecedor_id, conta_id, status, data, obrigacao_id) values ($1,$2,'previsto','2026-10-12',$3)`, [padaria, bradesco, d2]);
await c.query(`insert into vw_fin_quitacao values ($1,'empresa',null,$2,'reembolso_a_pagar',120,300,'2026-10-12')`, [d2, empresa]);
// 3) Marta, despesa na conta estrutural das ofertas (convertida em reembolso): conta nula
const d3 = await desp(leandro, NEUTRA, '2026-10-15', 'Gás');
await c.query(`insert into vw_fin_quitacao values ($1,'pessoa',$2,null,'reembolso_a_pagar',null,80,'2026-10-15')`, [d3, marta]);
// 4) ainda NÃO aprovado: fora
const d4 = await desp(leandro, caixinha, '2026-10-16');
await c.query(`insert into vw_fin_quitacao values ($1,'pessoa',$2,null,'aprovar_reembolso',null,999,'2026-10-16')`, [d4, marta]);
// 5) oferta (sem fila de reembolso): fora
const d5 = await desp(leandro, NEUTRA, '2026-10-17');
await c.query(`insert into vw_fin_quitacao values ($1,'pessoa',$2,null,null,null,50,'2026-10-17')`, [d5, marta]);
// já enviado em resumo diário
await c.query(`insert into resumo_diario_enviados (lancamento_id, enviado_em) values ($1,'2026-10-21 10:00:00+00')`, [d1]);

await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022230000_reembolsos_a_pagar_nos_resumos.sql', 'utf8'));
await c.query('set role service_role');
const lista = (await c.query('select resumo_reembolsos_a_pagar() as j')).rows[0].j;
await c.query('reset role');
const por = Object.fromEntries(lista.map(x => [x.obrigacao_id, x]));

confere('só os 3 reembolsos aprovados com saldo (nem "aprovar", nem oferta)', lista.length === 3 && !por[d4] && !por[d5], String(lista.length));
confere('ordem: pela data da despesa', lista.map(x => x.obrigacao_id).join() === [d1, d2, d3].join());
confere('1: Lúcio recebe; quitou Leandro; R$ 500; conta Caixinha Administrativa', por[d1].quem_recebe === 'Lúcio' && por[d1].quitou === 'Leandro' && Number(por[d1].valor) === 500 && por[d1].conta_prevista === 'Caixinha Administrativa', JSON.stringify(por[d1]));
confere('1: tipo de quem recebe = pessoa', por[d1].tipo_de_quem_recebe === 'pessoa');
confere('2: quem recebe vem do cadastro de fornecedores quando é empresa', por[d2].quem_recebe === 'Mercado Bom Ltda');
confere('2: o valor é o SALDO (120), não o da obrigação (300)', Number(por[d2].valor) === 120 && Number(por[d2].valor_obrigacao) === 300);
confere('2: a conta prevista é a da parcela em aberto (Bradesco), não a da raiz', por[d2].conta_prevista === 'Bradesco', por[d2].conta_prevista);
confere('3: sem saldo guardado, o valor é o da obrigação (80)', Number(por[d3].valor) === 80);
confere('3: despesa na conta estrutural das ofertas → conta prevista nula (o e-mail diz "a definir ao pagar")', por[d3].conta_prevista === null);
confere('3: sem fornecedor ligado... aqui há (Leandro) e a descrição vem junto', por[d3].quitou === 'Leandro' && por[d3].descricao === 'Gás');
confere('1: ultimo_envio vem do registro do resumo diário', por[d1].ultimo_envio !== null && por[d2].ultimo_envio === null, String(por[d1].ultimo_envio));

for (const papel of ['anon', 'authenticated']) {
  await c.query(`set role ${papel}`);
  const e = await recusa('select resumo_reembolsos_a_pagar()');
  await c.query('reset role');
  confere(`${papel} não executa`, e && /permission denied/i.test(e), e ?? '');
}
await c.query('drop function resumo_reembolsos_a_pagar()');
confere('reverter = DROP FUNCTION', (await c.query(`select count(*)::int n from pg_proc where proname = 'resumo_reembolsos_a_pagar'`)).rows[0].n === 0);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
