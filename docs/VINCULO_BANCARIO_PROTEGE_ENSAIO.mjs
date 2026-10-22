// Ensaio (Postgres embutido) da migration 20261022150000_fin_vinculo_bancario_protege.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Usa as funções e gatilhos REAIS de vínculo (migration 20261013120000, seção 4) e a trilha REAL (20261016170000). Reproduz o caso Light: lançamento conciliado ligado a uma linha do banco
// não pode mudar valor, voltar a previsto etc.; o caminho é desvincular com motivo; casos já inconsistentes seguem podendo ir para realizado/conciliado.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data7';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5477, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5477, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const tenta = async (sql, p) => { await c.query('savepoint s'); try { await c.query(sql, p); await c.query('release savepoint s'); return null; } catch (e) { await c.query('rollback to savepoint s'); return e.message; } };

const USER = '11111111-1111-1111-1111-111111111111';
await c.query(`
 create role anon; create role authenticated;
 create schema auth; create function auth.uid() returns uuid language sql as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
 create type app_role as enum ('admin','diakonia','secretaria','tesouraria','voluntario');
 create function has_any_role(u uuid, r app_role[]) returns boolean language sql as $f$ select u = '${USER}'::uuid $f$;
 create function fin_nome_do_usuario(u uuid) returns text language sql as $f$ select 'Telma Souza'::text $f$;
 create type fin_tipo as enum ('entrada','saida');
 create type fin_status as enum ('previsto','realizado','conciliado','cancelado','aguardando_aprovacao');
 create table fin_contas (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), conta_id uuid references fin_contas(id), tipo fin_tipo, status fin_status, data date, data_pagamento date,
   valor numeric(14,2), origem text, observacoes text, descricao text, forma_pagamento text, categoria_id uuid, obrigacao_id uuid, audit_user_id uuid, audit_em timestamptz, created_at timestamptz default now());
 create table fin_extrato_vinculos (
  id uuid primary key default gen_random_uuid(), conta_id uuid not null references fin_contas(id), fitid text not null check (btrim(fitid) <> ''), origem text not null check (origem in ('ofx','pdf')),
  lancamento_id uuid references fin_lancamentos(id) on delete set null, obrigacao_id uuid, vinculado_em timestamptz not null default now(), vinculado_por uuid,
  desfeito_em timestamptz, desfeito_por uuid, desfeito_motivo text, nota text, check ((desfeito_em is null) = (desfeito_motivo is null)));
 create unique index fin_extrato_vinculos_ativo_idx on fin_extrato_vinculos (conta_id, fitid) where desfeito_em is null;
`);
// as funções e gatilhos REAIS do vínculo
const d4 = fs.readFileSync(raiz + 'supabase/migrations/20261013120000_fin_extrato_vinculos_e_conferencia.sql', 'utf8');
const ini = d4.indexOf('CREATE OR REPLACE FUNCTION public.fin_marcas_do_extrato'), fim = d4.indexOf('-- ── 5)');
if (ini < 0 || fim < ini) throw new Error('seção 4 do D4 não encontrada');
await c.query(d4.slice(ini, fim));
// a trilha REAL (tabela com a restrição do campo)
const decl = fs.readFileSync(raiz + 'supabase/migrations/20261016170000_fin_declaracao_manda.sql', 'utf8');
const ti = decl.indexOf('CREATE TABLE IF NOT EXISTS public.fin_lancamento_historico'), tf = decl.indexOf('CREATE INDEX IF NOT EXISTS fin_lancamento_historico_lanc_idx');
await c.query(decl.slice(ti, tf));
await c.query(`create function fin_lancamento_historico_imutavel() returns trigger language plpgsql as $f$ begin raise exception 'imutável'; end $f$;
 create trigger fin_lancamento_historico_imutavel before update or delete on fin_lancamento_historico for each row execute function fin_lancamento_historico_imutavel();`);

const migration = fs.readFileSync(raiz + 'supabase/migrations/20261022150000_fin_vinculo_bancario_protege.sql', 'utf8');
await c.query(migration);
await c.query(`set test.uid = '${USER}'`);
await c.query('begin');

const conta = (await q(`insert into fin_contas (nome) values ('Bradesco') returning id`))[0].id;
const novo = async (valor, status, obs, extra = {}) => (await q(
  `insert into fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, observacoes, forma_pagamento) values ($1,'saida',$2,'2026-10-15',$3,$4,$5,'transferencia') returning id`,
  [conta, status, status === 'previsto' ? null : '2026-10-15', valor, obs]))[0].id;

// === o caso Light: conciliado ligado à linha N10DBB
const L = await novo(3583.22, 'conciliado', '[ofx:N10DBB] [lote-ofx:x]');
confere('o vínculo nasce pelo gatilho real', (await q(`select count(*)::int n from fin_extrato_vinculos where lancamento_id=$1 and desfeito_em is null`, [L]))[0].n === 1);

let e = await tenta(`update fin_lancamentos set valor = 2110.12 where id = $1`, [L]);
confere('NÃO deixa mudar o valor', /valor não pode ser alterado/.test(e ?? ''), e ? '' : '(passou!)');
e = await tenta(`update fin_lancamentos set status = 'previsto', data_pagamento = null where id = $1`, [L]);
confere('NÃO deixa voltar a previsto', !!e && /não pode voltar para "previsto"|data do pagamento/.test(e));
e = await tenta(`update fin_lancamentos set status = 'previsto' where id = $1`, [L]);
confere('NÃO deixa voltar a previsto (só o status)', /não pode voltar para "previsto"/.test(e ?? ''));
e = await tenta(`update fin_lancamentos set status = 'cancelado' where id = $1`, [L]);
confere('NÃO deixa cancelar', /não pode voltar para "cancelado"/.test(e ?? ''));
e = await tenta(`update fin_lancamentos set tipo = 'entrada' where id = $1`, [L]);
confere('NÃO deixa trocar o sentido', /sentido/.test(e ?? ''));
e = await tenta(`update fin_lancamentos set data_pagamento = '2026-10-20' where id = $1`, [L]);
confere('NÃO deixa mudar a data do pagamento', /data do pagamento/.test(e ?? ''));
e = await tenta(`update fin_lancamentos set observacoes = 'só texto' where id = $1`, [L]);
confere('NÃO deixa retirar a marca do extrato à mão', /marca \[ofx/.test(e ?? ''));
e = await tenta(`update fin_lancamentos set observacoes = null where id = $1`, [L]);
confere('NÃO deixa apagar as observações (e a marca)', /marca \[ofx/.test(e ?? ''));

// o que continua livre
e = await tenta(`update fin_lancamentos set forma_pagamento = 'boleto' where id = $1`, [L]);
confere('forma de pagamento continua livre', e === null);
e = await tenta(`update fin_lancamentos set descricao = 'Light de outubro', categoria_id = gen_random_uuid() where id = $1`, [L]);
confere('descrição e categoria continuam livres', e === null);
e = await tenta(`update fin_lancamentos set observacoes = '[ofx:N10DBB] [lote-ofx:x]\nnota minha' where id = $1`, [L]);
confere('acrescentar texto nas observações (mantendo a marca) continua livre', e === null);
e = await tenta(`update fin_lancamentos set status = 'realizado' where id = $1`, [L]);
confere('desconferir (conciliado → realizado) continua livre', e === null);
e = await tenta(`update fin_lancamentos set status = 'conciliado' where id = $1`, [L]);
confere('conferir (realizado → conciliado) continua livre', e === null);
e = await tenta(`update fin_lancamentos set valor = 3583.22, tipo = 'saida', status = 'conciliado', data_pagamento = '2026-10-15' where id = $1`, [L]);
confere('gravar de novo os MESMOS valores (o formulário manda todos os campos) não é bloqueado', e === null);

// === o caminho: desvincular com motivo
e = await tenta(`select fin_desvincular_do_extrato($1, 'abc')`, [L]);
confere('desvincular exige motivo de 5+ letras', /motivo/.test(e ?? ''));
await c.query(`set test.uid = ''`);
e = await tenta(`select fin_desvincular_do_extrato($1, 'motivo válido')`, [L]);
confere('desvincular exige permissão', /permissão/.test(e ?? ''));
await c.query(`set test.uid = '${USER}'`);
const n = (await q(`select fin_desvincular_do_extrato($1, 'O débito pagou duas faturas da Light') n`, [L]))[0].n;
confere('desvincular fecha 1 vínculo', n === 1);
const v = (await q(`select desfeito_em is not null fechado, desfeito_motivo, desfeito_por from fin_extrato_vinculos where lancamento_id=$1`, [L]))[0];
confere('o vínculo fica FECHADO com o motivo e quem fechou (a história permanece)', v.fechado && v.desfeito_motivo === 'O débito pagou duas faturas da Light' && v.desfeito_por === USER);
const h = await q(`select campo, antes, depois, motivo, por, por_nome from fin_lancamento_historico where lancamento_id=$1`, [L]);
confere('trilha: campo vinculo_extrato, a linha do banco, o motivo, quem e quando', h.length === 1 && h[0].campo === 'vinculo_extrato' && h[0].antes === 'N10DBB' && h[0].motivo.includes('duas faturas') && h[0].por === USER && h[0].por_nome === 'Telma Souza');
const obs = (await q(`select observacoes from fin_lancamentos where id=$1`, [L]))[0].observacoes;
confere('a marca saiu das observações e o resto do texto ficou', obs !== null && !obs.includes('[ofx:N10DBB]') && obs.includes('nota minha'));
e = await tenta(`update fin_lancamentos set valor = 2110.12, status = 'previsto', data_pagamento = null where id = $1`, [L]);
confere('DEPOIS de desvincular o lançamento é editável como qualquer outro', e === null);
e = await tenta(`select fin_desvincular_do_extrato($1, 'segunda vez')`, [L]);
confere('desvincular de novo avisa que não há vínculo', /não tem vínculo ativo/.test(e ?? ''));
e = await tenta(`delete from fin_lancamento_historico where lancamento_id=$1`, [L]);
confere('a trilha continua imutável', /imutável/.test(e ?? ''));
// a linha do banco fica livre para outro lançamento
const L2 = await novo(3583.22, 'realizado', null);
e = await tenta(`update fin_lancamentos set observacoes = '[ofx:N10DBB]' where id = $1`, [L2]);
confere('a linha do banco, solta, pode ser ligada a outro lançamento', e === null && (await q(`select count(*)::int n from fin_extrato_vinculos where fitid='N10DBB' and desfeito_em is null`))[0].n === 1);

// === caso histórico já inconsistente (previsto COM vínculo ativo), como os da Light hoje
await c.query(`alter table fin_lancamentos disable trigger fin_lanc_protege_vinculo`);
const H = await novo(2110.12, 'previsto', '[ofx:N10DBX] [lote-ofx:y]');
await c.query(`alter table fin_lancamentos enable trigger fin_lanc_protege_vinculo`);
e = await tenta(`update fin_lancamentos set descricao = 'qualquer coisa' where id = $1`, [H]);
confere('histórico inconsistente: editar outros campos continua possível', e === null);
e = await tenta(`update fin_lancamentos set status = 'conciliado' where id = $1`, [H]);
confere('histórico inconsistente: ir para conciliado (o caminho de volta) continua possível', e === null);
const H2 = await novo(313.77, 'previsto', null);
await c.query(`update fin_lancamentos set observacoes='[ofx:N10DA5]' where id=$1`, [H2]);   // ligar um previsto a uma linha do banco ainda é possível (a conciliação faz isso e depois muda o status)
e = await tenta(`update fin_lancamentos set status = 'conciliado' where id = $1`, [H2]);
confere('o fluxo da liquidação (marca primeiro, status conciliado depois) continua funcionando', e === null);

// escape de manutenção
const M = await novo(100, 'conciliado', '[ofx:NMANUT]');
await c.query('commit');
await c.query('begin'); await c.query(`set local qibrj.vinculo_livre = 'on'`);
const eEscape = await tenta(`update fin_lancamentos set valor = 101 where id = $1`, [M]);
await c.query('commit');
await c.query('begin');
const eFora = await tenta(`update fin_lancamentos set valor = 102 where id = $1`, [M]);
confere('escape de manutenção por SQL (SET LOCAL qibrj.vinculo_livre) funciona e não vaza para fora da transação', eEscape === null && /valor/.test(eFora ?? ''));

// === rollback
await c.query(fs.readFileSync(raiz + 'docs/VINCULO_BANCARIO_PROTEGE_ROLLBACK.sql', 'utf8'));
confere('rollback: o gatilho e a função saem', (await q(`select count(*)::int n from pg_trigger where tgname='fin_lanc_protege_vinculo'`))[0].n === 0 && (await q(`select count(*)::int n from pg_proc where proname in ('fin_lanc_protege_vinculo','fin_desvincular_do_extrato')`))[0].n === 0);
e = await tenta(`update fin_lancamentos set valor = 7 where id = $1`, [M]);
confere('rollback: a edição volta a ser livre', e === null);
confere('rollback: a trilha já gravada fica', (await q(`select count(*)::int n from fin_lancamento_historico where campo='vinculo_extrato'`))[0].n === 1);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
