// Trava de regressão (17/10/2026): a função do convite NUNCA mais pode criar uma conta no Auth com colunas de token NULL — o Auth (GoTrue v2.197) responde 500 "Database error querying schema"
// em todo login numa linha assim. Lê a ÚLTIMA definição de `aceitar_convite` entre as migrations e confere o INSERT em auth.users.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pasta = join(process.cwd(), "supabase", "migrations");
const COLUNAS_DE_TOKEN = ["confirmation_token", "recovery_token", "email_change", "email_change_token_new"];

function ultimaDefinicao(): { arquivo: string; corpo: string } {
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
  let achada: { arquivo: string; corpo: string } | null = null;
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(pasta, arquivo), "utf8");
    const i = sql.search(/CREATE OR REPLACE FUNCTION public\.aceitar_convite\s*\(/i);
    if (i < 0) continue;
    const fim = sql.indexOf("$function$;", sql.indexOf("$function$", i) + 10);
    achada = { arquivo, corpo: sql.slice(i, fim < 0 ? undefined : fim) };
  }
  if (!achada) throw new Error("nenhuma migration define aceitar_convite");
  return achada;
}

describe("aceitar_convite — a conta nasce legível pelo Auth", () => {
  const { arquivo, corpo } = ultimaDefinicao();
  const insert = corpo.slice(corpo.search(/INSERT INTO auth\.users/i));

  it(`(${arquivo}) o INSERT em auth.users lista as colunas de token`, () => {
    const colunas = insert.slice(0, insert.search(/VALUES/i));
    for (const c of COLUNAS_DE_TOKEN) expect(colunas, c).toContain(c);
  });

  it("e as grava como texto vazio, não como NULL", () => {
    const valores = insert.slice(insert.search(/VALUES/i), insert.search(/\);/));
    expect(valores).toMatch(/'',\s*'',\s*'',\s*'',\s*'',\s*'',\s*'',\s*''/);   // oito colunas de token em ''
    expect(valores).not.toMatch(/NULL/i);
  });
});
