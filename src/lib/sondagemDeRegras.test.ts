// O resumo da sondagem das regras de atraso (27/10/2026): contagens por situação e por favorecido — a régua que decide se vale construir o degrau A.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resumirSondagem, situacaoDe, type ResultadoDaSondagem } from "./sondagemDeRegras";

const r = (o: Partial<ResultadoDaSondagem> & { situacao: ResultadoDaSondagem["situacao"] }): ResultadoDaSondagem => ({
  anexoId: Math.random().toString(36).slice(2), tipo: "boleto", favorecido: "Light", multa: false, juros: false, desconto: false, naoReceberApos: false, correcao: null, confianca: 0, trechos: [], ...o,
});

describe("situacaoDe", () => {
  it("multa e juros / só um / nenhum", () => {
    expect(situacaoDe({ multa: true, juros: true })).toBe("com_regra");
    expect(situacaoDe({ multa: true, juros: false })).toBe("so_multa");
    expect(situacaoDe({ multa: false, juros: true })).toBe("so_juros");
    expect(situacaoDe({ multa: false, juros: false })).toBe("sem_regra");
  });
});

describe("resumirSondagem", () => {
  const lista = [
    r({ situacao: "com_regra", multa: true, juros: true, trechos: ["multa de 2%"] }),
    r({ situacao: "com_regra", multa: true, juros: true, trechos: ["multa de 2%", "juros de 1% ao mês"] }),
    r({ situacao: "so_multa", multa: true, favorecido: "Claro" }),
    r({ situacao: "sem_regra", favorecido: "Claro" }),
    r({ situacao: "sem_texto", favorecido: "Amil" }),
    r({ situacao: "erro" }),
  ];
  const s = resumirSondagem(lista);
  it("conta por situação e separa os que tiveram texto", () => {
    expect(s.total).toBe(6);
    expect(s.porSituacao).toMatchObject({ com_regra: 2, so_multa: 1, sem_regra: 1, sem_texto: 1, erro: 1 });
    expect(s.lidos).toBe(4);
  });
  it("as taxas são sobre os LIDOS (escaneado sem texto e erro não puxam a taxa para baixo)", () => {
    expect(s.pctComRegraCompleta).toBe(50);
    expect(s.pctComAlgumaRegra).toBe(75);
    expect(s.semTextoPct).toBe(16.7);
  });
  it("por favorecido, só os lidos, do mais frequente ao menos", () => {
    expect(s.porFavorecido[0]).toEqual({ favorecido: "Claro", anexos: 2, comRegra: 1, pct: 50 });   // empate em anexos: ordem alfabética
    expect(s.porFavorecido[1]).toEqual({ favorecido: "Light", anexos: 2, comRegra: 2, pct: 100 });
    expect(s.porFavorecido.some(f => f.favorecido === "Amil")).toBe(false);
  });
  it("exemplos distintos", () => expect(s.exemplos).toEqual(["multa de 2%", "juros de 1% ao mês"]));
  it("lista vazia não quebra e não inventa taxa", () => {
    const v = resumirSondagem([]);
    expect(v).toMatchObject({ total: 0, lidos: 0, pctComRegraCompleta: null, pctComAlgumaRegra: null, semTextoPct: null });
  });
});

describe("a página é só leitura e só do administrador", () => {
  const arquivos = ["src/pages/SondagemDeRegrasDeAtraso.tsx", "src/services/sondagemDeRegrasService.ts"].map(f => fs.readFileSync(f, "utf8")).join("\n");
  it("não grava nada no banco", () => {
    expect(arquivos).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(arquivos).not.toMatch(/\.rpc\(/);
  });
  it("não guarda o texto dos documentos no resultado (só booleanos e os trechos das regras)", () => {
    const fonte = fs.readFileSync("src/lib/sondagemDeRegras.ts", "utf8");
    const ini = fonte.indexOf("export interface ResultadoDaSondagem {");
    const bloco = fonte.slice(ini, fonte.indexOf("}", ini));
    expect(bloco).not.toMatch(/^\s*texto\w*\??:/m);   // nenhuma PROPRIEDADE de texto (o comentário pode citar a palavra)
    expect(bloco).toContain("trechos: string[]");
  });
  it("a rota fica sob /admin (a guarda por prefixo exige o papel de administração)", () => {
    expect(fs.readFileSync("src/App.tsx", "utf8")).toContain('path="/admin/sondagem-regras-de-atraso"');
    expect(fs.readFileSync("src/components/layout/navConfig.ts", "utf8")).toMatch(/"\/admin":\s+ROLES_ADMIN/);
  });
});
