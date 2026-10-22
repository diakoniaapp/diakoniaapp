import { describe, expect, it } from "vitest";
import { diasEntre, situacaoPelaEtapa, situacaoPelosFatos, textoDoVisitante } from "@/lib/mensagemDoVisitante";
import { CONFIG_PADRAO, SITUACOES, modeloPadrao, type PacoteDeMensagens } from "@/lib/mensagensVisitante";
import { sanearConfig, sanearIdentidade, sanearModelo } from "../../supabase/functions/_shared/mensagensVisitante/sanear";

const pacote = (o: Partial<PacoteDeMensagens> = {}): PacoteDeMensagens => ({
  config: { ...CONFIG_PADRAO, assinatura: "Equipe" },
  igreja: { nome: "QIBRJ", site: "", redes: [], endereco: "", telefone: "", email: "" },
  modelos: SITUACOES.map(s => modeloPadrao(s, "whatsapp")),
  eventos: [{ titulo: "Culto de Oração", quando: "quarta-feira" }],
  ...o,
});

describe("situação do visitante nas telas de envio", () => {
  it("pela etapa do fluxo: voltou = segunda visita; sumiu = não retornou; o resto é primeira visita (ou a faixa de idade)", () => {
    expect(situacaoPelaEtapa("retornou", null, "2026-10-22")).toBe("segunda_visita");
    expect(situacaoPelaEtapa("nao_voltou", null, "2026-10-22")).toBe("nao_retornou");
    expect(situacaoPelaEtapa("boas_vindas", null, "2026-10-22")).toBe("primeira_visita");
    expect(situacaoPelaEtapa("em_acompanhamento", null, "2026-10-22")).toBe("primeira_visita");
    expect(situacaoPelaEtapa("incentivo", "2018-05-01", "2026-10-22")).toBe("infantil");
    expect(situacaoPelaEtapa("cuidado", "2005-05-01", "2026-10-22")).toBe("jovem");
    expect(situacaoPelaEtapa("retornou", "2018-05-01", "2026-10-22")).toBe("segunda_visita");   // a idade só decide na primeira visita
  });
  it("pelos fatos do check-in, com o prazo da configuração", () => {
    expect(situacaoPelosFatos({ numeroDeVisitas: 1, diasDesdeAUltimaVisita: 2, hoje: "2026-10-22" }, 15)).toBe("primeira_visita");
    expect(situacaoPelosFatos({ numeroDeVisitas: 2, diasDesdeAUltimaVisita: 2, hoje: "2026-10-22" }, 15)).toBe("segunda_visita");
    expect(situacaoPelosFatos({ numeroDeVisitas: 1, diasDesdeAUltimaVisita: 20, hoje: "2026-10-22" }, 15)).toBe("nao_retornou");
    expect(situacaoPelosFatos({ numeroDeVisitas: 1, diasDesdeAUltimaVisita: 20, hoje: "2026-10-22" }, 30)).toBe("primeira_visita");
  });
  it("diasEntre: inteiros, nunca negativos", () => {
    expect(diasEntre("2026-10-20", "2026-10-22")).toBe(2);
    expect(diasEntre("2026-10-22", "2026-10-22")).toBe(0);
    expect(diasEntre("2026-10-25", "2026-10-22")).toBe(0);
    expect(diasEntre("2026-09-30", "2026-10-01")).toBe(1);
  });
});

describe("o texto que a equipe manda", () => {
  it("vem da configuração, personalizado, com os eventos da agenda", () => {
    const t = textoDoVisitante(pacote(), "primeira_visita", { nome: "Maria da Silva", culto: "Culto da Manhã" })!;
    expect(t).toContain("Olá, Maria! 😊 Que alegria receber você na QIBRJ!");
    expect(t).toContain("• Culto de Oração – quarta-feira");
    expect(t.endsWith("Equipe")).toBe(true);
  });
  it("sem configuração (null), ou com o modelo desligado, devolve null: a tela usa o texto antigo", () => {
    expect(textoDoVisitante(null, "primeira_visita", { nome: "A B" })).toBeNull();
    expect(textoDoVisitante(undefined, "primeira_visita", { nome: "A B" })).toBeNull();
    const desligado = pacote({ modelos: SITUACOES.map(s => ({ ...modeloPadrao(s, "whatsapp"), ativo: s !== "jovem" })) });
    expect(textoDoVisitante(desligado, "jovem", { nome: "A B" })).toBeNull();
    expect(textoDoVisitante(desligado, "infantil", { nome: "Pedrinho" })).toContain("Pedrinho");
  });
  it("o e-mail tem o seu próprio modelo: pedir e-mail sem modelo de e-mail devolve null", () => {
    expect(textoDoVisitante(pacote(), "primeira_visita", { nome: "A B" }, "email")).toBeNull();
  });
});

describe("o rascunho que chega à função do e-mail de teste", () => {
  it("modelo: tipos e tamanhos reduzidos ao que o banco aceita; situação/canal desconhecidos são recusados", () => {
    expect(sanearModelo({ situacao: "inventada", canal: "email" })).toBeNull();
    expect(sanearModelo({ situacao: "jovem", canal: "fax" })).toBeNull();
    expect(sanearModelo(null)).toBeNull();
    const m = sanearModelo({ situacao: "jovem", canal: "email", abertura: "x".repeat(5000), assunto: 123, incluir_redes: "sim", incluir_eventos: false })!;
    expect(m.abertura).toHaveLength(600);
    expect(m.assunto).toBe("");
    expect(m.incluir_redes).toBe(true);     // não era booleano: volta ao padrão
    expect(m.incluir_eventos).toBe(false);
  });
  it("config: campos cortados, números dentro dos limites, só redes conhecidas (sem repetir) na lista de ocultas", () => {
    const c = sanearConfig({ assinatura: "a".repeat(999), link_pedido_oracao: "https://x.org/oracao", dias_sem_retorno: 1000, eventos_max: -3, redes_ocultas: ["spotify", "spotify", "myspace", 7] });
    expect(c.assinatura).toHaveLength(400);
    expect(c.link_pedido_oracao).toBe("https://x.org/oracao");
    expect(c.dias_sem_retorno).toBe(90);
    expect(c.eventos_max).toBe(1);
    expect(c.redes_ocultas).toEqual(["spotify"]);
  });
  it("Identidade como o banco a devolve: só redes com plataforma e url em texto; sem nome, o nome padrão; nada de fora entra", () => {
    const i = sanearIdentidade({ nome: "  ", site: "qibrj.org.br", redes: [{ plataforma: "instagram", url: "@qibrj" }, { plataforma: 1, url: "x" }, null, { plataforma: "x" }], endereco: "e".repeat(999), email: "a@b.org" });
    expect(i.nome).toBe("Quarta Igreja Batista do Rio de Janeiro");
    expect(i.redes).toEqual([{ plataforma: "instagram", url: "@qibrj" }]);
    expect(i.endereco).toHaveLength(300);
    expect(i.site).toBe("qibrj.org.br");
    expect(sanearIdentidade(undefined).redes).toEqual([]);
    expect(sanearIdentidade("lixo").telefone).toBe("");
  });
  it("config vazia ou estranha vira o padrão, sem quebrar", () => {
    expect(sanearConfig(undefined).dias_sem_retorno).toBe(15);
    expect(sanearConfig("lixo").eventos_max).toBe(4);
  });
});
