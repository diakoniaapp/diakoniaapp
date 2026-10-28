// ─── documentacaoExigida — A regra única de completude documental (pura, testada) ───────────────────────────────────────────────────────────────────────
//
// Decisão dela (20/10/2026): a pergunta da Auditoria deixa de ser "existe algum documento?" e passa a ser "esta despesa está pronta para a contabilidade?". Antes disso quatro
// lugares liam a documentação cada um a seu modo (Auditoria, Pronta para Malote, Fechamento, Ciclo da despesa) e "com documento" era QUALQUER anexo — um comprovante sozinho
// já contava. Esta é a definição ÚNICA: todos chamam `documentacaoDaSaida`.
//
// O documento exigido vem da contabilidade (do TIPO da despesa), não só da categoria:
//   · Energia, Água, Gás, Telefonia ........ Fatura + Comprovante
//   · Prestador PJ / compra de material .... Nota Fiscal (ou Fatura) + Comprovante        ← o padrão: toda categoria sem regra própria
//   · RPA .................................. RPA + Comprovante
//   · Prebenda ............................. RSP + Comprovante
//   · Salários ............................. DPS + Comprovante
//   · Condomínio ........................... Boleto OU Fatura + Comprovante
//   · Seguros .............................. Apólice (Contrato) OU Boleto + Comprovante
//   · Impostos e encargos .................. Guia (ou Boleto) + Comprovante
//   · Compra OFERTADA por terceiro ......... Nota Fiscal + Declaração do Terceiro            (a igreja não pagou: nada de comprovante)
//   · REEMBOLSO ............................ Nota Fiscal + Declaração do Terceiro + Comprovante do PIX da igreja
//   · Tarifas, IOF, juros, encargos bancários  dispensam
//   · PAGAMENTO AUTOMÁTICO (débito automático, Pix recorrente, transferência programada): o documento de origem (a fatura) + a CONFIRMAÇÃO BANCÁRIA — a linha do extrato OFX ou do PDF do banco ligada
//     ao lançamento — no lugar do comprovante. Não existe comprovante de um débito que o banco fez sozinho; exigi-lo obrigava a tesouraria a anexar um papel artificial (decisão dela, 22/10/2026).
//
// POR MEIO DE PAGAMENTO (decisão dela, 28/10/2026 — matriz completa em docs/MATRIZ_DE_EXIGENCIAS_DOCUMENTAIS_2026-10-28.md):
//   · ESPÉCIE / CAIXINHA ... a Nota Fiscal basta (qualquer categoria); nunca comprovante bancário
//   · REEMBOLSO EM ESPÉCIE . Nota Fiscal + Declaração; sem PIX nem TED (por PIX/TED o comprovante continua)
//   · DÉBITO AUTOMÁTICO ... a confirmação do banco (vínculo, liquidação com FITID ou a marca [ofx:…]) substitui o comprovante
//   · CARTÃO ............... sem comprovante (a fatura do cartão é a prova)
//
// O COMPROVANTE de pagamento só se exige onde o banco o emite: conta do tipo `banco`. Caixinha trabalha com espécie (o cupom/NF é a prova), o Cartão já é a própria prova do pagamento
// e a Caixa de Envelopes tem dinâmica própria — decisão dela. Enquanto a obrigação não foi paga, ainda não há comprovante a exigir (só o reembolso, que a decisão dela lista inteiro).
//
// Onde a regra mora: aqui, em código, por NOME de categoria (a mesma escolha de `dispensaDocumento`: não há coluna `exige_documento` e evita migration). Mudar uma regra = uma linha de `REGRAS`.
//
// Duas leituras minhas, a confirmar: (1) Fatura e Nota Fiscal se aceitam uma à outra nas contas de consumo (a fatura de telefonia costuma ser "Nota Fiscal Fatura"); (2) "Apólice" não é um tipo de
// anexo — o contrato guarda a apólice.

import { ehAutomatica } from "@/lib/formaLiquidacao";

export type SituacaoDocumental = "completa" | "parcial" | "sem" | "dispensa";
/** 🔴 crítica = nenhum documento · 🟠 parcial = falta algum · 🔵 administrativa = documentação completa, falta algo operacional */
export type Gravidade = "critica" | "parcial" | "administrativa";
export type ModeloDocumental = "padrao" | "oferta" | "reembolso" | "dispensa";

export interface Exigencia {
  /** o que a contabilidade lê: "Nota Fiscal ou Fatura", "Comprovante de pagamento"… (é a chave do "existentes × necessários") */
  rotulo: string;
  /** tipos de anexo que atendem (qualquer um serve) */
  aceita: readonly string[];
  atendida: boolean;
  /** o reembolso ainda não foi pago: o comprovante do PIX só existe depois */
  aguardaPagamento?: boolean;
}

export interface EntradaDocumental {
  categoriaNome?: string | null;
  /** previsto · realizado · conciliado · quitado_terceiro */
  status: string;
  /** tipo da conta (`banco`, `caixa`, `envelope`, `cartao`…): só `banco` emite comprovante */
  contaTipo?: string | null;
  /** os tipos de anexo da obrigação (documentos e provas da quitação) e do pagamento (comprovante) */
  tipos: readonly string[];
  /** o campo antigo `comprovante_url` (1 arquivo) vale como comprovante */
  temComprovanteAntigo?: boolean;
  /** a Quitação registrada: intenção e se QUEM pagou é um terceiro */
  intencao?: string | null;
  terceiroQuitou?: boolean;
  temCategoria: boolean;
  temCentro: boolean;
  documentoNumero?: string | null;
  /** como a obrigação é liquidada (`manual`, `debito_automatico`, `pix_recorrente`, `transferencia_programada`…); ausente = manual */
  formaLiquidacao?: string | null;
  /** a linha do banco (OFX ou PDF) que confirma o pagamento, se há um vínculo ativo com ela */
  confirmacaoBancaria?: "ofx" | "pdf" | null;
  /** `fin_forma_pagamento` do lançamento (`dinheiro`, `pix`, `transferencia`, `cartao_debito`…): decide o MEIO quando a conta sozinha não decide */
  formaPagamento?: string | null;
  /** a observação do lançamento: a marca `[ofx:FITID]` (conciliação anterior aos vínculos) também é a linha do banco ligada */
  observacoes?: string | null;
}

/** Como a despesa foi (ou será) paga — é o que decide qual prova do pagamento existe: espécie não tem, PIX/TED/boleto têm o do banco, o débito automático tem o extrato. */
export type MeioDePagamento = "especie" | "pix" | "ted" | "cartao" | "automatico" | "boleto" | "outro";
export const ROTULO_DO_MEIO: Record<MeioDePagamento, string> = {
  especie: "Espécie / Caixinha", pix: "PIX", ted: "TED / transferência", cartao: "Cartão", automatico: "Débito automático", boleto: "Boleto / guia / fatura", outro: "Outro",
};

export interface DocumentacaoDaSaida {
  modelo: ModeloDocumental;
  /** o meio de pagamento que a regra enxergou (a matriz de exigências é por meio) */
  meio: MeioDePagamento;
  situacao: SituacaoDocumental;
  gravidade: Gravidade | null;
  exigidas: Exigencia[];
  /** rótulos do que falta, na ordem da regra ("Nota Fiscal ou Fatura", "Comprovante de pagamento") */
  faltam: string[];
  /** a documentação de ORIGEM (tudo que não é a prova do pagamento) está completa — é a etapa "Documento" do Ciclo da despesa */
  documentosOk: boolean;
  /** o comprovante de pagamento está em ordem OU a regra não o exige nesta conta — é a etapa "Comprovante" do Ciclo */
  comprovanteOk: boolean;
  /** a regra EXIGE comprovante nesta despesa (conta de banco, ou reembolso) */
  exigeComprovante: boolean;
  /** pendências operacionais (categoria, centro, nº do documento, conferência) — não impedem a documentação de estar completa */
  administrativas: string[];
}

// ─── as regras por tipo de despesa ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/** Categorias que dispensam documento (a mesma lista de `dispensaDocumento` em lib/pacoteContabil.ts — as duas leem daqui). */
// Pedido dela (21/10/2026): o que o PRÓPRIO banco movimenta já tem o extrato como documento — tarifas (inclusive PIX e cesta), rendimentos, investimentos, Invest Fácil, título de capitalização e IOF
  // saem como "⚪ Dispensa documentação" e não geram pendência na Auditoria nem na Prontidão do Malote. Por padrão de NOME (os nomes variam: "Rendimentos de Aplicações", "Título de Capitalização"…).
export const CATEGORIAS_QUE_DISPENSAM = new Set([
  "tarifas bancarias", "tarifa bancaria", "tarifa pix", "tarifas pix", "cesta bancaria", "iof", "juros", "encargos bancarios",
  "rendimentos", "rendimento", "investimentos", "investimento", "invest facil", "titulo de capitalizacao", "titulos de capitalizacao", "capitalizacao",
]);
const PADRAO_QUE_DISPENSA = /^(tarifas?|rendimentos?)\b|\bcapitalizacao\b|\binvest\s*facil\b|\bcesta\s+bancaria\b/;
export const categoriaDispensaDocumento = (nome: string | null | undefined): boolean => CATEGORIAS_QUE_DISPENSAM.has(norm(nome)) || PADRAO_QUE_DISPENSA.test(norm(nome));

interface Origem { rotulo: string; aceita: readonly string[] }
const NF_OU_FATURA: Origem = { rotulo: "Nota Fiscal ou Fatura", aceita: ["nota_fiscal", "fatura"] };

const REGRAS: { categorias?: readonly string[]; prefixo?: string; origem: Origem }[] = [
  { categorias: ["energia eletrica", "agua e esgoto", "gas", "internet e telefonia"], origem: { rotulo: "Fatura", aceita: ["fatura", "nota_fiscal"] } },
  { categorias: ["salarios"], origem: { rotulo: "DPS", aceita: ["dps"] } },
  { categorias: ["prebenda"], origem: { rotulo: "RSP", aceita: ["rsp"] } },
  { prefixo: "rpa", origem: { rotulo: "RPA", aceita: ["rpa"] } },
  { categorias: ["condominio", "projeto missionario"], origem: { rotulo: "Boleto ou Fatura", aceita: ["boleto", "fatura", "nota_fiscal"] } },
  { categorias: ["seguros"], origem: { rotulo: "Apólice ou Boleto", aceita: ["contrato", "boleto"] } },
  { categorias: ["impostos e taxas", "encargos trabalhistas"], origem: { rotulo: "Guia", aceita: ["guia", "boleto"] } },
];

/** O documento de origem que a contabilidade exige para uma despesa comum desta categoria. */
export function origemExigida(categoriaNome: string | null | undefined): Origem {
  const n = norm(categoriaNome);
  const r = REGRAS.find(x => x.categorias?.includes(n) || (x.prefixo && n.startsWith(x.prefixo)));
  return r?.origem ?? NF_OU_FATURA;
}

const DECLARACAO: Origem = { rotulo: "Declaração do Terceiro", aceita: ["declaracao_terceiro", "pedido_reembolso"] };
const NOTA_FISCAL: Origem = { rotulo: "Nota Fiscal", aceita: ["nota_fiscal", "fatura"] };
const COMPROVANTE = "Comprovante de pagamento";
const CONFIRMACAO_BANCARIA = "Confirmação bancária (OFX ou PDF)";
const COMPROVANTE_PIX = "Comprovante do PIX da igreja";

const COMPROVANTE_TED = "Comprovante da TED da igreja";

const PAGAS = new Set(["realizado", "conciliado"]);

/**
 * O meio de pagamento. A CONTA manda primeiro (Caixinha e Caixa de Envelopes só têm espécie — não existe PIX saindo de uma gaveta), depois a forma de liquidação (débito automático, PIX
 * recorrente, transferência programada), depois a forma de pagamento do lançamento. Sem nada disso, "outro" — e "outro" se comporta como sempre se comportou (comprovante em conta de banco).
 */
export function meioDePagamento(e: Pick<EntradaDocumental, "contaTipo" | "formaPagamento" | "formaLiquidacao">): MeioDePagamento {
  if (e.contaTipo === "caixa" || e.contaTipo === "envelope") return "especie";
  if (ehAutomatica(e.formaLiquidacao)) return "automatico";
  if (e.formaPagamento === "dinheiro") return "especie";
  if (e.contaTipo === "cartao" || e.formaPagamento === "cartao_debito" || e.formaPagamento === "cartao_credito") return "cartao";
  if (e.formaPagamento === "pix") return "pix";
  if (e.formaPagamento === "transferencia") return "ted";
  if (e.formaPagamento === "boleto" || e.formaPagamento === "guia" || e.formaPagamento === "fatura") return "boleto";
  return "outro";
}

/** A marca `[ofx:FITID]` das conciliações anteriores aos vínculos (e `[ofx:PDF:…]`, a do extrato em PDF): a linha do banco já está ligada ao lançamento. */
export function confirmacaoPelaMarca(observacoes: string | null | undefined): "ofx" | "pdf" | null {
  const m = /\[ofx:([^\]]+)\]/.exec(observacoes ?? "");
  return m ? (m[1].startsWith("PDF:") ? "pdf" : "ofx") : null;
}

// ─── a regra ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function documentacaoDaSaida(e: EntradaDocumental): DocumentacaoDaSaida {
  const tem = (aceita: readonly string[]) => aceita.some(t => e.tipos.includes(t));
  const paga = PAGAS.has(e.status);
  const meio = meioDePagamento(e);
  const confirmacao = e.confirmacaoBancaria ?? confirmacaoPelaMarca(e.observacoes);
  const exige = (o: Origem): Exigencia => ({ rotulo: o.rotulo, aceita: o.aceita, atendida: tem(o.aceita) });
  const confirmacaoDoBanco = (atendida: boolean): Exigencia => ({ rotulo: CONFIRMACAO_BANCARIA, aceita: ["comprovante"], atendida });
  const comprovante = (rotulo: string, aguarda = false): Exigencia => ({
    rotulo, aceita: ["comprovante"], atendida: tem(["comprovante"]) || !!e.temComprovanteAntigo, ...(aguarda ? { aguardaPagamento: true } : {}),
  });

  let modelo: ModeloDocumental = "padrao";
  let exigidas: Exigencia[];
  if (e.terceiroQuitou && e.intencao === "reembolso") {
    modelo = "reembolso";
    // reembolso em ESPÉCIE (Caixinha): a prova é a Declaração assinada + a Nota — não há PIX nem TED para comprovar (decisão dela, 28/10/2026)
    exigidas = [exige(NOTA_FISCAL), exige(DECLARACAO)];
    if (meio !== "especie") exigidas.push(paga && confirmacao ? confirmacaoDoBanco(true) : comprovante(e.formaPagamento === "transferencia" ? COMPROVANTE_TED : COMPROVANTE_PIX, !paga));
  } else if (e.status === "quitado_terceiro" || (e.terceiroQuitou && e.intencao === "oferta")) {
    modelo = "oferta";
    exigidas = [exige(NOTA_FISCAL), exige(DECLARACAO)];
  } else if (categoriaDispensaDocumento(e.categoriaNome)) {
    modelo = "dispensa";
    exigidas = [];
  } else {
    const origem = origemExigida(e.categoriaNome);
    // ESPÉCIE (Caixinha): a Nota Fiscal anexada é o documento comprobatório SUFICIENTE da despesa, qualquer que seja a categoria (decisão dela, 28/10/2026)
    const nfBasta = meio === "especie" && !origem.aceita.includes("nota_fiscal");
    exigidas = [nfBasta ? exige({ rotulo: `${origem.rotulo} ou Nota Fiscal`, aceita: [...origem.aceita, "nota_fiscal"] }) : exige(origem)];
    // o comprovante é do BANCO: espécie e cartão não têm (o cupom/NF e a fatura do cartão são a prova)
    if (paga && e.contaTipo === "banco" && meio !== "especie" && meio !== "cartao") {
      // a CONFIRMAÇÃO DO BANCO (linha do OFX/PDF ligada ao lançamento) é a prova do pagamento em QUALQUER meio — PIX, TED, boleto ou débito automático (decisão dela, 28/10/2026; em 22/10 valia só
      // para o pagamento automático). Conta como "comprovante" para o Ciclo e a Prontidão (`aceita: ["comprovante"]`); um comprovante anexado à mão também vale. No pagamento automático ela é EXIGIDA
      // (não há comprovante de um débito que o banco fez sozinho); nos demais, sem a linha do banco ligada, continua valendo o comprovante de pagamento.
      exigidas.push(meio === "automatico" || confirmacao
        ? confirmacaoDoBanco(!!confirmacao || tem(["comprovante"]) || !!e.temComprovanteAntigo)
        : comprovante(COMPROVANTE));
    }
  }

  const faltamEx = exigidas.filter(x => !x.atendida);
  // a confirmação do banco de um pagamento automático também é "alguma" prova: sem a fatura a despesa é parcial, não "sem documentos"
  const temAlgum = e.tipos.length > 0 || !!e.temComprovanteAntigo || (modelo === "padrao" && paga && !!confirmacao);
  const situacao: SituacaoDocumental = exigidas.length === 0 ? (temAlgum ? "completa" : "dispensa") : faltamEx.length === 0 ? "completa" : !temAlgum ? "sem" : "parcial";

  const administrativas: string[] = [];
  if (!e.temCategoria) administrativas.push("Categoria");
  if (!e.temCentro) administrativas.push("Centro de custo");
  if ((e.tipos.includes("nota_fiscal") || e.tipos.includes("fatura")) && !(e.documentoNumero ?? "").trim()) administrativas.push("Nº do documento");
  if (e.status === "realizado") administrativas.push("Conferência do pagamento");

  const gravidade: Gravidade | null = situacao === "sem" ? "critica" : situacao === "parcial" ? "parcial" : administrativas.length > 0 ? "administrativa" : null;
  const ehComprovante = (x: Exigencia) => x.aceita.length === 1 && x.aceita[0] === "comprovante";
  return {
    modelo, meio, situacao, gravidade, exigidas, faltam: faltamEx.map(x => x.rotulo), administrativas,
    documentosOk: exigidas.filter(x => !ehComprovante(x)).every(x => x.atendida),
    comprovanteOk: exigidas.filter(ehComprovante).every(x => x.atendida),
    exigeComprovante: exigidas.some(ehComprovante),
  };
}

/** "Falta Nota Fiscal ou Fatura e Comprovante de pagamento" — a frase que a fila mostra. */
export function textoDoQueFalta(d: Pick<DocumentacaoDaSaida, "situacao" | "faltam" | "administrativas" | "exigidas">): string {
  if (d.faltam.length > 0) {
    const aguarda = d.exigidas.find(x => !x.atendida && x.aguardaPagamento);
    const base = `Falta ${d.faltam.map((f, i) => (i === 0 ? f : f.charAt(0).toLowerCase() + f.slice(1))).join(" e ")}`;
    return aguarda ? `${base} (reembolso ainda não pago)` : base;
  }
  if (d.administrativas.length > 0) return `Documentos ok · falta ${d.administrativas.map(a => a.charAt(0).toLowerCase() + a.slice(1)).join(", ")}`;
  return "Documentação completa";
}

// ─── os totais ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ResumoDaProntidao {
  total: number;
  completas: number;
  parciais: number;
  sem: number;
  dispensam: number;
  /** completas + dispensam: o que o escritório já consegue trabalhar */
  prontas: number;
  /** 0–100, sem arredondar; sem nenhuma saída = 0 */
  percentual: number;
  /** quantas têm alguma pendência — documental ou administrativa */
  pendentes: number;
  /** documentação completa mas com pendência operacional (🔵) */
  administrativas: number;
  /** existentes × necessários por documento exigido (só o que a regra EXIGE) */
  porDocumento: { rotulo: string; necessarios: number; existentes: number }[];
}

export function resumirProntidao(itens: readonly DocumentacaoDaSaida[]): ResumoDaProntidao {
  let completas = 0, parciais = 0, sem = 0, dispensam = 0, pendentes = 0, administrativas = 0;
  const por = new Map<string, { rotulo: string; necessarios: number; existentes: number }>();
  for (const d of itens) {
    if (d.situacao === "completa") completas++;
    else if (d.situacao === "parcial") parciais++;
    else if (d.situacao === "sem") sem++;
    else dispensam++;
    if (d.gravidade) pendentes++;
    if (d.gravidade === "administrativa") administrativas++;
    for (const x of d.exigidas) {
      const g = por.get(x.rotulo) ?? { rotulo: x.rotulo, necessarios: 0, existentes: 0 };
      g.necessarios++;
      if (x.atendida) g.existentes++;
      por.set(x.rotulo, g);
    }
  }
  const total = itens.length, prontas = completas + dispensam;
  return {
    total, completas, parciais, sem, dispensam, prontas, percentual: total > 0 ? (prontas / total) * 100 : 0, pendentes, administrativas,
    porDocumento: [...por.values()].sort((a, b) => b.necessarios - a.necessarios || a.rotulo.localeCompare(b.rotulo, "pt-BR")),
  };
}

/** Ordem da fila: 🔴 antes de 🟠 antes de 🔵; dentro de cada uma, o maior valor primeiro. */
export const ORDEM_DA_GRAVIDADE: Record<Gravidade, number> = { critica: 0, parcial: 1, administrativa: 2 };
export const ROTULO_DA_GRAVIDADE: Record<Gravidade, string> = { critica: "Crítica", parcial: "Parcial", administrativa: "Administrativa" };
export const ROTULO_DA_SITUACAO_DOCUMENTAL: Record<SituacaoDocumental, string> = {
  completa: "Documentação completa", parcial: "Documentação parcial", sem: "Sem documentos", dispensa: "Dispensa documentação",
};
