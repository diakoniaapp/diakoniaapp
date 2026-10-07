import { describe, expect, it } from "vitest";
import {
  FORMULARIO_VAZIO, dataBrParaIso, emailValido, mascararData, mascararTelefone, montarPedido, nascimentoValido, pediuOracao,
  preferenciaDeContato, problemasDoFormulario, problemasDoPasso, rotulosDaOracao, telefoneValido,
  type FormularioDoVisitante,
} from "./autocadastroVisitante";

const ok = (extra: Partial<FormularioDoVisitante> = {}): FormularioDoVisitante =>
  ({ ...FORMULARIO_VAZIO, nome: "Maria da Silva", telefone: "(21) 98399-1229", lgpd: true, ...extra });

describe("telefone", () => {
  it("aceita DDD + 8/9 dígitos, com ou sem 55", () => {
    expect(telefoneValido("(21) 98399-1229")).toBe(true);
    expect(telefoneValido("2133334444")).toBe(true);
    expect(telefoneValido("+55 21 98399-1229")).toBe(true);
    expect(telefoneValido("98399-1229")).toBe(false);   // sem DDD
    expect(telefoneValido("123")).toBe(false);
  });
  it("máscara enquanto digita", () => {
    expect(mascararTelefone("21983991229")).toBe("(21) 98399-1229");
    expect(mascararTelefone("2133334444")).toBe("(21) 3333-4444");
    expect(mascararTelefone("2198")).toBe("(21) 98");
    expect(mascararTelefone("5521983991229")).toBe("(21) 98399-1229");
  });
});

describe("data de nascimento digitada", () => {
  it("máscara dd/mm/aaaa, inclusive o que o preenchimento automático entrega (AAAA-MM-DD)", () => {
    expect(mascararData("17")).toBe("17");
    expect(mascararData("1705")).toBe("17/05");
    expect(mascararData("17051990")).toBe("17/05/1990");
    expect(mascararData("17/05/19901234")).toBe("17/05/1990");
    expect(mascararData("1990-05-17")).toBe("17/05/1990");
  });
  it("só vale data que existe no calendário, entre 1900 e hoje; vazio é permitido", () => {
    expect(dataBrParaIso("17/05/1990")).toBe("1990-05-17");
    expect(dataBrParaIso("29/02/2024")).toBe("2024-02-29");
    expect(dataBrParaIso("31/02/1990")).toBeNull();
    expect(dataBrParaIso("29/02/2023")).toBeNull();
    expect(dataBrParaIso("17/05/90")).toBeNull();
    expect(nascimentoValido("")).toBe(true);
    expect(nascimentoValido("17/05/1990")).toBe(true);
    expect(nascimentoValido("17/05/1899")).toBe(false);
    expect(nascimentoValido("01/01/2999")).toBe(false);
    expect(nascimentoValido("17/05")).toBe(false);
  });
});

describe("e-mail (opcional)", () => {
  it("vazio vale; preenchido precisa parecer e-mail", () => {
    expect(emailValido("")).toBe(true);
    expect(emailValido("  maria@igreja.org.br ")).toBe(true);
    expect(emailValido("maria@igreja")).toBe(false);
    expect(emailValido("maria igreja.com")).toBe(false);
  });
});

describe("validação por passo", () => {
  it("o mínimo: nome, um telefone e o aceite — o resto é opcional (cabe em 1 minuto)", () => {
    expect(problemasDoFormulario(ok())).toEqual([]);
  });
  it("passo 1: nome e telefone; os erros apontam o campo", () => {
    expect(problemasDoPasso(ok({ nome: "Ma" }), 1)).toEqual([{ campo: "v-nome", msg: "Informe seu nome completo." }]);
    expect(problemasDoPasso(ok({ telefone: "" }), 1)[0]).toMatchObject({ campo: "v-tel", msg: expect.stringMatching(/telefone/) });
    expect(problemasDoPasso(ok({ telefone: "(21) 9839" }), 1)[0].msg).toMatch(/incompleto/);
    expect(problemasDoPasso(ok({ email: "x@y" }), 1)[0].campo).toBe("v-email");
    expect(problemasDoPasso(ok({ dataNascimento: "31/02/1990" }), 1)[0].campo).toBe("v-nasc");
  });
  it("o passo 2 nunca trava (tudo é opcional) e o aceite só é cobrado no passo 3", () => {
    expect(problemasDoPasso(ok({ lgpd: false }), 2)).toEqual([]);
    expect(problemasDoPasso(ok({ lgpd: false }), 1)).toEqual([]);
    expect(problemasDoPasso(ok({ lgpd: false }), 3)[0]).toMatchObject({ campo: "v-lgpd" });
    expect(problemasDoFormulario(ok({ lgpd: false })).join(" ")).toMatch(/concordância/);
  });
  it("só o WhatsApp (sem 'mesmo número') também basta", () => {
    expect(problemasDoFormulario(ok({ telefone: "", mesmoNumero: false, whatsapp: "(21) 98399-1229" }))).toEqual([]);
  });
  it("'Outro' pedido de oração exige o texto", () => {
    expect(problemasDoFormulario(ok({ oracaoOutro: true })).join(" ")).toMatch(/pedido de oração/);
    expect(problemasDoFormulario(ok({ oracaoOutro: true, oracaoOutroTexto: "pela minha mãe" }))).toEqual([]);
  });
});

describe("o pedido enviado ao banco", () => {
  it("'quem convidou' só vai com 'Convite de familiar ou amigo'; 'Outro' leva o texto livre", () => {
    const a = montarPedido(ok({ comoConheceu: "amigo_familiar", quemConvidou: " João ", comoConheceuOutro: "x" }));
    expect(a).toMatchObject({ como_conheceu: "amigo_familiar", quem_convidou: "João", como_conheceu_outro: null });
    const b = montarPedido(ok({ comoConheceu: "outros", comoConheceuOutro: "vi o culto na TV", quemConvidou: "alguém" }));
    expect(b).toMatchObject({ como_conheceu: "outros", quem_convidou: null, como_conheceu_outro: "vi o culto na TV" });
  });
  it("'mesmo número' repete o telefone no WhatsApp; Sim/Não viram booleanos e a primeira visita não respondida vai nula", () => {
    const p = montarPedido(ok({ desejaContato: "sim", desejaInformacoes: "nao", primeiraVisita: "" }));
    expect(p).toMatchObject({ whatsapp: "(21) 98399-1229", deseja_contato: true, deseja_informacoes: false, primeira_visita: null, lgpd_aceito: true });
    expect(montarPedido(ok({ primeiraVisita: "nao" })).primeira_visita).toBe(false);
  });
  it("nascimento vai em AAAA-MM-DD; e-mail em minúsculas ou nulo", () => {
    expect(montarPedido(ok({ dataNascimento: "17/05/1990", email: " Maria@Igreja.COM " }))).toMatchObject({ data_nascimento: "1990-05-17", email: "maria@igreja.com" });
    expect(montarPedido(ok())).toMatchObject({ data_nascimento: null, email: null });
  });
  it("canal e horário do contato só vão quando o visitante pediu contato", () => {
    const base = { canalContato: "whatsapp", horarioContato: "tarde" } as const;
    expect(montarPedido(ok({ ...base, desejaContato: "sim" }))).toMatchObject({ canal_contato: "whatsapp", horario_contato: "tarde" });
    expect(montarPedido(ok({ ...base, desejaContato: "nao" }))).toMatchObject({ canal_contato: null, horario_contato: null });
    expect(montarPedido(ok({ desejaContato: "sim" }))).toMatchObject({ canal_contato: null, horario_contato: null });
  });
  it("a medição do funil leva só o id sorteado e a duração", () => {
    const p = montarPedido(ok(), { sessaoId: "abc", duracaoS: 47.6 });
    expect(p).toMatchObject({ sessao_id: "abc", duracao_s: 48 });
    expect("sessao_id" in montarPedido(ok())).toBe(false);
  });
  it("oração: marcas e texto só quando 'Outro' está marcado", () => {
    const c = { oracao_familia: true, oracao_saude: false, oracao_trabalho: false, oracao_outro: "pela minha mãe" };
    expect(montarPedido(ok({ oracaoFamilia: true, oracaoOutro: true, oracaoOutroTexto: "pela minha mãe" }))).toMatchObject(c);
    expect(montarPedido(ok({ oracaoOutro: false, oracaoOutroTexto: "esquecido" })).oracao_outro).toBeNull();
    expect(pediuOracao(c)).toBe(true);
    expect(rotulosDaOracao(c)).toEqual(["Família", "Outro"]);
    expect(pediuOracao({})).toBe(false);
  });
});

describe("preferência de contato na fila pastoral", () => {
  it("monta o texto curto, ou vazio", () => {
    expect(preferenciaDeContato({ canal_contato: "whatsapp", horario_contato: "tarde" })).toBe("prefere WhatsApp, à tarde");
    expect(preferenciaDeContato({ canal_contato: "ligacao", horario_contato: null })).toBe("prefere ligação");
    expect(preferenciaDeContato({ canal_contato: null, horario_contato: "noite" })).toBe("prefere contato, à noite");
    expect(preferenciaDeContato({})).toBe("");
  });
});
