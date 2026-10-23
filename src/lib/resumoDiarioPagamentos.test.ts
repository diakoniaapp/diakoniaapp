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

/** O texto que o leitor vê: sem tags e com espaços colapsados (o HTML agora é de cartões, e o teste não deve depender da marcação). */
const semTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

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
    expect(e.contagem).toEqual({ pagar: 3, conferir: 1, semMeio: 1, sigilosos: 1, sigilososIncluidos: 0, reembolsos: 0 });
  });
  it("atrasada primeiro; mostra o banco, a linha em grupos de 5 e a ORIGEM do código", () => {
    expect(e.html.indexOf("LIGHT SERVIÇOS")).toBeLessThan(e.html.indexOf("CEDAE"));
    expect(semTags(e.html)).toContain("Boleto bancário · Bradesco");
    expect(semTags(e.html)).toContain("R$ 300,00");
    expect(semTags(e.html)).toContain("Vencimento 17/10/2026");
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
    expect(e.html).toContain("Abrir o DiakoniaApp");
    expect(e.html).toContain("DiakoniaApp");
    expect(e.texto).toContain("PARA PAGAR");
    expect(e.texto).toContain("Abrir o DiakoniaApp: https://portal.diakoniaapp.com.br");
  });
  it("o registro de 'já enviado' recebe tudo o que foi listado, menos os sigilosos", () => {
    expect(e.listados.map(i => i.id).sort()).toEqual(["atras", "conf", "hoje", "pix", "sem"]);
  });
  it("a abertura institucional é a mesma em qualquer hora, e o aviso de prévia vem no topo", () => {
    expect(montarEmailDiario(itens, { hojeYmd: hoje, hora: 7 }).html).toContain("Prezados, graça e paz!");
    expect(montarEmailDiario(itens, { hojeYmd: hoje, hora: 14, aviso: "PRÉVIA — nada foi enviado" }).html).toMatch(/PRÉVIA.*Prezados, graça e paz!/s);
    expect(montarEmailDiario(itens, { hojeYmd: hoje, hora: 7 }).html).toContain("favor contatar a equipe administrativa da igreja.");
  });
  it("sem nada a pagar, o e-mail diz isso (a Edge Function decide se envia)", () => {
    const v = montarEmailDiario([], { hojeYmd: hoje, hora: 7 });
    expect(v.assunto).toBe("Resumo diário da Tesouraria | 22.10.2026");
    expect(v.html).toContain("Não há pagamentos em aberto nesta data.");
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
    expect(semTags(e.html)).toContain("Vencimento 12/10/2026");
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

import { INTERVALO_MINIMO_ENTRE_ENVIOS_MS, motivoDeNaoEnviar, motivoDeNaoEnviarAgora, prepararDiario, type DadosDoDiario } from "../../supabase/functions/_shared/pagamentos/resumoDiario";

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
    expect(motivo(dados({ itens: [cand({ categoria: "Prebenda", anexos: [boleto()] })], config: { incluir_sigilosos: false } }))).toBe("nada_a_pagar");
  });
  it("já enviado há menos de 20 minutos: não repete (agendamento duplicado, URL pública chamada de novo); depois disso, envia", () => {
    const agora = Date.parse("2026-10-22T10:05:00Z");
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-22T10:00:00Z" }), agora)).toBe("enviado_ha_pouco");
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-22T10:00:00Z" }), agora + INTERVALO_MINIMO_ENTRE_ENVIOS_MS)).toBeNull();
    expect(motivo(dados({ ultimo_envio_geral: "2026-10-21T10:00:00Z" }), agora)).toBeNull();   // ontem
  });
  it("a saudação não depende da hora do agendamento: é a institucional (a mesma na visualização, no teste e no envio)", () => {
    for (const hora of [7, 15, 21]) expect(prepararDiario(dados({ config: { hora } })).email.html).toContain("Prezados, graça e paz!");
  });
});

describe("a linha digitável INFORMADA no lançamento, sem anexo (23/10/2026 — fatura Amil)", () => {
  const informada = "23793381286000782713695000063305975520000010000";
  it("sem nenhum anexo, a linha informada vira o meio de pagamento: sai em 'Para pagar', com a origem dita", () => {
    const i = itemDoDia(cand({ linha_digitavel: informada }));
    expect(i.linha).toBe(informada);
    expect(i.origem).toBe("linha_informada");
    expect(secaoDoItem(i)).toBe("pagar");
    const e = montarEmailDiario([i], { hojeYmd: "2026-10-22", hora: 7 });
    expect(e.html).toContain("Linha digitável informada no lançamento");
    expect(e.html).toContain("23793 38128 60007 82713 69500 00633 05975 52000 00100 00");
    expect(e.html).not.toContain("Sem linha digitável nem Pix");
    expect(e.texto).toContain("Linha digitável informada no lançamento");
  });
  it("a leitura do DOCUMENTO continua mandando: com linha no anexo, a informada não entra", () => {
    const doc = "34191790010104351004791020150008291070026000";
    const i = itemDoDia(cand({ linha_digitavel: informada, anexos: [boleto({ linhaDigitavel: "34191000000000000000000000000000000000000000000" })] }));
    expect(i.origem).toBe("linha_documento");
    expect(i.linha).not.toBe(informada);
    expect(doc).toBeTruthy();
  });
  it("a informada vale mais que o Pix do cadastro (ordem: linha > Pix do documento > Pix do cadastro)", () => {
    const i = itemDoDia(cand({ linha_digitavel: informada, chave_pix: "12345678909", tipo_chave_pix: "cpf" }));
    expect(i.origem).toBe("linha_informada");
    expect(i.pix).toBeNull();
  });
  it("com pontos e espaços, só os dígitos; vazio ou em branco é como não ter", () => {
    expect(itemDoDia(cand({ linha_digitavel: "23793.38128 60007.827136 95000.063305 9 75520000010000" })).linha).toBe(informada);
    expect(itemDoDia(cand({ linha_digitavel: "   " })).origem).toBeNull();
    expect(itemDoDia(cand({ linha_digitavel: null })).origem).toBeNull();
  });
});

describe("motivoDeNaoEnviarAgora — o botão 'Enviar agora' do painel Resumo diário (23/10/2026)", () => {
  const dados = (o: Omit<Partial<DadosDoDiario>, "config"> & { config?: Partial<DadosDoDiario["config"]> } = {}): DadosDoDiario => ({
    hoje: "2026-10-23", dow: 6, gerado_em: "2026-10-23T10:00:00Z", ultimo_envio_geral: null,
    destinatarios: [{ nome: "Bruno", email: "bruno@x.org" }], itens: [cand({ anexos: [boleto()] })], ...o,
    config: { ativo: false, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, ...o.config },
  });
  const agora = (d: DadosDoDiario, t?: number) => motivoDeNaoEnviarAgora(d, prepararDiario(d), t);

  it("ignora o interruptor e os dias da semana: desligado, num sábado, e mesmo assim envia (é um pedido de uma pessoa, não o agendamento)", () => {
    const d = dados();
    expect(motivoDeNaoEnviar(d, prepararDiario(d))).toBe("desligado");   // o agendamento não sairia
    expect(agora(d)).toBeNull();                                         // o botão envia
  });
  it("mantém o que protege de erro: sem destinatário, repetição em 20 minutos e nada a pagar", () => {
    expect(agora(dados({ destinatarios: [] }))).toBe("sem_destinatarios");
    const t = Date.parse("2026-10-23T10:05:00Z");
    expect(agora(dados({ ultimo_envio_geral: "2026-10-23T10:00:00Z" }), t)).toBe("enviado_ha_pouco");
    expect(agora(dados({ ultimo_envio_geral: "2026-10-23T10:00:00Z" }), t + INTERVALO_MINIMO_ENTRE_ENVIOS_MS)).toBeNull();
    expect(agora(dados({ itens: [] }))).toBe("nada_a_pagar");
    expect(agora(dados({ itens: [], config: { enviar_sem_pagamentos: true } }))).toBeNull();
  });
  it("o agendamento segue igual: a ordem desligado → fora dos dias → o resto não mudou", () => {
    const d = dados({ config: { ativo: true }, dow: 6 });
    expect(motivoDeNaoEnviar(d, prepararDiario(d))).toBe("fora_dos_dias");
    expect(motivoDeNaoEnviar(dados({ config: { ativo: true }, dow: 4, destinatarios: [] }), prepararDiario(dados({ config: { ativo: true }, dow: 4 })))).toBe("sem_destinatarios");
  });
});

import { enviarDiarioAosDestinatarios } from "../../supabase/functions/_shared/pagamentos/enviarDiario";
import { vi } from "vitest";

describe("enviarDiarioAosDestinatarios — o envio e o registro que o agendamento e o 'Enviar agora' dividem", () => {
  const d: DadosDoDiario = {
    hoje: "2026-10-23", dow: 5, gerado_em: "2026-10-23T10:00:00Z", ultimo_envio_geral: null,
    destinatarios: [{ nome: "Bruno", email: "bruno@x.org" }, { nome: "Lúcio", email: "lucio@x.org" }],
    itens: [cand({ id: "l1", anexos: [boleto()] }), cand({ id: "l2", anexos: [boleto()] })],
    config: { ativo: true, dias_semana: [5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false },
  };
  const bd = () => { const gravado: unknown[][] = []; return { gravado, cliente: { from: (t: string) => ({ insert: async (l: unknown[]) => { gravado.push([t, l]); return { error: null }; } }) } }; };

  it("manda um e-mail para CADA destinatário e registra o que foi listado, uma vez", async () => {
    const chamadas: { to: string[] }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => { chamadas.push(JSON.parse(init.body)); return { ok: true, text: async () => "" }; });
    const { gravado, cliente } = bd();
    const r = await enviarDiarioAosDestinatarios(cliente, "chave", "Diakonia <r@x.org>", d, prepararDiario(d));
    vi.unstubAllGlobals();
    expect(r).toMatchObject({ ok: true, enviados: 2, falharam: 0, itens: 2, registrados: 2 });
    expect(chamadas.map(c => c.to[0]).sort()).toEqual(["bruno@x.org", "lucio@x.org"]);
    expect(gravado).toHaveLength(1);
    expect(gravado[0][0]).toBe("resumo_diario_enviados");
    expect((gravado[0][1] as { lancamento_id: string; destinatarios: number }[]).map(l => [l.lancamento_id, l.destinatarios])).toEqual([["l1", 2], ["l2", 2]]);
  });
  it("se um e-mail falha e o outro sai, avisa quantos falharam e AINDA registra (o outro destinatário recebeu)", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => (++n === 1 ? { ok: true, text: async () => "" } : { ok: false, text: async () => "caixa cheia" }));
    const { gravado, cliente } = bd();
    const r = await enviarDiarioAosDestinatarios(cliente, "chave", "Diakonia <r@x.org>", d, prepararDiario(d));
    vi.unstubAllGlobals();
    expect(r).toMatchObject({ ok: true, enviados: 1, falharam: 1 });
    expect(gravado).toHaveLength(1);
  });
  it("se NENHUM sai, é erro e nada é registrado (o e-mail seguinte não pode dizer 'já enviado')", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, text: async () => "chave inválida" }));
    const { gravado, cliente } = bd();
    const r = await enviarDiarioAosDestinatarios(cliente, "chave", "Diakonia <r@x.org>", d, prepararDiario(d));
    vi.unstubAllGlobals();
    expect(r.ok).toBe(false);
    expect(gravado).toHaveLength(0);
  });
});
