// Ensaio (Postgres embutido) da migration 20261020220000_fin_recusa_movimento_duplicado.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg). Resultado em 20/10/2026: TUDO OK (9 blocos).
// Ensaio local (Postgres real): o gatilho fin_recusa_movimento_duplicado da migration 20261020220000, do arquivo real,
// junto com as funções e gatilhos REAIS de vínculo da migration 20261013120000 (D4).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data3';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5473, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5473, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const tenta = async (sql, p) => { await c.query('savepoint s'); try { await c.query(sql, p); await c.query('release savepoint s'); return null; } catch (e) { await c.query('rollback to savepoint s'); return e; } };

await c.query(`
 create schema auth; create function auth.uid() returns uuid language sql as $f$ select null::uuid $f$;
 create type fin_tipo as enum ('entrada','saida');
 create type fin_status as enum ('previsto','realizado','conciliado');
 create table fin_contas (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), conta_id uuid references fin_contas(id), tipo fin_tipo, status fin_status, data date, data_pagamento date,
   valor numeric(14,2), origem text, observacoes text, descricao text, obrigacao_id uuid, created_at timestamptz default now());
 create table fin_extrato_vinculos (
  id uuid primary key default gen_random_uuid(), conta_id uuid not null references fin_contas(id), fitid text not null check (btrim(fitid) <> ''), origem text not null check (origem in ('ofx','pdf')),
  lancamento_id uuid references fin_lancamentos(id) on delete set null, obrigacao_id uuid, vinculado_em timestamptz not null default now(), vinculado_por uuid,
  desfeito_em timestamptz, desfeito_por uuid, desfeito_motivo text, nota text, check ((desfeito_em is null) = (desfeito_motivo is null)));
 create unique index fin_extrato_vinculos_ativo_idx on fin_extrato_vinculos (conta_id, fitid) where desfeito_em is null;
`);
// as funções e gatilhos REAIS do D4 (seção 4 da migration 20261013120000)
const d4 = fs.readFileSync(raiz + 'supabase/migrations/20261013120000_fin_extrato_vinculos_e_conferencia.sql', 'utf8');
const ini = d4.indexOf('CREATE OR REPLACE FUNCTION public.fin_marcas_do_extrato'), fim = d4.indexOf('-- ── 5)');
if (ini < 0 || fim < ini) throw new Error('seção 4 do D4 não encontrada');
await c.query(d4.slice(ini, fim));
// a migration REAL desta entrega
await c.query(fs.readFileSync(raiz + "supabase/migrations/20261020220000_fin_recusa_movimento_duplicado.sql", "utf8"));

await c.query("begin");
const conta = (await q(`insert into fin_contas (nome) values ('Bradesco') returning id`))[0].id;
const outra = (await q(`insert into fin_contas (nome) values ('Itaú') returning id`))[0].id;
const ins = (o) => c.query(`insert into fin_lancamentos (conta_id,tipo,status,data,data_pagamento,valor,origem,observacoes,descricao) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [o.conta ?? conta, o.tipo ?? 'saida', o.status ?? 'conciliado', o.data ?? '2026-10-02', o.pag ?? null, o.valor ?? 760, o.origem ?? 'importado_ofx', o.obs ?? null, o.desc ?? null]);
const envelhece = (fitid) => c.query(`update fin_extrato_vinculos set vinculado_em = now() - interval '12 days' where fitid = $1`, [fitid]);

// o caso real: o PIX de R$ 760 para a Ana, já baixado em 08/10 pela recorrência, com o identificador do OUTRO arquivo
await ins({ origem: 'recorrencia', obs: '[ofx:N11D35]', desc: 'Ana Patrícia', data: '2026-10-05', pag: '2026-10-02' });
await envelhece('N11D35');

console.log('\n1) O caso de 20/10: mesma conta, sentido, valor e dia, outro identificador → o banco recusa');
let e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'importado_ofx','[ofx:N10335] [lote-ofx:abc]')`, [conta]);
confere('recusado', !!e && /já parece estar registrado/.test(e.message), e?.message?.slice(0, 120));
confere('a mensagem diz o identificador antigo e traz a dica', !!e && /N11D35/.test(e.message) && /Vincule/.test(e.hint ?? ''));
confere('nada foi gravado', +(await q(`select count(*)::int n from fin_lancamentos where observacoes like '%N10335%'`))[0].n === 0);

console.log('\n2) Com o motivo ("é outro pagamento") o lançamento nasce');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'importado_ofx','[ofx:N10336] [lote-ofx:abc] [motivo-novo:Dois pagamentos iguais no mesmo dia]')`, [conta]);
confere('gravado', e === null, e?.message);

console.log('\n3) O que NÃO é gêmeo passa');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',761,'importado_ofx','[ofx:N20001]')`, [conta]);
confere('valor diferente', e === null, e?.message);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-03',760,'importado_ofx','[ofx:N20002]')`, [conta]);
confere('dia diferente', e === null, e?.message);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'entrada','conciliado','2026-10-02',760,'importado_ofx','[ofx:N20003]')`, [conta]);
confere('sentido diferente', e === null, e?.message);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'importado_ofx','[ofx:N20004]')`, [outra]);
confere('outra conta', e === null, e?.message);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'manual','lançado à mão, sem marca do banco')`, [conta]);
confere('lançamento manual (sem marca do extrato) nunca é guardado', e === null, e?.message);

console.log('\n4) Dois PIX iguais no MESMO arquivo (confirmados em sequência) não se recusam entre si');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'entrada','conciliado','2026-10-05',20,'importado_ofx','[ofx:N30001]')`, [conta]);
confere('o primeiro', e === null, e?.message);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'entrada','conciliado','2026-10-05',20,'importado_ofx','[ofx:N30002]')`, [conta]);
confere('o segundo, minutos depois (o vínculo do primeiro é recente)', e === null, e?.message);
await envelhece('N30001'); await envelhece('N30002');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'entrada','conciliado','2026-10-05',20,'importado_ofx','[ofx:N39999]')`, [conta]);
confere('mas um terceiro, vindo de OUTRO arquivo dias depois, é recusado', !!e && /já parece estar registrado/.test(e.message));

console.log('\n5) Vínculo recente no gêmeo (a tesouraria acabou de vincular) também libera');
await ins({ origem: 'recorrencia', valor: 291.31, data: '2026-10-05', pag: '2026-10-05', obs: '[ofx:N11F2D]' });
await envelhece('N11F2D');
await c.query(`update fin_lancamentos set observacoes = observacoes || E'\n[ofx:N105F0]' where observacoes like '%N11F2D%'`);   // "Vincular" acrescenta a marca agora
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-05',291.31,'importado_ofx','[ofx:N105F1]')`, [conta]);
confere('o segundo pagamento igual do dia segue (o gêmeo já foi vinculado há instantes)', e === null, e?.message);

console.log('\n6) Obrigação ainda PREVISTA não é gêmeo (essa se liquida) · marca só do PDF não conta');
await ins({ status: 'previsto', valor: 500, data: '2026-10-06', origem: 'recorrencia' });
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-06',500,'importado_ofx','[ofx:N40001]')`, [conta]);
confere('previsto não bloqueia', e === null, e?.message);
await ins({ valor: 2639.15, data: '2026-10-01', origem: 'transferencia', obs: '[ofx:PDF:2026-10-01:APLICACAO:5643063:2639.15] [transferencia-ofx]' });
await envelhece('PDF:2026-10-01:APLICACAO:5643063:2639.15');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-01',2639.15,'importado_ofx','[ofx:N50001]')`, [conta]);
confere('o vínculo do PDF não gera recusa', e === null, e?.message);

console.log('\n7) Transferência (a perna do banco, com marca) também é guardada — o caso dos R$ 250');
await ins({ tipo: 'entrada', valor: 250, data: '2026-10-01', origem: 'transferencia', obs: '[ofx:N11AEB]' });
await envelhece('N11AEB');
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'entrada','conciliado','2026-10-01',250,'transferencia','[ofx:N10111] [transferencia-ofx]')`, [conta]);
confere('a segunda transferência é recusada', !!e && /já parece estar registrado/.test(e.message));
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','realizado','2026-10-01',250,'transferencia',null)`, [outra]);
confere('a perna da OUTRA conta (sem marca do extrato) passa', e === null, e?.message);

console.log('\n8) Sem a tabela de vínculos a função nunca bloqueia');
await c.query(`alter table fin_extrato_vinculos rename to fin_extrato_vinculos_x`);
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'importado_ofx','[ofx:N60001]')`, [conta]);
// o gatilho de vínculo (D4) também precisa da tabela; aqui só o nosso é medido: sem erro de "já parece"
confere('não recusa por duplicidade', !e || !/já parece estar registrado/.test(e.message), e?.message?.slice(0, 80));
await c.query(`alter table fin_extrato_vinculos_x rename to fin_extrato_vinculos`);

console.log('\n9) Reverter: sem o gatilho, volta ao comportamento anterior');
await c.query(fs.readFileSync(raiz + 'docs/RECUSA_DUPLICADO_ROLLBACK.sql', 'utf8'));
e = await tenta(`insert into fin_lancamentos (conta_id,tipo,status,data,valor,origem,observacoes) values ($1,'saida','conciliado','2026-10-02',760,'importado_ofx','[ofx:N70001]')`, [conta]);
confere('após o rollback o mesmo insert passa', e === null, e?.message);

await c.query("rollback");
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
