// Ensaio (Postgres embutido) da migration 20261023120000_reembolsos_com_pix_de_quem_recebe.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: a chave Pix da linha é SEMPRE a de quem recebe — pessoa: favorecido ligado a ela, senão a chave avulsa (fin_pessoa_pix); empresa/entidade: a do próprio cadastro —, e NUNCA a do fornecedor da nota;
// sem chave = nulo; o que já existia (quem recebe, quitou, valor, conta prevista, último envio) continua igual; só service_role executa.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data13';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5483, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5483, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const recusa = async (sql) => { try { await c.query(sql); return null; } catch (e) { return e.message; } };

const NEUTRA = '00000000-0000-4000-8000-0000000000a1';
await c.query(`
 create role anon; create role authenticated; create role service_role;
 create table membros (id uuid primary key default gen_random_uuid(), nome_completo text);
 create table fin_fornecedores (id uuid primary key default gen_random_uuid(), nome text, pessoa_id uuid, chave_pix text, tipo_chave_pix text);
 create table fin_pessoa_pix (pessoa_id uuid primary key, chave_pix text not null, tipo_chave_pix text);
 create table fin_contas (id uuid primary key, nome text);
 create type st as enum ('previsto','realizado','conciliado');
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), fornecedor_id uuid, descricao text, conta_id uuid, status st, obrigacao_id uuid, data date);
 create table vw_fin_quitacao (obrigacao_id uuid, responsavel_tipo text, responsavel_pessoa_id uuid, responsavel_fornecedor_id uuid, fila text, saldo_a_reembolsar numeric, valor_obrigacao numeric, data_despesa date);
 create table resumo_diario_enviados (id uuid primary key default gen_random_uuid(), lancamento_id uuid not null, enviado_em timestamptz not null default now());
`);
const id = async (sql, p) => (await c.query(sql, p)).rows[0].id;
const caixinha = '00000000-0000-0000-0000-00000000c001';
await c.query(`insert into fin_contas values ($1,'Caixinha Administrativa'), ($2,'Não Aplicável')`, [caixinha, NEUTRA]);
const lucio = await id(`insert into membros (nome_completo) values ('Lúcio') returning id`);
const marta = await id(`insert into membros (nome_completo) values ('Marta') returning id`);
const ana = await id(`insert into membros (nome_completo) values ('Ana') returning id`);
const bia = await id(`insert into membros (nome_completo) values ('Bia') returning id`);
// o fornecedor da NOTA tem Pix — nunca pode aparecer
const leandro = await id(`insert into fin_fornecedores (nome, chave_pix, tipo_chave_pix) values ('Leandro', 'pix-do-prestador@x.org', 'email') returning id`);
const empresa = await id(`insert into fin_fornecedores (nome, chave_pix, tipo_chave_pix) values ('Mercado Bom Ltda', '12345678000199', 'cnpj') returning id`);
// Lúcio: favorecido ligado a ele com chave; Marta: só chave avulsa; Ana: as duas (vale o favorecido); Bia: nenhuma
await c.query(`insert into fin_fornecedores (nome, pessoa_id, chave_pix, tipo_chave_pix) values ('Lúcio', $1, '11122233344', 'cpf')`, [lucio]);
await c.query(`insert into fin_pessoa_pix values ($1, 'marta@x.org', 'email')`, [marta]);
await c.query(`insert into fin_fornecedores (nome, pessoa_id, chave_pix, tipo_chave_pix) values ('Ana', $1, '21999990000', 'telefone')`, [ana]);
await c.query(`insert into fin_pessoa_pix values ($1, 'ana-avulsa@x.org', 'email')`, [ana]);
await c.query(`insert into fin_fornecedores (nome, pessoa_id, chave_pix) values ('Bia', $1, '   ')`, [bia]);   // favorecido sem chave de verdade (espaços)
const desp = async (conta, data) => id(`insert into fin_lancamentos (fornecedor_id, conta_id, status, data) values ($1,$2,'previsto',$3) returning id`, [leandro, conta, data]);
const quita = async (d, tipo, pessoa, forn, valor) => c.query(`insert into vw_fin_quitacao values ($1,$2,$3,$4,'reembolso_a_pagar',null,$5,'2026-10-10')`, [d, tipo, pessoa, forn, valor]);
const dL = await desp(caixinha, '2026-10-10'); await quita(dL, 'pessoa', lucio, null, 500);
const dM = await desp(caixinha, '2026-10-11'); await quita(dM, 'pessoa', marta, null, 80);
const dA = await desp(caixinha, '2026-10-12'); await quita(dA, 'pessoa', ana, null, 70);
const dB = await desp(NEUTRA, '2026-10-13'); await quita(dB, 'pessoa', bia, null, 60);
const dE = await desp(caixinha, '2026-10-14'); await quita(dE, 'empresa', null, empresa, 300);
await c.query(`insert into resumo_diario_enviados (lancamento_id, enviado_em) values ($1,'2026-10-21 10:00:00+00')`, [dL]);

await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261023120000_reembolsos_com_pix_de_quem_recebe.sql', 'utf8'));
await c.query('set role service_role');
const lista = (await c.query('select resumo_reembolsos_a_pagar() as j')).rows[0].j;
await c.query('reset role');
const por = Object.fromEntries(lista.map(x => [x.obrigacao_id, x]));

confere('5 linhas, uma por reembolso', lista.length === 5, String(lista.length));
confere('pessoa com favorecido ligado: a chave do favorecido', por[dL].chave_pix === '11122233344' && por[dL].tipo_chave_pix === 'cpf');
confere('pessoa só com chave avulsa: a avulsa', por[dM].chave_pix === 'marta@x.org' && por[dM].tipo_chave_pix === 'email');
confere('pessoa com as duas: vale o favorecido, como na Declaração do Terceiro', por[dA].chave_pix === '21999990000');
confere('pessoa sem chave (favorecido com espaços): nula', por[dB].chave_pix === null && por[dB].tipo_chave_pix === null);
confere('empresa: a chave do próprio cadastro', por[dE].chave_pix === '12345678000199' && por[dE].tipo_chave_pix === 'cnpj');
confere('o Pix do PRESTADOR da nota nunca aparece em nenhuma linha', !JSON.stringify(lista).includes('pix-do-prestador'));
confere('o que já existia segue igual: quem recebe, quitou, valor, conta prevista, último envio', por[dL].quem_recebe === 'Lúcio' && por[dL].quitou === 'Leandro' && Number(por[dL].valor) === 500 && por[dL].conta_prevista === 'Caixinha Administrativa' && por[dL].ultimo_envio !== null && por[dB].conta_prevista === null);

for (const papel of ['anon', 'authenticated']) {
  await c.query(`set role ${papel}`);
  const e = await recusa('select resumo_reembolsos_a_pagar()');
  await c.query('reset role');
  confere(`${papel} não executa`, e && /permission denied/i.test(e), e ?? '');
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
