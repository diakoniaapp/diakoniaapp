// Reprodução da corrida de saldo_atual (docs/PARECER_SALDO_CONCORRENCIA.md). NÃO faz parte do app: roda num Postgres real e descartável.
// Uso: numa pasta vazia, 'npm i embedded-postgres pg' e 'node corrida_saldo.mjs' (ajuste a constante 'dir'). Não toca em nenhum banco da igreja.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';

const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgreal/data';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5444, persistent: false });
await server.initialise();
await server.start();
await server.createDatabase('t');
const cli = async () => { const c = new pg.Client({ host: 'localhost', port: 5444, user: 'postgres', password: 'x', database: 't' }); await c.connect(); return c; };

const funcaoAtual = `
create or replace function public.fin_recalc_saldo_conta(p_conta_id uuid) returns void language plpgsql as $$
begin
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l where l.conta_id = c.id and l.status in ('realizado','conciliado')), 0)
   where c.id = p_conta_id;
end;$$;`;
const funcaoCorrigida = `
create or replace function public.fin_recalc_saldo_conta(p_conta_id uuid) returns void language plpgsql as $$
begin
  perform 1 from public.fin_contas where id = p_conta_id for no key update;   -- espera a outra transação terminar; o UPDATE abaixo ganha um retrato novo
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l where l.conta_id = c.id and l.status in ('realizado','conciliado')), 0)
   where c.id = p_conta_id;
end;$$;`;

const adm = await cli();
await adm.query(`
 create table fin_contas (id uuid primary key default gen_random_uuid(), nome text, saldo_inicial numeric default 0, saldo_atual numeric default 0);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), conta_id uuid references fin_contas(id), tipo text, valor numeric, status text);
 create function public.fin_atualiza_saldo() returns trigger language plpgsql as $$
 begin
  if tg_op = 'INSERT' then if new.status in ('realizado','conciliado') then perform public.fin_recalc_saldo_conta(new.conta_id); end if;
  elsif tg_op = 'UPDATE' then if old.status in ('realizado','conciliado') or new.status in ('realizado','conciliado') then perform public.fin_recalc_saldo_conta(new.conta_id); end if;
  else if old.status in ('realizado','conciliado') then perform public.fin_recalc_saldo_conta(old.conta_id); end if; end if; return null; end;$$;
 create trigger fin_lanc_saldo after insert or update or delete on fin_lancamentos for each row execute function fin_atualiza_saldo();
`);

async function cenario(rotulo, funcao, tentativas = 1) {
  await adm.query(funcao);
  let erradas = 0;
  for (let i = 0; i < tentativas; i++) {
    const { rows: [{ id }] } = await adm.query(`insert into fin_contas (nome, saldo_inicial) values ('c', 1) returning id`);
    const A = await cli(), B = await cli();
    await A.query('begin'); await B.query('begin');
    await A.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',100,'realizado')`, [id]);   // A grava (e recalcula) — segura a linha da conta
    const pB = B.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',50,'realizado')`, [id]);   // B grava ao mesmo tempo: o gatilho dele espera por A
    await new Promise(r => setTimeout(r, 300));
    await A.query('commit');
    await pB; await B.query('commit');
    const { rows: [r] } = await adm.query(`select saldo_atual::numeric as guardado, saldo_inicial + (select coalesce(sum(valor),0) from fin_lancamentos where conta_id = fin_contas.id) as devido from fin_contas where id = $1`, [id]);
    if (Number(r.guardado) !== Number(r.devido)) erradas++;
    if (i === 0) console.log(`${rotulo}: lançamentos A(100) e B(50) gravados e confirmados → saldo_atual guardado = ${r.guardado}, devido = ${r.devido}  ${Number(r.guardado) === Number(r.devido) ? 'OK' : '<<< DIVERGE'}`);
    await A.end(); await B.end();
  }
  console.log(`${rotulo}: ${erradas} de ${tentativas} tentativas divergiram`);
}

await cenario('FUNÇÃO ATUAL     ', funcaoAtual, 5);
await cenario('FUNÇÃO CORRIGIDA ', funcaoCorrigida, 5);

// e o autocura: o próximo lançamento da conta recalcula tudo
await adm.query(funcaoAtual);
const { rows: [{ id: c2 }] } = await adm.query(`insert into fin_contas (nome, saldo_inicial) values ('d', 1) returning id`);
const A = await cli(), B = await cli(); await A.query('begin'); await B.query('begin');
await A.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',100,'realizado')`, [c2]);
const pB = B.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',50,'realizado')`, [c2]);
await new Promise(r => setTimeout(r, 300)); await A.query('commit'); await pB; await B.query('commit');
const q = async () => (await adm.query(`select saldo_atual::numeric s from fin_contas where id=$1`, [c2])).rows[0].s;
console.log('após a corrida (função atual): saldo_atual =', await q(), '(devido 151)');
await adm.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',10,'realizado')`, [c2]);
console.log('após o PRÓXIMO lançamento de 10 na conta: saldo_atual =', await q(), '(devido 161) → autocura');
await A.end(); await B.end();
// estresse: 8 conexões gravando ao mesmo tempo na MESMA conta (cada gravação confirma sozinha, como o PostgREST faz)
async function estresse(rotulo, funcao) {
  await adm.query(funcao);
  const { rows: [{ id }] } = await adm.query(`insert into fin_contas (nome, saldo_inicial) values ('e', 1) returning id`);
  const cs = await Promise.all(Array.from({ length: 8 }, cli));
  let erros = 0;
  await Promise.all(cs.map(async c => { for (let i = 0; i < 25; i++) { try { await c.query(`insert into fin_lancamentos (conta_id,tipo,valor,status) values ($1,'entrada',1,'realizado')`, [id]); } catch (e) { erros++; } } }));
  const { rows: [r] } = await adm.query(`select saldo_atual::numeric g, saldo_inicial + (select coalesce(sum(valor),0) from fin_lancamentos where conta_id = fin_contas.id) d from fin_contas where id = $1`, [id]);
  console.log(rotulo, '→ 200 gravações simultâneas: guardado', r.g, 'devido', r.d, Number(r.g) === Number(r.d) ? 'OK' : '<<< DIVERGE', '| erros/deadlocks:', erros);
  await Promise.all(cs.map(c => c.end()));
}
await estresse('FUNÇÃO ATUAL    ', funcaoAtual);
await estresse('FUNÇÃO CORRIGIDA', funcaoCorrigida);
await adm.end(); await server.stop();
