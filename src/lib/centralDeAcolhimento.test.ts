import { describe, expect, it } from "vitest";
import {
  classificar, diaDeBrasilia, diasEntre, filtrar, filtroDaUrl, funil, indicadores, linhaDoTempoDe, ordenar, prioridadeDe, situacaoDe,
  type PedidoDeCuidado, type VisitanteBase, type VisitanteDaCentral,
} from "@/lib/centralDeAcolhimento";

const HOJE = "2026-10-22";
/** Um instante `n` dias antes de hoje, ao meio-dia em Brasília (longe da virada do dia). */
const atras = (n: number) => { const d = new Date(`${HOJE}T15:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString(); };
const base = (o: Partial<VisitanteBase> = {}): VisitanteBase => ({ id: "v1", nome: "Maria da Silva", telefone: "5521983991229", numeroVisitas: 1, criadoEm: atras(0), ultimoContatoEm: null, ...o });
const c = (o: Partial<VisitanteBase> = {}) => classificar(base(o), HOJE);
const oracao: PedidoDeCuidado = { checkinId: "k1", oracao: ["Saúde", "Família"], quer_contato: false, dataVisita: "2026-10-20" };
const contatoPastoral: PedidoDeCuidado = { checkinId: "k2", oracao: [], quer_contato: true, preferencia: "WhatsApp, à tarde", dataVisita: "2026-10-21" };

describe("datas", () => {
  it("o dia é o de Brasília: 22h do dia 20 (01h UTC do 21) ainda é dia 20", () => {
    expect(diaDeBrasilia("2026-10-21T01:00:00Z")).toBe("2026-10-20");
    expect(diaDeBrasilia("2026-10-21T04:00:00Z")).toBe("2026-10-21");
  });
  it("diasEntre: inteiros, nunca negativos, atravessa mês", () => {
    expect(diasEntre("2026-10-20", "2026-10-22")).toBe(2);
    expect(diasEntre("2026-10-25", "2026-10-22")).toBe(0);
    expect(diasEntre("2026-09-30", "2026-10-02")).toBe(2);
  });
});

describe("situação", () => {
  it("duas visitas = retornou; uma só: chegou agora (até 1 dia), em prazo, e não voltou depois de 15 dias", () => {
    expect(situacaoDe(2, 40)).toBe("retornou");
    expect(situacaoDe(1, 0)).toBe("chegou_agora");
    expect(situacaoDe(1, 1)).toBe("chegou_agora");
    expect(situacaoDe(1, 2)).toBe("em_prazo");
    expect(situacaoDe(1, 15)).toBe("em_prazo");
    expect(situacaoDe(1, 16)).toBe("nao_voltou");
  });
});

describe("prioridade — o cuidado pedido e o contato valem mais que o tempo sozinho", () => {
  it("ALTA: pediu oração ou contato pastoral (mesmo recém-chegado e mesmo já contatado)", () => {
    expect(c({ pedido: oracao }).prioridade).toBe("alta");
    expect(c({ pedido: contatoPastoral, ultimoContatoEm: atras(0) }).prioridade).toBe("alta");
  });
  it("ALTA: nunca foi procurado e já passaram 2 dias; MÉDIA: chegou hoje (a boas-vindas é para hoje)", () => {
    expect(c({ criadoEm: atras(2) }).prioridade).toBe("alta");
    expect(c({ criadoEm: atras(0) }).prioridade).toBe("media");
    expect(c({ criadoEm: atras(1) }).prioridade).toBe("media");
  });
  it("não voltou: ALTA se ninguém procurou na última semana (se perdendo); MÉDIA se já foi procurado esta semana", () => {
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(10) }).prioridade).toBe("alta");
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(3) }).prioridade).toBe("media");
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(7) }).prioridade).toBe("media");   // 7 dias ainda é "esta semana"
    expect(c({ criadoEm: atras(20) }).prioridade).toBe("alta");
  });
  it("o tempo sozinho NÃO deixa ninguém em ALTA para sempre (o defeito da regra antiga): contatado ontem = fora do alto", () => {
    expect(c({ criadoEm: atras(30), ultimoContatoEm: atras(1) }).prioridade).toBe("media");
    expect(c({ criadoEm: atras(30), numeroVisitas: 3, ultimoContatoEm: atras(1) }).prioridade).toBe("baixa");
  });
  it("em prazo e sem contato há mais de uma semana = MÉDIA; procurado há pouco = BAIXA; quem voltou e foi procurado = BAIXA", () => {
    expect(c({ criadoEm: atras(12), ultimoContatoEm: atras(9) }).prioridade).toBe("media");
    expect(c({ criadoEm: atras(5), ultimoContatoEm: atras(1) }).prioridade).toBe("baixa");
    expect(c({ criadoEm: atras(20), numeroVisitas: 2, ultimoContatoEm: atras(2) }).prioridade).toBe("baixa");
  });
  it("pronto para o próximo passo sobe para MÉDIA (não deixar esfriar)", () => {
    expect(c({ criadoEm: atras(20), numeroVisitas: 3, ultimoContatoEm: atras(1), sugestaoDePromocao: "congregado" }).prioridade).toBe("media");
  });
  it("prioridadeDe é pura: só olha os fatos que recebe", () => {
    expect(prioridadeDe({ situacao: "retornou", diasDesdeCadastro: 50, diasSemContato: 1, numeroVisitas: 4 })).toBe("baixa");
  });
});

describe("contatar hoje = quem tem uma AÇÃO a fazer agora (o cartão e o indicador nunca se contradizem)", () => {
  it("nunca procurado, sem contato há mais de 2 dias, pediu cuidado ou pronto para promover: SIM", () => {
    expect(c().contatarHoje).toBe(true);                                        // nunca procurado
    expect(c({ ultimoContatoEm: atras(3) }).contatarHoje).toBe(true);
    expect(c({ ultimoContatoEm: atras(0), pedido: contatoPastoral }).contatarHoje).toBe(true);   // pediu: sempre hoje
    expect(c({ criadoEm: atras(30), numeroVisitas: 3, ultimoContatoEm: atras(1), sugestaoDePromocao: "congregado" }).contatarHoje).toBe(true);   // conversar e promover
  });
  it("procurado há até 2 dias, ou não voltou mas foi procurado esta semana (a recomendação é aguardar): NÃO", () => {
    expect(c({ ultimoContatoEm: atras(2) }).contatarHoje).toBe(false);
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(3) }).contatarHoje).toBe(false);
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(3) }).proximaAcao.botao).toBe("nenhuma");
  });
  it("coerência: contatarHoje é verdadeiro exatamente quando a próxima ação tem um botão", () => {
    for (const o of [{}, { criadoEm: atras(5) }, { criadoEm: atras(20) }, { criadoEm: atras(20), ultimoContatoEm: atras(4) }, { criadoEm: atras(20), ultimoContatoEm: atras(10) }, { numeroVisitas: 2, criadoEm: atras(9), ultimoContatoEm: atras(6) }, { telefone: null }]) {
      const x = c(o as Partial<VisitanteBase>);
      expect(x.contatarHoje).toBe(x.proximaAcao.botao !== "nenhuma");
    }
  });
});

describe("próxima ação — uma só, a primeira regra que valer", () => {
  it("pedido de oração › responder (com o motivo, o que pediu e quando)", () => {
    const a = c({ pedido: oracao, sugestaoDePromocao: "congregado" }).proximaAcao;
    expect(a).toMatchObject({ tipo: "orar", botao: "whatsapp", rotuloDoBotao: "Responder pelo WhatsApp" });
    expect(a.detalhe).toContain("saúde, família");
    expect(a.detalhe).toContain("20/10");
  });
  it("contato pastoral pedido › fazer o contato, com a preferência da pessoa", () => {
    const a = c({ pedido: contatoPastoral }).proximaAcao;
    expect(a).toMatchObject({ tipo: "contato_pastoral", botao: "whatsapp" });
    expect(a.detalhe).toContain("WhatsApp, à tarde");
  });
  it("pronto para o próximo passo › promover (sem pedido pendente)", () => {
    expect(c({ numeroVisitas: 3, ultimoContatoEm: atras(1), sugestaoDePromocao: "membro" }).proximaAcao).toMatchObject({ tipo: "promover", botao: "promover", rotuloDoBotao: "Promover a membro" });
  });
  it("nunca procurado: boas-vindas se chegou hoje/ontem; primeiro contato atrasado depois disso", () => {
    expect(c({ criadoEm: atras(0) }).proximaAcao).toMatchObject({ tipo: "boas_vindas", rotuloDoBotao: "Enviar boas-vindas" });
    expect(c({ criadoEm: atras(4) }).proximaAcao).toMatchObject({ tipo: "primeiro_contato" });
    expect(c({ criadoEm: atras(4) }).proximaAcao.detalhe).toContain("há 4 dias");
  });
  it("não voltou: reengajar se faz mais de uma semana do contato; aguardar se foi procurado esta semana", () => {
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(9) }).proximaAcao).toMatchObject({ tipo: "reengajar", botao: "whatsapp" });
    const espera = c({ criadoEm: atras(20), ultimoContatoEm: atras(3) }).proximaAcao;
    expect(espera).toMatchObject({ tipo: "em_dia", botao: "nenhuma" });
    expect(espera.titulo).toBe("Aguardar a resposta");
  });
  it("em prazo e sem contato há mais de 2 dias: acompanhar; quem voltou: convidar a se aproximar", () => {
    expect(c({ criadoEm: atras(6), ultimoContatoEm: atras(4) }).proximaAcao).toMatchObject({ tipo: "acompanhar" });
    expect(c({ criadoEm: atras(10), numeroVisitas: 2, ultimoContatoEm: atras(5) }).proximaAcao).toMatchObject({ tipo: "convidar" });
  });
  it("em dia: nada a fazer e sem botão", () => {
    expect(c({ criadoEm: atras(6), ultimoContatoEm: atras(1) }).proximaAcao).toMatchObject({ tipo: "em_dia", botao: "nenhuma" });
  });
  it("sem telefone o botão não finge WhatsApp: abre a ficha", () => {
    expect(c({ telefone: null }).proximaAcao).toMatchObject({ tipo: "boas_vindas", botao: "abrir_ficha" });
    expect(c({ telefone: null, pedido: oracao }).proximaAcao).toMatchObject({ tipo: "orar", botao: "abrir_ficha" });
  });
});

describe("motivos (por que está nessa prioridade)", () => {
  it("lista o pedido primeiro, depois o resto", () => {
    expect(c({ pedido: oracao, criadoEm: atras(5) }).motivos).toEqual(["Pediu oração (Saúde, Família)", "Nunca foi procurado — chegou há 5 dias"]);
    expect(c({ pedido: contatoPastoral }).motivos[0]).toBe("Quer contato pastoral (WhatsApp, à tarde)");
    expect(c({ criadoEm: atras(20), ultimoContatoEm: atras(9) }).motivos).toEqual(["Sem contato há 9 dias", "Não voltou: 20 dias desde a visita"]);
    expect(c({ criadoEm: atras(0) }).motivos).toEqual(["Chegou agora: enviar as boas-vindas"]);
  });
});

describe("linha do tempo — quatro marcos", () => {
  const t = (o: Partial<VisitanteBase>) => { const x = classificar(base(o), HOJE); return linhaDoTempoDe(base(o), { situacao: x.situacao, diasDesdeCadastro: x.diasDesdeCadastro, diasSemContato: x.diasSemContato }); };
  it("chegou · contato · retorno · próximo passo, sempre nessa ordem", () => {
    expect(t({}).map(m => m.chave)).toEqual(["chegada", "contato", "retorno", "proximo_passo"]);
  });
  it("recém-chegado: chegada feita, contato é o próximo passo, retorno aguardando", () => {
    const m = t({});
    expect(m[0]).toMatchObject({ estado: "feito", detalhe: "22/10 · hoje" });
    expect(m[1]).toMatchObject({ estado: "proximo", detalhe: "ainda não" });
    expect(m[2]).toMatchObject({ estado: "pendente", detalhe: "aguardando" });
  });
  it("nunca procurado há dias: o contato vira ATENÇÃO e diz há quantos dias", () => {
    expect(t({ criadoEm: atras(5) })[1]).toMatchObject({ estado: "atencao", detalhe: "nenhum em 5 dias" });
  });
  it("contato recente: feito, com data e tipo; contato velho e sem retorno: atenção", () => {
    expect(t({ criadoEm: atras(6), ultimoContatoEm: atras(1), ultimoContatoTipo: "Respondeu" })[1]).toMatchObject({ estado: "feito", detalhe: "21/10 · Respondeu" });
    expect(t({ criadoEm: atras(14), ultimoContatoEm: atras(10) })[1].estado).toBe("atencao");
    expect(t({ criadoEm: atras(14), numeroVisitas: 2, ultimoContatoEm: atras(10) })[1].estado).toBe("feito");   // quem voltou não é cobrado do contato semanal
  });
  it("não voltou: o retorno vira ATENÇÃO; voltou: feito com o número de visitas", () => {
    expect(t({ criadoEm: atras(20) })[2]).toMatchObject({ estado: "atencao", detalhe: "não voltou (20 dias)" });
    expect(t({ criadoEm: atras(20), numeroVisitas: 3 })[2]).toMatchObject({ estado: "feito", rotulo: "Voltou", detalhe: "3 visitas" });
  });
  it("pronto para crescer: o último marco é o PRÓXIMO passo, com o vínculo", () => {
    expect(t({ numeroVisitas: 3, sugestaoDePromocao: "congregado" })[3]).toMatchObject({ estado: "proximo", detalhe: "pronto para congregado" });
  });
});

describe("ordem e filtros", () => {
  const lista = (): VisitanteDaCentral[] => [
    classificar(base({ id: "baixa", criadoEm: atras(6), ultimoContatoEm: atras(1) }), HOJE),
    classificar(base({ id: "media-hoje", criadoEm: atras(0) }), HOJE),
    classificar(base({ id: "alta-sumiu", criadoEm: atras(25), ultimoContatoEm: atras(12) }), HOJE),
    classificar(base({ id: "alta-oracao", criadoEm: atras(1), ultimoContatoEm: atras(0), pedido: oracao }), HOJE),
    classificar(base({ id: "alta-nunca", criadoEm: atras(8) }), HOJE),
    classificar(base({ id: "voltou", criadoEm: atras(30), numeroVisitas: 2, ultimoContatoEm: atras(5) }), HOJE),
  ];
  it("alta antes de média antes de baixa; entre as altas: quem pediu cuidado, depois quem está há mais tempo sem contato", () => {
    const ids = ordenar(lista()).map(v => v.id);
    expect(ids.slice(0, 3)).toEqual(["alta-oracao", "alta-nunca", "alta-sumiu"]);
    expect(ids.indexOf("media-hoje")).toBeLessThan(ids.indexOf("baixa"));
    expect(ids.indexOf("media-hoje")).toBeGreaterThan(2);
  });
  it("cada filtro devolve o seu recorte, já ordenado", () => {
    expect(filtrar(lista(), "cuidado").map(v => v.id)).toEqual(["alta-oracao", "alta-nunca", "alta-sumiu"]);
    expect(filtrar(lista(), "nao_voltou").map(v => v.id)).toEqual(["alta-sumiu"]);
    expect(filtrar(lista(), "retornaram").map(v => v.id)).toEqual(["voltou"]);
    expect(filtrar(lista(), "todos")).toHaveLength(6);
    expect(filtrar(lista(), "hoje").map(v => v.id)).toContain("media-hoje");
    expect(filtrar(lista(), "hoje").map(v => v.id)).not.toContain("baixa");
  });
  it("não altera a lista original", () => {
    const l = lista(); const ids = l.map(v => v.id);
    filtrar(l, "todos"); ordenar(l);
    expect(l.map(v => v.id)).toEqual(ids);
  });
  it("filtroDaUrl entende os valores antigos de ?aba= (acao, nao_voltou, todos) e cai em 'hoje'", () => {
    expect(filtroDaUrl("acao")).toBe("hoje");
    expect(filtroDaUrl("nao_voltou")).toBe("nao_voltou");
    expect(filtroDaUrl("todos")).toBe("todos");
    expect(filtroDaUrl("cuidado")).toBe("cuidado");
    expect(filtroDaUrl("lixo")).toBe("hoje");
    expect(filtroDaUrl(null)).toBe("hoje");
  });
});

describe("indicadores", () => {
  it("conta cada pergunta da Central: quem contatar hoje, quem precisa de cuidado, quem não voltou, quem retornou, novos da semana, prontos", () => {
    const l = [
      classificar(base({ id: "a", criadoEm: atras(0) }), HOJE),                                                                    // chegou hoje
      classificar(base({ id: "b", criadoEm: atras(25), ultimoContatoEm: atras(12) }), HOJE),                                       // se perdendo
      classificar(base({ id: "c", criadoEm: atras(3), ultimoContatoEm: atras(0), pedido: oracao }), HOJE),                         // pediu oração
      classificar(base({ id: "d", criadoEm: atras(30), numeroVisitas: 3, ultimoContatoEm: atras(1), sugestaoDePromocao: "congregado" }), HOJE),
      classificar(base({ id: "e", criadoEm: atras(5), ultimoContatoEm: atras(1) }), HOJE),                                         // em dia
    ];
    expect(indicadores(l)).toMatchObject({ total: 5, contatarHoje: 4, cuidado: 2, pedidos: 1, naoVoltaram: 1, retornaram: 1, novosNaSemana: 3, prontos: 1 });   // a, b, c e d (pronto: conversar e promover); e está em dia
    expect(indicadores(l).maisEsquecidoHaDias).toBe(12);
  });
  it("lista vazia: tudo zero, ninguém esquecido", () => {
    expect(indicadores([])).toEqual({ total: 0, contatarHoje: 0, cuidado: 0, pedidos: 0, naoVoltaram: 0, retornaram: 0, novosNaSemana: 0, prontos: 0, maisEsquecidoHaDias: null });
  });
});

describe("funil de acolhimento", () => {
  const l = [
    classificar(base({ id: "1", criadoEm: atras(2) }), HOJE),
    classificar(base({ id: "2", criadoEm: atras(10), ultimoContatoEm: atras(8) }), HOJE),
    classificar(base({ id: "3", criadoEm: atras(20), numeroVisitas: 2, ultimoContatoEm: atras(5) }), HOJE),
    classificar(base({ id: "4", criadoEm: atras(40), numeroVisitas: 4, ultimoContatoEm: atras(1), sugestaoDePromocao: "congregado" }), HOJE),
  ];
  it("cinco etapas, na ordem, com a porcentagem em relação a quem chegou", () => {
    const f = funil(l, 1);
    expect(f.map(e => e.chave)).toEqual(["chegaram", "procurados", "voltaram", "prontos", "congregados"]);
    expect(f.map(e => e.n)).toEqual([4, 3, 2, 1, 1]);
    expect(f.map(e => e.pct)).toEqual([100, 75, 50, 25, 25]);
  });
  it("sem ninguém não divide por zero; conversões maiores que o total não passam de 100%", () => {
    expect(funil([]).map(e => e.pct)).toEqual([0, 0, 0, 0, 0]);
    expect(funil(l, 99).at(-1)!.pct).toBe(100);
  });
});
