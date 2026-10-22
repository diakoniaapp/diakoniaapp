// Ensaio (Postgres embutido) da migration 20261022200000_resumo_semanal_configuravel.sql e do ROLLBACK — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Monta um esquema MÍNIMO com as tabelas que as funções leem, semeia casos de borda e prova: o digest conserva as chaves antigas e acrescenta os números novos com as definições do painel
// (atrasada ≠ automática; aguardando × possível falha; semana até o sábado; transferência e pagas ficam de fora); salvar a configuração é tudo-ou-nada e só para admin/diakonia; os destinatários
// respeitam perfil desligado e e-mail faltando; o rollback devolve o digest antigo.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data9';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5479, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5479, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
const q = async (sql, p) => (await c.query(sql, p)).rows;
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const ADMIN = '00000000-0000-0000-0000-0000000000a1', COMUM = '00000000-0000-0000-0000-0000000000b2';
const P_TES = '00000000-0000-0000-0000-0000000000c3', P_PAS = '00000000-0000-0000-0000-0000000000c4', P_SEC = '00000000-0000-0000-0000-0000000000c5', P_DIA = '00000000-0000-0000-0000-0000000000c6';
const comoUsuario = async (uid) => { await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); };

await c.query(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create type app_role as enum ('admin','diakonia','pastor','secretaria','tesouraria','outro');
 create table user_roles (user_id uuid, role app_role);
 create table profiles (id uuid primary key, pessoa_id uuid, nome text);
 create table membros (id uuid primary key default gen_random_uuid(), nome_completo text, email text, tipo_pessoa text, status text default 'ativo', ultimo_contato_em timestamptz, data_nascimento date, telefone_celular text, telefone_dispensado boolean);
 create table solicitacoes_membresia (status text);
 create table gov_reunioes (status text, ata_url text);
 create table gov_pautas (status text);
 create table arr_caixas (estado text, arquivado_em timestamptz);
 create table fin_fornecedores (id uuid primary key default gen_random_uuid(), nome text);
 create table fin_contas (id uuid primary key default gen_random_uuid(), nome text, saldo_atual numeric, ativo boolean, ordem int);
 create table fin_lancamentos (id uuid primary key default gen_random_uuid(), tipo text, status text, data date, valor numeric, fornecedor_id uuid, pessoa_id uuid, descricao text, origem text, forma_liquidacao text, obrigacao_id uuid);
 create table vw_fin_quitacao (fila text, saldo_a_reembolsar numeric, valor_obrigacao numeric);
 create function agenda_pastoral_proximos_dias(int) returns table(tipo text, data_evento date) language sql as $$ select 'aniversario'::text, current_date + 1 $$;
 create function fiscal_resumo_dashboard() returns table(total_atrasados int, total_urgentes int, total_proximos int, total_pagos_mes int, proximos jsonb) language sql as $$ select 0, 0, 0, 0, '[]'::jsonb $$;
 create function fin_alertas_centros() returns table(tipo_alerta text) language sql as $$ select 'sem_movimento'::text $$;
 create function has_role(u uuid, r app_role) returns boolean language sql stable security definer as $$ select exists (select 1 from user_roles where user_id = u and role = r) $$;

 insert into user_roles values ('${ADMIN}', 'admin'), ('${ADMIN}', 'diakonia'), ('${COMUM}', 'outro'), ('${P_TES}', 'tesouraria'), ('${P_PAS}', 'pastor'), ('${P_SEC}', 'secretaria'), ('${P_DIA}', 'diakonia');
 insert into membros (id, nome_completo, email) values
   ('${ADMIN}', 'Telma Admin', 'telma@x.org'), ('${P_TES}', 'Bruno Tesoureiro', 'bruno@x.org'), ('${P_PAS}', 'Lucio Pastor', 'lucio@x.org'), ('${P_SEC}', 'Lourdes Secretaria', null), ('${P_DIA}', 'Dia Sem Email', '');
 insert into profiles (id, pessoa_id, nome) values ('${ADMIN}', '${ADMIN}', 'Telma'), ('${P_TES}', '${P_TES}', 'Bruno'), ('${P_PAS}', '${P_PAS}', 'Lucio'), ('${P_SEC}', '${P_SEC}', 'Lourdes'), ('${P_DIA}', '${P_DIA}', 'Dia');
 insert into fin_fornecedores (id, nome) values ('f0000000-0000-0000-0000-000000000001', 'Light'), ('f0000000-0000-0000-0000-000000000002', 'Cedae');
 insert into fin_contas (nome, saldo_atual, ativo, ordem) values ('Bradesco', 1000.50, true, 1), ('Caixinha', -200.25, true, 2), ('Antiga', 999, false, 3);
 -- obrigações (hoje = current_date)
 insert into fin_lancamentos (tipo, status, data, valor, fornecedor_id, origem, forma_liquidacao) values
   ('saida', 'previsto', current_date - 5, 100, 'f0000000-0000-0000-0000-000000000001', 'manual', 'manual'),            -- atrasada manual
   ('saida', 'previsto', current_date - 2, 40,  'f0000000-0000-0000-0000-000000000002', 'manual', 'boleto_fatura'),     -- atrasada manual
   ('saida', 'previsto', current_date - 5, 300, 'f0000000-0000-0000-0000-000000000001', 'manual', 'debito_automatico'), -- automática: possível falha (passou de 3 dias)
   ('saida', 'previsto', current_date - 1, 70,  'f0000000-0000-0000-0000-000000000002', 'manual', 'pix_recorrente'),    -- automática: aguardando o banco
   ('saida', 'previsto', current_date,     50,  'f0000000-0000-0000-0000-000000000001', 'manual', 'manual'),            -- vence hoje (entra na semana)
   ('saida', 'previsto', current_date,     60,  'f0000000-0000-0000-0000-000000000002', 'manual', 'transferencia_programada'), -- automática de hoje: previstos
   ('saida', 'previsto', current_date - 3, 999, 'f0000000-0000-0000-0000-000000000001', 'transferencia', 'manual'),    -- transferência: ignorada
   ('saida', 'realizado', current_date - 9, 888, 'f0000000-0000-0000-0000-000000000001', 'manual', 'manual'),          -- paga: ignorada
   ('entrada', 'previsto', current_date - 9, 777, null, 'manual', 'manual');                                           -- entrada: ignorada
 insert into vw_fin_quitacao values ('reembolso_a_pagar', 1500, 2000), ('reembolso_a_pagar', null, 300), ('formalizar', 50, 50);
`);

await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022200000_resumo_semanal_configuravel.sql', 'utf8'));
confere('a migration aplica', true);

const d = (await q(`select resumo_semanal_digest() d`))[0].d;
confere('chaves antigas conservadas (pastoral, secretaria, tesouraria)', ['aniversarios_semana', 'bodas_semana', 'visitantes_sem_contato', 'candidatos_batismo'].every(k => k in d.pastoral)
  && ['sem_telefone', 'membresia_em_andamento', 'atas_pendentes', 'pautas_rascunho'].every(k => k in d.secretaria)
  && ['fiscal_atrasados', 'fiscal_urgentes', 'caixas_abertos', 'aprovacoes_pendentes', 'centros_criticos'].every(k => k in d.tesouraria));
const t = d.tesouraria;
confere('contas atrasadas: só as manuais vencidas (2 · R$ 140), sem automática, transferência, paga ou entrada', t.contas_atrasadas.n === 2 && Number(t.contas_atrasadas.total) === 140, JSON.stringify(t.contas_atrasadas));
confere('contas atrasadas: a lista vem pela data e traz o favorecido', t.contas_atrasadas.itens[0].quem === 'Light' && t.contas_atrasadas.itens.length === 2);
confere('vencimentos da semana: o que vence hoje e não é automático (1 · R$ 50)', t.vencimentos_semana.n === 1 && Number(t.vencimentos_semana.total) === 50, JSON.stringify(t.vencimentos_semana));
const da = t.debitos_automaticos;
confere('débitos automáticos: 1 previsto até sábado (R$ 60), 1 aguardando, 1 possível falha (R$ 300)', da.previstos_n === 1 && Number(da.previstos_total) === 60 && da.aguardando_n === 1 && da.possivel_falha_n === 1 && Number(da.possivel_falha_total) === 300, JSON.stringify(da));
confere('débitos automáticos: a possível falha aparece na lista', da.itens.length === 1 && da.itens[0].quem === 'Light');
confere('reembolsos a pagar: só a fila certa, pelo saldo (ou pelo valor se não há saldo) = 2 · R$ 1.800', t.reembolsos.n === 2 && Number(t.reembolsos.total) === 1800, JSON.stringify(t.reembolsos));
confere('saldo das contas: só contas ativas, com cada conta (total R$ 800,25)', Number(t.saldo_contas.total) === 800.25 && t.saldo_contas.contas.length === 2 && t.saldo_contas.contas[0].nome === 'Bradesco', JSON.stringify(t.saldo_contas));

// segurança do digest e das funções internas
await c.query(`set role authenticated`);
let negou = false; try { await q(`select resumo_semanal_digest()`); } catch { negou = true; }
confere('o digest continua só para service_role', negou);
negou = false; try { await q(`select * from resumo_semanal_destinatarios_v2()`); } catch { negou = true; }
confere('os destinatários continuam só para service_role', negou);
await c.query(`reset role`);

// config: ler (RLS), salvar (guarda), atomicidade
await c.query(`set role authenticated`); await comoUsuario(COMUM);
confere('quem não é admin/diakonia não lê a configuração', (await q(`select * from resumo_semanal_perfis`)).length === 0);
negou = false; try { await q(`select sistema_resumo_semanal_salvar_config('[]')`); } catch (e) { negou = /Sem permissão/.test(e.message); }
confere('quem não é admin/diakonia não salva', negou);
await comoUsuario(ADMIN);
const cfg = [{ perfil: 'tesouraria', ativo: true, blocos: [{ bloco: 'saldo_contas', ativo: true, ordem: 1 }, { bloco: 'contas_atrasadas', ativo: false, ordem: 2 }] }, { perfil: 'pastoral', ativo: false, blocos: [] }];
await q(`select sistema_resumo_semanal_salvar_config($1::jsonb)`, [JSON.stringify(cfg)]);
await c.query(`reset role`);
confere('admin salva: perfis e blocos gravados', (await q(`select count(*)::int n from resumo_semanal_perfis`))[0].n === 2 && (await q(`select count(*)::int n from resumo_semanal_blocos where perfil='tesouraria'`))[0].n === 2);
await c.query(`set role authenticated`); await comoUsuario(ADMIN);
const lido = await q(`select perfil, bloco, ativo, ordem from resumo_semanal_blocos order by perfil, ordem`);
confere('admin lê o que salvou', lido.length === 2 && lido[0].bloco === 'saldo_contas' && lido[1].ativo === false);
// salvar de novo substitui (não acumula)
await q(`select sistema_resumo_semanal_salvar_config($1::jsonb)`, [JSON.stringify([{ perfil: 'tesouraria', ativo: true, blocos: [{ bloco: 'reembolsos', ativo: true, ordem: 1 }] }])]);
confere('salvar de novo substitui os blocos do perfil', (await q(`select bloco from resumo_semanal_blocos where perfil = 'tesouraria'`)).map(r => r.bloco).join() === 'reembolsos');
// tudo ou nada: um perfil inválido no meio desfaz tudo
let msg = ''; try { await q(`select sistema_resumo_semanal_salvar_config($1::jsonb)`, [JSON.stringify([{ perfil: 'secretaria', ativo: true, blocos: [{ bloco: 'membresias', ativo: true, ordem: 1 }] }, { perfil: 'inventado', ativo: true, blocos: [] }])]); } catch (e) { msg = e.message; }
await c.query(`reset role`);
confere('perfil inválido é recusado em português', /Perfil desconhecido/.test(msg), msg);
confere('e a recusa desfaz tudo (nada de secretaria gravado)', (await q(`select count(*)::int n from resumo_semanal_perfis where perfil = 'secretaria'`))[0].n === 0);
let recusou = false; try { await c.query(`select sistema_resumo_semanal_salvar_config('[{"perfil":"tesouraria","blocos":[{"bloco":"x","ordem":5000}]}]')`); } catch { recusou = true; }
confere('ordem fora da faixa é recusada pelo banco', recusou);

// destinatários
await c.query(`delete from resumo_semanal_perfis`); await c.query(`delete from resumo_semanal_blocos`);
let dest = await q(`select perfil, email from resumo_semanal_destinatarios_v2() order by perfil, email`);
confere('destinatários: administração = admin e diakonia; pastor = pastoral; sem e-mail (ou vazio) não recebe',
  JSON.stringify(dest) === JSON.stringify([{ perfil: 'administracao', email: 'telma@x.org' }, { perfil: 'pastoral', email: 'lucio@x.org' }, { perfil: 'tesouraria', email: 'bruno@x.org' }]), JSON.stringify(dest));
await c.query(`insert into resumo_semanal_perfis (perfil, ativo) values ('pastoral', false)`);
dest = await q(`select perfil from resumo_semanal_destinatarios_v2() order by perfil`);
confere('perfil desligado não recebe', !dest.some(r => r.perfil === 'pastoral'));
await c.query(`set role authenticated`); await comoUsuario(ADMIN);
const pessoas = (await q(`select sistema_resumo_semanal_pessoas() p`))[0].p;
confere('a tela vê TODAS as pessoas, inclusive sem e-mail (para explicar por que não recebem)', pessoas.some(x => x.nome === 'Lourdes Secretaria' && x.email === null) && pessoas.length >= 5, JSON.stringify(pessoas.map(x => [x.perfil, x.email])));
await c.query(`reset role`);

// a função antiga de destinatários não existe neste esquema de ensaio (não é tocada pela migration) — o que importa: a migration não a recria nem a derruba
confere('a migration não toca na função antiga de destinatários', (await q(`select count(*)::int n from pg_proc where proname = 'resumo_semanal_destinatarios'`))[0].n === 0);

// rollback
await c.query(fs.readFileSync(raiz + 'docs/RESUMO_SEMANAL_CONFIGURAVEL_ROLLBACK.sql', 'utf8'));
const antigo = (await q(`select resumo_semanal_digest() d`))[0].d;
confere('rollback: o digest volta a ter só as chaves antigas', !('contas_atrasadas' in antigo.tesouraria) && 'fiscal_atrasados' in antigo.tesouraria);
confere('rollback: tabelas e funções novas saem', (await q(`select count(*)::int n from pg_class where relname in ('resumo_semanal_perfis','resumo_semanal_blocos')`))[0].n === 0
  && (await q(`select count(*)::int n from pg_proc where proname in ('sistema_resumo_semanal_salvar_config','resumo_semanal_destinatarios_v2','resumo_semanal_obrigacoes_abertas')`))[0].n === 0);

await c.end(); await server.stop();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
