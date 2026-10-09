// ─── lib/cicloDaDespesa.ts — o ciclo de vida de UMA despesa, do vencimento ao malote (puro, testado) ───────────────────────────────
//
// Visão da tesouraria (09/10/2026): "uma única entidade financeira". Boleto → Pagamento → OFX → Conciliação → Comprovante → Malote Contábil, tudo num
// registro só. Mesa de Operações, Central de Pagamentos, Extrato, Conciliação e Malote leem o MESMO lançamento (a obrigação) — esta função é a
// definição única do ESTADO dele, para que as telas nunca discordem:
//
//   Prevista → Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta para Malote
//
//   Prevista               ainda não venceu (nada a fazer hoje)
//   Em Aberto              venceu e não foi paga — é a ÚNICA fase que pede ação da tesouraria na Mesa de Operações
//   Pagamento Realizado    foi paga (botão Pagar) e o extrato do banco ainda não chegou até a data
//   Aguardando Conciliação foi paga, o extrato já cobre a data e nenhuma linha dele foi ligada: conferir (pode ter sido paga errado, ou o OFX não foi importado)
//   Conciliada             a linha do extrato foi ligada ao pagamento (marca do OFX)
//   Pronta para Malote     conciliada + classificada (categoria e centro) + documento original + comprovante: pode ir para a contabilidade
//
// Conta sem extrato (caixinha, envelopes, cartão): não há o que conciliar — a etapa não se aplica, a obrigação paga já pode seguir para o malote.
// Só despesas (saídas) têm este ciclo; a função devolve null para entradas.

export type EstadoDoCiclo = "prevista" | "em_aberto" | "pagamento_realizado" | "aguardando_conciliacao" | "conciliada" | "pronta_para_malote" | "cancelada";

export const ORDEM_DO_CICLO: EstadoDoCiclo[] = ["prevista", "em_aberto", "pagamento_realizado", "aguardando_conciliacao", "conciliada", "pronta_para_malote"];

export const ROTULO_DO_CICLO: Record<EstadoDoCiclo, string> = {
  prevista: "Prevista", em_aberto: "Em aberto", pagamento_realizado: "Pagamento realizado", aguardando_conciliacao: "Aguardando conciliação",
  conciliada: "Conciliada", pronta_para_malote: "Pronta para o malote", cancelada: "Cancelada",
};

export interface EntradaDoCiclo {
  tipo: "entrada" | "saida";
  status: "previsto" | "realizado" | "conciliado" | "cancelado" | string;
  /** vencimento AAAA-MM-DD */
  data: string;
  data_pagamento: string | null;
  /** a observação do lançamento: a marca [ofx:FITID] é o vínculo com a linha do extrato */
  observacoes: string | null;
  /** tipo da conta (`banco` tem extrato OFX; as demais não) */
  contaTipo: string;
  /** o último dia coberto por um extrato importado nesta conta (null = nunca importou) */
  ultimoExtratoDaConta: string | null;
  temCategoria: boolean;
  temCentro: boolean;
  /** há anexo que não seja só comprovante: boleto, fatura, guia, nota, XML… */
  temDocumento: boolean;
  temComprovante: boolean;
  /** categorias que não têm documento (tarifas bancárias, IOF, juros): ver `dispensaDocumento` */
  dispensaDocumento: boolean;
  hoje: string;
}

export interface EtapaDoCiclo {
  chave: "documento" | "pagamento" | "ofx" | "conciliacao" | "comprovante" | "classificacao";
  rotulo: string;
  /** feita, ou "não se aplica" (dispensada) — nos dois casos não trava nada */
  feita: boolean;
  naoSeAplica: boolean;
  detalhe: string | null;
}

export interface CicloDaDespesa {
  estado: EstadoDoCiclo;
  etapas: EtapaDoCiclo[];
  /** o que falta para o malote, em palavras (vazio = pronta) */
  pendencias: string[];
  /** só "Em aberto" (e "Prevista", que aparece na Mesa para quem quiser se antecipar) pede ação — o resto já saiu da fila operacional */
  naFilaOperacional: boolean;
  proximoPasso: string;
}

/** A marca [ofx:FITID] do vínculo com o extrato (a do PDF do Invest Fácil, `[ofx:PDF:…]`, também é vínculo: veio de um extrato do banco). */
export function ofxVinculado(observacoes: string | null | undefined): string | null {
  return /\[ofx:([^\]]+)\]/.exec(observacoes ?? "")?.[1] ?? null;
}

export function cicloDaDespesa(e: EntradaDoCiclo): CicloDaDespesa | null {
  if (e.tipo !== "saida") return null;
  const temExtrato = e.contaTipo === "banco";
  const fitid = ofxVinculado(e.observacoes);
  const paga = e.status === "realizado" || e.status === "conciliado";
  const conciliada = e.status === "conciliado";
  const dataDoPagamento = (e.data_pagamento ?? e.data).slice(0, 10);

  const etapas: EtapaDoCiclo[] = [
    { chave: "documento", rotulo: "Documento original", feita: e.temDocumento || e.dispensaDocumento, naoSeAplica: !e.temDocumento && e.dispensaDocumento, detalhe: !e.temDocumento && e.dispensaDocumento ? "esta categoria não exige documento" : null },
    { chave: "pagamento", rotulo: "Pagamento", feita: paga, naoSeAplica: false, detalhe: paga ? dataDoPagamento : null },
    { chave: "ofx", rotulo: "OFX vinculado", feita: !!fitid || !temExtrato, naoSeAplica: !temExtrato, detalhe: fitid ?? (temExtrato ? null : "conta sem extrato bancário") },
    { chave: "conciliacao", rotulo: "Conciliação", feita: conciliada || (!temExtrato && paga), naoSeAplica: !temExtrato, detalhe: !temExtrato ? "conta sem extrato bancário" : null },
    { chave: "comprovante", rotulo: "Comprovante de pagamento", feita: e.temComprovante || e.dispensaDocumento, naoSeAplica: !e.temComprovante && e.dispensaDocumento, detalhe: !e.temComprovante && e.dispensaDocumento ? "o extrato é o comprovante" : null },
    { chave: "classificacao", rotulo: "Categoria e centro de custo", feita: e.temCategoria && e.temCentro, naoSeAplica: false, detalhe: null },
  ];
  const faltam = (...chaves: EtapaDoCiclo["chave"][]) => chaves.filter(k => !etapas.find(x => x.chave === k)!.feita);
  const NOME: Record<EtapaDoCiclo["chave"], string> = {
    documento: "anexar o documento original (boleto, fatura, guia…)", pagamento: "pagar", ofx: "vincular a linha do extrato (importar o OFX)",
    conciliacao: "conciliar com o extrato", comprovante: "anexar o comprovante de pagamento", classificacao: "classificar (categoria e centro de custo)",
  };

  if (e.status === "cancelado") return { estado: "cancelada", etapas, pendencias: [], naFilaOperacional: false, proximoPasso: "Nada a fazer: obrigação cancelada." };

  if (!paga) {
    const vencida = e.data.slice(0, 10) < e.hoje;
    return {
      estado: vencida ? "em_aberto" : "prevista", etapas, naFilaOperacional: true,
      pendencias: faltam("documento", "classificacao").map(k => NOME[k]).concat(["pagar"]),
      proximoPasso: vencida ? "Pagar — a conta venceu." : "Anexar o documento e pagar até o vencimento.",
    };
  }

  const pendencias = faltam("ofx", "conciliacao", "comprovante", "documento", "classificacao").map(k => NOME[k]);
  if (!conciliada && temExtrato) {
    const cobre = !!e.ultimoExtratoDaConta && e.ultimoExtratoDaConta >= dataDoPagamento;
    return {
      estado: cobre ? "aguardando_conciliacao" : "pagamento_realizado", etapas, naFilaOperacional: false, pendencias,
      proximoPasso: cobre ? "O extrato já cobre o dia do pagamento e nenhuma linha foi ligada: conferir na Mesa de Conciliação." : "Importar o OFX quando o banco compensar: a conciliação é automática.",
    };
  }
  const prontaParaMalote = pendencias.length === 0;
  return {
    estado: prontaParaMalote ? "pronta_para_malote" : "conciliada", etapas, naFilaOperacional: false, pendencias,
    proximoPasso: prontaParaMalote ? "Pronta: o malote já a enxerga." : `Para o malote: ${pendencias.join("; ")}.`,
  };
}
