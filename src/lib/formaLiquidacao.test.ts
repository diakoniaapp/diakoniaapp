import { describe, expect, it } from "vitest";
import {
  acharDebitoCompativel, ehAutomatica, indicadoresDeDebitos, normalizarLiquidacao, palavrasEmComum,
  situacaoDoDebito, type CandidatoDebito,
} from "./formaLiquidacao";

describe("forma de liquidação", () => {
  it("valor desconhecido ou ausente (antes da migration) vira manual", () => {
    expect(normalizarLiquidacao(undefined)).toBe("manual");
    expect(normalizarLiquidacao(null)).toBe("manual");
    expect(normalizarLiquidacao("cheque")).toBe("manual");
    expect(normalizarLiquidacao("debito_automatico")).toBe("debito_automatico");
  });
  it("só as formas em que o banco executa sozinho são 'automáticas'", () => {
    expect(ehAutomatica("debito_automatico")).toBe(true);
    expect(ehAutomatica("pix_recorrente")).toBe(true);
    expect(ehAutomatica("transferencia_programada")).toBe(true);
    expect(ehAutomatica("manual")).toBe(false);
    expect(ehAutomatica("boleto_fatura")).toBe(false);
    expect(ehAutomatica(undefined)).toBe(false);
  });
});

describe("situação do débito", () => {
  it("aguarda até 3 dias depois do vencimento (fim de semana); depois vira não encontrado", () => {
    const d = { status: "previsto", data: "2026-10-05" };
    expect(situacaoDoDebito(d, "2026-10-05")).toBe("aguardando");
    expect(situacaoDoDebito(d, "2026-10-08")).toBe("aguardando");
    expect(situacaoDoDebito(d, "2026-10-09")).toBe("nao_encontrado");
  });
  it("realizado/conciliado = encontrado; cancelado/aguardando aprovação não contam", () => {
    expect(situacaoDoDebito({ status: "conciliado", data: "2026-10-05" }, "2026-10-06")).toBe("encontrado");
    expect(situacaoDoDebito({ status: "realizado", data: "2026-10-05" }, "2026-10-06")).toBe("encontrado");
    expect(situacaoDoDebito({ status: "cancelado", data: "2026-10-05" }, "2026-10-06")).toBeNull();
    expect(situacaoDoDebito({ status: "aguardando_aprovacao", data: "2026-10-05" }, "2026-10-06")).toBeNull();
  });
});

describe("indicadores de débitos do mês", () => {
  const itens = [
    { id: "1", data: "2026-10-05", valor: 2821.46, status: "conciliado" },
    { id: "2", data: "2026-10-05", valor: 100, status: "previsto" },   // venceu há 1 dia: ainda aguardando
    { id: "3", data: "2026-10-01", valor: 300.5, status: "previsto" }, // venceu há 5: não encontrado
    { id: "4", data: "2026-10-20", valor: 50, status: "previsto" },    // futuro: aguardando
    { id: "5", data: "2026-10-05", valor: 999, status: "cancelado" },  // ignorado
  ];
  it("conta previstos, encontrados, não encontrados e os valores", () => {
    expect(indicadoresDeDebitos(itens, "2026-10-06")).toEqual({
      previstos: 4, encontrados: 1, naoEncontrados: 1, aguardando: 2,
      valorPrevisto: 3271.96, valorDebitado: 2821.46,
    });
  });
});

describe("palavras em comum entre o extrato e o cadastro", () => {
  it("ignora o ruído do banco e casa começo de palavra", () => {
    expect(palavrasEmComum("DEB AUT AMIL ASSISTENCIA MEDICA", "Amil")).toEqual(["amil"]);
    expect(palavrasEmComum("PIX ENVIADO DES CLARO S A", "Claro")).toEqual(["claro"]);
    expect(palavrasEmComum("TARIFA BANCARIA CESTA", "Amil")).toEqual([]);
  });
});

describe("acharDebitoCompativel", () => {
  const amil: CandidatoDebito = { id: "amil", data: "2026-10-05", valor: 2821.46, status: "previsto", descricao: "Amil", fornecedor: "Amil Assistência Médica" };
  const luz: CandidatoDebito = { id: "luz", data: "2026-10-10", valor: 800, status: "previsto", descricao: "Energia", fornecedor: "Light", variavel: true };

  it("o exemplo dela: AMIL R$ 2.821,46 → débito automático encontrado, confiança alta", () => {
    const r = acharDebitoCompativel({ data: "2026-10-05", valor: 2821.46, memo: "AMIL ASSISTENCIA MEDICA" }, [amil, luz]);
    expect(r?.candidato.id).toBe("amil");
    expect(r!.confianca).toBeGreaterThanOrEqual(95);
    expect(r!.motivos.join(" ")).toMatch(/valor igual/);
  });

  it("débito um dia depois do vencimento ainda casa; seis dias depois, não", () => {
    expect(acharDebitoCompativel({ data: "2026-10-06", valor: 2821.46, memo: "AMIL" }, [amil])?.candidato.id).toBe("amil");
    expect(acharDebitoCompativel({ data: "2026-10-11", valor: 2821.46, memo: "AMIL" }, [amil])).toBeNull();
  });

  it("conta fixa exige valor igual; centavo a menos não casa", () => {
    expect(acharDebitoCompativel({ data: "2026-10-05", valor: 2821.45, memo: "AMIL" }, [amil])).toBeNull();
  });

  it("conta variável aceita ±35% — mas só com nome em comum", () => {
    expect(acharDebitoCompativel({ data: "2026-10-10", valor: 950, memo: "LIGHT SERVICOS DE ELETRICIDADE" }, [luz])?.candidato.id).toBe("luz");
    expect(acharDebitoCompativel({ data: "2026-10-10", valor: 950, memo: "DEB AUT OUTRA EMPRESA" }, [luz])).toBeNull();
    expect(acharDebitoCompativel({ data: "2026-10-10", valor: 2000, memo: "LIGHT" }, [luz])).toBeNull();
  });

  it("valor igual sem nome em comum: sugere, mas com confiança de revisão (<85)", () => {
    const r = acharDebitoCompativel({ data: "2026-10-05", valor: 2821.46, memo: "DEB AUT 123456" }, [amil]);
    expect(r?.candidato.id).toBe("amil");
    expect(r!.confianca).toBeLessThan(85);
  });

  it("dois candidatos de mesmo valor: o nome decide; sem nome, ninguém", () => {
    const outro: CandidatoDebito = { ...amil, id: "bradesco-saude", descricao: "Bradesco Saúde", fornecedor: "Bradesco Seguros" };
    expect(acharDebitoCompativel({ data: "2026-10-05", valor: 2821.46, memo: "AMIL ASSISTENCIA" }, [amil, outro])?.candidato.id).toBe("amil");
    expect(acharDebitoCompativel({ data: "2026-10-05", valor: 2821.46, memo: "DEB AUT 998877" }, [amil, outro])).toBeNull();
  });

  it("só considera quem ainda está previsto", () => {
    expect(acharDebitoCompativel({ data: "2026-10-05", valor: 2821.46, memo: "AMIL" }, [{ ...amil, status: "conciliado" }])).toBeNull();
  });
});
