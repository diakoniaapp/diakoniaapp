// Ensaio (Postgres embutido) dos scripts CORRECAO_DUPLICADOS_OFX_*.sql — harness em scratchpad/pgnew (embedded-postgres + pg). Resultado em 20/10/2026: TUDO OK (6 blocos, 4 travas).
// Ensaio local (Postgres real) dos scripts docs/CORRECAO_DUPLICADOS_OFX_ENSAIO.sql e _APLICAR.sql, com os 33 pares (mesmos ids) e os gatilhos REAIS de vínculo (D4).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data4';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5474, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5474, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const base = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const CONTA = '9c6730f9-89a5-4112-b040-1cce5a5d77b3';

await c.query(`
 create schema auth; create function auth.uid() returns uuid language sql as $f$ select null::uuid $f$;
 create type fin_tipo as enum ('entrada','saida'); create type fin_status as enum ('previsto','realizado','conciliado');
 create table fin_contas (id uuid primary key, nome text);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), conta_id uuid references fin_contas(id), tipo fin_tipo, status fin_status, data date, data_pagamento date,
   valor numeric(14,2), origem text, observacoes text, descricao text, obrigacao_id uuid, liquidacao_id uuid, lancamento_pai_id uuid, created_at timestamptz default now());
 create table fin_lancamento_anexos (id uuid primary key default gen_random_uuid(), lancamento_id uuid references fin_lancamentos(id) on delete cascade);
 create table fin_extrato_vinculos (
  id uuid primary key default gen_random_uuid(), conta_id uuid not null references fin_contas(id), fitid text not null, origem text not null check (origem in ('ofx','pdf')),
  lancamento_id uuid references fin_lancamentos(id) on delete set null, obrigacao_id uuid, vinculado_em timestamptz not null default now(), vinculado_por uuid,
  desfeito_em timestamptz, desfeito_por uuid, desfeito_motivo text, nota text, check ((desfeito_em is null) = (desfeito_motivo is null)));
 create unique index fin_extrato_vinculos_ativo_idx on fin_extrato_vinculos (conta_id, fitid) where desfeito_em is null;
`);
const d4 = fs.readFileSync(raiz + 'supabase/migrations/20261013120000_fin_extrato_vinculos_e_conferencia.sql', 'utf8');
await c.query(d4.slice(d4.indexOf('CREATE OR REPLACE FUNCTION public.fin_marcas_do_extrato'), d4.indexOf('-- ── 5)')));
await c.query(`insert into fin_contas values ($1,'Bradesco')`, [CONTA]);

const pares = fs.readFileSync(base + 'pares33.txt', 'utf8').trim().split('\n').map(l => l.split('|'));
const ontem = '2026-10-10T12:00:00-03', hoje = '2026-10-20T19:30:00-03';
async function semear() {
  await c.query('delete from fin_lancamento_anexos'); await c.query('delete from fin_extrato_vinculos'); await c.query('delete from fin_lancamentos');
  for (const [h, a, dia, tipo, valor, fh, fa] of pares) {
    await c.query(`insert into fin_lancamentos (id,conta_id,tipo,status,data,valor,origem,observacoes,created_at) values ($1,$2,$3,'conciliado',$4,$5,'recorrencia',$6,$7)`, [a, CONTA, tipo, dia, valor, `[ofx:${fa}]`, ontem]);
    await c.query(`insert into fin_lancamentos (id,conta_id,tipo,status,data,valor,origem,observacoes,created_at) values ($1,$2,$3,'conciliado',$4,$5,'importado_ofx',$6,$7)`, [h, CONTA, tipo, dia, valor, `[ofx:${fh}] [lote-ofx:x]`, hoje]);
  }
  // o que NÃO pode ser tocado: um movimento qualquer de 01/10 que não está na lista, e um duplicado da lista de REVISÃO
  await c.query(`insert into fin_lancamentos (id,conta_id,tipo,status,data,valor,origem,observacoes,created_at) values (gen_random_uuid(),$1,'entrada','conciliado','2026-10-03',77,'importado_ofx','[ofx:N99999]',$2)`, [CONTA, hoje]);
}
const ent = fs.readFileSync(raiz + 'docs/CORRECAO_DUPLICADOS_OFX_ENSAIO.sql', 'utf8');
const apl = fs.readFileSync(raiz + 'docs/CORRECAO_DUPLICADOS_OFX_APLICAR.sql', 'utf8');
const total = async () => +(await q(`select count(*)::int n from fin_lancamentos`))[0].n;
const rodar = async (sql) => { try { const r = await c.query(sql); return { ok: true, r }; } catch (e) { try { await c.query('rollback'); } catch {} return { ok: false, e }; } };
const ultimo = (r) => { const arr = Array.isArray(r) ? r : [r]; return arr.filter(x => x.command === 'SELECT').pop()?.rows?.[0]; };

console.log('\n1) ENSAIO: roda tudo, mostra a conferência final e DESFAZ');
await semear();
let r = await rodar(ent);
confere('executou sem erro', r.ok, r.e?.message);
const fim = r.ok ? ultimo(r.r) : null;
confere('conferência final: 33 apagados · 33 antigos preservados · 33 chaves com um só · variação 2081.75', !!fim && +fim.apagados === 33 && +fim.antigos_preservados === 33 && +fim.chaves_com_um_so === 33 && Math.abs(+fim.variacao_do_saldo - 2081.75) < 0.005, JSON.stringify(fim));
confere('ROLLBACK: nada ficou (67 lançamentos, como antes)', (await total()) === 67);

console.log('\n2) APLICAR: apaga só os 33 de hoje');
await semear();
r = await rodar(apl);
confere('executou sem erro', r.ok, r.e?.message);
confere('sobraram 34 (os 33 antigos + o movimento fora da lista)', (await total()) === 34);
confere('todos os 33 antigos continuam', +(await q(`select count(*)::int n from fin_lancamentos where id = any($1::uuid[])`, [pares.map(p => p[1])]))[0].n === 33);
confere('o movimento fora da lista continua', +(await q(`select count(*)::int n from fin_lancamentos where observacoes like '%N99999%'`))[0].n === 1);
const vinc = await q(`select count(*)::int n from fin_extrato_vinculos where desfeito_em is not null and desfeito_motivo like 'A despesa foi excluída%'`);
confere('o vínculo de cada apagado foi FECHADO (fica na história), não apagado', +vinc[0].n === 33, String(vinc[0].n));
confere('os vínculos dos antigos seguem ativos', +(await q(`select count(*)::int n from fin_extrato_vinculos where desfeito_em is null and fitid like 'N11%'`))[0].n === 33);

console.log('\n3) Trava: um anexo no lançamento de HOJE aborta tudo, sem apagar nada');
await semear();
await c.query(`insert into fin_lancamento_anexos (lancamento_id) values ($1)`, [pares[5][0]]);
r = await rodar(apl);
confere('abortou com a mensagem certa', !r.ok && /Nada foi alterado/.test(r.e.message) && /tem anexo/.test(r.e.message), r.e?.message?.slice(0, 120));
confere('nada foi apagado', (await total()) === 67);

console.log('\n4) Trava: o ANTIGO sumiu (alguém já limpou) → aborta');
await semear();
await c.query(`delete from fin_lancamentos where id = $1`, [pares[0][1]]);
r = await rodar(apl);
confere('abortou', !r.ok && /Nada foi alterado/.test(r.e.message), r.e?.message?.slice(0, 120));
confere('nada além do que já tinha sumido', (await total()) === 66);

console.log('\n5) Trava: um terceiro lançamento igual na mesma chave (o sistema teria 3, não 2) → aborta');
await semear();
await c.query(`insert into fin_lancamentos (id,conta_id,tipo,status,data,valor,origem,observacoes,created_at) values (gen_random_uuid(),$1,$2,'realizado',$3,$4,'manual',null,$5)`, [CONTA, pares[2][3], pares[2][2], pares[2][4], ontem]);
r = await rodar(apl);
confere('abortou citando a chave', !r.ok && /esperado 2/.test(r.e.message), r.e?.message?.slice(0, 160));
confere('nada foi apagado', (await total()) === 68);

console.log('\n6) Trava: o lançamento de hoje foi liquidado/ligado a outro (tem filho) → aborta');
await semear();
await c.query(`insert into fin_lancamentos (id,conta_id,tipo,status,data,valor,origem,observacoes,lancamento_pai_id,created_at) values (gen_random_uuid(),$1,'saida','realizado','2026-10-05',1,'manual',null,$2,$3)`, [CONTA, pares[10][0], hoje]);
r = await rodar(apl);
confere('abortou', !r.ok && /filho/.test(r.e.message), r.e?.message?.slice(0, 120));

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
