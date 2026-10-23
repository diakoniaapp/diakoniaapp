// Ensaio (Postgres embutido) da migration 20261023160000_fin_recalcular_obrigacao.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Esquema mínimo + a `fin_liquidar` REAL (extraída da migration 20261008200000, que é a definição viva) para provar a troca guardada. Prova: só Administração e Tesouraria recalculam; só despesa PREVISTA, sem quitação
// por terceiro; novo valor maior, quebra fechando, motivo e NOVA GUIA anexada a ESTA despesa; `valor_original` gravado uma vez; encargos acumulam; o registro é imutável e segura a despesa; e `fin_liquidar` passa a
// SOMAR aos encargos já gravados, recusa baixa parcial de recalculada e continua igual para quem nunca foi recalculada.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data15';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5486, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5486, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const recusa = async (sql, p) => { try { await c.query(sql, p); return null; } catch (e) { return e.message; } };

const TES = '00000000-0000-0000-0000-0000000000a1', SEC = '00000000-0000-0000-0000-0000000000b2';
await c.query(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
 create type app_role as enum ('admin','tesouraria','diakonia','secretaria','pastor');
 create table papeis (uid uuid, role app_role);
 create function has_any_role(u uuid, r app_role[]) returns boolean language sql stable as $$ select exists (select 1 from papeis p where p.uid = u and p.role = any(r)) $$;
 create function public.fin_nome_do_usuario(u uuid) returns text language sql stable as $$ select 'Fulana da Tesouraria' $$;
 create type fin_forma_pagamento as enum ('pix','boleto');
 create table fin_lancamentos (
   id uuid primary key default gen_random_uuid(), tipo text not null default 'saida', status text not null default 'previsto', conta_id uuid, data date, data_competencia date,
   valor numeric(14,2) not null, valor_original numeric(14,2), desconto numeric(14,2) not null default 0, juros numeric(14,2) not null default 0, multa numeric(14,2) not null default 0,
   complemento numeric(14,2) not null default 0, ajuste numeric(14,2) not null default 0, motivo_diferenca text, descricao text, categoria_id uuid, centro_custo_id uuid, projeto_id uuid,
   fornecedor_id uuid, pessoa_id uuid, forma_pagamento fin_forma_pagamento, documento_numero text, observacoes text, origem text, campanha_missionaria text, valor_variavel boolean,
   obrigacao_id uuid, componente text, liquidacao_id uuid, data_pagamento date, comprovante_url text, motivo_edicao text);
 create table fin_lancamento_anexos (id uuid primary key default gen_random_uuid(), lancamento_id uuid not null references fin_lancamentos(id));
 create table fin_liquidacoes (id uuid primary key default gen_random_uuid(), conta_id uuid, data_pagamento date, forma_pagamento fin_forma_pagamento, valor_total numeric, comprovante_url text, ofx_fitid text, observacoes text);
 create table vw_fin_quitacao (obrigacao_id uuid);
 insert into papeis values ('${TES}', 'tesouraria'), ('${SEC}', 'secretaria');
`);
// a fin_liquidar VIVA: a da migration 20261008200000 (a de 20261016120000 só trocou fin_sem_marcas_do_extrato, que a troca desta migration não toca)
const src = fs.readFileSync(raiz + 'supabase/migrations/20261008200000_fin_encargos_como_atributos_da_obrigacao.sql', 'utf8').split('\r\n').join('\n');
const ini = src.indexOf('CREATE OR REPLACE FUNCTION public.fin_liquidar(');
const fim = src.indexOf('\n$fn$;', ini) + '\n$fn$;'.length;
await c.query(src.slice(ini, fim));
const MIG = fs.readFileSync(raiz + 'supabase/migrations/20261023160000_fin_recalcular_obrigacao.sql', 'utf8');

const comoUsuario = async (uid, fn) => { await c.query(`select set_config('app.uid', $1, false)`, [uid]); try { return await fn(); } finally { await c.query(`select set_config('app.uid', '', false)`); } };
const despesa = async (valor, extra = {}) => (await q(`insert into fin_lancamentos (valor, data, descricao, status, tipo) values ($1, current_date - 12, 'FGTS Setembro/2026', $2, 'saida') returning id`, [valor, extra.status ?? 'previsto']))[0].id;
const anexo = async (lid) => (await q(`insert into fin_lancamento_anexos (lancamento_id) values ($1) returning id`, [lid]))[0].id;
const lanc = async (id) => (await q(`select * from fin_lancamentos where id = $1`, [id]))[0];
const recalcula = (id, novo, j, m, cc, motivo, ax) => q(`select fin_recalcular_obrigacao($1,$2,$3,$4,$5,$6,$7) r`, [id, novo, j, m, cc, motivo, ax]);

// ── uma despesa que JÁ EXISTIA antes da migration: nada muda nela ──
const antiga = await despesa(500);
await c.query(MIG);
const a0 = await lanc(antiga);
confere('a migration aplica e nada existente muda: valor, original e encargos intactos; recalculada_em nula', Number(a0.valor) === 500 && a0.valor_original === null && Number(a0.juros) === 0 && a0.recalculada_em === null);
confere('rodar a migration de novo é inofensivo (a troca de fin_liquidar não se repete)', await (async () => { await c.query(MIG); const def = (await q(`select pg_get_functiondef(to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)')) d`))[0].d; return def.split('l.juros + v_juros').length === 2 && def.split('l.recalculada_em IS NOT NULL').length === 2; })());

// ── quem pode ──
const fgts = await despesa(1000);
const nova = await anexo(fgts);
confere('quem não é Administração/Tesouraria é recusado (secretaria)', /Só a Administração e a Tesouraria/.test(await comoUsuario(SEC, () => recusa(`select fin_recalcular_obrigacao($1,1037.5,10,20,7.5,'Encargos por atraso',$2)`, [fgts, nova])) ?? ''));
confere('sem login também', /Só a Administração e a Tesouraria/.test(await recusa(`select fin_recalcular_obrigacao($1,1037.5,10,20,7.5,'Encargos por atraso',$2)`, [fgts, nova]) ?? ''));
await c.query('set role anon');
confere('anon nem executa a função', /permission denied/.test(await recusa(`select fin_recalcular_obrigacao($1,1037.5,10,20,7.5,'Encargos por atraso',$2)`, [fgts, nova]) ?? ''));
await c.query('reset role');

// ── as recusas ──
const R = (novo, j, m, cc, motivo, ax = nova, id = fgts) => comoUsuario(TES, () => recusa(`select fin_recalcular_obrigacao($1,$2,$3,$4,$5,$6,$7)`, [id, novo, j, m, cc, motivo, ax]));
confere('novo valor menor ou igual ao atual: recusa', /precisa ser maior/.test(await R(1000, 0, 0, 0, 'Encargos por atraso') ?? ''));
confere('quebra que não fecha com a diferença: recusa', /precisam fechar com a diferença/.test(await R(1037.5, 10, 20, 0, 'Encargos por atraso') ?? ''));
confere('encargo negativo: recusa', /negativos/.test(await R(1037.5, -5, 42.5, 0, 'Encargos por atraso') ?? ''));
confere('motivo curto: recusa', /motivo do recálculo/.test(await R(1037.5, 10, 20, 7.5, 'ok') ?? ''));
confere('sem a nova guia anexada: recusa', /Anexe a nova guia/.test(await R(1037.5, 10, 20, 7.5, 'Encargos por atraso', null) ?? ''));
confere('guia anexada a OUTRA despesa não vale', /Anexe a nova guia/.test(await R(1037.5, 10, 20, 7.5, 'Encargos por atraso', await anexo(await despesa(10))) ?? ''));
const paga = await despesa(300, { status: 'realizado' });
confere('despesa já paga não se recalcula', /em aberto/.test(await R(350, 50, 0, 0, 'Encargos por atraso', await anexo(paga), paga) ?? ''));
const comTerceiro = await despesa(200);
await c.query(`insert into vw_fin_quitacao values ($1)`, [comTerceiro]);
confere('despesa com quitação por terceiro não se recalcula', /quitação por terceiro/.test(await R(250, 50, 0, 0, 'Encargos por atraso', await anexo(comTerceiro), comTerceiro) ?? ''));
const intacta = await lanc(fgts);
confere('nenhuma recusa gravou nada', Number(intacta.valor) === 1000 && intacta.recalculada_em === null && (await q(`select count(*)::int n from fin_obrigacao_recalculos`))[0].n === 0);

// ── o recálculo ──
const idLog = (await comoUsuario(TES, () => recalcula(fgts, 1037.5, 10, 20, 7.5, 'Encargos por atraso — guia reemitida', nova)))[0].r;
const f1 = await lanc(fgts);
confere('o valor passa a 1.037,50 e o ORIGINAL (1.000,00) fica guardado', Number(f1.valor) === 1037.5 && Number(f1.valor_original) === 1000);
confere('multa 20 · juros 10 + correção 7,5 somados em "juros" (17,5)', Number(f1.multa) === 20 && Number(f1.juros) === 17.5);
confere('motivo, marca de recalculada e canal da trilha preenchidos', f1.motivo_diferenca === 'Encargos por atraso — guia reemitida' && !!f1.recalculada_em && f1.motivo_edicao === 'Encargos por atraso — guia reemitida');
const log = (await q(`select * from fin_obrigacao_recalculos where id = $1`, [idLog]))[0];
confere('o registro guarda antes, depois, a quebra em TRÊS, a guia nova, quem e o nome', Number(log.valor_antes) === 1000 && Number(log.valor_depois) === 1037.5 && Number(log.juros) === 10 && Number(log.multa) === 20 && Number(log.correcao) === 7.5 && log.anexo_id === nova && log.por === TES && log.por_nome === 'Fulana da Tesouraria');
confere('o registro é imutável: não altera', /não se altera nem se apaga/.test(await recusa(`update fin_obrigacao_recalculos set motivo = 'outro motivo' where id = $1`, [idLog]) ?? ''));
confere('o registro é imutável: não apaga', /não se altera nem se apaga/.test(await recusa(`delete from fin_obrigacao_recalculos where id = $1`, [idLog]) ?? ''));
confere('a despesa recalculada não pode ser excluída (o registro a segura)', /foreign key|viola/i.test(await recusa(`delete from fin_lancamentos where id = $1`, [fgts]) ?? ''));

// ── um segundo recálculo acumula e mantém o original da primeira ──
const nova2 = await anexo(fgts);
await comoUsuario(TES, () => recalcula(fgts, 1050, 12.5, 0, 0, 'Segunda guia: mais 12,50 de juros', nova2));
const f2 = await lanc(fgts);
confere('segundo recálculo: valor 1.050, original continua 1.000, juros 30, multa 20', Number(f2.valor) === 1050 && Number(f2.valor_original) === 1000 && Number(f2.juros) === 30 && Number(f2.multa) === 20);
confere('o motivo acumula, sem apagar o primeiro', /guia reemitida.*Segunda guia/.test(f2.motivo_diferenca));
confere('dois registros no histórico', (await q(`select count(*)::int n from fin_obrigacao_recalculos where obrigacao_id = $1`, [fgts]))[0].n === 2);

// ── PAGAR depois do recálculo ──
const pagar = (id, valorPago, total, encargos = []) => q(`select fin_liquidar($1::uuid, current_date, 'pix', $2::numeric, $3::jsonb, $4::jsonb, null, null, null) liq`,
  ['00000000-0000-0000-0000-00000000c001', total, JSON.stringify([{ lancamento_id: id, valor_pago: valorPago }]), JSON.stringify(encargos)]);
await comoUsuario(TES, () => pagar(fgts, 1050, 1050));
const p = await lanc(fgts);
confere('pago: valor 1.050, status realizado, original 1.000 e os encargos JÁ gravados continuam (juros 30 · multa 20)', Number(p.valor) === 1050 && p.status === 'realizado' && Number(p.valor_original) === 1000 && Number(p.juros) === 30 && Number(p.multa) === 20);

// novo atraso NO pagamento: o encargo do pagamento SOMA ao registrado
const segunda = await despesa(1000), ax3 = await anexo(segunda);
await comoUsuario(TES, () => recalcula(segunda, 1037.5, 0, 37.5, 0, 'Multa por atraso na guia', ax3));
await comoUsuario(TES, () => pagar(segunda, 1037.5, 1042.5, [{ tipo: 'juros', valor: 5, lancamento_id: segunda }]));
const s = await lanc(segunda);
confere('juros do pagamento (5) somam à multa registrada: valor 1.042,50 · multa 37,50 · juros 5', Number(s.valor) === 1042.5 && Number(s.multa) === 37.5 && Number(s.juros) === 5 && Number(s.valor_original) === 1000);

// baixa parcial de recalculada: recusa
const terceira = await despesa(1000), ax4 = await anexo(terceira);
await comoUsuario(TES, () => recalcula(terceira, 1037.5, 0, 37.5, 0, 'Multa por atraso na guia', ax4));
const e = await comoUsuario(TES, () => recusa(`select fin_liquidar($1::uuid, current_date, 'pix', 500::numeric, $2::jsonb, '[]'::jsonb, null, null, null)`, ['00000000-0000-0000-0000-00000000c001', JSON.stringify([{ lancamento_id: terceira, valor_pago: 500 }])]));
confere('baixa parcial de uma obrigação recalculada é recusada, e nada é gravado', /valor integral da guia/.test(e ?? '') && (await lanc(terceira)).status === 'previsto' && (await q(`select count(*)::int n from fin_lancamentos where obrigacao_id = $1`, [terceira]))[0].n === 0);

// quem NUNCA foi recalculada paga exatamente como antes (inclusive a baixa parcial)
await comoUsuario(TES, () => pagar(antiga, 400, 440, [{ tipo: 'juros', valor: 40, lancamento_id: antiga }]));
const an = await lanc(antiga);
confere('despesa comum com encargo no pagamento: igual a antes (valor 440, juros 40, original 500, saldo de 100 segue previsto)', Number(an.valor) === 440 && Number(an.juros) === 40 && Number(an.valor_original) === 500 && (await q(`select count(*)::int n from fin_lancamentos where obrigacao_id = $1 and status = 'previsto'`, [antiga]))[0].n === 1);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
