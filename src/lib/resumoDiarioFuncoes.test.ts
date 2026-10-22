import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261022210000_resumo_diario_tesouraria.sql", "utf8");
const envio = readFileSync("supabase/functions/resumo-diario/index.ts", "utf8");
const previa = readFileSync("supabase/functions/resumo-diario-previa/index.ts", "utf8");
const servico = readFileSync("src/services/sistemaService.ts", "utf8");

describe("o resumo diário: migration, funções e tela falam a mesma língua", () => {
  it("as funções chamam as RPCs e as tabelas que a migration cria", () => {
    expect(envio).toContain('rpc("resumo_diario_dados")');
    expect(previa).toContain('rpc("resumo_diario_dados")');
    expect(migration).toContain("FUNCTION public.resumo_diario_dados()");
    expect(envio).toContain('from("resumo_diario_enviados")');
    expect(migration).toContain("TABLE IF NOT EXISTS public.resumo_diario_enviados");
  });
  it("a tela chama as RPCs de configuração e as funções de prévia que existem", () => {
    for (const rpc of ["sistema_resumo_diario_status", "sistema_resumo_diario_salvar"]) { expect(servico).toContain(rpc); expect(migration).toContain(`FUNCTION public.${rpc}`); }
    expect(servico).toContain('invoke("resumo-diario-previa"');
  });
  it("o job nasce DESLIGADO e o agendamento é PRÓPRIO (não toca o do resumo semanal)", () => {
    expect(migration).toContain("'resumo-diario'");
    expect(migration).toMatch(/alter_job\(\(SELECT jobid FROM cron\.job WHERE jobname = 'resumo-diario'\), active := false\)/);
    expect(migration).not.toContain("resumo-semanal");
  });
  it("a configuração nasce desligada", () => {
    expect(migration).toMatch(/ativo\s+boolean NOT NULL DEFAULT false/);
  });
  it("o envio agendado não lê nada da chamada e nunca devolve conteúdo nem destinatários", () => {
    expect(envio).not.toContain("req.json");
    expect(envio).not.toMatch(/resposta\(\{[^}]*\b(html|texto|destinatarios|email|assunto)\s*:/);
  });
  it("prévia e teste conferem a sessão e o papel ANTES de ler qualquer dado", () => {
    expect(previa).toContain("auth.getUser(token)");
    expect(previa).toContain('.in("role", ["admin", "diakonia"])');
    expect(previa.indexOf("auth.getUser(token)")).toBeLessThan(previa.indexOf('rpc("resumo_diario_dados")'));
  });
  it("o teste só vai para o e-mail cadastrado de quem pediu, e não registra 'já enviado'", () => {
    expect(previa).toContain('.from("membros").select("email")');
    expect(previa).not.toMatch(/corpo\.(para|email|destino)/);
    expect(previa).not.toContain("resumo_diario_enviados");
  });
  it("só a função agendada registra o que foi enviado, e só depois de enviar", () => {
    expect(envio.indexOf("api.resend.com")).toBeLessThan(envio.indexOf('from("resumo_diario_enviados")'));
  });
  it("a prévia nunca lê a lista de destinatários nem envia ao grupo", () => {
    expect(previa).not.toContain("destinatarios");
  });
});
