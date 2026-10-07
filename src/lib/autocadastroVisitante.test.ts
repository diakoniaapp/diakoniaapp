import { describe, expect, it } from "vitest";
import {
  FORMULARIO_VAZIO, mascararTelefone, montarPedido, pediuOracao, problemasDoFormulario, rotulosDaOracao, telefoneValido,
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

describe("validação do formulário", () => {
  it("o mínimo: nome, um telefone e o aceite — o resto é opcional (cabe em 1 minuto)", () => {
    expect(problemasDoFormulario(ok())).toEqual([]);
  });
  it("sem aceite, sem nome ou sem telefone: não envia", () => {
    expect(problemasDoFormulario(ok({ lgpd: false })).join(" ")).toMatch(/concordância/);
    expect(problemasDoFormulario(ok({ nome: "Ma" })).join(" ")).toMatch(/nome completo/);
    expect(problemasDoFormulario(ok({ telefone: "" })).join(" ")).toMatch(/telefone/);
  });
  it("só o WhatsApp (sem 'mesmo número') também basta", () => {
    expect(problemasDoFormulario(ok({ telefone: "", mesmoNumero: false, whatsapp: "(21) 98399-1229" }))).toEqual([]);
  });
  it("'Outro' pedido de oração exige o texto; data de nascimento no futuro é recusada", () => {
    expect(problemasDoFormulario(ok({ oracaoOutro: true })).join(" ")).toMatch(/pedido de oração/);
    expect(problemasDoFormulario(ok({ oracaoOutro: true, oracaoOutroTexto: "pela minha mãe" }))).toEqual([]);
    expect(problemasDoFormulario(ok({ dataNascimento: "2999-01-01" })).join(" ")).toMatch(/nascimento/);
  });
});

describe("o pedido enviado ao banco", () => {
  it("'quem convidou' só vai com 'Convite de Familiar/Amigo'; 'Outro' leva o texto livre", () => {
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
  it("oração: marcas e texto só quando 'Outro' está marcado", () => {
    const c = { oracao_familia: true, oracao_saude: false, oracao_trabalho: false, oracao_outro: "pela minha mãe" };
    expect(montarPedido(ok({ oracaoFamilia: true, oracaoOutro: true, oracaoOutroTexto: "pela minha mãe" }))).toMatchObject(c);
    expect(montarPedido(ok({ oracaoOutro: false, oracaoOutroTexto: "esquecido" })).oracao_outro).toBeNull();
    expect(pediuOracao(c)).toBe(true);
    expect(rotulosDaOracao(c)).toEqual(["Família", "Outro"]);
    expect(pediuOracao({})).toBe(false);
  });
});
