// Ensaio (Postgres embutido) da migration 20261029100000_fin_reembolso_especie_declaracao_depois.sql
// 1) a função NOVA fin_quitacao_avaliar é igual à ANTIGA em tudo, exceto no caso decidido (reembolso, prova do terceiro Formal, sem declaração, ainda não paga) e no TEXTO do motivo do reembolso já pago;
// 2) as funções fin_quitacao_entrada e fin_liquidar_reembolso criam sem erro de sintaxe;
// 3) fin_liquidar_reembolso: com tabelas mínimas, recusa PIX sem declaração e deixa passar espécie.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgb/data1';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5488, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5488, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };

const mig = fs.readFileSync(raiz + 'supabase/migrations/20261029100000_fin_reembolso_especie_declaracao_depois.sql', 'utf8').replace(/\r\n/g, '\n');
const antiga = fs.readFileSync(raiz + 'supabase/migrations/20261016160000_fin_quitacao_oferta_formalizada.sql', 'utf8').replace(/\r\n/g, '\n');
const pega = (s, ini, fim) => { const i = s.indexOf(ini); return s.slice(i, s.indexOf(fim, i) + fim.length); };

await c.query(`create role anon; create role authenticated; create schema velho;
  create function public.fin_nfe_chave_valida(t text) returns boolean language sql as $f$ select true $f$;`);
// a antiga, num schema próprio
const velha = pega(antiga, 'CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb)', '$fn$;').replace('public.fin_quitacao_avaliar', 'velho.fin_quitacao_avaliar');
await c.query(velha);
// a nova (a da migration)
await c.query(pega(mig, 'CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb)', '$fn$;'));
confere('a função nova cria', true);

// ── 1) equivalência antiga × nova ──
const graus = ['nenhum', 'relatado', 'formal'];
const intencoes = ['reembolso', 'oferta', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica'];
const resps = ['pessoa', 'empresa', 'entidade', 'igreja', 'nao_localizado', 'ninguem_ainda'];
let total = 0, iguais = 0, difs = [];
const R = (a) => a[Math.floor(Math.random() * a.length)];
const base = (o) => ({ valor: 60, natureza_item: 'consumo', tem_nota_anexada: true, comprador_cnpj_igreja: true, chave_informada: false, chave_valida: false, chave_confere_com_emitente: false,
  terceiro_no_circuito: false, terceiro_ministro: false, empresa_com_pagamentos_12m: false, intencao_alterada_recentemente: false, pede_recibo_fiscal: false, oferta_com_condicao: false,
  dias_entre_pagamento_e_declaracao: 0, acumulado_ano_do_terceiro: 60, qtd_relatadas_no_trimestre: 1, periodo_aprovado: false, formalizacao_vencida: false, aprovado_pelo_administrador: false,
  teto_1: 500, prazo_declaracao_dias: 30, teto_anual_terceiro: 2000, qtd_relatadas_trimestre: 3, limite_capitalizacao: 1000, ...o });
for (let i = 0; i < 6000; i++) {
  const p = base({
    responsavel: R(resps), intencao: R(intencoes), grau_responsavel: R(graus), grau_intencao: R(graus), valor: R([40, 300, 767.1, 1500, 5000]),
    natureza_item: R([null, 'consumo', 'duravel']), tem_nota_anexada: R([true, false]), comprador_cnpj_igreja: R([true, false]), chave_informada: R([true, false]),
    chave_valida: R([true, false]), chave_confere_com_emitente: R([true, false]), terceiro_no_circuito: R([true, false]), pede_recibo_fiscal: R([true, false]),
    aprovado_pelo_administrador: R([true, false]), acumulado_ano_do_terceiro: R([60, 3000]), formalizacao_vencida: R([true, false]), dias_entre_pagamento_e_declaracao: R([0, 45]),
  });
  const paga = R([true, false]);
  const a = (await c.query('select velho.fin_quitacao_avaliar($1::jsonb) r', [JSON.stringify(p)])).rows[0].r;
  const b = (await c.query('select public.fin_quitacao_avaliar($1::jsonb) r', [JSON.stringify({ ...p, paga })])).rows[0].r;
  total++;
  const igual = JSON.stringify(a) === JSON.stringify(b);
  const decidido = p.intencao === 'reembolso' && p.grau_responsavel === 'formal' && p.grau_intencao === 'relatado'; // a função não ramifica por responsavel; resultado() trata igreja/ninguém/não localizado antes de ler 'suficiente'
  if (igual) iguais++;
  else {
    // só pode diferir no caso decidido: antes de pagar fica suficiente; depois de pago muda só o texto do motivo
    const ok = decidido && (paga ? (a.suficiente === b.suficiente && a.motivo !== b.motivo && /Solicitação e Recibo/.test(b.motivo)) : (b.suficiente === true && a.suficiente === false));
    if (!ok) difs.push({ p, paga, a, b });
  }
}
confere(`antiga × nova: ${total} entradas, ${iguais} idênticas`, difs.length === 0, difs.slice(0, 6).map(d => [d.p.intencao, d.p.responsavel, d.p.grau_responsavel, d.p.grau_intencao, 'paga=' + d.paga, 'antes=' + d.a.suficiente + '/' + d.a.nivel, 'depois=' + d.b.suficiente + '/' + d.b.nivel, JSON.stringify(d.a.motivo).slice(0, 60), JSON.stringify(d.b.motivo).slice(0, 60)].join(' ')).join(" | "));

// ── casos nomeados ──
const nova = async (o) => (await c.query('select public.fin_quitacao_avaliar($1::jsonb) r', [JSON.stringify(base({ responsavel: 'pessoa', intencao: 'reembolso', ...o }))])).rows[0].r;
confere('antes de pagar, prova do terceiro Formal e sem declaração: SUFICIENTE', (await nova({ grau_responsavel: 'formal', grau_intencao: 'relatado', paga: false })).suficiente === true);
let r = await nova({ grau_responsavel: 'formal', grau_intencao: 'relatado', paga: true });
confere('depois de pago, sem declaração: insuficiente, com o motivo da Solicitação e Recibo', r.suficiente === false && /Solicitação e Recibo de Reembolso assinada/.test(r.motivo), r.motivo);
confere('depois de pago, COM declaração: suficiente', (await nova({ grau_responsavel: 'formal', grau_intencao: 'formal', paga: true })).suficiente === true);
confere('sem a prova do pagamento do terceiro: insuficiente mesmo antes de pagar', (await nova({ grau_responsavel: 'relatado', grau_intencao: 'relatado', paga: false })).suficiente === false);
confere('sem informar paga vale como não paga', (await nova({ grau_responsavel: 'formal', grau_intencao: 'relatado' })).suficiente === true);

// ── 2) as outras duas funções criam ──
await c.query(`create type public.fin_forma_pagamento as enum ('pix','dinheiro','transferencia','boleto','outro');
  create type app_role as enum ('admin','diakonia','secretaria','tesouraria');
  create schema auth; create function auth.uid() returns uuid language sql as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
  create function has_any_role(u uuid, r app_role[]) returns boolean language sql as $f$ select true $f$;
  create table fin_contas (id uuid primary key, tipo text);
  create table fin_quitacoes (id uuid primary key, obrigacao_id uuid, intencao text, responsavel_tipo text);
  create table fin_lancamentos (id uuid primary key, tipo text, status text, data date, obrigacao_id uuid);
  create table fin_quitacao_eventos (id uuid default gen_random_uuid(), quitacao_id uuid, obrigacao_id uuid, evento text, para jsonb, motivo text, por uuid);
  create table fin_quitacao_parametros (vigencia date);
  create table fin_extrato_vinculos (id uuid); create table fin_fornecedores (id uuid, cnpj_cpf text); create table fin_lancamento_anexos (lancamento_id uuid, tipo text);`);
// fin_liquidar_reembolso lê vw_fin_quitacao e chama fin_liquidar: stubs para provar só o NOVO guard
await c.query(`create table vw_fin_quitacao (quitacao_id uuid, resultado text, grau_intencao text, saldo_a_reembolsar numeric, motivo_insuficiencia text);
  create function public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) returns uuid language sql as $f$ select gen_random_uuid() $f$;`);
let criou = true; try { await c.query(pega(mig, 'CREATE OR REPLACE FUNCTION public.fin_liquidar_reembolso(', '$fn$;')); } catch (e) { criou = false; console.log(e.message); }
confere('fin_liquidar_reembolso cria sem erro', criou);
const eCriou = await (async () => { try { await c.query(pega(mig, 'CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid)', '$function$;')); return true; } catch (e) { console.log(e.message); return false; } })();
confere('fin_quitacao_entrada cria sem erro', eCriou);

// ── 3) o guard de espécie ──
const Q = '11111111-1111-1111-1111-111111111111', L = '22222222-2222-2222-2222-222222222222', CX = '33333333-3333-3333-3333-333333333333', BC = '44444444-4444-4444-4444-444444444444';
await c.query(`insert into fin_contas values ('${CX}', 'caixa'), ('${BC}', 'banco');
  insert into fin_quitacoes values ('${Q}', '${L}', 'reembolso', 'pessoa');
  insert into fin_lancamentos values ('${L}', 'saida', 'previsto', current_date, null);`);
await c.query('begin');
const paga = async (grau, conta, forma) => {
  await c.query('delete from vw_fin_quitacao'); await c.query(`insert into vw_fin_quitacao values ('${Q}', 'divida_com_terceiro', '${grau}', 767.10, null)`);
  await c.query('savepoint s');
  try { await c.query(`select set_config('test.uid', '${Q}', true)`); await c.query(`select public.fin_liquidar_reembolso('${Q}', '${conta}', current_date, ${forma ? `'${forma}'` : 'null'}::public.fin_forma_pagamento, 767.10)`); await c.query('release savepoint s'); return null; }
  catch (e) { await c.query('rollback to savepoint s'); return e.message; }
};
confere('sem declaração + PIX + conta de banco: RECUSA', /só se paga em espécie/.test(await paga('relatado', BC, 'pix') ?? ''));
confere('sem declaração + transferência: RECUSA', /só se paga em espécie/.test(await paga('relatado', BC, 'transferencia') ?? ''));
confere('sem declaração + forma indefinida em banco: RECUSA', /só se paga em espécie/.test(await paga('relatado', BC, null) ?? ''));
confere('sem declaração + Caixinha: PAGA', (await paga('relatado', CX, null)) === null);
confere('sem declaração + forma Dinheiro (conta de banco): PAGA', (await paga('relatado', BC, 'dinheiro')) === null);
confere('COM declaração + PIX: PAGA (nada muda para quem já assinou antes)', (await paga('formal', BC, 'pix')) === null);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
