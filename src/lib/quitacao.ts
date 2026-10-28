// ─── lib/quitacao.ts — QUEM quitou a obrigação e POR QUÊ (Responsável, Intenção, Grau de Prova), puro e testado ─────────────────────
//
// Fase 1 da Política de Compras por Terceiros, Reembolsos e Doações (docs/ESPECIFICACAO_FUNCIONAL_*, docs/ADENDO_RESPONSAVEL_E_INTENCAO_DA_QUITACAO_*,
// docs/FASE1_PROPOSTA_TECNICA_QUITACAO_*). A obrigação continua sendo a identidade; a Quitação são FATOS (quem pagou, a intenção, as datas, o que foi
// anexado). Tudo o mais é DERIVADO daqui: o grau de prova, o nível de risco, a suficiência, o resultado, o credor, a fila.
//
// Esta é a definição única, no aplicativo, da regra que a função `fin_quitacao_avaliar` do banco também implementa
// (migration 20261014110000). Os dois são provados equivalentes em milhares de cenários (docs/QUITACAO_ENSAIO.sql + ensaio local).
//
// O QUE NÃO É GUARDADO (decisão dela, 13/10/2026: "não quero campos redundantes quando o sistema puder inferir"):
//   · o GRAU de prova — nasce dos anexos: com a prova do pagamento do terceiro é Formal, sem ela é Relatado; a declaração assinada idem para a intenção;
//   · o NÍVEL de risco, a suficiência, a fila, o resultado, o credor atual, a extinção.
// PADRÕES CONSERVADORES (aprovados por ela, valem até o escritório decidir): bem durável sem limite de capitalização = Alto · Empresa sem histórico de
// pagamentos = Médio · reembolso exige Formal · compensação de adiantamento exige Formal · responsável não identificado nunca é suficiente.

export type ResponsavelTipo = "igreja" | "pessoa" | "empresa" | "entidade" | "ninguem_ainda" | "nao_localizado";
export type Intencao = "reembolso" | "oferta" | "compensacao_adiantamento" | "nao_declarada" | "nao_se_aplica";
export type Grau = "nenhum" | "relatado" | "formal";
export type Nivel = "baixo" | "medio" | "alto";
export type NaturezaDoItem = "consumo" | "estoque" | "duravel" | "servico";
/** A conta estrutural das compras pagas por terceiros (oferta): não é conta financeira, é invisível nos seletores e tem saldo zero. Mesmo id do banco (migration 20261016140100). */
export const CONTA_NAO_APLICAVEL_ID = "00000000-0000-4000-8000-0000000000a1";
export const NOME_CONTA_NAO_APLICAVEL = "Não Aplicável (Compras Pagas por Terceiros)";

export type Fila = "investigar" | "a_esclarecer" | "formalizar" | "aprovar_reembolso" | "reembolso_a_pagar";
export type Resultado =
  | "em_aberto" | "pago_pela_igreja" | "sem_quitacao_localizada" | "a_esclarecer" | "a_formalizar"
  | "reembolso_em_analise" | "divida_com_terceiro" | "reembolsada" | "extinta_como_oferta" | "compensada";

/** Quem é o terceiro (Pessoa, Empresa ou Entidade) — o que tem cadastro e pode ter quitado. */
export const TERCEIROS: ResponsavelTipo[] = ["pessoa", "empresa", "entidade"];
export const ehTerceiro = (t: ResponsavelTipo | string | null | undefined): boolean => TERCEIROS.includes(t as ResponsavelTipo);

export const ROTULO_RESPONSAVEL: Record<ResponsavelTipo, string> = {
  igreja: "Igreja", pessoa: "Pessoa", empresa: "Empresa", entidade: "Entidade", ninguem_ainda: "Ninguém ainda", nao_localizado: "Não localizado",
};
export const ROTULO_INTENCAO: Record<Intencao, string> = {
  reembolso: "Reembolso", oferta: "Oferta", compensacao_adiantamento: "Compensação de adiantamento", nao_declarada: "Não declarada", nao_se_aplica: "Não se aplica",
};
export const ROTULO_GRAU: Record<Grau, string> = { nenhum: "Nenhum", relatado: "Relatado", formal: "Formal" };
export const ROTULO_NIVEL: Record<Nivel, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" };
export const ROTULO_FILA: Record<Fila, string> = {
  investigar: "Investigar", a_esclarecer: "A esclarecer", formalizar: "Formalizar", aprovar_reembolso: "Aprovar reembolso", reembolso_a_pagar: "Reembolso a pagar",
};
export const ROTULO_RESULTADO: Record<Resultado, string> = {
  em_aberto: "Em aberto", pago_pela_igreja: "Pago pela Igreja", sem_quitacao_localizada: "Sem quitação localizada", a_esclarecer: "A esclarecer",
  a_formalizar: "A formalizar", reembolso_em_analise: "Reembolso em análise", divida_com_terceiro: "Dívida com o terceiro", reembolsada: "Reembolsada",
  extinta_como_oferta: "Extinta como oferta", compensada: "Compensada por adiantamento",
};

/** Tipos de anexo que PROVAM a quitação — não são "o documento original" da despesa (nota, boleto, fatura…) nem o comprovante do pagamento da igreja. */
export const ANEXOS_DA_QUITACAO = ["declaracao_terceiro", "pedido_reembolso", "prova_pagamento_terceiro"] as const;
export const ehAnexoDaQuitacao = (tipo: string | null | undefined): boolean => (ANEXOS_DA_QUITACAO as readonly string[]).includes(String(tipo));
/** O que conta como "documento original" da obrigação: tudo que não é comprovante nem prova da quitação (a mesma regra de vw_fin_ciclo). */
export const ehDocumentoOriginal = (tipo: string | null | undefined): boolean => String(tipo) !== "comprovante" && !ehAnexoDaQuitacao(tipo);

// ── parâmetros (fin_quitacao_parametros) ───────────────────────────────────────────────────────────────────────────────────────────

export interface ParametrosDaQuitacao {
  /** AAAA-MM-DD; null = a Política está DESLIGADA e nada bloqueia o fechamento nem o malote */
  vigencia: string | null;
  teto1: number;
  prazoDeclaracaoDias: number;
  tetoAnualTerceiro: number;
  qtdRelatadasTrimestre: number;
  prazoFormalizacaoDias: number;
  prazoEsclarecimentoDias: number;
  prazoReembolsoDias: number;
  /** null = o escritório ainda não definiu: todo bem durável conta como Alto (exige prova Formal) */
  limiteCapitalizacao: number | null;
}
export const PARAMETROS_PADRAO: ParametrosDaQuitacao = {
  vigencia: null, teto1: 500, prazoDeclaracaoDias: 30, tetoAnualTerceiro: 2000, qtdRelatadasTrimestre: 3,
  prazoFormalizacaoDias: 30, prazoEsclarecimentoDias: 30, prazoReembolsoDias: 10, limiteCapitalizacao: null,
};

// ── graus ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ORDEM_GRAU: Record<Grau, number> = { nenhum: 0, relatado: 1, formal: 2 };
export const menorGrau = (a: Grau, b: Grau): Grau => (ORDEM_GRAU[a] <= ORDEM_GRAU[b] ? a : b);

/**
 * O grau de prova NASCE DOS ANEXOS, não é digitado: quem registra a quitação já está "relatando" (Relatado); o comprovante do pagamento do terceiro
 * torna o RESPONSÁVEL Formal; a declaração assinada (ou o Pedido de Reembolso) torna a INTENÇÃO Formal. Responsável "Não localizado" e intenção
 * "Não declarada" são Nenhum. Assim ninguém consegue afirmar "Formal" sem o documento estar no sistema.
 */
export function grausDaQuitacao(q: { responsavel: ResponsavelTipo; intencao: Intencao; anexos: readonly string[] }): { responsavel: Grau; intencao: Grau } {
  if (!ehTerceiro(q.responsavel)) return { responsavel: "nenhum", intencao: "nenhum" };
  const responsavel: Grau = q.anexos.includes("prova_pagamento_terceiro") ? "formal" : "relatado";
  let intencao: Grau;
  if (q.intencao === "nao_declarada" || q.intencao === "nao_se_aplica") intencao = "nenhum";
  else if (q.intencao === "reembolso") intencao = q.anexos.includes("pedido_reembolso") || q.anexos.includes("declaracao_terceiro") ? "formal" : "relatado";
  else intencao = q.anexos.includes("declaracao_terceiro") ? "formal" : "relatado";
  return { responsavel, intencao };
}

// ── CNPJ e chave de acesso da NF-e ─────────────────────────────────────────────────────────────────────────────────────────────────

const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** CNPJ válido: 14 dígitos, não todos iguais, dígitos verificadores (módulo 11) conferem. */
export function cnpjValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((s, c, i) => s + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(d.slice(0, 12), p1);
  const d2 = dv(d.slice(0, 12) + d1, p2);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Chave de acesso da NF-e/NFS-e nacional: 44 dígitos, o último é o verificador (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function chaveNfeValida(chave: string | null | undefined): boolean {
  const d = soDigitos(chave);
  if (d.length !== 44 || String(chave ?? "").replace(/\s/g, "") !== d) return false;
  let peso = 2, soma = 0;
  for (let i = 42; i >= 0; i--) { soma += Number(d[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  const dv = r === 0 || r === 1 ? 0 : 11 - r;
  return dv === Number(d[43]);
}

/** O CNPJ do emitente está dentro da chave (posições 7 a 20): serve para conferir a chave contra o fornecedor cadastrado. */
export const cnpjDaChave = (chave: string | null | undefined): string | null => (soDigitos(chave).length === 44 ? soDigitos(chave).slice(6, 20) : null);

// ── a Matriz de Suficiência da Prova (cláusula 3.7 da Política) ────────────────────────────────────────────────────────────────────

export interface EntradaDaMatriz {
  responsavel: ResponsavelTipo;
  intencao: Intencao;
  grauResponsavel: Grau;
  grauIntencao: Grau;
  naturezaItem: NaturezaDoItem | null;
  valor: number;
  /** eixo 3 */
  temNotaAnexada: boolean;
  /** o comprador é a igreja por documento no CNPJ (e não por contratação prévia) */
  compradorCnpjIgreja: boolean;
  /** a chave de acesso foi digitada (a oferta não a exige; se informada, tem de ser válida e do emitente) */
  chaveInformada?: boolean;
  chaveValida: boolean;
  /** o CNPJ dentro da chave é o do fornecedor cadastrado */
  chaveConfereComEmitente: boolean;
  /** eixo 4 */
  terceiroNoCircuito: boolean;
  terceiroMinistro: boolean;
  empresaComPagamentos12m: boolean;
  intencaoAlteradaRecentemente: boolean;
  pedeReciboFiscal: boolean;
  /** eixo 1: oferta com condição, destinação restrita */
  ofertaComCondicao: boolean;
  /** moduladores */
  diasEntrePagamentoEDeclaracao: number | null;
  acumuladoAnoDoTerceiro: number;
  qtdRelatadasNoTrimestre: number;
  periodoDaDespesaAprovado: boolean;
  /** o Relatado já passou do prazo de formalização */
  formalizacaoVencida: boolean;
  /** o Administrador já aprovou o grau Relatado desta quitação (vale para o nível Médio) */
  aprovadoPeloAdministrador: boolean;
  /**
   * A obrigação já foi paga pela igreja por inteiro (Opção B, 28/10/2026): no REEMBOLSO a declaração assinada deixa de ser exigida ANTES de pagar — o recebedor a assina no ato do pagamento — e passa a ser
   * exigida DEPOIS de pago. Ausente = ainda não paga.
   */
  paga?: boolean;
  parametros: Pick<ParametrosDaQuitacao, "teto1" | "prazoDeclaracaoDias" | "tetoAnualTerceiro" | "qtdRelatadasTrimestre" | "limiteCapitalizacao">;
}

export interface AvaliacaoDaMatriz {
  eixos: { natureza: Nivel; patrimonio: Nivel; lastro: Nivel; relacao: Nivel };
  /** M1…M4 acionados, mais "vencida" quando a formalização passou do prazo */
  moduladores: string[];
  nivel: Nivel;
  grauConjunto: Grau;
  suficiente: boolean;
  /** Relatado em nível Médio: falta a aprovação do Administrador */
  exigeAprovacaoDoAdministrador: boolean;
  /** quando insuficiente, por quê (para a tela dizer o que falta) */
  motivo: string | null;
  /** só para OFERTA: a regra simples que decidiu (revisão da Matriz de 15/10/2026); `null` = valeu a Matriz de sempre */
  regraDaOferta: RegraDaOferta | null;
}

/** `oferta_formalizada` = nota da igreja + Declaração do Terceiro assinada, sem comprovante do pagamento; `oferta_alto_risco` = comprovante do pagamento OU aprovação formal do Administrador. */
export type RegraDaOferta = "oferta_formalizada" | "oferta_alto_risco";
/** O começo da mensagem de uma oferta de alto risco (a tela só oferece "anexar o comprovante" nesse caso). */
export const MOTIVO_OFERTA_ALTO_RISCO = "Oferta de alto risco";

const NIVEIS: Nivel[] = ["baixo", "medio", "alto"];
const maxNivel = (...ns: Nivel[]): Nivel => NIVEIS[Math.max(...ns.map(n => NIVEIS.indexOf(n)))];
const sobe = (n: Nivel, passos: number): Nivel => NIVEIS[Math.min(NIVEIS.length - 1, NIVEIS.indexOf(n) + passos)];

export function avaliarQuitacao(e: EntradaDaMatriz): AvaliacaoDaMatriz {
  const p = e.parametros;
  // eixo 1 — o que a intenção faz acontecer
  const natureza: Nivel = e.intencao === "reembolso" || e.intencao === "compensacao_adiantamento" || e.intencao === "nao_declarada" || e.intencao === "nao_se_aplica"
    ? "alto" : e.ofertaComCondicao ? "medio" : "baixo";
  // eixo 2 — patrimônio (sem natureza informada ou sem limite de capitalização definido: o lado seguro, Alto)
  const patrimonio: Nivel = e.naturezaItem === null ? "alto"
    : e.naturezaItem !== "duravel" ? "baixo"
    : p.limiteCapitalizacao === null || e.valor >= p.limiteCapitalizacao ? "alto" : "medio";
  const chaveOk = e.chaveValida && e.chaveConfereComEmitente;
  // eixo 3 — lastro de nota fiscal
  let lastro: Nivel = !e.temNotaAnexada ? "alto"
    : e.compradorCnpjIgreja && chaveOk ? "baixo" : "medio";
  // eixo 4 — risco da relação
  let relacao: Nivel = "baixo";
  if (e.responsavel === "pessoa") relacao = e.pedeReciboFiscal || e.terceiroNoCircuito ? "alto" : e.terceiroMinistro || e.intencaoAlteradaRecentemente ? "medio" : "baixo";
  else if (e.responsavel === "empresa") relacao = e.pedeReciboFiscal || e.empresaComPagamentos12m ? "alto" : "medio";
  else if (e.responsavel === "entidade") relacao = e.pedeReciboFiscal ? "alto" : "medio";

  let grauConjunto = menorGrau(e.grauResponsavel, e.grauIntencao);

  let moduladores: string[] = [];
  if (e.diasEntrePagamentoEDeclaracao !== null && e.diasEntrePagamentoEDeclaracao > p.prazoDeclaracaoDias) moduladores.push("M1");
  if (e.valor > p.teto1) moduladores.push("M2");
  if (e.acumuladoAnoDoTerceiro > p.tetoAnualTerceiro || e.qtdRelatadasNoTrimestre >= p.qtdRelatadasTrimestre) moduladores.push("M3");
  if (e.periodoDaDespesaAprovado) moduladores.push("M4");
  const vencida = grauConjunto === "relatado" && e.formalizacaoVencida;
  const qtdModuladores = moduladores.length;
  if (vencida) moduladores.push("vencida");

  const base = maxNivel(natureza, patrimonio, lastro, relacao);
  // até dois níveis pelos moduladores M1–M4; a formalização vencida sobe mais um (cláusulas 3.7.3 e 3.7.4)
  const passos = Math.min(2, qtdModuladores) + (vencida ? 1 : 0);
  let nivel = sobe(base, passos);

  let suficiente = false, exige = false, motivo: string | null = null;
  let regra: RegraDaOferta | null = null;
  const grauResp = ORDEM_GRAU[e.grauResponsavel], grauInt = ORDEM_GRAU[e.grauIntencao];

  // ── OFERTA: simples (decisão de 15/10/2026). Reembolso e compensação NÃO passam por aqui ──
  if (e.intencao === "oferta" && grauResp > 0) {
    // a nota está em nome da igreja, e a chave de acesso (que não é obrigatória) bate quando foi informada
    const nfOk = e.temNotaAnexada && e.compradorCnpjIgreja && (!e.chaveInformada || chaveOk);
    // alto risco: pede recibo com efeito fiscal, pessoa do circuito financeiro, empresa com relação financeira, bem durável (ou sem natureza informada)
    const causas: string[] = [];
    if (e.pedeReciboFiscal) causas.push("pede recibo com efeito fiscal");
    if (e.responsavel === "pessoa" && e.terceiroNoCircuito) causas.push("o terceiro participa do circuito financeiro da igreja");
    if (e.responsavel === "empresa" && e.empresaComPagamentos12m) causas.push("a empresa tem relação financeira com a igreja");
    if (patrimonio === "alto") causas.push(e.naturezaItem === null ? "a natureza do item não foi informada" : p.limiteCapitalizacao === null ? "bem durável, e o limite de capitalização ainda não foi definido" : "bem durável acima do limite de capitalização");

    if (causas.length > 0) {
      regra = "oferta_alto_risco"; nivel = "alto";
      if (grauConjunto === "formal") suficiente = true;            // o comprovante do pagamento do terceiro (e a declaração)
      else if (e.aprovadoPeloAdministrador) suficiente = true;     // OU a aprovação formal do Administrador, com justificativa registrada
      else { exige = true; motivo = `${MOTIVO_OFERTA_ALTO_RISCO} (${causas.join("; ")}): anexe o comprovante do pagamento do terceiro OU peça a aprovação formal do Administrador, com justificativa.`; }
    } else if (nfOk && grauInt === 2) {
      // OFERTA FORMALIZADA: nota da igreja + Declaração do Terceiro assinada. Não se exige o comprovante do pagamento do terceiro
      regra = "oferta_formalizada"; grauConjunto = "formal"; lastro = "baixo"; moduladores = [];
      if (e.acumuladoAnoDoTerceiro > p.tetoAnualTerceiro) {
        nivel = "medio";                                           // acima do limite anual: revisão administrativa, sem virar Alto Risco
        if (e.aprovadoPeloAdministrador) suficiente = true;
        else { exige = true; motivo = "Oferta formalizada acima do limite anual do terceiro: precisa da revisão do Administrador, com justificativa."; }
      } else { nivel = "baixo"; suficiente = true; }
    }
  }

  // o que falta para formalizar uma oferta (só para a mensagem)
  const faltas: string[] = [];
  if (e.intencao === "oferta") {
    if (!e.temNotaAnexada) faltas.push("anexe a nota fiscal da compra");
    else if (!e.compradorCnpjIgreja) faltas.push("a nota precisa estar em nome da igreja (CNPJ da igreja)");
    if (e.temNotaAnexada && e.chaveInformada && !chaveOk) faltas.push("a chave de acesso informada não confere (deve ser válida e do emitente): corrija ou deixe em branco");
    if (grauInt < 2) faltas.push("falta a Declaração do Terceiro assinada");
  }
  const oQueFalta = faltas.join("; ") || "formalize a oferta";

  // suficiência
  if (regra !== null) { /* decidida acima */ }
  else if (e.intencao === "nao_declarada" || e.intencao === "nao_se_aplica") motivo = "A intenção do terceiro não foi declarada.";
  else if (e.grauResponsavel === "nenhum") motivo = "Falta identificar quem pagou.";
  else if (e.grauIntencao === "nenhum") motivo = "Falta a declaração da intenção.";
  else if (grauConjunto === "formal") suficiente = true;
  // OPÇÃO B (28/10/2026): com a prova do pagamento do terceiro Formal, o reembolso pode ser pago SEM a declaração assinada antes (ela é assinada pelo recebedor no ato do pagamento). Quem decide se o
  // pagamento pode sair assim é `fin_liquidar_reembolso` (só em espécie); depois de pago, a falta da declaração volta a tornar a prova insuficiente
  else if (e.intencao === "reembolso" && e.grauResponsavel === "formal" && e.grauIntencao === "relatado" && !e.paga) suficiente = true;
  else if (e.intencao === "reembolso") motivo = e.paga && e.grauResponsavel === "formal" && e.grauIntencao === "relatado"
    ? "Reembolso pago: falta a Solicitação e Recibo de Reembolso assinada pelo recebedor (a prova do recebimento)."
    : "Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.";
  else if (e.intencao === "compensacao_adiantamento") motivo = "A compensação de adiantamento exige a prova Formal.";
  else if (nivel === "baixo") suficiente = true;
  else if (nivel === "medio") {
    if (e.aprovadoPeloAdministrador) suficiente = true;
    else {
      exige = true;
      motivo = e.intencao === "oferta" ? `Oferta ainda não formalizada: ${oQueFalta}, ou peça a aprovação do Administrador, com justificativa.` : "O Relatado, neste nível de risco, precisa da aprovação do Administrador.";
    }
  } else motivo = e.intencao === "oferta" ? `Oferta ainda não formalizada: ${oQueFalta}.` : "Neste nível de risco o Relatado não basta: anexe a declaração assinada e a prova do pagamento do terceiro.";

  return { eixos: { natureza, patrimonio, lastro, relacao }, moduladores, nivel, grauConjunto, suficiente, exigeAprovacaoDoAdministrador: exige, motivo, regraDaOferta: regra };
}

// ── resultado, credor e fila (tudo derivado) ───────────────────────────────────────────────────────────────────────────────────────

export interface EntradaDoResultado {
  responsavel: ResponsavelTipo;
  intencao: Intencao;
  suficiente: boolean;
  /** a decisão vigente sobre o reembolso (a mais recente, e só vale se a quitação não foi alterada depois dela) */
  aprovacaoDoReembolso: "aprovada" | "recusada" | null;
  /** a obrigação já foi paga pela igreja (status realizado/conciliado) */
  paga: boolean;
}

export interface ResultadoDaQuitacao {
  resultado: Resultado;
  /** a quem a igreja deve AGORA */
  credorAtual: "emitente" | "terceiro" | "nenhum" | "em_analise";
  fila: Fila | null;
}

export function resultadoDaQuitacao(e: EntradaDoResultado): ResultadoDaQuitacao {
  if (e.responsavel === "igreja") return { resultado: "pago_pela_igreja", credorAtual: "nenhum", fila: null };
  if (e.responsavel === "ninguem_ainda") return { resultado: "em_aberto", credorAtual: "emitente", fila: null };
  if (e.responsavel === "nao_localizado") return { resultado: "sem_quitacao_localizada", credorAtual: "emitente", fila: "investigar" };
  // terceiro identificado
  if (e.intencao === "nao_declarada" || e.intencao === "nao_se_aplica") return { resultado: "a_esclarecer", credorAtual: "em_analise", fila: "a_esclarecer" };
  if (!e.suficiente) return { resultado: "a_formalizar", credorAtual: "em_analise", fila: "formalizar" };
  if (e.intencao === "reembolso") {
    if (e.aprovacaoDoReembolso === "recusada") return { resultado: "a_esclarecer", credorAtual: "em_analise", fila: "a_esclarecer" };
    if (e.aprovacaoDoReembolso !== "aprovada") return { resultado: "reembolso_em_analise", credorAtual: "em_analise", fila: "aprovar_reembolso" };
    return e.paga
      ? { resultado: "reembolsada", credorAtual: "nenhum", fila: null }
      : { resultado: "divida_com_terceiro", credorAtual: "terceiro", fila: "reembolso_a_pagar" };
  }
  if (e.intencao === "oferta") return { resultado: "extinta_como_oferta", credorAtual: "nenhum", fila: null };
  return { resultado: "compensada", credorAtual: "nenhum", fila: null };
}

/** A fila bloqueia o fechamento do mês e o malote? Só A esclarecer e Formalizar, e só depois da vigência, para despesas a partir dela (cláusulas 12.4 e 1.5). */
export function bloqueiaOFechamento(fila: Fila | null, dataDaDespesa: string, vigencia: string | null): boolean {
  if (!vigencia || (fila !== "a_esclarecer" && fila !== "formalizar")) return false;
  return dataDaDespesa.slice(0, 10) >= vigencia;
}

// ── aprovação do reembolso (alçada e segregação) ───────────────────────────────────────────────────────────────────────────────────

export type PapelDeAprovacao = "administrador" | "tesouraria";
/** Quem pode aprovar: até o teto 1, a Tesouraria (ou o Administrador); acima, só o Administrador (cláusula 11.1). */
export const alcadaDoReembolso = (valor: number, teto1: number): PapelDeAprovacao => (valor <= teto1 ? "tesouraria" : "administrador");

/** Ninguém aprova o reembolso a si mesmo (cláusula 2.6). `pessoaDoAprovador` é o `profiles.pessoa_id` de quem está aprovando. */
export const aprovaOProprioReembolso = (pessoaDoAprovador: string | null, pessoaResponsavel: string | null): boolean =>
  !!pessoaDoAprovador && !!pessoaResponsavel && pessoaDoAprovador === pessoaResponsavel;

// ── a Quitação registrada, como o aplicativo a lê ──────────────────────────────────────────────────────────────────────────────────

export interface QuitacaoRegistrada {
  id: string;
  obrigacaoId: string;
  responsavel: ResponsavelTipo;
  pessoaId: string | null;
  fornecedorId: string | null;
  intencao: Intencao;
  pagoEm: string | null;
  declaradoEm: string | null;
  condicao: string | null;
  pedeRecibo: boolean;
  registradoPor: string | null;
  registradoEm: string;
}

/** Valida o que a função do banco também valida; a tela usa para avisar antes de enviar (a barreira de verdade é o banco). */
export function problemasDoRegistro(q: {
  responsavel: ResponsavelTipo; intencao: Intencao; pessoaId: string | null; fornecedorId: string | null; pagoEm: string | null; declaradoEm: string | null;
  naturezaItem: NaturezaDoItem | null; hoje: string; emitenteId: string | null; cnpjDoFornecedor: string | null;
}): string[] {
  const erros: string[] = [];
  const terceiro = ehTerceiro(q.responsavel);
  if (q.responsavel === "igreja" || q.responsavel === "ninguem_ainda") erros.push("Igreja e Ninguém ainda não se registram: são o que o sistema já deduz.");
  if (q.responsavel === "pessoa" && !q.pessoaId) erros.push("Escolha a pessoa que pagou.");
  if ((q.responsavel === "empresa" || q.responsavel === "entidade") && !q.fornecedorId) erros.push(`Escolha ${q.responsavel === "empresa" ? "a empresa" : "a entidade"} que pagou.`);
  if ((q.responsavel === "empresa" || q.responsavel === "entidade") && q.fornecedorId && !cnpjValido(q.cnpjDoFornecedor)) erros.push("Empresa e Entidade só podem ser responsáveis com CNPJ válido no cadastro.");
  if (q.fornecedorId && q.emitenteId && q.fornecedorId === q.emitenteId) erros.push("O próprio emitente da nota não pode ser o terceiro que a quitou.");
  if (terceiro) {
    if (!q.pagoEm) erros.push("Informe a data em que o terceiro pagou.");
    else if (q.pagoEm > q.hoje) erros.push("A data do pagamento do terceiro não pode ser futura.");
    if (!q.naturezaItem) erros.push("Informe a natureza do item (consumo, estoque, bem durável ou serviço).");
    if (q.intencao === "nao_se_aplica") erros.push("Escolha a intenção do terceiro, ou marque Não declarada.");
    if ((q.intencao === "reembolso" || q.intencao === "oferta" || q.intencao === "compensacao_adiantamento")) {
      if (!q.declaradoEm) erros.push("Informe a data da declaração do terceiro.");
      else if (q.declaradoEm > q.hoje) erros.push("A data da declaração não pode ser futura.");
    }
  } else if (q.responsavel === "nao_localizado" && q.intencao !== "nao_se_aplica") erros.push("Quando não se sabe quem pagou, a intenção não se aplica.");
  return erros;
}

// ── a forma de pagamento do terceiro (Fase 1D-a) ─────────────────────────────────────────────────────────────────────────────────────────────
export type FormaDePagamento = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "transferencia" | "outro";
export const FORMAS_DE_PAGAMENTO: FormaDePagamento[] = ["dinheiro", "pix", "cartao_credito", "cartao_debito", "transferencia", "outro"];
export const ROTULO_FORMA: Record<FormaDePagamento, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito", transferencia: "Transferência", outro: "Outro",
};
