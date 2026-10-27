// ─── As Edge Functions de e-mail CARREGAM (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O defeito que isto previne: `contribuicoes-enviar` foi implantada com uma variável `base` declarada duas vezes (`const base` e `const base`). O Deno recusa carregar o arquivo, e o navegador só vê
// "a função ainda não foi implantada" — enquanto os testes de TEXTO (que leem o arquivo como string) passavam. Aqui o TypeScript lê cada função como programa e falha em erro de SINTAXE ou de
// declaração repetida, que são os que derrubam o carregamento. Erros de módulo não resolvido (esm.sh, Deno) são esperados e ignorados: só interessa o que quebra o arquivo em si.
import { describe, expect, it } from "vitest";
import ts from "typescript";
import path from "node:path";

// 1xxx = sintaxe; 2300/2451/2393/2392 = identificador ou variável declarados mais de uma vez; 2448/2454 = uso antes da declaração; 2304 não entra (Deno e módulos remotos não resolvem aqui)
const CODIGOS_QUE_DERRUBAM = (c: number) => (c >= 1000 && c < 2000) || [2300, 2451, 2393, 2392, 2448].includes(c);

function problemasDoArquivo(arquivo: string): string[] {
  const opcoes: ts.CompilerOptions = {
    noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, noResolve: false, types: [], strict: false,
  };
  const programa = ts.createProgram([arquivo], opcoes);
  const alvo = programa.getSourceFile(arquivo)!;
  const diags = [...programa.getSyntacticDiagnostics(alvo), ...programa.getSemanticDiagnostics(alvo)].filter(d => CODIGOS_QUE_DERRUBAM(d.code));
  return diags.map(d => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

const FUNCOES = ["contribuicoes-enviar", "resumo-diario", "resumo-diario-previa", "resumo-semanal", "resumo-semanal-previa", "alerta-ata-atrasada", "alerta-visitante-esfriando", "visitante-mensagem-teste"];

describe("nenhuma Edge Function de e-mail tem erro que impeça o carregamento", () => {
  it.each(FUNCOES)("%s: sem erro de sintaxe nem declaração repetida", f => {
    const problemas = problemasDoArquivo(path.resolve(__dirname, `../../supabase/functions/${f}/index.ts`));
    expect(problemas).toEqual([]);
  }, 60_000);

  it("o detector pega de fato uma variável declarada duas vezes (a regressão deste defeito)", () => {
    const host = ts.createCompilerHost({});
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (nome, lang, ...resto) => (nome.endsWith("duplicada.ts") ? ts.createSourceFile(nome, "const base = 1;\nconst base = 2;\n", lang) : original(nome, lang, ...resto));
    const programa = ts.createProgram(["duplicada.ts"], { noEmit: true, types: [], skipLibCheck: true }, host);
    const arquivo = programa.getSourceFile("duplicada.ts")!;
    const codigos = programa.getSemanticDiagnostics(arquivo).map(d => d.code);
    expect(codigos.some(CODIGOS_QUE_DERRUBAM)).toBe(true);
  });
});
