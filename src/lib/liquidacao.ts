// ─── lib/liquidacao.ts — o plano de uma liquidação (pura, testada) ───────────────────────────────────────────
//
// Decisões dela (06/10/2026): o desconto reduz o valor pago e fica em campo próprio; ajuste manual só com motivo;
// diferença sem explicação NÃO liquida. Aqui se transforma "o que foi digitado" no que a função `fin_liquidar`
// (migration 20261007100000) recebe — e se diz, em palavras, o que ainda falta explicar.
//
//   pagou IGUAL ao documento      → baixa total.
//   pagou MENOS  → "parcial" (o saldo continua previsto) ou "desconto" (o saldo é abatido e registrado como economia).
//   pagou MAIS   → a diferença tem que virar juros, multa, complemento voluntário ou ajuste (com motivo); ou entra
//                  OUTRO documento no mesmo pagamento (a tela adiciona o documento e a conta é refeita).

export type MotivoPagouMenos = "parcial" | "desconto";
export type MotivoPagouMais = "juros" | "multa" | "juros_multa" | "outro_documento" | "complemento" | "ajuste";

export interface DocumentoAPagar {
  id: string;
  /** Valor do lançamento previsto (o que falta pagar dele). */
  valor: number;
  /** AAAA-MM-DD — define a ordem de baixa quando o valor não cobre tudo. */
  vencimento: string;
}

export interface EntradaDeLiquidacao {
  /** O documento clicado primeiro; os demais entram no mesmo pagamento. */
  documentos: DocumentoAPagar[];
  /** O que saiu do banco (ou o que o OFX mostra). */
  valorPago: number;
  motivoMenos: MotivoPagouMenos | null;
  motivoMais: MotivoPagouMais | null;
  juros: number;
  multa: number;
  complemento: number;
  ajuste: number;
  motivoDoAjuste: string;
}

export interface ItemDeLiquidacao { lancamento_id: string; valor_pago: number; desconto: number }
export interface EncargoDeLiquidacao { tipo: "juros" | "multa" | "complemento" | "ajuste"; valor: number; lancamento_id: string; motivo?: string }

export interface PlanoDeLiquidacao {
  itens: ItemDeLiquidacao[];
  encargos: EncargoDeLiquidacao[];
  /** Soma dos documentos (o "valor original" que está sendo liquidado). */
  valorOriginal: number;
  valorPago: number;
  /** pago − original. Positivo = a maior; negativo = a menor. */
  diferenca: number;
  /** Quanto da diferença ainda NÃO foi explicado (0 = explicado). */
  faltaExplicar: number;
  /** Em palavras, para o resumo: "Juros R$ 80,00 + Multa R$ 40,00". */
  motivo: string;
  /** O que impede de confirmar (vazio = pode confirmar). */
  problemas: string[];
  pronto: boolean;
  /** Parcial: quanto continua em aberto depois desta liquidação. */
  saldoPendente: number;
}

const c = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function planejarLiquidacao(e: EntradaDeLiquidacao): PlanoDeLiquidacao {
  const docs = [...e.documentos].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const original = c(docs.reduce((s, d) => s + d.valor, 0));
  const pago = c(e.valorPago);
  const diferenca = c(pago - original);
  const problemas: string[] = [];
  const itens: ItemDeLiquidacao[] = [];
  const encargos: EncargoDeLiquidacao[] = [];
  let motivo = "";
  let faltaExplicar = 0;
  let saldoPendente = 0;

  if (docs.length === 0) problemas.push("Escolha o documento a pagar.");
  if (!(pago > 0)) problemas.push("Informe o valor pago.");

  if (docs.length > 0 && pago > 0) {
    if (Math.abs(diferenca) < 0.005) {
      docs.forEach(d => itens.push({ lancamento_id: d.id, valor_pago: c(d.valor), desconto: 0 }));
      motivo = "";
    } else if (diferenca < 0) {
      const falta = c(-diferenca);
      if (!e.motivoMenos) {
        faltaExplicar = falta;
        problemas.push(`Pagou ${brl(falta)} a menos: é pagamento parcial (o saldo continua em aberto) ou desconto?`);
      } else if (e.motivoMenos === "parcial") {
        // paga na ordem de vencimento; o último documento atingido fica parcial, os seguintes ficam intactos
        let resta = pago;
        for (const d of docs) {
          if (resta <= 0.004) break;
          const parte = c(Math.min(resta, d.valor));
          itens.push({ lancamento_id: d.id, valor_pago: parte, desconto: 0 });
          resta = c(resta - parte);
        }
        saldoPendente = falta;
        motivo = `Pagamento parcial — saldo pendente ${brl(falta)}`;
      } else {
        // desconto: abate nos documentos na ordem de vencimento, sem zerar nenhum
        let desc = falta;
        for (const d of docs) {
          const abate = c(Math.min(desc, Math.max(d.valor - 0.01, 0)));
          itens.push({ lancamento_id: d.id, valor_pago: c(d.valor - abate), desconto: abate });
          desc = c(desc - abate);
        }
        if (desc > 0.004) problemas.push("O desconto é maior que os documentos.");
        motivo = `Desconto ${brl(falta)}`;
      }
    } else {
      docs.forEach(d => itens.push({ lancamento_id: d.id, valor_pago: c(d.valor), desconto: 0 }));
      const ref = docs[0].id;
      const juros = e.motivoMais === "juros" || e.motivoMais === "juros_multa" ? c(e.juros) : 0;
      const multa = e.motivoMais === "multa" || e.motivoMais === "juros_multa" ? c(e.multa) : 0;
      const complemento = e.motivoMais === "complemento" ? c(e.complemento) : 0;
      const ajuste = e.motivoMais === "ajuste" ? c(e.ajuste) : 0;
      if (juros > 0) encargos.push({ tipo: "juros", valor: juros, lancamento_id: ref });
      if (multa > 0) encargos.push({ tipo: "multa", valor: multa, lancamento_id: ref });
      if (complemento > 0) encargos.push({ tipo: "complemento", valor: complemento, lancamento_id: ref });
      if (ajuste > 0) encargos.push({ tipo: "ajuste", valor: ajuste, lancamento_id: ref, motivo: e.motivoDoAjuste.trim() });
      const explicado = c(juros + multa + complemento + ajuste);
      faltaExplicar = c(diferenca - explicado);
      if (!e.motivoMais) {
        problemas.push(`Pagou ${brl(diferenca)} a mais: qual o motivo da diferença?`);
      } else if (e.motivoMais === "outro_documento" && Math.abs(faltaExplicar) >= 0.005) {
        problemas.push(`Inclua o outro documento (faltam ${brl(faltaExplicar)} para fechar com o valor pago).`);
      } else if (e.motivoMais !== "outro_documento") {
        if (faltaExplicar > 0.004) problemas.push(`Faltam ${brl(faltaExplicar)} para explicar a diferença.`);
        if (faltaExplicar < -0.004) problemas.push(`Os valores informados passam ${brl(-faltaExplicar)} da diferença.`);
        if (e.motivoMais === "ajuste" && !e.motivoDoAjuste.trim()) problemas.push("O ajuste manual exige o motivo.");
      }
      motivo = encargos.map(x => `${ROTULO_ENCARGO[x.tipo]} ${brl(x.valor)}`).join(" + ");
    }
  }

  return {
    itens, encargos, valorOriginal: original, valorPago: pago, diferenca, faltaExplicar, motivo, problemas,
    pronto: problemas.length === 0 && itens.length > 0, saldoPendente,
  };
}

export const ROTULO_ENCARGO: Record<EncargoDeLiquidacao["tipo"], string> = {
  juros: "Juros", multa: "Multa", complemento: "Complementação voluntária", ajuste: "Ajuste manual",
};

/** A situação de uma obrigação (vw_fin_obrigacoes), com o rótulo que a tela mostra. */
export type SituacaoDaObrigacao =
  "previsto" | "em_aberto" | "pago_parcialmente" | "pago_integralmente" | "pago_com_diferenca" | "cancelado";

export const ROTULO_DA_SITUACAO: Record<SituacaoDaObrigacao, string> = {
  previsto: "Previsto", em_aberto: "Em Aberto", pago_parcialmente: "Pago Parcialmente",
  pago_integralmente: "Pago Integralmente", pago_com_diferenca: "Pago com Diferença", cancelado: "Cancelado",
};
