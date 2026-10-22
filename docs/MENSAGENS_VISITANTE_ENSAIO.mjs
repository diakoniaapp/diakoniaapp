// Ensaio (Postgres embutido) da migration 20261023100000_visitante_mensagens.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: as 2 tabelas e a função nascem; 14 modelos semeados (7 situações × WhatsApp/E-mail) com os textos de padroes.ts; a config nasce com o nome da Identidade e as redes da tela de Boas-vindas (ativas só as que
// tinham endereço) + Spotify desligado; a função devolve config + modelos + eventos; anon não lê nada nem executa; usuário comum executa a função mas não lê/escreve as tabelas; admin/secretaria editam;
// as CHECKs recusam link que não é http(s), prazo fora de 3–90 e situação desconhecida; reaplicar a migration NÃO desfaz uma edição.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
const dir = 'C:/Users/telma/AppData/Local/Temp/claude/C--Users-telma-Downloads-DIAKONIA-SIS/bb8af799-1330-42aa-a229-c8874dce0088/scratchpad/pgnew/data14';
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'x', port: 5484, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await server.initialise(); await server.start(); await server.createDatabase('t');
const c = new pg.Client({ host: 'localhost', port: 5484, user: 'postgres', password: 'x', database: 't' }); await c.connect();
const raiz = 'C:/Users/telma/Downloads/DIAKONIA_SIS/diakonia-main/diakonia-main/';
let falhas = 0;
const confere = (nome, ok, extra = '') => { console.log(ok ? '  OK  ' : '  FALHOU', nome, extra); if (!ok) falhas++; };
const recusa = async (sql, p) => { try { await c.query(sql, p); return null; } catch (e) { return e.message; } };
const ADMIN = '00000000-0000-0000-0000-0000000000a1', SECR = '00000000-0000-0000-0000-0000000000a2', COMUM = '00000000-0000-0000-0000-0000000000b2';
const como = async (papel, uid) => { await c.query(`reset role`); if (papel) { await c.query(`set role ${papel}`); } await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); };

await c.query(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create type app_role as enum ('admin','diakonia','secretaria','tesouraria','voluntario');
 create table user_roles (user_id uuid, role app_role);
 create function has_any_role(u uuid, r app_role[]) returns boolean language sql stable security definer as $$ select exists (select 1 from user_roles where user_id = u and role = any (r)) $$;
 create table identidade_igreja (id uuid primary key default gen_random_uuid(), nome_igreja text, ativa boolean default true, created_at timestamptz default now());
 create table visitante_boasvindas (id boolean primary key default true, canais jsonb not null default '[]');
 -- a função pública de Boas-vindas, de mentira: só o que a mensagem lê (os eventos)
 create function visitante_boasvindas() returns jsonb language sql stable as $$ select jsonb_build_object('eventos', jsonb_build_array(jsonb_build_object('titulo','Culto de Oração','quando','quarta-feira'))) $$;
 insert into user_roles values ('${ADMIN}', 'admin'), ('${SECR}', 'secretaria'), ('${COMUM}', 'voluntario');
 insert into identidade_igreja (nome_igreja) values ('Quarta Igreja Batista do Rio de Janeiro (Identidade)');
 insert into visitante_boasvindas (id, canais) values (true, '[{"tipo":"instagram","url":"https://instagram.com/qibrj","ativo":true},{"tipo":"facebook","url":"","ativo":false},{"tipo":"youtube","url":"https://youtube.com/@qibrj","ativo":true},{"tipo":"site","url":"https://qibrj.org.br","ativo":true},{"tipo":"whatsapp","url":"","ativo":false}]');
`);

const migration = fs.readFileSync(raiz + 'supabase/migrations/20261023100000_visitante_mensagens.sql', 'utf8');
await c.query(migration);

confere('14 modelos semeados', (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n === 14);
confere('7 situações × (whatsapp, email), nenhum sms', (await c.query(`select count(distinct situacao)::int s, count(*) filter (where canal='sms')::int sms, count(*) filter (where canal='whatsapp')::int w, count(*) filter (where canal='email')::int e from visitante_mensagem_modelos`)).rows.every(r => r.s === 7 && r.sms === 0 && r.w === 7 && r.e === 7));
const cfg = (await c.query(`select * from visitante_mensagem_config`)).rows;
confere('a config é uma linha só', cfg.length === 1);
confere('o nome da igreja vem da Identidade', cfg[0].igreja_nome === 'Quarta Igreja Batista do Rio de Janeiro (Identidade)', cfg[0].igreja_nome);
const redes = Object.fromEntries(cfg[0].redes.map(r => [r.tipo, r]));
confere('redes: Instagram, YouTube e Site vêm ativas com o endereço da Boas-vindas', redes.instagram.ativo && redes.instagram.url === 'https://instagram.com/qibrj' && redes.youtube.ativo && redes.site.ativo);
confere('redes: Facebook sem endereço fica desligado; Spotify nasce vazio e desligado', redes.facebook.ativo === false && redes.spotify.ativo === false && redes.spotify.url === '');
confere('padrões: oração ligada e plano de leitura desligado; prazo 15 dias; 4 eventos', (await c.query(`select bool_and(incluir_oracao) o, bool_or(incluir_leitura) l from visitante_mensagem_modelos`)).rows[0].o === true && cfg[0].dias_sem_retorno === 15 && cfg[0].eventos_max === 4);
const m1 = (await c.query(`select * from visitante_mensagem_modelos where situacao='nao_retornou' and canal='email'`)).rows[0];
confere('o texto de partida de "não retornou" está lá (com as marcas {{nome}} e {{igreja}})', /Sentimos a sua falta, \{\{nome\}\}/.test(m1.assunto) && /\{\{igreja\}\}/.test(m1.texto_pastoral));

// a função para quem envia
await como('authenticated', COMUM);
const j = (await c.query(`select visitante_mensagens() as j`)).rows[0].j;
confere('usuário logado executa a função: config + 14 modelos + eventos da agenda', j.config.igreja_nome && j.modelos.length === 14 && j.eventos[0].titulo === 'Culto de Oração');
confere('a função não expõe atualizado_por nem o id', !('atualizado_por' in j.config) && !('id' in j.config) && !('atualizado_por' in j.modelos[0]));
const lerDireto = (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n;
confere('usuário comum NÃO lê a tabela direto (RLS)', lerDireto === 0, String(lerDireto));
const escritaComum = await recusa(`update visitante_mensagem_config set assinatura = 'x'`);
const afetadas = (await c.query(`update visitante_mensagem_config set assinatura = 'invasor' returning 1`)).rowCount;
confere('usuário comum NÃO edita a config (0 linhas afetadas)', afetadas === 0 && !escritaComum);

await como('anon', '');
confere('anon não executa a função', /permission denied/i.test(await recusa(`select visitante_mensagens()`) ?? ''));
confere('anon não lê as tabelas', /permission denied/i.test(await recusa(`select * from visitante_mensagem_modelos`) ?? ''));

// administração edita
await como('authenticated', SECR);
const edit = await c.query(`update visitante_mensagem_modelos set abertura = 'Texto da secretaria, {{nome}}!' where situacao='primeira_visita' and canal='whatsapp' returning 1`);
confere('secretaria edita um modelo', edit.rowCount === 1);
const cfgEd = await c.query(`update visitante_mensagem_config set whatsapp = '21983991229', link_pedido_oracao = 'https://qibrj.org.br/oracao' returning 1`);
confere('secretaria edita a config (WhatsApp, link de oração)', cfgEd.rowCount === 1);
await como('authenticated', ADMIN);
confere('a CHECK recusa link que não é http(s)', /check constraint/i.test(await recusa(`update visitante_mensagem_config set link_plano_leitura = 'javascript:alert(1)'`) ?? ''));
confere('a CHECK recusa prazo fora de 3–90', /check constraint/i.test(await recusa(`update visitante_mensagem_config set dias_sem_retorno = 1`) ?? '') && /check constraint/i.test(await recusa(`update visitante_mensagem_config set dias_sem_retorno = 400`) ?? ''));
confere('a CHECK recusa situação desconhecida', /check constraint/i.test(await recusa(`insert into visitante_mensagem_modelos (situacao, canal) values ('inventada', 'email')`) ?? ''));
confere('a CHECK aceita sms (previsto) e recusa canal desconhecido', (await recusa(`insert into visitante_mensagem_modelos (situacao, canal, abertura) values ('primeira_visita', 'sms', 'oi')`)) === null && /check constraint/i.test(await recusa(`insert into visitante_mensagem_modelos (situacao, canal) values ('jovem', 'fax')`) ?? ''));

// reaplicar não desfaz a edição
await como(null, '');
await c.query(migration);
const depois = (await c.query(`select abertura from visitante_mensagem_modelos where situacao='primeira_visita' and canal='whatsapp'`)).rows[0].abertura;
confere('reaplicar a migration não desfaz a edição da secretaria', depois === 'Texto da secretaria, {{nome}}!', depois);
confere('reaplicar não duplica modelos (14 + o sms do teste)', (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n === 15);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
