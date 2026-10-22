// Ensaio (Postgres embutido) da migration 20261022240000_autocadastro_telefone_opcional.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Esquema mínimo (só o que visitante_autocadastro lê/escreve) + stubs de normalizar_telefone, visitante_primeiro_nome, visitante_ponto_resolver e visitante_culto_agora.
// Prova: ANTES da migration o cadastro sem telefone é recusado; DEPOIS entra com telefone/WhatsApp nulos (as CHECKs de formato aceitam nulo); número inválido vira nulo; o reconhecimento sem número exige
// nome completo + nascimento (só o nome não basta; nascimento diferente = outra pessoa); com número a regra de antes continua (últimos 11 dígitos + primeiro nome; família com primeiro nome diferente = novo);
// o mesmo preenchimento repetido no mesmo dia/culto não vira duas visitas; anon continua executando só esta função.
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
const chama = async (dados) => { try { return { r: (await c.query(`select visitante_autocadastro('', $1::jsonb) as j`, [JSON.stringify({ lgpd_aceito: 'true', ...dados })])).rows[0].j }; } catch (e) { return { erro: e.message }; } };
const n = async (sql, p) => (await c.query(sql, p)).rows[0].n;

await c.query(`
 create role anon; create role authenticated;
 create table membros (id uuid primary key default gen_random_uuid(), nome_completo text not null, tipo_pessoa text, status text, status_acolhimento text, numero_visitas int, origem_cadastro text,
   telefone_celular text, whatsapp_celular text, telefone_e164 text, email text, data_nascimento date, endereco text, como_conheceu text, como_conheceu_descricao text, convidado_nome text,
   lgpd_aceito boolean, data_aceite_lgpd timestamptz, created_at timestamptz default now(),
   constraint membros_telefone_celular_formato check (telefone_celular ~ '^55[0-9]{10,11}$'),
   constraint membros_whatsapp_celular_formato check (whatsapp_celular is null or whatsapp_celular ~ '^55[0-9]{10,11}$'));
 create table visitas (id uuid primary key default gen_random_uuid(), membro_id uuid, data date, origem text, observacoes text);
 create table visitante_pontos (id uuid primary key default gen_random_uuid(), ativo boolean default true);
 create table visitante_sessoes (id uuid primary key default gen_random_uuid(), data date, ativo boolean, culto text, evento_id uuid, created_at timestamptz default now());
 create table visitante_funil (sessao_id uuid primary key, ponto_id uuid, passo_max int, concluiu boolean, duracao_s int, atualizado_em timestamptz default now());
 create table acompanhamentos_visitante (id uuid primary key default gen_random_uuid(), membro_id uuid, status text, proximo_passo text);
 create table visitante_checkins (id uuid primary key default gen_random_uuid(), membro_id uuid, visita_id uuid, ponto_id uuid, data_visita date, culto text, evento_id uuid, novo_cadastro boolean,
   tipo_pessoa_na_hora text, primeira_visita boolean, deseja_contato boolean, canal_contato text, horario_contato text, deseja_informacoes boolean, oracao_familia boolean, oracao_saude boolean,
   oracao_trabalho boolean, oracao_outro text, como_conheceu text, quem_convidou text, whatsapp text, criado_em timestamptz default now());
 -- stubs
 create function normalizar_telefone(t text) returns text language sql immutable as $$
   select case when d ~ '^[0-9]{10,11}$' then '55' || d when d ~ '^55[0-9]{10,11}$' then d else null end from (select regexp_replace(coalesce(t, ''), '\\D', '', 'g') as d) x $$;
 create function visitante_primeiro_nome(n text) returns text language sql immutable as $$ select lower(split_part(btrim(coalesce(n, '')), ' ', 1)) $$;
 create function visitante_ponto_resolver(p text) returns visitante_pontos language sql as $$ select * from visitante_pontos limit 1 $$;
 create function visitante_culto_agora(a timestamp) returns table (culto text, evento_id uuid) language sql as $$ select 'Culto de Teste'::text, null::uuid $$;
 insert into visitante_pontos default values;
`);

// ── ANTES: o defeito
const antes = fs.readFileSync(raiz + 'supabase/migrations/20261008100000_autocadastro_ux_mobile.sql', 'utf8');
const ini = antes.indexOf('CREATE OR REPLACE FUNCTION public.visitante_autocadastro(p_codigo text, p_dados jsonb)');
const fimMarca = 'GRANT EXECUTE ON FUNCTION public.visitante_autocadastro(text, jsonb) TO anon, authenticated;';
await c.query(antes.slice(ini, antes.indexOf(fimMarca, ini) + fimMarca.length));
const a1 = await chama({ nome: 'Maria da Silva' });
confere('ANTES: sem telefone o cadastro é recusado (o defeito)', a1.erro && /Informe um telefone/.test(a1.erro), a1.erro ?? '');

// ── DEPOIS
await c.query(fs.readFileSync(raiz + 'supabase/migrations/20261022240000_autocadastro_telefone_opcional.sql', 'utf8'));
const m = async (nome) => (await c.query(`select * from membros where nome_completo = $1 order by created_at`, [nome])).rows;

const d1 = await chama({ nome: 'Maria da Silva' });
confere('1: sem telefone e sem nascimento → cadastra, visita 1, novo', d1.r?.ok === true && d1.r.novo === true && d1.r.visita === 1, JSON.stringify(d1));
const r1 = (await m('Maria da Silva'))[0];
confere('1: telefone e WhatsApp ficam nulos; visitante ativo, origem qr_code', r1.telefone_celular === null && r1.whatsapp_celular === null && r1.tipo_pessoa === 'visitante' && r1.origem_cadastro === 'qr_code');
confere('1: o check-in nasce com whatsapp nulo', (await n(`select count(*)::int n from visitante_checkins where membro_id = $1 and whatsapp is null`, [r1.id])) === 1);
const d1b = await chama({ nome: 'Maria da Silva' });
confere('2: o mesmo nome sem número e sem nascimento NÃO é reconhecido: vira outro cadastro (custo aceito)', d1b.r?.novo === true && (await m('Maria da Silva')).length === 2);

const d3 = await chama({ nome: 'Pedro Alves', data_nascimento: '1990-05-17' });
confere('3: sem telefone, com nascimento → cadastra', d3.r?.novo === true);
const d3b = await chama({ nome: '  pedro   ALVES ', data_nascimento: '1990-05-17' });
confere('3: mesmo preenchimento (nome com outra caixa/espaços + mesmo nascimento) no mesmo culto → reconhecido, não duplica nem repete a visita', d3b.r?.novo === false && (await m('Pedro Alves')).length === 1 && (await n(`select count(*)::int n from visitas where membro_id = $1`, [(await m('Pedro Alves'))[0].id])) === 1, JSON.stringify(d3b));
const d3c = await chama({ nome: 'Pedro Alves', data_nascimento: '1985-01-01' });
confere('4: mesmo nome com OUTRO nascimento = outra pessoa (cadastro novo)', d3c.r?.novo === true && (await m('Pedro Alves')).length === 2);

// membro com telefone já cadastrado preenche sem telefone: nome + nascimento o reconhecem, sem criar ficha
await c.query(`insert into membros (nome_completo, tipo_pessoa, status, numero_visitas, telefone_celular, data_nascimento) values ('Joana Costa', 'membro', 'ativo', null, '5521988887777', '1980-03-02')`);
const d5 = await chama({ nome: 'Joana Costa', data_nascimento: '1980-03-02' });
confere('5: membro que preenche sem telefone é reconhecido por nome + nascimento (sem ficha nova; fica o check-in)', d5.r?.novo === false && (await m('Joana Costa')).length === 1, JSON.stringify(d5));

// número inválido vira nulo (não trava)
const d6 = await chama({ nome: 'Lucas Prado', telefone: '123' });
confere('6: telefone inválido é descartado (nulo) e o cadastro segue', d6.r?.novo === true && (await m('Lucas Prado'))[0].telefone_celular === null);

// COM número: a regra de antes
const d7 = await chama({ nome: 'Ana Souza', telefone: '(21) 98399-1229' });
confere('7: com telefone cadastra normalizado (55 + número)', d7.r?.novo === true && (await m('Ana Souza'))[0].telefone_celular === '5521983991229');
const d7b = await chama({ nome: 'Ana Souza', telefone: '21983991229' });
confere('7: mesmo telefone + mesmo primeiro nome no mesmo culto → mesmo cadastro, sem visita repetida', d7b.r?.novo === false && (await m('Ana Souza')).length === 1);
const d7c = await chama({ nome: 'Ana Lúcia Souza', telefone: '21983991229' });
confere('7: mesmo telefone, mesmo primeiro nome "Ana" → é a mesma pessoa (regra antiga)', d7c.r?.novo === false);
const d7d = await chama({ nome: 'Bruno Souza', telefone: '21983991229' });
confere('7: telefone da família com OUTRO primeiro nome → visitante novo (regra antiga preservada)', d7d.r?.novo === true);
const d8 = await chama({ nome: 'Rita Gomes', whatsapp: '(21) 97777-6666' });
confere('8: só WhatsApp também vale (um número só vale para os dois)', d8.r?.novo === true && (await m('Rita Gomes'))[0].telefone_celular === '5521977776666');

// pedido de contato sem número: a fila recebe o pedido
const d9 = await chama({ nome: 'Paulo Reis', deseja_contato: 'true', canal_contato: 'whatsapp', horario_contato: 'tarde' });
confere('9: pede contato pastoral sem número → cadastra e abre o acompanhamento pendente', d9.r?.novo === true && (await n(`select count(*)::int n from acompanhamentos_visitante where status = 'pendente'`)) === 1);

// continua exigindo o resto
const e1 = await chama({ nome: 'Fulano' , lgpd_aceito: 'false' });
confere('o aceite LGPD continua obrigatório', e1.erro && /concordar/.test(e1.erro));
const e2 = await chama({ nome: 'Al' });
confere('o nome continua obrigatório (mínimo de 3 letras)', e2.erro && /nome completo/.test(e2.erro));

// permissões
confere('anon continua podendo executar só esta função', (await c.query(`select has_function_privilege('anon', 'visitante_autocadastro(text, jsonb)', 'execute') as p`)).rows[0].p === true);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
