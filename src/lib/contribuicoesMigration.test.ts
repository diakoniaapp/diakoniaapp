// ─── O registro de acessos às contribuições: o que a migration garante (27/10/2026) ────────────────────────────────────────────────────────────────────────────────────────────────────
// Teste de contrato sobre o texto da migration (não há banco local): trilha imutável, nenhuma porta de escrita fora da função, papel conferido DENTRO da função, leitura só de admin e diakonia, e o
// que o cliente chama existe com o mesmo nome e os mesmos parâmetros.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261027160000_contribuicoes_registro_de_acessos.sql", "utf8");
const servico = readFileSync("src/services/contribuicoesService.ts", "utf8");

describe("migration 20261027160000 — registro de quem vê a lista nominal", () => {
  it("a trilha é imutável: gatilho que recusa UPDATE e DELETE", () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.contribuicoes_acessos/);
    expect(sql).toContain("só acrescenta: não se altera nem se apaga");
  });
  it("não guarda nomes nem valores: só ação, recorte e total", () => {
    const tabela = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf(");", sql.indexOf("CREATE TABLE")));
    expect(tabela).not.toMatch(/nome_completo|valor|pessoa_id|membro_id/);
    expect(tabela).toMatch(/filtros\s+jsonb/);
  });
  it("a tabela não tem política de escrita: só a função grava; a leitura é de admin e diakonia", () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
    expect(sql).toMatch(/CREATE POLICY contribuicoes_acessos_leitura ON public\.contribuicoes_acessos FOR SELECT/);
    expect(sql).toMatch(/ARRAY\['admin'::app_role, 'diakonia'::app_role\]\)\);/);
  });
  it("a função confere o papel (admin, diakonia, tesouraria), carimba auth.uid() e é SECURITY DEFINER com search_path fixo", () => {
    const funcao = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.contribuicoes_registrar_acesso"));
    expect(funcao).toContain("SECURITY DEFINER SET search_path TO 'public'");
    expect(funcao).toMatch(/has_any_role\(v_uid, ARRAY\['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role\]\)/);
    expect(funcao).toContain("VALUES (v_uid,");
    expect(funcao).toMatch(/REVOKE ALL ON FUNCTION public\.contribuicoes_registrar_acesso\(text, jsonb, integer\) FROM PUBLIC/);
    expect(funcao).toMatch(/GRANT EXECUTE ON FUNCTION public\.contribuicoes_registrar_acesso\(text, jsonb, integer\) TO authenticated/);
  });
  it("as ações que o app envia são exatamente as que o CHECK aceita", () => {
    const aceitas = [...sql.matchAll(/acao IN \(([^)]*)\)/g)][0][1].match(/'([a-z_]+)'/g)!.map(s => s.replace(/'/g, "")).sort();
    const doApp = [...servico.matchAll(/"(ver_[a-z_]+|exportar_[a-z_]+)"/g)].map(m => m[1]);
    expect(new Set(doApp)).toEqual(new Set(aceitas));
  });
  it("o cliente chama a função pelo mesmo nome e parâmetros, e o rollback a remove", () => {
    expect(servico).toContain('"contribuicoes_registrar_acesso"');
    expect(servico).toMatch(/p_acao: acao, p_filtros: filtros, p_total: total/);
    const rollback = readFileSync("docs/CONTRIBUICOES_REGISTRO_ROLLBACK.sql", "utf8");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.contribuicoes_registrar_acesso");
    expect(rollback).toContain("DROP TABLE IF EXISTS public.contribuicoes_acessos");
  });
});
