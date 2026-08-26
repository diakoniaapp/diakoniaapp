#!/usr/bin/env node
// ─── validar_4b.cjs — Fase 4b do DATABASE_RECOVERY_PLAN.md ───────────────────
//
// Compara o banco LOCAL (reconstruido a partir do baseline) com os numeros
// medidos em producao em 25/08/2026.
//
// Uso:  node supabase/baseline/validar_4b.cjs
//
// Precisa de:
//   - Docker rodando
//   - `npx supabase start` ja executado
//   - o baseline ja aplicado (ver validar_4b.md)
//
// Nao se conecta a producao. So le o banco local.

const { execSync } = require('node:child_process');

// Numeros de producao, medidos em 25/08/2026 e conferidos nas fases 1 a 4.
const PRODUCAO = {
  tabelas: 143, views: 30, funcoes: 397, gatilhos: 117,
  enums: 114, politicas: 439, indices: 423, fks: 273, rls_ligada: 143,
};

const CONSULTA = `
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE') AS tabelas,
  (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS views,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public') AS funcoes,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal) AS gatilhos,
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname='public' AND t.typtype='e') AS enums,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS politicas,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indices,
  (SELECT count(*) FROM pg_constraint c JOIN pg_class t2 ON t2.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t2.relnamespace
     WHERE n.nspname='public' AND c.contype='f') AS fks,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) AS rls_ligada;
`;

let _cache = null;
function container() {
  if (_cache) return _cache;
  let saida;
  try {
    saida = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    console.error('Docker nao esta disponivel nesta maquina, ou o motor nao subiu.');
    console.error('');
    console.error('  1. Instale o Docker Desktop');
    console.error('  2. Abra-o e espere aparecer "Engine running"');
    console.error('  3. Rode `npx supabase start`');
    console.error('');
    console.error('Passo a passo completo em supabase/baseline/validar_4b.md');
    process.exit(2);
  }
  const nome = saida.split('\n').map(s => s.trim()).find(n => n.startsWith('supabase_db_'));
  if (!nome) {
    console.error('Docker esta rodando, mas nao ha container supabase_db_*.');
    console.error('Rode `npx supabase start` antes — ver validar_4b.md.');
    process.exit(2);
  }
  _cache = nome;
  return nome;
}

function consultar(sql) {
  const c = container();
  const out = execSync(
    `docker exec -i ${c} psql -U postgres -d postgres -t -A -F "|" -c "${sql.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return out.trim().split('|').map(Number);
}

console.log('Fase 4b — reconstrucao a partir do baseline\n');
console.log('Container: ' + container() + '\n');

const chaves = Object.keys(PRODUCAO);
const valores = consultar(CONSULTA);
const local = Object.fromEntries(chaves.map((k, i) => [k, valores[i]]));

console.log('objeto        producao     local   confere');
console.log('-'.repeat(44));
let ok = true;
for (const k of chaves) {
  const igual = local[k] === PRODUCAO[k];
  if (!igual) ok = false;
  console.log('  ' + k.padEnd(12) + String(PRODUCAO[k]).padStart(8) +
    String(local[k]).padStart(10) + '   ' + (igual ? 'sim' : '*** NAO ***'));
}
console.log('-'.repeat(44));

if (ok) {
  console.log('\n>>> FASE 4b APROVADA <<<');
  console.log('O baseline reconstroi o schema de producao a partir do zero.');
  console.log('Ele deixa de ser "copia conferida" e passa a ser "reconstrucao provada".');
} else {
  console.log('\n>>> FASE 4b REPROVADA <<<');
  console.log('Divergencia acima. Nao use este baseline para criar ambiente novo');
  console.log('antes de entender a causa. Confira a saida do psql ao aplicar o arquivo:');
  console.log('objeto que falhou ao criar aparece como ERROR ali.');
}
process.exit(ok ? 0 : 1);
