import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const pasta = path.resolve(__dirname, "../../supabase/migrations");

// Em 22/10/2026 o Advisor do Supabase acusou 4 views "Security Definer" (vw_fin_resumo_mes, vw_fin_centros_resumo, vw_fin_orcamento_vs_real, vw_fin_proximos_vencimentos): a opção
// security_invoker, ligada em 20260805130000, foi zerada por CREATE OR REPLACE VIEW posteriores que não a repetiram. A migration 20261022170000 religou; este teste impede a reincidência.
// Vale só da migration de correção em diante — as anteriores são história e não se reescrevem.
const A_PARTIR_DE = "20261022170000";

describe("views vw_* nas migrations novas", () => {
  const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= A_PARTIR_DE);

  it("a migration de correção religa as quatro views", () => {
    const sql = fs.readFileSync(path.join(pasta, "20261022170000_views_financeiras_voltam_a_security_invoker.sql"), "utf8");
    for (const v of ["vw_fin_resumo_mes", "vw_fin_centros_resumo", "vw_fin_orcamento_vs_real", "vw_fin_proximos_vencimentos"]) {
      expect(sql).toContain(`ALTER VIEW public.${v} SET (security_invoker = true);`);
    }
  });

  it("toda CREATE [OR REPLACE] VIEW de vw_* repete WITH (security_invoker = true)", () => {
    const falhas: string[] = [];
    for (const f of arquivos) {
      const sql = fs.readFileSync(path.join(pasta, f), "utf8").replace(/--[^\n]*/g, "");
      const criacoes = sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?(vw_\w+)\s*([^]*?)\bAS\b/gi);
      for (const [, nome, opcoes] of criacoes) {
        if (!/security_invoker\s*=\s*(true|on)/i.test(opcoes)) falhas.push(`${f}: ${nome}`);
      }
    }
    expect(falhas).toEqual([]);
  });
});
