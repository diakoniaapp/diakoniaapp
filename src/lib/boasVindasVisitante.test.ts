import { describe, expect, it } from "vitest";
import {
  BOAS_VINDAS_PADRAO, completarCanais, descreverQuando, fecharCanal, lerRespostaPublica, normalizarUrl, numeroDoWhatsApp, paraPublica,
  problemasDaConfig, urlValida, type ConfigBoasVindas,
} from "./boasVindasVisitante";

const base = (extra: Partial<ConfigBoasVindas> = {}): ConfigBoasVindas => ({
  titulo: "Cadastro realizado com sucesso", mensagem: "Bem-vindo", banner_url: null, canais: completarCanais([]), links: [],
  eventos_mostrar: true, eventos_titulo: "Venha nos visitar de novo", eventos_max: 4, eventos: [], ...extra,
});

describe("endereços", () => {
  it("só http(s) com domínio vira botão", () => {
    expect(urlValida("https://qibrj.org.br")).toBe(true);
    expect(urlValida("javascript:alert(1)")).toBe(false);
    expect(urlValida("data:text/html,x")).toBe(false);
    expect(urlValida("https://sem espaco.com")).toBe(false);
    expect(urlValida("https://localhost")).toBe(false);
  });
  it("entende @, nome da página, endereço sem https e telefone", () => {
    expect(normalizarUrl("instagram", "@qibrj")).toBe("https://www.instagram.com/qibrj/");
    expect(normalizarUrl("instagram", "qibrj")).toBe("https://www.instagram.com/qibrj/");
    expect(normalizarUrl("instagram", "instagram.com/qibrj")).toBe("https://instagram.com/qibrj");
    expect(normalizarUrl("facebook", "qibrj")).toBe("https://www.facebook.com/qibrj/");
    expect(normalizarUrl("youtube", "@qibrj")).toBe("https://www.youtube.com/@qibrj");
    expect(normalizarUrl("site", "www.qibrj.org.br")).toBe("https://www.qibrj.org.br");
    expect(normalizarUrl("site", "https://qibrj.org.br/")).toBe("https://qibrj.org.br/");
    expect(normalizarUrl("site", "qibrj")).toBe("");
    expect(normalizarUrl("site", "javascript:alert(1)")).toBe("");
    expect(normalizarUrl("site", "")).toBe("");
  });
  it("WhatsApp: telefone vira wa.me com 55; mensagem opcional; número impossível é recusado", () => {
    expect(normalizarUrl("whatsapp", "(21) 99999-0000")).toBe("https://wa.me/5521999990000");
    expect(normalizarUrl("whatsapp", "+55 21 99999-0000", "Olá, estive aí")).toBe("https://wa.me/5521999990000?text=Ol%C3%A1%2C%20estive%20a%C3%AD");
    expect(normalizarUrl("whatsapp", "wa.me/5521999990000")).toBe("https://wa.me/5521999990000");
    expect(normalizarUrl("whatsapp", "12345")).toBe("");
    expect(numeroDoWhatsApp("https://wa.me/5521999990000?text=oi")).toBe("21999990000");
  });
});

describe("a configuração", () => {
  it("os cinco canais estão sempre lá, na ordem, e os que faltam nascem desligados", () => {
    const c = completarCanais([{ tipo: "youtube", url: "https://youtube.com/@x", ativo: true }]);
    expect(c.map(x => x.tipo)).toEqual(["instagram", "facebook", "youtube", "site", "whatsapp"]);
    expect(c.filter(x => x.ativo).map(x => x.tipo)).toEqual(["youtube"]);
  });
  it("canal ligado sem endereço utilizável impede salvar; desligado não", () => {
    const canais = completarCanais([{ tipo: "site", url: "qibrj", ativo: true }]);
    expect(problemasDaConfig(base({ canais })).join(" ")).toMatch(/Site/);
    expect(problemasDaConfig(base())).toEqual([]);
    expect(problemasDaConfig(base({ titulo: " " })).join(" ")).toMatch(/título/);
  });
  it("link e encontro ligados precisam de texto e de endereço válido", () => {
    expect(problemasDaConfig(base({ links: [{ rotulo: "", url: "x", ativo: true }] })).length).toBe(2);
    expect(problemasDaConfig(base({ links: [{ rotulo: "Ministérios", url: "qibrj.org.br/ministerios", ativo: true }] }))).toEqual([]);
    expect(problemasDaConfig(base({ eventos: [{ titulo: "", quando: "", data: "", local: "", link: "", ativo: true }] })).join(" ")).toMatch(/nome do encontro/);
    expect(problemasDaConfig(base({ eventos: [{ titulo: "Culto", quando: "", data: "", local: "", link: "javascript:x", ativo: true }] })).join(" ")).toMatch(/link/);
  });
});

describe("o que o visitante vê (a prévia repete o banco)", () => {
  const hoje = "2026-10-08";
  it("só canais ligados e com endereço; só encontros que não passaram; respeita o máximo e a ordem", () => {
    const canais = completarCanais([
      { tipo: "instagram", url: "@qibrj", ativo: true }, { tipo: "facebook", url: "qibrj", ativo: false },
      { tipo: "site", url: "qibrj", ativo: true }, { tipo: "whatsapp", numero: "(21) 99999-0000", url: "", ativo: true },
    ]);
    const eventos = [
      { titulo: "Já passou", quando: "", data: "2026-10-07", local: "", link: "", ativo: true },
      { titulo: "Hoje", quando: "hoje", data: hoje, local: "Templo", link: "javascript:x", ativo: true },
      { titulo: "Desligado", quando: "", data: "2026-10-20", local: "", link: "", ativo: false },
      { titulo: "Fixo", quando: "Domingos, 10h30", data: "", local: "", link: "qibrj.org.br/cultos", ativo: true },
      { titulo: "Passa do máximo", quando: "", data: "2026-10-30", local: "", link: "", ativo: true },
    ];
    const p = paraPublica(base({ canais, eventos, eventos_max: 2 }), hoje);
    expect(p.canais.map(c => c.tipo)).toEqual(["instagram", "whatsapp"]);
    expect(p.canais[1].url).toBe("https://wa.me/5521999990000");
    expect(p.eventos.map(e => e.titulo)).toEqual(["Hoje", "Fixo"]);
    expect(p.eventos[0].link).toBeNull();
    expect(p.eventos[1].link).toBe("https://qibrj.org.br/cultos");
  });
  it("encontros desligados somem; banner perigoso não passa", () => {
    expect(paraPublica(base({ eventos_mostrar: false, eventos: [{ titulo: "X", quando: "", data: "", local: "", link: "", ativo: true }] }), hoje).eventos).toEqual([]);
    expect(paraPublica(base({ banner_url: "javascript:alert(1)" }), hoje).banner_url).toBeNull();
    expect(paraPublica(base({ banner_url: "https://x.supabase.co/a.webp" }), hoje).banner_url).toBe("https://x.supabase.co/a.webp");
  });
  it("a resposta do banco fora do formato cai no padrão, sem quebrar a tela", () => {
    expect(lerRespostaPublica(null)).toEqual(BOAS_VINDAS_PADRAO);
    expect(lerRespostaPublica("lixo")).toEqual(BOAS_VINDAS_PADRAO);
    const r = lerRespostaPublica({ titulo: "T", mensagem: "M", canais: [{ tipo: "instagram", url: "https://i.com/x" }, { tipo: "tiktok", url: "https://t.com/x" }, { tipo: "site", url: "javascript:x" }], eventos: [{ titulo: "E", link: "javascript:x" }] });
    expect(r.canais).toEqual([{ tipo: "instagram", url: "https://i.com/x" }]);
    expect(r.eventos[0]).toMatchObject({ titulo: "E", link: null });
  });
});

describe("quando", () => {
  it("dia da semana, dia/mês e hora", () => {
    expect(descreverQuando("2026-10-10", "19:00:00")).toBe("sábado, 10/10 às 19h");
    expect(descreverQuando("2026-10-11", "10:30:00")).toBe("domingo, 11/10 às 10h30");
    expect(descreverQuando("2026-10-11", null)).toBe("domingo, 11/10");
    expect(descreverQuando("", "10:00:00")).toBe("");
  });
  it("fecharCanal monta o WhatsApp a partir do número e da mensagem", () => {
    expect(fecharCanal({ tipo: "whatsapp", url: "", ativo: true, numero: "21999990000", mensagem: "oi" }).url).toBe("https://wa.me/5521999990000?text=oi");
  });
});
