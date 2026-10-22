import { describe, expect, it } from "vitest";
import { contaPrevista, linhasDoReembolso, oQueQuitou, quemRecebe, ROTULO_CONTA_A_DEFINIR, ROTULO_SEM_NOME, textoCurtoDoReembolso, type ReembolsoParaExibir } from "@/lib/reembolsoApresentacao";
import { lerReembolsosAPagar } from "../../supabase/functions/_shared/reembolsos/lerReembolsos";
import { montarEmailDiario } from "../../supabase/functions/_shared/pagamentos/emailDiario";
import { montarBloco, type Digest } from "../../supabase/functions/_shared/resumoSemanal/blocos";
import { motivoDeNaoEnviar, prepararDiario, type DadosDoDiario } from "../../supabase/functions/_shared/pagamentos/resumoDiario";

const HOJE = "2026-10-22";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const lucio = (o: Partial<ReembolsoParaExibir> = {}): ReembolsoParaExibir => ({
  obrigacao_id: "ob1", quem_recebe: "Lúcio", quitou: "Leandro", valor: 500, conta_prevista: "Caixinha Administrativa", data_despesa: "2026-10-10", ...o,
});

describe("como um reembolso a pagar é apresentado", () => {
  it("o terceiro em destaque; depois o que quitou, o valor e a conta prevista", () => {
    expect(quemRecebe(lucio())).toBe("Lúcio");
    expect(linhasDoReembolso(lucio(), brl)).toEqual([
      { rotulo: "Quitou", texto: "Leandro" },
      { rotulo: "Valor", texto: "R$ 500,00" },
      { rotulo: "Conta prevista para pagamento", texto: "Caixinha Administrativa" },
    ]);
    expect(textoCurtoDoReembolso(lucio(), brl)).toBe("Lúcio quitou Leandro · R$ 500,00 · conta prevista: Caixinha Administrativa");
  });
  it("a conta pode ser o Bradesco; sem conta (despesa na conta das ofertas) diz que se define ao pagar", () => {
    expect(contaPrevista(lucio({ conta_prevista: "Bradesco" }))).toBe("Bradesco");
    expect(contaPrevista(lucio({ conta_prevista: null }))).toBe(ROTULO_CONTA_A_DEFINIR);
    expect(contaPrevista(lucio({ conta_prevista: "  " }))).toBe(ROTULO_CONTA_A_DEFINIR);
  });
  it("nunca deixa o nome vazio: sem nome no cadastro vira um rótulo; sem fornecedor usa a descrição", () => {
    expect(quemRecebe(lucio({ quem_recebe: null }))).toBe(ROTULO_SEM_NOME);
    expect(oQueQuitou(lucio({ quitou: null, descricao: "Compra de gás" }))).toBe("Compra de gás");
    expect(oQueQuitou(lucio({ quitou: null, descricao: null }))).toBe("despesa sem fornecedor");
  });
});

describe("e-mail diário — Reembolsos a pagar", () => {
  const email = (reembolsos?: ReembolsoParaExibir[]) => montarEmailDiario([], { hojeYmd: HOJE, hora: 7, reembolsos });
  it("lista QUEM recebe em destaque, o que quitou, o valor e a conta prevista (os dois exemplos dela)", () => {
    const e = email([lucio(), lucio({ obrigacao_id: "ob2", quem_recebe: "Marta", quitou: "Padaria Pão Quente", valor: 120.5, conta_prevista: "Bradesco" })]);
    expect(e.html).toContain("Reembolsos a pagar");
    expect(e.html).toContain("<b>➡️ LÚCIO</b>");
    expect(e.html).toContain("Quitou: <b>Leandro</b>");
    expect(e.html).toContain("Valor: <b>R$ 500,00</b>");
    expect(e.html).toContain("Conta prevista para pagamento: <b>Caixinha Administrativa</b>");
    expect(e.html).toContain("<b>➡️ MARTA</b>");
    expect(e.html).toContain("Conta prevista para pagamento: <b>Bradesco</b>");
    expect(e.html).toContain("R$ 620,50");   // o total no título da seção
    expect(e.texto).toContain("➡️ LÚCIO");
    expect(e.texto).toContain("Quitou: Leandro");
    expect(e.texto).toContain("Conta prevista para pagamento: Caixinha Administrativa");
    expect(e.contagem.reembolsos).toBe(2);
    expect(e.reembolsosListados).toHaveLength(2);
  });
  it("a frase de abertura reconhece que só há reembolso a pagar", () => {
    expect(email([lucio()]).texto).toContain("Não há contas a pagar para hoje, mas há reembolsos aprovados a pagar.");
    expect(email([]).texto).toContain("Não há pagamentos em aberto para hoje.");
  });
  it("conta a definir é dito com clareza; já enviado antes de hoje vem com o alerta contra duplicidade", () => {
    const e = email([lucio({ conta_prevista: null, ultimo_envio: "2026-10-21T10:00:00Z" })]);
    expect(e.html).toContain("Conta prevista para pagamento: <b>a definir ao pagar</b>");
    expect(e.html).toContain("já enviado em 21/10 — confira se já foi pago");
  });
  it("sem a lista (migration não aplicada) o e-mail sai como antes", () => {
    expect(email(undefined).html).not.toContain("Reembolsos a pagar");
    expect(email(undefined).contagem.reembolsos).toBe(0);
  });
  it("o nome é escapado (nada de HTML vindo do cadastro)", () => {
    expect(email([lucio({ quem_recebe: "<b>X</b> & cia" })]).html).toContain("&lt;B&gt;X&lt;/B&gt; &amp; CIA");
  });
  it("com reembolso a pagar o resumo SAI mesmo sem nenhuma conta a pagar; sem nada, continua não saindo", () => {
    const base = (reembolsos: ReembolsoParaExibir[]): DadosDoDiario => ({
      hoje: HOJE, dow: 4, gerado_em: "2026-10-22T10:00:00Z", ultimo_envio_geral: null, destinatarios: [{ nome: "B", email: "b@x.org" }], itens: [], reembolsos_a_pagar: reembolsos,
      config: { ativo: true, dias_semana: [4], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false },
    });
    expect(motivoDeNaoEnviar(base([lucio()]), prepararDiario(base([lucio()])))).toBeNull();
    expect(motivoDeNaoEnviar(base([]), prepararDiario(base([])))).toBe("nada_a_pagar");
  });
});

describe("e-mail semanal — bloco Reembolsos", () => {
  const digest = (r: { n: number; total: number; itens?: ReembolsoParaExibir[] } | undefined): Digest => ({
    pastoral: { aniversarios_semana: 0, bodas_semana: 0, visitantes_sem_contato: 0, candidatos_batismo: 0 },
    secretaria: { sem_telefone: 0, membresia_em_andamento: 0, atas_pendentes: 0, pautas_rascunho: 0 },
    tesouraria: { fiscal_atrasados: 0, fiscal_urgentes: 0, caixas_abertos: 0, aprovacoes_pendentes: 0, centros_criticos: 0, reembolsos: r },
    gerado_em: "2026-10-22T10:00:00Z",
  });
  it("cada reembolso diz quem recebe, o que quitou, quanto e a conta prevista", () => {
    const b = montarBloco("reembolsos", digest({ n: 1, total: 500, itens: [lucio()] }))!;
    expect(b.frase).toBe("1 reembolso a pagar, somando R$ 500,00.");
    expect(b.itens).toEqual(["Lúcio quitou Leandro · R$ 500,00 · conta prevista: Caixinha Administrativa"]);
    expect(b.tom).toBe("atencao");
  });
  it("passando de 10, lista 10 e diz quantos faltam", () => {
    const itens = Array.from({ length: 12 }, (_, i) => lucio({ obrigacao_id: `o${i}`, quem_recebe: `Pessoa ${i}` }));
    const b = montarBloco("reembolsos", digest({ n: 12, total: 6000, itens }))!;
    expect(b.itens).toHaveLength(11);
    expect(b.itens.at(-1)).toBe("+ 2 outros");
  });
  it("sem a lista (migration não aplicada) o bloco diz só quantos e quanto, como antes", () => {
    const b = montarBloco("reembolsos", digest({ n: 2, total: 800 }))!;
    expect(b.itens).toEqual([]);
    expect(b.frase).toBe("2 reembolsos a pagar, somando R$ 800,00.");
  });
  it("nenhum reembolso: bloco em dia", () => {
    expect(montarBloco("reembolsos", digest({ n: 0, total: 0 }))!.tom).toBe("ok");
  });
});

describe("leitura da função do banco", () => {
  it("sem a migration (erro) ou com falha de rede devolve vazio: o e-mail sai do mesmo jeito", async () => {
    expect(await lerReembolsosAPagar({ rpc: async () => ({ data: null, error: { message: "function does not exist" } }) })).toEqual([]);
    expect(await lerReembolsosAPagar({ rpc: async () => { throw new Error("rede"); } })).toEqual([]);
  });
  it("normaliza a linha (valor numérico, data AAAA-MM-DD, nulos preservados)", async () => {
    const r = await lerReembolsosAPagar({ rpc: async () => ({ data: [{ obrigacao_id: "ob1", quem_recebe: "Lúcio", quitou: "Leandro", valor: "500.00", conta_prevista: null, data_despesa: "2026-10-10T00:00:00", ultimo_envio: null }], error: null }) });
    expect(r).toMatchObject([{ obrigacao_id: "ob1", quem_recebe: "Lúcio", quitou: "Leandro", valor: 500, conta_prevista: null, data_despesa: "2026-10-10", ultimo_envio: null }]);
  });
});
