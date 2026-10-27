// ─── Triagem de contribuições: o que a migration 20261027220000 garante (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Teste de contrato sobre o texto: trilha imutável, desfazer por nova linha, view com security_invoker, única porta de escrita com papel e regras conferidas DENTRO da função, e o que o app chama existe.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20261027220000_contribuicoes_triagem_de_identificacao.sql", "utf8");
const servico = readFileSync("src/services/pendentesDeIdentificacaoService.ts", "utf8");

describe("migration 20261027220000 — triagem de identificação", () => {
  it("a trilha é imutável (gatilho recusa UPDATE e DELETE) e desfazer é uma NOVA linha 'desfeita'", () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.fin_contribuicao_triagem/);
    expect(sql).toContain("decisao IN ('anonimo', 'ignorado', 'desfeita')");
    expect(sql).toContain("para desfazer, registre");
  });
  it("sem chave estrangeira para o lançamento (apagar um lançamento não pode ser bloqueado por uma trilha imutável)", () => {
    const tabela = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf(");", sql.indexOf("CREATE TABLE")));
    expect(tabela).not.toMatch(/REFERENCES/i);
  });
  it("a view da decisão vigente é security_invoker (as views financeiras já vazaram uma vez sem isso) e esconde as desfeitas", () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.fin_contribuicao_triagem_atual WITH \(security_invoker = true\)/);
    expect(sql).toContain("DISTINCT ON (lancamento_id)");
    expect(sql).toContain("WHERE t.decisao <> 'desfeita'");
  });
  it("não há política de escrita na tabela; a leitura é de admin, diakonia e tesouraria", () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
    expect(sql).toMatch(/CREATE POLICY fin_contribuicao_triagem_leitura ON public\.fin_contribuicao_triagem FOR SELECT/);
    expect(sql).toMatch(/ARRAY\['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role\]\)\);/);
  });
  it("a função é a única porta: SECURITY DEFINER, papel conferido, só contribuição de entrada realizada e SEM pessoa", () => {
    const f = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.contribuicao_triar"));
    expect(f).toContain("SECURITY DEFINER SET search_path TO 'public'");
    expect(f).toMatch(/has_any_role\(v_uid, ARRAY\['admin'::app_role, 'diakonia'::app_role, 'tesouraria'::app_role\]\)/);
    expect(f).toContain("l.pessoa_id IS NOT NULL");
    expect(f).toContain("Só contribuição de entrada já realizada");
    expect(f).toMatch(/lower\(c\.nome\) LIKE 'dizim%' OR lower\(c\.nome\) LIKE 'oferta%'/);
    expect(f).toContain("Este lançamento não tem classificação a desfazer.");
    expect(f).toContain("VALUES (p_lancamento, p_decisao,");
    expect(f).toMatch(/REVOKE ALL ON FUNCTION public\.contribuicao_triar\(uuid, text, text\) FROM PUBLIC/);
    expect(f).toMatch(/GRANT EXECUTE ON FUNCTION public\.contribuicao_triar\(uuid, text, text\) TO authenticated/);
  });
  it("amplia o CHECK do registro de acessos com 'ver_pendentes' e mantém as ações anteriores", () => {
    for (const a of ["ver_pessoas", "ver_nao_contribuiram", "exportar_pessoas", "exportar_nao_contribuiram", "ver_pessoa", "previa_relatorio", "teste_relatorio", "enviar_relatorio", "ver_pendentes"]) expect(sql).toContain(`'${a}'`);
  });
  it("o app chama a função e a view pelos mesmos nomes e parâmetros; o rollback remove tudo", () => {
    expect(servico).toContain('"contribuicao_triar"');
    expect(servico).toMatch(/p_lancamento: lancamentoId, p_decisao: decisao, p_motivo: motivo \?\? null/);
    expect(servico).toContain('"fin_contribuicao_triagem_atual"');
    const rollback = readFileSync("docs/CONTRIBUICOES_TRIAGEM_ROLLBACK.sql", "utf8");
    for (const o of ["DROP FUNCTION IF EXISTS public.contribuicao_triar", "DROP VIEW IF EXISTS public.fin_contribuicao_triagem_atual", "DROP TABLE IF EXISTS public.fin_contribuicao_triagem"]) expect(rollback).toContain(o);
  });
});

describe("o serviço de pendentes protege o vínculo", () => {
  it("só vincula lançamento que AINDA está sem pessoa, e só desvincula se for a mesma pessoa (não apaga o trabalho de outro)", () => {
    expect(servico).toContain('.eq("id", lancamentoId).is("pessoa_id", null).select("id")');
    expect(servico).toMatch(/\.eq\("id", lancamentoId\)\.eq\("pessoa_id", pessoaId\)\.select\("id"\)/);
  });
  it("toda escrita é conferida (UPDATE barrado pela RLS devolve zero linhas, não erro)", () => {
    expect(servico).toContain('conferir(');
    expect((servico.match(/conferir\(/g) ?? []).length).toBe(3);   // vincular, desvincular e confirmar como contribuição
  });
});
