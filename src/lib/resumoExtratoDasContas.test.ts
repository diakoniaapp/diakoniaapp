import { describe, expect, it } from "vitest";
import { avisoDeExtratoDefasado, DIAS_ATE_AVISAR, ddmmaaaa, decidirSaldos, ehContaDeBanco, EXPLICACAO_DO_SALDO_OCULTO, juntarExtrato, lerExtratoDasContas, NOTA_DO_SALDO, situacaoDoExtrato, type ExtratoDaConta } from "../../supabase/functions/_shared/saldos/extratoDasContas";
import { montarEmailDiario } from "../../supabase/functions/_shared/pagamentos/emailDiario";
import { montarBloco, type Digest } from "../../supabase/functions/_shared/resumoSemanal/blocos";
import { prepararDiario, type DadosDoDiario } from "../../supabase/functions/_shared/pagamentos/resumoDiario";

const HOJE = "2026-10-22";
const bradesco = (o: Partial<ExtratoDaConta> = {}): ExtratoDaConta => ({ nome: "Bradesco", saldo: 2058.01, ultimo_movimento: "2026-10-21", ultima_conciliacao: "2026-10-21T15:00:00Z", ...o });
const invest = (o: Partial<ExtratoDaConta> = {}): ExtratoDaConta => ({ nome: "Bradesco Investimento", saldo: 1, ultimo_movimento: "2026-10-22", ultima_conciliacao: null, ...o });
const caixa: ExtratoDaConta = { nome: "Caixa da Secretaria", saldo: 50, ultimo_movimento: null, ultima_conciliacao: null };

describe("situação do extrato de cada conta de banco", () => {
  it("diz até que dia o banco foi importado, em linguagem de gente", () => {
    expect(situacaoDoExtrato(bradesco(), HOJE).texto).toBe("extrato do banco até 21/10 (ontem) · conciliado em 21/10");
    expect(situacaoDoExtrato(invest(), HOJE).texto).toBe("extrato do banco até 22/10 (hoje)");
    expect(situacaoDoExtrato(bradesco({ ultimo_movimento: "2026-10-19" }), HOJE).texto).toContain("(há 3 dias)");
  });
  it("só avisa em destaque depois de DIAS_ATE_AVISAR dias (fim de semana não dispara)", () => {
    expect(DIAS_ATE_AVISAR).toBe(3);
    expect(situacaoDoExtrato(bradesco({ ultimo_movimento: "2026-10-19" }), HOJE).defasado).toBe(false);   // 3 dias
    expect(situacaoDoExtrato(bradesco({ ultimo_movimento: "2026-10-18" }), HOJE).defasado).toBe(true);    // 4 dias
  });
  it("conta de banco que nunca recebeu extrato é defasada e diz isso", () => {
    const s = situacaoDoExtrato({ ultimo_movimento: null, ultima_conciliacao: null }, HOJE);
    expect(s).toMatchObject({ defasado: true, dias: null });
    expect(s.texto).toBe("nenhum extrato do banco importado");
  });
  it("o dia da conciliação é o de Brasília, não o de UTC (21h30 BRT = 00h30 UTC do dia seguinte)", () => {
    expect(situacaoDoExtrato(bradesco({ ultima_conciliacao: "2026-10-22T00:30:00Z" }), HOJE).texto).toContain("conciliado em 21/10");
  });
  it("caixa físico (sem extrato) não é conta de banco; Bradesco e Investimento são, mesmo sem nenhuma linha", () => {
    expect(ehContaDeBanco(caixa)).toBe(false);
    expect(ehContaDeBanco({ nome: "Bradesco", ultimo_movimento: null })).toBe(true);
    expect(ehContaDeBanco({ nome: "Bradesco Investimento", ultimo_movimento: null })).toBe(true);
  });
});

describe("aviso no topo", () => {
  it("vazio quando todas as contas de banco estão em dia", () => {
    expect(avisoDeExtratoDefasado([bradesco(), invest(), caixa], HOJE)).toBe("");
  });
  it("cita a conta e a data quando uma está defasada (o caixa nunca entra)", () => {
    const a = avisoDeExtratoDefasado([bradesco({ ultimo_movimento: "2026-10-15" }), invest(), caixa], HOJE);
    expect(a).toContain("Bradesco (extrato do banco até 15/10 (há 7 dias))");
    expect(a).not.toContain("Caixa");
    expect(a).not.toContain("Investimento");
  });
});

describe("juntar a data do extrato às contas do resumo semanal", () => {
  it("casa por nome e deixa intocada a conta sem correspondência", () => {
    const r = juntarExtrato([{ nome: "Bradesco", saldo: 10 }, { nome: "Outra", saldo: 5 }], [bradesco()]);
    expect(r[0]).toMatchObject({ nome: "Bradesco", saldo: 10, ultimo_movimento: "2026-10-21" });
    expect(r[1]).toEqual({ nome: "Outra", saldo: 5 });
  });
});

describe("leitura da função do banco", () => {
  it("sem a migration (erro) devolve vazio: o e-mail sai do mesmo jeito", async () => {
    expect(await lerExtratoDasContas({ rpc: async () => ({ data: null, error: { message: "function does not exist" } }) })).toEqual([]);
    expect(await lerExtratoDasContas({ rpc: async () => { throw new Error("rede"); } })).toEqual([]);
  });
  it("normaliza a data para AAAA-MM-DD", async () => {
    const r = await lerExtratoDasContas({ rpc: async () => ({ data: [{ nome: "Bradesco", saldo: "100.5", ultimo_movimento: "2026-10-21", ultima_conciliacao: null }], error: null }) });
    expect(r).toEqual([{ nome: "Bradesco", saldo: 100.5, ultimo_movimento: "2026-10-21", ultima_conciliacao: null }]);
  });
});

describe("e-mail diário", () => {
  const email = (contas?: ExtratoDaConta[]) => montarEmailDiario([], { hojeYmd: HOJE, hora: 7, contas });
  it("traz o saldo de Bradesco e Investimento com a data do extrato e a nota; o caixa fica de fora", () => {
    const e = email([bradesco(), invest(), caixa]);
    expect(e.html).toContain("Saldo das contas");
    expect(e.html).toContain("Bradesco");
    expect(e.html).toContain("extrato do banco até 21/10 (ontem)");
    expect(e.html).toContain("Bradesco Investimento");
    expect(e.html).toContain("extrato do banco até 22/10 (hoje)");
    expect(e.html).not.toContain("Caixa da Secretaria");
    expect(e.html).toContain(NOTA_DO_SALDO);
    expect(e.texto).toContain("SALDO DAS CONTAS");
    expect(e.texto).toContain(NOTA_DO_SALDO);
    expect(e.html).not.toContain("Extrato desatualizado");
  });
  it("com extrato velho, o aviso vai para o TOPO, antes de qualquer pagamento", () => {
    const e = email([bradesco({ ultimo_movimento: "2026-10-10" }), invest()]);
    expect(e.html).toContain("Extrato desatualizado");
    expect(e.html.indexOf("Extrato desatualizado")).toBeLessThan(e.html.indexOf("Saldo das contas"));
    expect(e.texto).toContain("⚠ Extrato desatualizado: Bradesco (extrato do banco até 10/10 (há 12 dias))");
  });
  it("sem dados de extrato (migration não aplicada) o e-mail sai sem o bloco de saldo, como antes", () => {
    expect(email(undefined).html).not.toContain("Saldo das contas");
    expect(email([]).html).not.toContain("Saldo das contas");
  });
  it("o saldo não faz o resumo sair sozinho: sem pagamento, `listados` continua vazio", () => {
    expect(email([bradesco()]).listados).toHaveLength(0);
  });
  const pacote = (config: Partial<DadosDoDiario["config"]> = {}): DadosDoDiario => ({ hoje: HOJE, dow: 4, gerado_em: "2026-10-22T10:00:00Z", ultimo_envio_geral: null, destinatarios: [], itens: [], contas_extrato: [bradesco()],
    config: { ativo: true, dias_semana: [4], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: true, ...config } });
  it("o RESUMO DIÁRIO NÃO leva saldo (decisão de 27/10/2026): mesmo com as contas no pacote, o e-mail sai sem o bloco", () => {
    const e = prepararDiario(pacote()).email;
    expect(e.html).not.toContain("Saldo das contas");
    expect(e.texto).not.toContain("SALDO DAS CONTAS");
    expect(e.html).not.toContain("Extrato desatualizado");   // sem saldo, sem aviso de extrato velho no topo
  });
  it("só com incluir_saldos ligado (que nenhuma tela oferece hoje) o diário repassa as contas do pacote", () => {
    expect(prepararDiario(pacote({ incluir_saldos: true })).email.html).toContain("extrato do banco até 21/10");
  });
});

describe("e-mail semanal — bloco Saldo das contas", () => {
  const digest = (contas: { nome: string; saldo: number; ultimo_movimento?: string | null; ultima_conciliacao?: string | null }[]): Digest => ({
    pastoral: { aniversarios_semana: 0, bodas_semana: 0, visitantes_sem_contato: 0, candidatos_batismo: 0 },
    secretaria: { sem_telefone: 0, membresia_em_andamento: 0, atas_pendentes: 0, pautas_rascunho: 0 },
    tesouraria: { fiscal_atrasados: 0, fiscal_urgentes: 0, caixas_abertos: 0, aprovacoes_pendentes: 0, centros_criticos: 0, saldo_contas: { total: contas.reduce((t, c) => t + c.saldo, 0), contas } },
    gerado_em: "2026-10-22T10:00:00Z",
  });
  it("cada conta de banco ganha a data do extrato; a nota geral fecha a lista", () => {
    const b = montarBloco("saldo_contas", digest([bradesco(), invest(), caixa]))!;
    expect(b.itens[0]).toContain("Bradesco: R$");
    expect(b.itens[0]).toContain("extrato do banco até 21/10 (ontem)");
    expect(b.itens[1]).toContain("extrato do banco até 22/10 (hoje)");
    expect(b.itens[2]).toBe(`Caixa da Secretaria: ${b.itens[2].split(": ")[1]}`);   // caixa físico: sem data
    expect(b.itens.at(-1)).toBe(NOTA_DO_SALDO);
    expect(b.tom).toBe("info");
  });
  // A REGRA DO SALDO (27/10/2026): conta de banco com extrato de mais de 3 dias tem o saldo OCULTADO, e o e-mail diz até quando vai o extrato
  it("extrato velho em UMA conta: o saldo dela é ocultado, o da outra segue, e NÃO há total (seria uma soma parcial)", () => {
    const b = montarBloco("saldo_contas", digest([bradesco({ ultimo_movimento: "2026-10-10" }), invest()]))!;
    expect(b.tom).toBe("atencao");
    expect(b.frase).toBe("Saldo das contas parcialmente ocultado: o extrato de Bradesco está desatualizado.");
    expect(b.itens).toEqual([
      expect.stringContaining("Bradesco Investimento: R$"),
      "Bradesco: saldo ocultado — extrato do banco até 10/10 (há 12 dias)",
      EXPLICACAO_DO_SALDO_OCULTO,
    ]);
    expect(b.itens.join(" ")).not.toContain("2.058,01");   // o saldo velho do Bradesco não aparece em lugar nenhum
    expect(b.frase).not.toContain("Saldo nas contas:");
  });
  it("todas as contas de banco velhas: 'Saldo das contas ocultado' com a ÚLTIMA ATUALIZAÇÃO BANCÁRIA e a explicação", () => {
    const b = montarBloco("saldo_contas", digest([bradesco({ ultimo_movimento: "2026-10-10" }), invest({ ultimo_movimento: "2026-10-12" })]))!;
    expect(b.frase).toBe("Saldo das contas ocultado. Última atualização bancária: 12/10/2026.");
    expect(b.itens.at(-1)).toBe("Os saldos foram ocultados para evitar interpretações baseadas em dados desatualizados.");
    expect(b.itens.join(" ")).not.toMatch(/R\$ \d/);   // nenhum valor de saldo
  });
  it("exatamente 3 dias ainda mostra; 4 oculta (a regra dos 3 dias)", () => {
    expect(montarBloco("saldo_contas", digest([bradesco({ ultimo_movimento: "2026-10-19" })]))!.frase).toContain("Saldo nas contas:");
    expect(montarBloco("saldo_contas", digest([bradesco({ ultimo_movimento: "2026-10-18" })]))!.frase).toContain("ocultado");
  });
  it("conta de banco que nunca recebeu extrato tem o saldo ocultado e o bloco diz que não há extrato importado", () => {
    const b = montarBloco("saldo_contas", digest([{ nome: "Bradesco", saldo: 10, ultimo_movimento: null, ultima_conciliacao: null }]))!;
    expect(b.frase).toBe("Saldo das contas ocultado. Última atualização bancária: nenhum extrato importado.");
    expect(b.itens[0]).toBe("Bradesco: saldo ocultado — nenhum extrato do banco importado");
    expect(b.tom).toBe("atencao");
  });
  it("sem a data (migration não aplicada) não há como conferir: o saldo da conta de banco também é ocultado", () => {
    const b = montarBloco("saldo_contas", digest([{ nome: "Bradesco", saldo: 10 }]))!;
    expect(b.itens[0]).toBe("Bradesco: saldo ocultado — não foi possível conferir a data do último extrato");
    expect(b.frase).toContain("ocultado");
  });
  it("o caixa físico (sem extrato) nunca é ocultado", () => {
    const b = montarBloco("saldo_contas", digest([bradesco({ ultimo_movimento: "2026-10-01" }), caixa]))!;
    expect(b.itens[0]).toContain("Caixa da Secretaria: R$ 50,00");
  });
});

describe("decidirSaldos — a regra pura", () => {
  it("separa visíveis e ocultas e guarda a data do extrato mais recente entre as contas de banco", () => {
    const d = decidirSaldos([bradesco({ ultimo_movimento: "2026-10-12" }), invest({ ultimo_movimento: "2026-10-14" }), caixa], HOJE);
    expect(d.visiveis.map(c => c.nome)).toEqual(["Caixa da Secretaria"]);
    expect(d.ocultas.map(o => o.nome)).toEqual(["Bradesco", "Bradesco Investimento"]);
    expect(d.ultimaAtualizacaoBancaria).toBe("2026-10-14");
  });
  it("a data sai em dd/mm/aaaa", () => { expect(ddmmaaaa("2026-10-05")).toBe("05/10/2026"); });
});
