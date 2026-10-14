// O que os três scripts da correção histórica da data de pagamento compartilham: a conexão, as pastas e o "hoje".
// Ver docs/CORRECAO_DATA_PAGAMENTO_COMPROVANTE.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(aqui, "../..");
/** Saídas (leituras, planos, resultados). Ignorada pelo git: tem o texto dos comprovantes (nomes, contas). */
export const SAIDA = path.join(aqui, "saida");

/** A chave de serviço (ignora a RLS: lê os anexos de todos e grava). Do ambiente ou do .env local — nunca do repositório. */
export function conectar() {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  const arq = path.join(RAIZ, ".env");
  if (fs.existsSync(arq)) {
    for (const l of fs.readFileSync(arq, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(l);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  }
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const chave = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou no .env). A chave de serviço é do painel do Supabase → Settings → API.");
    process.exit(2);
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

/** Hoje em Brasília (UTC−3). */
export const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function carimbo() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

export function garantirSaida() { fs.mkdirSync(SAIDA, { recursive: true }); }

/** O arquivo de leitura mais recente em saida/ (ou o passado como argumento). */
export function arquivoDeLeitura(arg?: string): string {
  if (arg && !arg.startsWith("--")) return path.resolve(arg);
  const lista = fs.existsSync(SAIDA) ? fs.readdirSync(SAIDA).filter(f => /^leituras-.*\.json$/.test(f)).sort() : [];
  if (!lista.length) { console.error("Nenhuma leitura em scripts/correcao-data-pagamento/saida/. Rode primeiro: npm run correcao-data:ler"); process.exit(2); }
  return path.join(SAIDA, lista[lista.length - 1]);
}
