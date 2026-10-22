import { describe, expect, it } from "vitest";
import { itemDoDia, montarItensDoDia, secaoDoItem, type CandidataDoDia } from "../../supabase/functions/_shared/pagamentos/itensDoDia";
import { LIMITE_POR_SECAO, montarEmailDiario } from "../../supabase/functions/_shared/pagamentos/emailDiario";

const LINHA = "23793381286000782713695000063305975520000010000";
const PIX_DOC = "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5909FORNECEDOR6009SAO PAULO62070503***63041D3D";

const cand = (o: Partial<CandidataDoDia> = {}): CandidataDoDia => ({
  id: "l1", data: "2026-10-22", valor: 100, dias_para_vencer: 0, fornecedor_id: "f1", fornecedor_nome: "Light Serviços", pessoa_nome: null, descricao: null,
  categoria: "Energia Elétrica", centro: "Administração", chave_pix: null, tipo_chave_pix: null, ultimo_envio: null, anexos: [], ...o,
});
const boleto = (dados: Record<string, unknown> = {}) => ({ tipo: "boleto", nome: "b.pdf", dados: { versao: 1, rotulo: "Boleto", linhaDigitavel: LINHA, valor: 100, vencimento: "2026-10-22", codigoValido: true, ...dados } });

describe("itemDoDia — a ordem do meio de pagamento (a aprovada em 20/10/2026)", () => {
  it("1 · linha digitável do documento vence o Pix do documento e o do cadastro", () => {
    const i = itemDoDia(cand({ chave_pix: "21999990000", tipo_chave_pix: "telefone", anexos: [boleto({ pix: { payload: PIX_DOC, crcValido: true } })] }));
    expect(i.origem).toBe("linha_documento");
    expect(i.linha).toBe(LINHA);
    expect(i.pix).toBeNull();
    expect(secaoDoItem(i)).toBe("pagar");
  });
  it("2 · sem linha, o Pix do documento", () => {
    const i = itemDoDia(cand({ anexos: [{ tipo: "fatura", nome: "f.pdf", dados: { versao: 1, rotulo: "Fatura", valor: 100, pix: { payload: PIX_DOC, crcValido: true } } }] }));
    expect(i.origem).toBe("pix_documento");
    expect(i.pix).toBe(PIX_DOC);
  });
  it("3 · sem documento lido, o Pix do cadastro do favorecido LIGADO — montado com o valor", () => {
    const i = itemDoDia(cand({ chave_pix: "12345678909", tipo_chave_pix: "cpf" }));
    expect(i.origem).toBe("pix_cadastro");
    expect(i.pix).toMatch(/^000201/);
    expect(i.pix).toContain("100.00");
    expect(secaoDoItem(i)).toBe("pagar");
  });
  it("sem favorecido LIGADO não há Pix de cadastro, mesmo que o nome combine: nada de palpite num e-mail automático", () => {
    const i = itemDoDia(cand({ fornecedor_id: null, fornecedor_nome: null, descricao: "Light Serviços", chave_pix: "12345678909", tipo_chave_pix: "cpf" }));
    expect(i.origem).toBeNull();
    expect(secaoDoItem(i)).toBe("sem_meio");
  });
  it("sem nada: vai para 'sem meio automático' (nunca some)", () => {
    const i = itemDoDia(cand());
    expect(i.grupo).toBe("sem_dado");
    expect(secaoDoItem(i)).toBe("sem_meio");
  });
  it("leitura guardada de outra versão (ou nula) não vale — o servidor não lê PDF", () => {
    expect(itemDoDia(cand({ anexos: [{ tipo: "boleto", nome: "b.pdf", dados: { versao: 2, linhaDigitavel: LINHA } }] })).linha).toBeNull();
    expect(itemDoDia(cand({ anexos: [{ tipo: "boleto", nome: "b.pdf", dados: null }] })).linha).toBeNull();
  });
  it("só anexos que se pagam contam: um contrato com linha não vira meio de pagamento", () => {
    expect(itemDoDia(cand({ anexos: [{ tipo: "contrato", nome: "c.pdf", dados: { versao: 1, linhaDigitavel: LINHA } }] })).linha).toBeNull();
  });
});

describe("secaoDoItem — para onde cada item vai", () => {
  it("valor do documento diferente da obrigação: 'conferir antes' (o código não vai)", () => {
    const i = itemDoDia(cand({ anexos: [boleto({ valor: 150 })] }));
    expect(secaoDoItem(i)).toBe("conferir");
    expect(i.avisos.join(" ")).toMatch(/documento traz/);
  });
  it("código de barras que não confere: 'conferir antes'", () => {
    expect(secaoDoItem(itemDoDia(cand({ anexos: [boleto({ codigoValido: false })] })))).toBe("conferir");
  });
  it("só a DATA do boleto diferente apenas informa: segue em 'pagar', com o vencimento do boleto", () => {
    const i = itemDoDia(cand({ anexos: [boleto({ vencimento: "2026-10-25" })] }));
    expect(secaoDoItem(i)).toBe("pagar");
    expect(i.vencimento).toBe("2026-10-25");
  });
  it("prebenda, salário, folha, RPA e Sustento são sigilosos", () => {
    for (const categoria of ["Prebenda", "Salários", "RPA Pessoa Física/Autônomo", "Sustento Pastoral"]) {
      expect(secaoDoItem(itemDoDia(cand({ categoria, anexos: [boleto()] })))).toBe("sigiloso");
    }
  });
});

describe("montarEmailDiario", () => {
  const hoje = "2026-10-22";
  const itens = montarItensDoDia([
    cand({ id: "hoje", dias_para_vencer: 0, data: "2026-10-22", valor: 50, fornecedor_nome: "Cedae", anexos: [boleto({ valor: 50 })] }),
    cand({ id: "atras", dias_para_vencer: -5, data: "2026-10-17", valor: 300, fornecedor_nome: "Light Serviços", ultimo_envio: "2026-10-21T10:00:00Z", anexos: [boleto({ valor: 300, vencimento: "2026-10-17" })] }),
    cand({ id: "pix", dias_para_vencer: 0, valor: 80, fornecedor_nome: "Papelaria Central", chave_pix: "12345678909", tipo_chave_pix: "cpf" }),
    cand({ id: "conf", dias_para_vencer: -1, data: "2026-10-21", valor: 70, fornecedor_nome: "Gráfica", anexos: [boleto({ valor: 90, vencimento: "2026-10-21" })] }),
    cand({ id: "sem", dias_para_vencer: -2, data: "2026-10-20", valor: 40, fornecedor_nome: "Zeladoria" }),
    cand({ id: "sig", dias_para_vencer: 0, valor: 5000, fornecedor_nome: "Pastor", categoria: "Prebenda", anexos: [boleto({ valor: 5000 })] }),
  ]);
  const e = montarEmailDiario(itens, { hojeYmd: hoje, hora: 7 });

  it("o assunto traz a data e a contagem do que há para pagar", () => {
    expect(e.assunto).toBe("Resumo diário da Tesouraria | 22.10.2026 · 3 pagamentos");
  });
  it("os totais são só da seção 'pagar', com atrasados e hoje à parte", () => {
    expect(e.total).toEqual({ quantidade: 3, valor: 430, atrasados: { quantidade: 1, valor: 300 }, hoje: { quantidade: 2, valor: 130 } });
    expect(e.contagem).toEqual({ pagar: 3, conferir: 1, semMeio: 1, sigilosos: 1 });
  });
  it("atrasada primeiro; mostra o banco, a linha em grupos de 5 e a ORIGEM do código", () => {
    expect(e.html.indexOf("LIGHT SERVIÇOS")).toBeLessThan(e.html.indexOf("CEDAE"));
    expect(e.html).toContain("Boleto bancário · Bradesco · R$ 300,00 · vence 17/10/2026");
    expect(e.html).toContain("ATRASADO há 5d");
    expect(e.html).toContain("23793 38128 60007 82713 69500 00633 05975 52000 00100 00");
    expect(e.html).toContain("🧾 Linha digitável do documento");
    expect(e.html).toContain("👤 PIX do cadastro do favorecido");
  });
  it("avisa 'já enviado em 21/10' quando o último envio foi antes de hoje — e só nesse item", () => {
    expect(e.html).toContain("já enviado em 21/10");
    expect(e.html.match(/já enviado em/g)).toHaveLength(1);
    expect(montarEmailDiario(itens, { hojeYmd: "2026-10-21", hora: 7 }).html).not.toContain("já enviado em");   // enviado HOJE não é repetição
  });
  it("'conferir antes' NÃO leva o código e explica a divergência", () => {
    expect(e.html).toContain("Conferir antes de pagar");
    expect(e.html).toContain("o documento traz R$ 90,00, a obrigação R$ 70,00");
    const trechoConferir = e.html.slice(e.html.indexOf("Conferir antes de pagar"), e.html.indexOf("Sem linha digitável nem Pix"));
    expect(trechoConferir).not.toContain("23793");
  });
  it("sigiloso nunca aparece — só a nota de que há", () => {
    expect(e.html).not.toContain("PASTOR");
    expect(e.html).not.toContain("5.000");
    expect(e.html).toContain("1 pagamento sigiloso");
    expect(e.texto).not.toContain("PASTOR");
  });
  it("traz o aviso de conferência, a assinatura, o link do sistema e a versão em texto", () => {
    expect(e.html).toContain("Confira sempre os valores e vencimentos");
    expect(e.html).toContain("Abrir o DiakoniaApp →");
    expect(e.html).toContain("DiakoniaApp");
    expect(e.texto).toContain("PARA PAGAR");
    expect(e.texto).toContain("Abrir o DiakoniaApp: https://portal.diakoniaapp.com.br");
  });
  it("o registro de 'já enviado' recebe tudo o que foi listado, menos os sigilosos", () => {
    expect(e.listados.map(i => i.id).sort()).toEqual(["atras", "conf", "hoje", "pix", "sem"]);
  });
  it("saudação pela hora e aviso de prévia no topo", () => {
    expect(montarEmailDiario(itens, { hojeYmd: hoje, hora: 7 }).html).toContain("bom dia");
    expect(montarEmailDiario(itens, { hojeYmd: hoje, hora: 14, aviso: "PRÉVIA — nada foi enviado" }).html).toMatch(/PRÉVIA.*boa tarde/s);
  });
  it("sem nada a pagar, o e-mail diz isso (a Edge Function decide se envia)", () => {
    const v = montarEmailDiario([], { hojeYmd: hoje, hora: 7 });
    expect(v.assunto).toBe("Resumo diário da Tesouraria | 22.10.2026");
    expect(v.html).toContain("Não há pagamentos em aberto para hoje.");
    expect(v.listados).toEqual([]);
  });
  it("texto do favorecido é escapado (nada de HTML injetado por um nome)", () => {
    const m = montarEmailDiario(montarItensDoDia([cand({ fornecedor_nome: "<b>X</b> & Cia", anexos: [boleto()] })]), { hojeYmd: hoje, hora: 7 });
    expect(m.html).toContain("&lt;B&gt;X&lt;/B&gt; &amp; CIA");
    expect(m.html).not.toContain("<b>X</b>");
  });
  it("passando do limite por seção, cita quantos ficaram de fora", () => {
    const muitos = montarItensDoDia(Array.from({ length: LIMITE_POR_SECAO + 5 }, (_, n) => cand({ id: `m${n}`, fornecedor_nome: `Fornecedor ${String(n).padStart(2, "0")}`, anexos: [boleto()] })));
    const m = montarEmailDiario(muitos, { hojeYmd: hoje, hora: 7 });
    expect(m.html).toContain("+ 5 outros pagamentos — abra o DiakoniaApp.");
    expect(m.contagem.pagar).toBe(LIMITE_POR_SECAO + 5);
  });
});

describe("o atraso vem da OBRIGAÇÃO; a data do documento aparece e, se diferir, vira nota", () => {
  it("obrigação de 13/10 com boleto de 12/10: cabeçalho com a data do boleto, atraso pela obrigação (9d) e a nota da diferença", () => {
    const itens = montarItensDoDia([cand({ data: "2026-10-13", dias_para_vencer: -9, anexos: [boleto({ vencimento: "2026-10-12" })] })]);
    const e = montarEmailDiario(itens, { hojeYmd: "2026-10-22", hora: 7 });
    expect(e.html).toContain("vence 12/10/2026");
    expect(e.html).toContain("ATRASADO há 9d");
    expect(e.html).toContain("o boleto vence em 12/10/2026, a obrigação em 13/10/2026");
    expect(e.total.atrasados.quantidade).toBe(1);
  });
  it("documento com data errada (emissão lida como vencimento) não inventa atraso: manda a obrigação (vence hoje)", () => {
    const itens = montarItensDoDia([cand({ data: "2026-10-22", dias_para_vencer: 0, anexos: [boleto({ vencimento: "2026-10-07" })] })]);
    const e = montarEmailDiario(itens, { hojeYmd: "2026-10-22", hora: 7 });
    expect(e.html).toContain("vence hoje");
    expect(e.html).not.toContain("ATRASADO");
    expect(e.total.atrasados.quantidade).toBe(0);
    expect(e.total.hoje.quantidade).toBe(1);
  });
});

import { INTERVALO_MINIMO_ENTRE_ENVIOS_MS, motivoDeNaoEnviar, prepararDiario, type DadosDoDiario } from "../../supabase/functions/_shared/pagamentos/resumoDiario";

describe("motivoDeNaoEnviar — o envio agendado sai hoje?", () => {
  const dados = (o: Omit<Partial<DadosDoDiario>, "config"> & { config?: Partial<DadosDoDiario["config"]> } = {}): DadosDoDiario => ({
    hoje: "2026-10-22", dow: 4, gerado_em: "2026-10-22T10:00:00Z", ultimo_envio_geral: null,
    destinatarios: [{ nome: "Bruno", email: "bruno@x.org" }], itens: [cand({ anexos: [boleto()] })], ...o,
    config: { ativo: true, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, ...o.config },
  });
  const motivo = (d: DadosDoDiario, agora?: number) => motivoDeNaoEnviar(d, prepararDiario(d), agora);

  it("tudo em ordem: envia", () => { expect(motivo(dados())).toBeNull(); });
  it("desligado: não envia (mesmo que o agendamento dispare)", () => { expect(motivo(dados({ config: { ativo: false } }))).toBe("desligado"); });
  it("fora dos dias escolhidos (sábado numa configuração seg–sex): não envia", () => { expect(motivo(dados({ dow: 6 }))).toBe("fora_dos_dias"); });
  it("ligado sem destinatário: recusa (é problema de configuração, não 'nada a fazer')", () => { expect(motivo(dados({ destinatarios: [] }))).toBe("sem_destinatarios"); });
  it("nada a pagar: não envia, a menos que a configuração mande assim mesmo", () => {
    expect(motivo(dados({ itens: [] }))).toBe("nada_a_pagar");
    expect(motivo(dados({ itens: [], config: { enviar_sem_pagamentos: true } }))).toBeNull();
  });
  it("só sigilosos (nada listado): não envia", () => {
    expect(motivo(dados({ itens: [cand({ categoria: "Prebenda", anexos: [boleto()] })] }))).toBe("nada_a_pagar");
  });
  it("já enviado há menos de 20 minutos: não repete (agendamento duplicado, URL pública chamada de novo); depois disso, envia", () => {
    const agora = Date.parse("2026-10-22T10:05:00Z");
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-22T10:00:00Z" }), agora)).toBe("enviado_ha_pouco");
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-22T10:00:00Z" }), agora + INTERVALO_MINIMO_ENTRE_ENVIOS_MS)).toBeNull();
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-21T10:00:00Z" }), agora)).toBeNull();   // ontem
  });
  it("a hora do cumprimento é a do agendamento", () => {
    expect(prepararDiario(dados({ config: { hora: 15 } })).email.html).toContain("boa tarde");
  });
});
