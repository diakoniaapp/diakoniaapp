// ─── apresentação do reembolso — QUEM RECEBE o dinheiro, o que ele quitou, quanto e de qual conta sai (puro: sem rede, sem Deno; e-mails e telas o dividem) ───────────────────────
//
// Pedido dela (22/10/2026): quando um terceiro quitou a despesa e a intenção é reembolso, a obrigação da igreja deixa de ser com o fornecedor e passa a ser com QUEM PAGOU. A informação que a
// Tesouraria precisa na hora é "quem vai receber, quanto e de qual conta sai" — não só qual fornecedor originou a despesa. Então, em toda lista de reembolso a pagar:
//   1. o nome do terceiro vem em destaque;  2. "Quitou:" mostra a despesa (o fornecedor);  3. o valor é o SALDO a reembolsar;  4. "Conta prevista para pagamento" é a conta da despesa.
//
// Os dados vêm de `resumo_reembolsos_a_pagar()` (SQL, para os e-mails) ou de `quitacaoService` (telas); aqui só se transforma em texto — nada é recalculado.

export interface ReembolsoParaExibir {
  /** o terceiro que pagou e vai receber (nome do cadastro); nulo = a quitação aponta um cadastro que não tem nome */
  quem_recebe: string | null;
  /** "pessoa" | "empresa" | "entidade" */
  tipo_de_quem_recebe?: string | null;
  /** a despesa que ele quitou: o fornecedor (emitente) da obrigação; nulo = despesa sem fornecedor */
  quitou: string | null;
  /** descrição da obrigação — só serve de reserva quando não há fornecedor */
  descricao?: string | null;
  /** o saldo a reembolsar (o que a igreja ainda deve a ele) */
  valor: number;
  valor_obrigacao?: number;
  /** a conta da despesa — a que a Tesouraria vai usar, salvo escolha em contrário no pagamento; nulo = a despesa está na conta estrutural das ofertas e a conta se escolhe ao pagar */
  conta_prevista: string | null;
  data_despesa?: string;
  /** só no e-mail diário: quando esta obrigação já saiu em um resumo (contra o pagamento em duplicidade) */
  ultimo_envio?: string | null;
  obrigacao_id?: string;
}

export const ROTULO_CONTA_A_DEFINIR = "a definir ao pagar";
export const ROTULO_SEM_NOME = "Quem pagou (sem nome no cadastro)";

/** "Lúcio" — nunca vazio. */
export const quemRecebe = (r: Pick<ReembolsoParaExibir, "quem_recebe">): string => (r.quem_recebe && r.quem_recebe.trim() ? r.quem_recebe.trim() : ROTULO_SEM_NOME);
/** "Leandro" — o fornecedor; sem ele, a descrição; sem nada, um traço explicado. */
export const oQueQuitou = (r: Pick<ReembolsoParaExibir, "quitou" | "descricao">): string =>
  (r.quitou && r.quitou.trim()) || (r.descricao && r.descricao.trim()) || "despesa sem fornecedor";
/** "Caixinha Administrativa" ou "a definir ao pagar". */
export const contaPrevista = (r: Pick<ReembolsoParaExibir, "conta_prevista">): string => (r.conta_prevista && r.conta_prevista.trim() ? r.conta_prevista.trim() : ROTULO_CONTA_A_DEFINIR);

/** Uma linha só, para listas curtas: "Lúcio quitou Leandro · R$ 500,00 · conta prevista: Caixinha Administrativa". */
export function textoCurtoDoReembolso(r: ReembolsoParaExibir, brl: (n: number) => string): string {
  return `${quemRecebe(r)} quitou ${oQueQuitou(r)} · ${brl(r.valor)} · conta prevista: ${contaPrevista(r)}`;
}

/** Os quatro fatos, na ordem em que a Tesouraria lê: (nome em destaque à parte) Quitou · Valor · Conta prevista para pagamento. */
export function linhasDoReembolso(r: ReembolsoParaExibir, brl: (n: number) => string): { rotulo: string; texto: string }[] {
  return [
    { rotulo: "Quitou", texto: oQueQuitou(r) },
    { rotulo: "Valor", texto: brl(r.valor) },
    { rotulo: "Conta prevista para pagamento", texto: contaPrevista(r) },
  ];
}
