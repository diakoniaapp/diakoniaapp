// ─── contribuicoes-enviar e o histórico de envios: o que a função e a migration garantem (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────
// Testes de contrato sobre o TEXTO (não há Deno nem banco local): sessão e papel conferidos por dentro, números calculados no servidor, um e-mail por destinatário, remetente de relatórios,
// Reply-To, histórico gravado, anti-duplicidade; e a migration: trilha imutável, sem política de escrita, leitura só de admin e diakonia.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
const sql = readFileSync("supabase/migrations/20261027180000_comunicacao_envios.sql", "utf8");
const servico = readFileSync("src/services/comunicacaoService.ts", "utf8");

describe("Edge Function contribuicoes-enviar", () => {
  it("confere a sessão E o papel (admin ou diakonia) por dentro — o token público também é um JWT válido", () => {
    expect(fn).toContain("supabase.auth.getUser(token)");
    expect(fn).toMatch(/\.in\("role", \["admin", "diakonia"\]\)/);
    expect(fn).toContain("403");
    expect(fn).toContain("401");
  });
  it("as três ações: prévia (nada enviado), teste (só para o e-mail de quem pediu) e enviar", () => {
    expect(fn).toMatch(/corpo\.acao !== "previa" && corpo\.acao !== "teste" && corpo\.acao !== "enviar"/);
    expect(fn).toContain("SÓ para o e-mail cadastrado de quem pediu");
    expect(fn).toMatch(/from\("profiles"\)\.select\("pessoa_id"\)/);
    expect(fn).toMatch(/from\("membros"\)\.select\("email"\)/);   // o único uso de `membros`: o e-mail de quem pediu o teste
    expect(fn).not.toMatch(/nome_completo/);
  });
  it("os números são calculados no servidor com o código compartilhado, nunca vêm da chamada", () => {
    expect(fn).toContain("lerContribuicoesDoPiso(supabase, pedido.periodo.fim)");
    expect(fn).toContain("analisarContribuicoes(linhas, pedido.periodo)");
    expect(fn).toContain("montarEmailDeContribuicoes(analise");
    expect(fn).toContain("validarPedido(corpo, hoje");
  });
  it("um e-mail por destinatário (ninguém vê os outros), pelo remetente de relatórios e com Reply-To", () => {
    expect(fn).toContain("REMETENTE_RELATORIOS");
    expect(fn).toMatch(/to: \[para\]/);
    expect(fn).toContain("comReplyTo(");
    expect(fn).toContain("lerEnderecoDeResposta(supabase)");
    expect(fn).not.toMatch(/to: pedido\.destinatarios|to: destinatarios/);
  });
  it("grava o histórico (só agregados) e recusa o mesmo envio repetido em 10 minutos", () => {
    expect(fn).toContain('from("comunicacao_envios").insert');
    expect(fn).toContain("MINUTOS_ANTI_DUPLICIDADE = 10");
    expect(fn).toContain("enviado_ha_pouco");
    expect(fn).toMatch(/const resumo = \{ dizimistas: analise\.dizimistas, doadores: analise\.doadores, arrecadado: analise\.arrecadado/);
  });
  it("a resposta é enxuta: contagens, nunca o conteúdo do envio", () => {
    expect(fn).toMatch(/resposta\(\{ ok: enviados > 0, enviados, falharam/);
  });
  it("o cliente pede a mesma função pelo mesmo nome e ações", () => {
    expect(servico).toContain('"contribuicoes-enviar"');
    for (const acao of ['"previa"', '"teste"', '"enviar"']) expect(servico).toContain(acao);
  });
});

describe("migration 20261027180000 — histórico de envios", () => {
  it("trilha imutável: o gatilho recusa UPDATE e DELETE", () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.comunicacao_envios/);
    expect(sql).toContain("só acrescenta: não se altera nem se apaga");
  });
  it("não guarda o corpo do e-mail nem anexo", () => {
    const tabela = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf(");", sql.indexOf("CREATE TABLE")));
    expect(tabela).not.toMatch(/\bhtml\b|\bcorpo\b|\btexto\b|anexo/i);
    expect(tabela).toMatch(/destinatarios\s+jsonb/);
  });
  it("sem política de escrita (só a Edge Function, com a chave de serviço, grava); leitura só de admin e diakonia", () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
    expect(sql).toMatch(/CREATE POLICY comunicacao_envios_leitura ON public\.comunicacao_envios FOR SELECT/);
    expect(sql).toMatch(/ARRAY\['admin'::app_role, 'diakonia'::app_role\]\)\);/);
  });
  it("as colunas que a função grava existem na tabela, e o resultado aceita só os valores que ela usa", () => {
    for (const col of ["tipo", "origem", "solicitante", "solicitante_nome", "remetente", "reply_to", "assunto", "destinatarios", "parametros", "resumo", "resultado", "resend_ids"]) expect(sql).toMatch(new RegExp(String.raw`\b${col}\b\s`));
    expect(sql).toContain("resultado IN ('enviado', 'parcial', 'falhou')");
    expect(sql).toContain("origem IN ('sob_demanda', 'teste')");
    expect(fn).toMatch(/"enviado" : ok === 0 \? "falhou" : "parcial"/);
  });
  it("o rollback remove a tabela", () => {
    expect(readFileSync("docs/COMUNICACAO_ENVIOS_ROLLBACK.sql", "utf8")).toContain("DROP TABLE IF EXISTS public.comunicacao_envios");
  });
});
