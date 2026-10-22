// Ensaio (Postgres embutido) da migration 20261023100000_visitante_mensagens.sql — roda com o harness de scratchpad/pgnew (embedded-postgres + pg).
// Prova: a Identidade ganha endereco/telefone/email_contato SEM mexer nas linhas existentes; as 2 tabelas e a função nascem; 14 modelos semeados (7 situações × WhatsApp/E-mail) com os textos de padroes.ts; a config
// guarda SÓ o que é das mensagens (nada de redes/contatos/nome da igreja: a Identidade é a fonte única); a função devolve config + modelos + Identidade + eventos e acompanha a Identidade quando ela muda; anon não lê nada
// nem executa; usuário comum executa a função mas não lê/escreve as tabelas; admin/secretaria editam; as CHECKs recusam link que não é http(s), prazo fora de 3–90, rede desconhecida e situação desconhecida;
// reaplicar a migration NÃO desfaz uma edição.
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
 -- a Identidade como ela é HOJE: sem endereço, telefone nem e-mail
 create table identidade_igreja (id uuid primary key default gen_random_uuid(), nome_igreja text not null, ativa boolean default true, created_at timestamptz default now(),
   site_oficial text, redes_sociais jsonb default '[]', resumo text, missao text);
 -- a função pública de Boas-vindas, de mentira: só o que a mensagem lê (os eventos)
 create function visitante_boasvindas() returns jsonb language sql stable as $$ select jsonb_build_object('eventos', jsonb_build_array(jsonb_build_object('titulo','Culto de Oração','quando','quarta-feira'))) $$;
 insert into user_roles values ('${ADMIN}', 'admin'), ('${SECR}', 'secretaria'), ('${COMUM}', 'voluntario');
 insert into identidade_igreja (nome_igreja, site_oficial, redes_sociais, resumo, missao) values
   ('Quarta Igreja Batista do Rio de Janeiro', 'https://qibrj.org.br', '[{"plataforma":"instagram","url":"@qibrj"},{"plataforma":"whatsapp","url":"21983991229"}]', 'Resumo da igreja.', 'Missão da igreja.');
`);

const migration = fs.readFileSync(raiz + 'supabase/migrations/20261023100000_visitante_mensagens.sql', 'utf8');
await c.query(migration);

// ── a Identidade
const colsIdent = (await c.query(`select column_name, is_nullable from information_schema.columns where table_name = 'identidade_igreja' and column_name in ('endereco','telefone','email_contato') order by 1`)).rows;
confere('a Identidade ganhou endereco, telefone e email_contato (opcionais)', colsIdent.length === 3 && colsIdent.every(x => x.is_nullable === 'YES'), JSON.stringify(colsIdent.map(x => x.column_name)));
const ident0 = (await c.query(`select endereco, telefone, email_contato, nome_igreja, site_oficial from identidade_igreja`)).rows[0];
confere('a linha que já existia NÃO foi alterada (colunas novas nulas, o resto intacto)', ident0.endereco === null && ident0.telefone === null && ident0.email_contato === null && ident0.site_oficial === 'https://qibrj.org.br');
confere('a CHECK da Identidade recusa endereço acima de 300 caracteres', /check constraint/i.test(await recusa(`update identidade_igreja set endereco = repeat('x', 301)`) ?? ''));

// ── as tabelas das mensagens
confere('14 modelos semeados', (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n === 14);
confere('7 situações × (whatsapp, email), nenhum sms', (await c.query(`select count(distinct situacao)::int s, count(*) filter (where canal='sms')::int sms, count(*) filter (where canal='whatsapp')::int w, count(*) filter (where canal='email')::int e from visitante_mensagem_modelos`)).rows.every(r => r.s === 7 && r.sms === 0 && r.w === 7 && r.e === 7));
const cfg = (await c.query(`select * from visitante_mensagem_config`)).rows;
confere('a config é uma linha só', cfg.length === 1);
confere('a config NÃO tem nome da igreja, endereço, telefone, WhatsApp, e-mail nem redes (a Identidade é a fonte)', !['igreja_nome', 'endereco', 'telefone', 'whatsapp', 'email_contato', 'redes'].some(k => k in cfg[0]), Object.keys(cfg[0]).join(','));
confere('a config tem o que é das mensagens: assinatura (com {{igreja}}), prazo 15, 4 eventos, nenhuma rede oculta', /\{\{igreja\}\}/.test(cfg[0].assinatura) && cfg[0].dias_sem_retorno === 15 && cfg[0].eventos_max === 4 && cfg[0].redes_ocultas.length === 0);
confere('padrões: oração ligada e plano de leitura desligado', (await c.query(`select bool_and(incluir_oracao) o, bool_or(incluir_leitura) l from visitante_mensagem_modelos`)).rows[0].o === true);
const m1 = (await c.query(`select * from visitante_mensagem_modelos where situacao='nao_retornou' and canal='email'`)).rows[0];
confere('o texto de partida de "não retornou" está lá (com as marcas {{nome}} e {{igreja}})', /Sentimos a sua falta, \{\{nome\}\}/.test(m1.assunto) && /\{\{igreja\}\}/.test(m1.texto_pastoral));

// ── a função para quem envia
await como('authenticated', COMUM);
const j = (await c.query(`select visitante_mensagens() as j`)).rows[0].j;
confere('usuário logado executa a função: config + 14 modelos + Identidade + eventos da agenda', j.config.assinatura && j.modelos.length === 14 && j.eventos[0].titulo === 'Culto de Oração' && j.igreja.nome === 'Quarta Igreja Batista do Rio de Janeiro');
confere('a Identidade vem inteira: site, redes (como cadastradas), endereço/telefone/e-mail vazios, resumo e missão', j.igreja.site === 'https://qibrj.org.br' && j.igreja.redes.length === 2 && j.igreja.redes[0].url === '@qibrj' && j.igreja.endereco === '' && j.igreja.telefone === '' && j.igreja.email === '' && j.igreja.resumo === 'Resumo da igreja.' && j.igreja.missao === 'Missão da igreja.', JSON.stringify(j.igreja));
confere('a função não expõe atualizado_por nem o id', !('atualizado_por' in j.config) && !('id' in j.config) && !('atualizado_por' in j.modelos[0]));
const lerDireto = (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n;
confere('usuário comum NÃO lê a tabela direto (RLS)', lerDireto === 0, String(lerDireto));
const afetadas = (await c.query(`update visitante_mensagem_config set assinatura = 'invasor' returning 1`)).rowCount;
confere('usuário comum NÃO edita a config (0 linhas afetadas)', afetadas === 0);

await como('anon', '');
confere('anon não executa a função', /permission denied/i.test(await recusa(`select visitante_mensagens()`) ?? ''));
confere('anon não lê as tabelas', /permission denied/i.test(await recusa(`select * from visitante_mensagem_modelos`) ?? ''));

// ── a administração edita; as CHECKs protegem
await como('authenticated', SECR);
confere('secretaria edita um modelo', (await c.query(`update visitante_mensagem_modelos set abertura = 'Texto da secretaria, {{nome}}!' where situacao='primeira_visita' and canal='whatsapp' returning 1`)).rowCount === 1);
confere('secretaria edita a config (assinatura, link de oração, redes ocultas)', (await c.query(`update visitante_mensagem_config set assinatura = 'Abraço, {{igreja}}', link_pedido_oracao = 'https://qibrj.org.br/oracao', redes_ocultas = ARRAY['spotify'] returning 1`)).rowCount === 1);
await como('authenticated', ADMIN);
confere('a CHECK recusa link que não é http(s)', /check constraint/i.test(await recusa(`update visitante_mensagem_config set link_plano_leitura = 'javascript:alert(1)'`) ?? ''));
confere('a CHECK recusa prazo fora de 3–90', /check constraint/i.test(await recusa(`update visitante_mensagem_config set dias_sem_retorno = 1`) ?? '') && /check constraint/i.test(await recusa(`update visitante_mensagem_config set dias_sem_retorno = 400`) ?? ''));
confere('a CHECK recusa rede desconhecida na lista de ocultas', /check constraint/i.test(await recusa(`update visitante_mensagem_config set redes_ocultas = ARRAY['myspace']`) ?? ''));
confere('a CHECK recusa situação desconhecida', /check constraint/i.test(await recusa(`insert into visitante_mensagem_modelos (situacao, canal) values ('inventada', 'email')`) ?? ''));
confere('a CHECK aceita sms (previsto) e recusa canal desconhecido', (await recusa(`insert into visitante_mensagem_modelos (situacao, canal, abertura) values ('primeira_visita', 'sms', 'oi')`)) === null && /check constraint/i.test(await recusa(`insert into visitante_mensagem_modelos (situacao, canal) values ('jovem', 'fax')`) ?? ''));

// ── a função ACOMPANHA a Identidade (fonte única): mudou lá, mudou aqui — sem copiar nada
await como(null, '');
await c.query(`update identidade_igreja set endereco = 'Rua das Flores, 100', telefone = '(21) 3333-4444', email_contato = 'acolhimento@qibrj.org.br', redes_sociais = '[{"plataforma":"youtube","url":"@qibrj"}]'`);
const j2 = (await c.query(`select visitante_mensagens() as j`)).rows[0].j;
confere('mudou na Identidade, a função devolve o novo (endereço, telefone, e-mail, redes)', j2.igreja.endereco === 'Rua das Flores, 100' && j2.igreja.telefone === '(21) 3333-4444' && j2.igreja.email === 'acolhimento@qibrj.org.br' && j2.igreja.redes.length === 1 && j2.igreja.redes[0].plataforma === 'youtube');
confere('a edição da secretaria aparece na leitura (assinatura e redes ocultas)', j2.config.assinatura === 'Abraço, {{igreja}}' && JSON.stringify(j2.config.redes_ocultas) === '["spotify"]');
await c.query(`update identidade_igreja set ativa = false`);
const j3 = (await c.query(`select visitante_mensagens() as j`)).rows[0].j;
confere('sem Identidade ativa, "igreja" vem vazia (o app usa o nome padrão) e o resto continua', Object.keys(j3.igreja).length === 0 && j3.modelos.length === 15);

// ── reaplicar não desfaz a edição
await c.query(migration);
const depois = (await c.query(`select abertura from visitante_mensagem_modelos where situacao='primeira_visita' and canal='whatsapp'`)).rows[0].abertura;
confere('reaplicar a migration não desfaz a edição da secretaria', depois === 'Texto da secretaria, {{nome}}!', depois);
confere('reaplicar não duplica modelos (14 + o sms do teste) nem recria a config', (await c.query(`select count(*)::int n from visitante_mensagem_modelos`)).rows[0].n === 15 && (await c.query(`select assinatura from visitante_mensagem_config`)).rows[0].assinatura === 'Abraço, {{igreja}}');

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await c.end(); await server.stop();
process.exit(falhas === 0 ? 0 : 1);
