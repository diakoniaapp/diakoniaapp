// ─── Testes do convite ─────────────────────────────────────────────────────
//
// Esta mensagem sai do sistema e vai para o WhatsApp de gente da igreja,
// assinada por uma pessoa da liderança. Um erro aqui não é um pixel torto: é
// a pastora assinando com o tratamento errado, ou o convite de um culto
// híbrido sem dizer que há transmissão.

import { describe, it, expect } from "vitest";
import {
  montarConvite, saudacaoDoHorario, tratamento, assinatura,
  dataPorExtenso, atalhoDoCanal,
} from "./convite";

const as = (h: number) => new Date(2026, 8, 2, h, 0, 0);

describe("saudacaoDoHorario", () => {
  it("muda com o relógio", () => {
    expect(saudacaoDoHorario(as(8))).toBe("Bom dia");
    expect(saudacaoDoHorario(as(14))).toBe("Boa tarde");
    expect(saudacaoDoHorario(as(21))).toBe("Boa noite");
  });

  it("a madrugada é boa noite, e não bom dia", () => {
    expect(saudacaoDoHorario(as(3))).toBe("Boa noite");
    expect(saudacaoDoHorario(as(5))).toBe("Bom dia");
  });
});

describe("tratamento", () => {
  it("flexiona com o sexo", () => {
    expect(tratamento("Pastor", "masculino")).toBe("Pr.");
    expect(tratamento("Pastor", "feminino")).toBe("Pra.");
    expect(tratamento("Diácono", "masculino")).toBe("Diác.");
    expect(tratamento("Diácono", "feminino")).toBe("Diaconisa");
  });

  it("cala quando não sabe o sexo — assinar errado é pior que não tratar", () => {
    // O rótulo em funcaoMinisterial.ts é "Pastor", sem flexão: usá-lo cru
    // assinaria "Pastor Maria".
    expect(tratamento("Pastor", null)).toBe("");
    expect(tratamento("Pastor", undefined)).toBe("");
  });

  it("cala para funções que não têm tratamento", () => {
    expect(tratamento("Tesoureiro", "masculino")).toBe("");
    expect(tratamento(null, "masculino")).toBe("");
  });
});

describe("assinatura", () => {
  it("junta tratamento, nome e igreja", () => {
    expect(assinatura({
      nome: "Lúcio Paulo", funcao: "Pastor", sexo: "masculino",
      igreja: "Quarta Igreja Batista do Rio de Janeiro",
    })).toBe("Pr. Lúcio Paulo | Quarta Igreja Batista do Rio de Janeiro");
  });

  it("sem tratamento conhecido, assina só o nome", () => {
    expect(assinatura({ nome: "Telma Rodrigues", igreja: "QIBRJ" }))
      .toBe("Telma Rodrigues | QIBRJ");
  });

  it("sem nome, assina a igreja — nunca uma linha vazia", () => {
    expect(assinatura({ igreja: "QIBRJ" })).toBe("QIBRJ");
    expect(assinatura({})).toBe("");
  });
});

describe("dataPorExtenso", () => {
  it("põe o dia da semana antes, que é como se planeja", () => {
    expect(dataPorExtenso("2026-09-02")).toBe("quarta-feira, 02/09/2026");
  });

  it("não escorrega de dia por causa do fuso", () => {
    // `new Date("2026-01-01")` seria meia-noite UTC, 21h de 31/12 em Brasília.
    expect(dataPorExtenso("2026-01-01")).toContain("01/01/2026");
  });
});

describe("atalhoDoCanal", () => {
  it("transforma o canal no endereço permanente da transmissão", () => {
    expect(atalhoDoCanal("https://www.youtube.com/@qibrj")).toBe("https://www.youtube.com/@qibrj/live");
    expect(atalhoDoCanal("https://www.youtube.com/@qibrj/")).toBe("https://www.youtube.com/@qibrj/live");
  });

  it("não mexe no que já é /live", () => {
    expect(atalhoDoCanal("https://www.youtube.com/@qibrj/live")).toBe("https://www.youtube.com/@qibrj/live");
  });

  it("recusa o que não é canal — um link de vídeo não vira transmissão", () => {
    expect(atalhoDoCanal("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(atalhoDoCanal("https://www.instagram.com/qibrj/")).toBeNull();
    expect(atalhoDoCanal(null)).toBeNull();
  });
});

describe("montarConvite", () => {
  const base = {
    titulo: "Palestra | MINISTÉRIO CELEBRANDO A TRANSFORMAÇÃO",
    data: "2026-09-02",
    horaInicio: "19:30:00",
    horaFim: "20:30:00",
    local: "Templo Principal",
    quemAssina: {
      nome: "Lúcio Paulo", funcao: "Pastor", sexo: "masculino",
      igreja: "Quarta Igreja Batista do Rio de Janeiro",
    },
    agora: as(9),
  };

  it("presencial: saudação, evento, local, fecho e assinatura", () => {
    expect(montarConvite(base)).toBe(
      [
        "Bom dia! Graça e paz. 🙏",
        "Tenho um convite especial para você:",
        "",
        "📅 *Palestra | MINISTÉRIO CELEBRANDO A TRANSFORMAÇÃO*",
        "quarta-feira, 02/09/2026, das 19:30 às 20:30",
        "📍 Templo Principal",
        "",
        "Será uma alegria ter você conosco! 🙏",
        "",
        "Pr. Lúcio Paulo | Quarta Igreja Batista do Rio de Janeiro",
      ].join("\n"),
    );
  });

  it("híbrido: diz as duas formas de participar", () => {
    const m = montarConvite({
      ...base, transmitido: true,
      urlTransmissao: "https://www.youtube.com/@qibrj/live",
    });
    expect(m).toContain("📍 Templo Principal");
    expect(m).toContain("📺 Ao vivo pelo YouTube: https://www.youtube.com/@qibrj/live");
    expect(m).toContain("presencialmente ou pela transmissão");
  });

  it("só online: não promete presença", () => {
    const m = montarConvite({
      ...base, local: null, transmitido: true,
      urlTransmissao: "https://www.youtube.com/@qibrj/live",
    });
    expect(m).not.toContain("📍");
    expect(m).toContain("conosco na transmissão");
  });

  it("transmissão programada convida a ativar o lembrete", () => {
    const m = montarConvite({
      ...base, transmitido: true, urlEhProgramada: true,
      urlTransmissao: "https://www.youtube.com/watch?v=abc",
    });
    expect(m).toContain("ative o lembrete");
  });

  it("marcado como transmitido mas sem endereço não inventa linha", () => {
    const m = montarConvite({ ...base, transmitido: true, urlTransmissao: null });
    expect(m).not.toContain("📺");
  });

  it("a saudação acompanha a hora do envio", () => {
    expect(montarConvite({ ...base, agora: as(20) })).toContain("Boa noite! Graça e paz.");
  });

  it("sem hora de fim, não inventa intervalo", () => {
    const m = montarConvite({ ...base, horaFim: null });
    expect(m).toContain("quarta-feira, 02/09/2026, às 19:30");
    expect(m).not.toContain("às 20:30");
  });
});
