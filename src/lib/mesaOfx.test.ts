import { describe, expect, it } from "vitest";
import { agruparPorClasse, resumirMedicao, textoDaMedicao, type LinhaParaAgrupar, type RegistroDaMedicao } from "./mesaOfx";
import { favorecidoEfetivo, foiCorrigida, type LinhaDaGrade } from "./gradeOfx";
import type { Sugestao } from "./classificacaoOfx";

const sug = (p: Partial<Sugestao> = {}): Sugestao => ({ confianca: 70, banda: "revisar", motivos: [], ...p });
const l = (fitid: string, memo: string, p: Partial<LinhaParaAgrupar> = {}): LinhaParaAgrupar => ({ fitid, tipo: "entrada", valor: 100, memo, situacao: "nova", sugestao: sug(), ...p });

describe("grupos por padrão do texto do banco", () => {
  it("3 ou mais do mesmo texto, sem favorecido, viram um grupo; números e acento não separam", () => {
    const linhas = [
      l("a", "PIX RECEBIDO REM: CIELO S.A - INSTITUICAO 0109", { valor: 100 }),
      l("b", "PIX RECEBIDO REM: CIELO S.A - INSTITUICAO 0209", { valor: 250 }),
      l("c", "PIX RECEBIDO REM: Cielo S.A - Instituição 1509", { valor: 50 }),
      l("d", "TARIFA BANCARIA TRANSF PGTO PIX", { tipo: "saida" }),
    ];
    const { grupos, avulsas } = agruparPorClasse(linhas);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ tipo: "entrada", fitids: ["a", "b", "c"], total: 400 });
    expect(avulsas).toEqual(["d"]);
  });
  it("não agrupa quem tem favorecido, transferência, entrada com saída, nem linha que não é nova", () => {
    const quem = sug({ pessoa: { id: "p", nome: "Maria" } });
    const mesmo = (id: string, p: Partial<LinhaParaAgrupar> = {}) => l(id, "DEP DINHEIRO ATM AG MAQ SEQ", p);
    expect(agruparPorClasse([mesmo("1", { sugestao: quem }), mesmo("2", { sugestao: quem }), mesmo("3", { sugestao: quem })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { tipo: "saida" })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { situacao: "ja_registrada" })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { sugestao: sug({ transferencia: true }) })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3")]).grupos).toHaveLength(1);
  });
  it("o grupo mais numeroso vem primeiro", () => {
    const g = (p: string, n: number) => Array.from({ length: n }, (_, i) => l(`${p}${i}`, `TEXTO ${p.repeat(4)}`));
    expect(agruparPorClasse([...g("a", 3), ...g("b", 5)]).grupos.map(x => x.fitids.length)).toEqual([5, 3]);
  });
});

describe("favorecido e correção na linha", () => {
  const linha: LinhaDaGrade = { fitid: "x", situacao: "nova", sugestao: sug({ pessoa: { id: "p1", nome: "Maria" }, categoriaId: "diz", centroId: "c1" }) };
  it("o favorecido efetivo é o escolhido na linha; null limpa; sem edição vale o sugerido", () => {
    expect(favorecidoEfetivo(linha)).toEqual({ pessoa: { id: "p1", nome: "Maria" } });
    expect(favorecidoEfetivo(linha, { favorecido: { tipo: "fornecedor", id: "f1", nome: "Light" } })).toEqual({ fornecedor: { id: "f1", nome: "Light" } });
    expect(favorecidoEfetivo(linha, { favorecido: null })).toEqual({});
  });
  it("só conta como correção o que MUDA o que foi sugerido", () => {
    expect(foiCorrigida(linha)).toBe(false);
    expect(foiCorrigida(linha, { categoriaId: "diz", centroId: "c1" })).toBe(false);
    expect(foiCorrigida(linha, { categoriaId: "ofe" })).toBe(true);
    expect(foiCorrigida(linha, { centroId: "c2" })).toBe(true);
    expect(foiCorrigida(linha, { favorecido: { tipo: "pessoa", id: "p1", nome: "Maria" } })).toBe(false);
    expect(foiCorrigida(linha, { favorecido: { tipo: "pessoa", id: "p2", nome: "Outra" } })).toBe(true);
    expect(foiCorrigida(linha, { favorecido: null })).toBe(true);
  });
});

describe("medição da rodada", () => {
  const aoAbrir = { identificadas: 6, revisar: 3, naoIdentificadas: 1, jaRegistradas: 2, conciliar: 0, debitos: 1, documentos: 1, transferencias: 0 };
  const reg = (banda: RegistroDaMedicao["banda"], desfecho: RegistroDaMedicao["desfecho"], p: Partial<RegistroDaMedicao> = {}): RegistroDaMedicao => ({ banda, desfecho, ...p });
  it("conta aceitas, corrigidas, manuais e pendentes; erro de 'identificada' = correção nela", () => {
    const m = resumirMedicao(aoAbrir, 15, 10, [
      reg("identificada", "aceita"), reg("identificada", "aceita"), reg("identificada", "corrigida"),
      reg("revisar", "aceita", { possivelMissoes: true }), reg("revisar", "corrigida"), reg("nao_identificada", "manual"), reg("revisar", "ignorada", { emGrupo: true }),
    ]);
    expect(m.resolvidas).toMatchObject({ aceitasSemMudar: 3, aceitasEmIdentificadas: 2, aceitasEmRevisar: 1, corrigidas: 2, manuais: 1, ignoradas: 1, viaGrupo: 1 });
    expect(m.pendentes).toBe(3);
    expect(m.errosNaIdentificada).toBe(1);
    expect(m.missoes).toEqual({ sugeridas: 1, confirmadas: 1 });
  });
  it("o relatório traz as três pilhas do motor e o que a tesouraria fez", () => {
    const t = textoDaMedicao(resumirMedicao(aoAbrir, 15, 10, [reg("identificada", "aceita")]), "setembro");
    expect(t).toMatch(/setembro/);
    expect(t).toMatch(/identificados automaticamente: 6 \(60%/);
    expect(t).toMatch(/precisam de revisão: 3 \(30%/);
    expect(t).toMatch(/não identificados: 1 \(10%/);
    expect(t).toMatch(/aceitou a sugestão sem mudar nada: 1/);
    expect(t).toMatch(/ainda pendentes: 9/);
  });
});
