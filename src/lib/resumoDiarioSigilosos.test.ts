import { describe, expect, it } from "vitest";
import { itemDoDia, montarItensDoDia, secaoDoItem, type CandidataDoDia } from "../../supabase/functions/_shared/pagamentos/itensDoDia";
import { montarEmailDiario } from "../../supabase/functions/_shared/pagamentos/emailDiario";
import { motivoDeNaoEnviar, prepararDiario, type DadosDoDiario } from "../../supabase/functions/_shared/pagamentos/resumoDiario";

const LINHA = "23793381286000782713695000063305975520000010000";
const cand = (o: Partial<CandidataDoDia> = {}): CandidataDoDia => ({
  id: "l1", data: "2026-10-22", valor: 100, dias_para_vencer: 0, fornecedor_id: "f1", fornecedor_nome: "Light Serviços", pessoa_nome: null, descricao: null,
  categoria: "Energia Elétrica", centro: "Administração", chave_pix: null, tipo_chave_pix: null, ultimo_envio: null, anexos: [], ...o,
});
const boleto = (dados: Record<string, unknown> = {}) => ({ tipo: "boleto", nome: "b.pdf", dados: { versao: 1, rotulo: "Boleto", linhaDigitavel: LINHA, valor: 100, vencimento: "2026-10-22", codigoValido: true, ...dados } });

describe("pagamentos sigilosos (prebenda, folha, Sustento, RPA) entram no e-mail diário — decisão dela, 22/10/2026", () => {
  const prebenda = (o: Partial<CandidataDoDia> = {}) => cand({ id: "preb", categoria: "Prebenda", fornecedor_nome: "Pastor Fulano", valor: 5000, anexos: [boleto({ valor: 5000 })], ...o });

  it("com `incluirSigilosos` o item segue pelo MEIO que tem: com linha vai para 'pagar', com 🔒", () => {
    const i = itemDoDia(prebenda());
    expect(i.sigiloso).toBe(true);
    expect(secaoDoItem(i, false)).toBe("sigiloso");
    expect(secaoDoItem(i, true)).toBe("pagar");
  });
  it("sem meio de pagamento, vai para 'sem meio' (não some)", () => {
    expect(secaoDoItem(itemDoDia(prebenda({ anexos: [] })), true)).toBe("sem_meio");
  });
  it("com divergência de valor, vai para 'conferir antes' — a mesma regra dos demais", () => {
    expect(secaoDoItem(itemDoDia(prebenda({ anexos: [boleto({ valor: 4000 })] })), true)).toBe("conferir");
  });
  it("o e-mail marca o item com 🔒 sigiloso, traz o código e avisa para não encaminhar", () => {
    const e = montarEmailDiario(montarItensDoDia([prebenda(), cand({ id: "luz", anexos: [boleto({ valor: 100 })] })]), { hojeYmd: "2026-10-22", hora: 7, incluirSigilosos: true });
    expect(e.html).toContain("PASTOR FULANO");
    expect(e.html).toContain("🔒 sigiloso");
    expect(e.html).toContain("não encaminhe este e-mail");
    expect(e.html).not.toContain("não aparece neste e-mail");   // a nota "ficou de fora" só vale quando excluídos
    expect(e.texto).toContain("não encaminhe este e-mail");
    expect(e.contagem).toMatchObject({ pagar: 2, sigilosos: 0, sigilososIncluidos: 1 });
    expect(e.total.valor).toBe(5100);
    expect(e.listados.map(i => i.id).sort()).toEqual(["luz", "preb"]);
  });
  it("só o item sigiloso leva a marca; os demais, não", () => {
    const e = montarEmailDiario(montarItensDoDia([prebenda(), cand({ id: "luz", anexos: [boleto()] })]), { hojeYmd: "2026-10-22", hora: 7, incluirSigilosos: true });
    expect(e.html.match(/🔒 sigiloso/g)).toHaveLength(1);
  });
  it("desligado (opção da tela): volta a ficar de fora, só a nota", () => {
    const e = montarEmailDiario(montarItensDoDia([prebenda()]), { hojeYmd: "2026-10-22", hora: 7, incluirSigilosos: false });
    expect(e.html).not.toContain("PASTOR FULANO");
    expect(e.html).toContain("1 pagamento sigiloso");
    expect(e.contagem).toMatchObject({ pagar: 0, sigilosos: 1, sigilososIncluidos: 0 });
  });
  it("na configuração, o padrão é INCLUIR (sem o campo, ou com true); `incluir_sigilosos: false` exclui", () => {
    const d = (incluir?: boolean): DadosDoDiario => ({
      hoje: "2026-10-22", dow: 4, gerado_em: "2026-10-22T10:00:00Z", ultimo_envio_geral: null, destinatarios: [{ nome: "B", email: "b@x.org" }], itens: [prebenda()],
      config: { ativo: true, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, ...(incluir === undefined ? {} : { incluir_sigilosos: incluir }) },
    });
    expect(prepararDiario(d()).email.contagem.pagar).toBe(1);
    expect(prepararDiario(d(true)).email.contagem.pagar).toBe(1);
    expect(prepararDiario(d(false)).email.contagem.pagar).toBe(0);
    expect(motivoDeNaoEnviar(d(), prepararDiario(d()))).toBeNull();                       // só há remuneração e ela entra: envia
    expect(motivoDeNaoEnviar(d(false), prepararDiario(d(false)))).toBe("nada_a_pagar");   // excluída: não há o que enviar
  });
  it("a prévia ainda não salva (sobreposição da tela) vale mais que a configuração", () => {
    const base: DadosDoDiario = {
      hoje: "2026-10-22", dow: 4, gerado_em: "2026-10-22T10:00:00Z", ultimo_envio_geral: null, destinatarios: [], itens: [prebenda()],
      config: { ativo: false, dias_semana: [1], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, incluir_sigilosos: true },
    };
    expect(prepararDiario(base, "PRÉVIA", false).email.contagem.pagar).toBe(0);
    expect(prepararDiario(base, "PRÉVIA", true).email.contagem.pagar).toBe(1);
  });
});
