import { describe, expect, it } from "vitest";
import { agruparPorClasse, resumirAgrupamentos, resumirMedicao, textoDaMedicao, type LinhaParaAgrupar, type RegistroDaMedicao } from "./mesaOfx";
import { favorecidoEfetivo, foiCorrigida, type LinhaDaGrade } from "./gradeOfx";
import type { Sugestao } from "./classificacaoOfx";

const sug = (p: Partial<Sugestao> = {}): Sugestao => ({ confianca: 70, banda: "revisar", motivos: [], ...p });
const l = (fitid: string, memo: string, p: Partial<LinhaParaAgrupar> = {}): LinhaParaAgrupar => ({ fitid, tipo: "entrada", valor: 100, memo, situacao: "nova", sugestao: sug(), ...p });

describe("grupos e segurança da decisão em lote", () => {
  const boa = (p: Partial<Sugestao> = {}) => sug({ banda: "identificada", confianca: 92, categoriaId: "tarifa", centroId: "adm", ...p });
  const tarifa = (id: string, p: Partial<LinhaParaAgrupar> = {}) => l(id, "TARIFA BANCARIA TRANSF PGTO PIX", { tipo: "saida", valor: 6, sugestao: boa(), ...p });

  it("mesma categoria e centro, todas identificadas: grupo SEGURO; números e acento não separam o texto", () => {
    const linhas = [
      l("a", "PIX RECEBIDO REM: CIELO S.A - INSTITUICAO 0109", { valor: 100, sugestao: boa() }),
      l("b", "PIX RECEBIDO REM: CIELO S.A - INSTITUICAO 0209", { valor: 100, sugestao: boa() }),
      l("c", "PIX RECEBIDO REM: Cielo S.A - Instituição 1509", { valor: 100, sugestao: boa() }),
      tarifa("d"),
    ];
    const { grupos, avulsas } = agruparPorClasse(linhas);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ tipo: "entrada", fitids: ["a", "b", "c"], total: 300, por: "texto", seguranca: "seguro" });
    expect(avulsas).toEqual(["d"]);
  });

  it("o CASO DELA: 'PAGTO ELETRON COBRANCA … NET EMPRESA' (categorias e valores diferentes) é INSEGURO", () => {
    const net = (id: string, valor: number, categoriaId: string, centroId: string) =>
      l(id, "PAGTO ELETRON COBRANCA PAG COBRANCA NET EMPRESA", { tipo: "saida", valor, sugestao: sug({ categoriaId, centroId }) });
    const { grupos } = agruparPorClasse([net("1", 37.8, "consumo", "adm"), net("2", 2944, "locacao", "mus"), net("3", 90, "limpeza", "adm"), net("4", 300, "consumo", "com")]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].seguranca).toBe("inseguro");
    expect(grupos[0].motivo).toMatch(/categorias diferentes/);
    expect(resumirAgrupamentos(grupos).inseguros).toEqual({ grupos: 1, linhas: 4 });
  });

  it("mesma categoria mas confiança baixa ou centros diferentes: PARCIAL — nunca seguro", () => {
    const g = (centros: string[], banda: "identificada" | "revisar") => agruparPorClasse(
      centros.map((c, i) => tarifa(`x${i}`, { sugestao: boa({ centroId: c, banda }) }))).grupos[0];
    expect(g(["adm", "adm", "mus"], "identificada")).toMatchObject({ seguranca: "parcial" });
    expect(g(["adm", "adm", "adm"], "revisar")).toMatchObject({ seguranca: "parcial" });
    expect(g(["adm", "adm", "adm"], "identificada")).toMatchObject({ seguranca: "seguro" });
  });

  it("o favorecido vem antes do texto: Light com o mesmo favorecido, categoria e centro agrupa mesmo com textos diferentes", () => {
    const hist = [{ dia: "2026-08-10", valor: 190, categoriaId: "energia" }, { dia: "2026-07-10", valor: 210, categoriaId: "energia" }, { dia: "2026-06-10", valor: 200, categoriaId: "energia" }];
    const light = (id: string, memo: string) => l(id, memo, { tipo: "saida", valor: 200, sugestao: boa({ fornecedor: { id: "f-light", nome: "Light" }, categoriaId: "energia", centroId: "infra", historico: hist }) });
    const { grupos } = agruparPorClasse([light("1", "PAGTO LIGHT 0109"), light("2", "DEB AUTOM LIGHT SERVICOS"), light("3", "BOLETO LIGHT ELETRICIDADE")]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ por: "favorecido", favorecido: "Light", seguranca: "seguro" });
  });

  describe("a mesma pessoa não tem a mesma natureza (pedido dela, 08/10/2026)", () => {
    const maria = { id: "p-maria", nome: "Maria" };
    const dizimo = (valor: number) => ({ dia: "2026-08-01", valor, categoriaId: "dizimo" });
    const oferta = (valor: number) => ({ dia: "2026-08-15", valor, categoriaId: "oferta" });
    const pix = (id: string, valor: number, p: Partial<Sugestao> = {}) =>
      l(id, "PIX RECEBIDO REM: MARIA " + id, { valor, sugestao: sug({ pessoa: maria, banda: "identificada", confianca: 95, categoriaId: "dizimo", centroId: "adm", historico: [dizimo(valor), dizimo(valor), dizimo(valor)], ...p }) });

    it("🟢 mesma pessoa, mesmo valor, mesma categoria histórica: seguro", () => {
      expect(agruparPorClasse([pix("1", 200), pix("2", 200), pix("3", 200)]).grupos[0]).toMatchObject({ por: "favorecido", seguranca: "seguro" });
    });
    it("🟡 mesma pessoa, VALORES diferentes: parcial — nunca lote", () => {
      const g = agruparPorClasse([pix("1", 200), pix("2", 20, { historico: [dizimo(200), dizimo(200), dizimo(20)] }), pix("3", 200)]).grupos[0];
      expect(g.seguranca).toBe("parcial");
      expect(g.motivo).toMatch(/valores diferentes/);
    });
    it("valor sem precedente no histórico dela: parcial", () => {
      const g = agruparPorClasse([pix("1", 50, { historico: [dizimo(200), dizimo(200), dizimo(200)] }), pix("2", 50, { historico: [dizimo(200), dizimo(200), dizimo(200)] }), pix("3", 50, { historico: [dizimo(200), dizimo(200), dizimo(200)] })]).grupos[0];
      expect(g.seguranca).toBe("parcial");
      expect(g.motivo).toMatch(/sem precedente/);
    });
    it("🔴 o histórico dela mistura dízimo e oferta: inseguro, mesmo com o mesmo valor", () => {
      const mista = { historico: [dizimo(200), oferta(20), dizimo(200)] };
      const g = agruparPorClasse([pix("1", 200, mista), pix("2", 200, mista), pix("3", 200, mista)]).grupos[0];
      expect(g.seguranca).toBe("inseguro");
      expect(g.motivo).toMatch(/mistura categorias/);
    });
    it("🔴 ,10 em parte das linhas: cada uma tem natureza própria", () => {
      const g = agruparPorClasse([pix("1", 200), pix("2", 50.1, { possivelMissoes: true, banda: "revisar", confianca: 70 }), pix("3", 200)]).grupos[0];
      expect(g.seguranca).toBe("inseguro");
      expect(g.motivo).toMatch(/,10/);
    });
    it("🟡 histórico curto não basta", () => {
      const g = agruparPorClasse([pix("1", 200, { historico: [dizimo(200)] }), pix("2", 200, { historico: [dizimo(200)] }), pix("3", 200, { historico: [dizimo(200)] })]).grupos[0];
      expect(g.seguranca).toBe("parcial");
    });
  });

  it("texto genérico (boleto serve a vários favorecidos) é inseguro, e valores muito distantes sem favorecido não são seguros", () => {
    const gen = agruparPorClasse([tarifa("1", { sugestao: boa({ generico: true }) }), tarifa("2"), tarifa("3")]).grupos[0];
    expect(gen.seguranca).toBe("inseguro");
    const dist = agruparPorClasse([tarifa("1", { valor: 5 }), tarifa("2", { valor: 50 }), tarifa("3", { valor: 500 })]).grupos[0];
    expect(dist.seguranca).not.toBe("seguro");
  });

  it("não agrupa transferência, entrada com saída, nem linha que não é nova; menos de 3 não é grupo", () => {
    const mesmo = (id: string, p: Partial<LinhaParaAgrupar> = {}) => l(id, "DEP DINHEIRO ATM AG MAQ SEQ", { sugestao: boa(), ...p });
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { tipo: "saida" })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { situacao: "ja_registrada" })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3", { sugestao: sug({ transferencia: true }) })]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2")]).grupos).toHaveLength(0);
    expect(agruparPorClasse([mesmo("1"), mesmo("2"), mesmo("3")]).grupos).toHaveLength(1);
  });

  it("o grupo mais numeroso vem primeiro", () => {
    const g = (p: string, n: number) => Array.from({ length: n }, (_, i) => l(`${p}${i}`, `TEXTO ${p.repeat(4)}`, { sugestao: boa() }));
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

describe("depósito em dinheiro nunca é lote de receita (pedido dela, 08/10/2026)", () => {
  it("'DEP DINHEIRO ATM' repetido é inseguro: pode ser o caixa/envelope indo para o banco", () => {
    const dep = (id: string, valor: number) => l(id, `DEP DINHEIRO ATM AG00448MAQ007616SEQ0${id}`, { valor, sugestao: sug({ banda: "identificada", confianca: 90, categoriaId: "oferta", centroId: "adm" }) });
    const g = agruparPorClasse([dep("1", 535), dep("2", 345), dep("3", 500), dep("4", 250)]).grupos[0];
    expect(g.seguranca).toBe("inseguro");
    expect(g.motivo).toMatch(/transferência interna/);
  });
});
