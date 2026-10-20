// ─── lib/cicloDaDespesa.ts — o ciclo de vida de UMA despesa, do vencimento ao malote (puro, testado) ───────────────────────────────
//
// Visão da tesouraria (09/10/2026): "uma única entidade financeira". Boleto → Pagamento → OFX → Conciliação → Comprovante → Malote Contábil, tudo num
// registro só. Mesa de Operações, Central de Pagamentos, Extrato, Conciliação e Malote leem o MESMO lançamento (a obrigação) — esta função é a
// definição única do ESTADO dele, para que as telas nunca discordem:
//
//   Prevista → Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta para Malote
//
//   Prevista               ainda não venceu (nada a fazer hoje)
//   Em Aberto              chegou o dia do vencimento (ou já passou) e não foi paga — é a ÚNICA fase que pede ação da tesouraria na Mesa de Operações.
//                          Decisão dela (13/10/2026): Em Aberto começa NO DIA do vencimento; depois dele continua Em Aberto, só com o indicador de atraso
//                          (`atrasoEmDias`) — "atrasada" NÃO é um estado, é uma situação visual da mesma fase, porque a ação é a mesma.
//   Pagamento Realizado    foi paga (botão Pagar) e o extrato do banco ainda não chegou até a data
//   Aguardando Conciliação foi paga, o extrato já cobre a data e nenhuma linha dele foi ligada: conferir (pode ter sido paga errado, ou o OFX não foi importado)
//   Conciliada             a linha do extrato foi ligada ao pagamento (marca do OFX)
//   Pronta para Malote     conciliada + classificada (categoria e centro) + documento original + comprovante: pode ir para a contabilidade
//   Enviada                (D6) o malote do mês foi ENVIADO e esta despesa estava Pronta naquele momento — o envio é por lote mensal, nunca despesa por despesa.
//                          Daí em diante nada regride sozinho; só uma reabertura (Administrador/Tesouraria, com motivo) a tira daqui.
//   Arquivada              (D6) enviada E o período do envio tem fechamento APROVADO. Vira só história.
//
// CONCILIADA × CONFERIDA (D4, 13/10/2026): Conciliada = existe VÍNCULO com a linha do banco (a marca [ofx:…]). Conferida = alguém marcou (status conciliado)
// sem vínculo: manual, ou "Conferida (Histórico)" — o que veio do Omie, que nunca teve extrato. Em conta COM extrato só o vínculo conta (o histórico do Omie é
// aceito como está, sem ser vendido como "conciliado"); em conta SEM extrato (caixinha, envelopes, cartão, aplicações) a conferência humana basta (Q4) —
// mas é preciso conferir: paga sozinha não chega a Pronta.
// Só despesas (saídas) têm este ciclo; a função devolve null para entradas.

import { debitoEmAberto, ehAutomatica, situacaoDoDebito, type SituacaoDoDebito } from "@/lib/formaLiquidacao";

export type EstadoDoCiclo = "prevista" | "em_aberto" | "pagamento_realizado" | "aguardando_conciliacao" | "conciliada" | "pronta_para_malote" | "enviada" | "arquivada" | "cancelada";

export const ORDEM_DO_CICLO: EstadoDoCiclo[] = ["prevista", "em_aberto", "pagamento_realizado", "aguardando_conciliacao", "conciliada", "pronta_para_malote", "enviada", "arquivada"];

export const ROTULO_DO_CICLO: Record<EstadoDoCiclo, string> = {
  prevista: "Prevista", em_aberto: "Em aberto", pagamento_realizado: "Pagamento realizado", aguardando_conciliacao: "Aguardando conciliação",
  conciliada: "Conciliada", pronta_para_malote: "Pronta para o malote", enviada: "Enviada", arquivada: "Arquivada", cancelada: "Cancelada",
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
  /** o envio ATIVO desta despesa (um item de malote não reaberto) e se o período dele já foi aprovado; ausente/null = nunca enviada ou reaberta */
  envio?: { ano: number; mes: number; periodoAprovado: boolean } | null;
  /** de onde veio o lançamento (`importado_omie` = histórico anterior ao extrato: Conferida (Histórico)) */
  origem?: string | null;
  /** categorias que não têm documento (tarifas bancárias, IOF, juros): ver `dispensaDocumento` */
  dispensaDocumento: boolean;
  /**
   * A REGRA ÚNICA de completude documental (`documentacaoDaSaida`, decisão de 20/10/2026): quando vem, ela manda nas etapas "Documento" e "Comprovante" — o documento CERTO para o tipo da
   * despesa, e o comprovante só onde o banco o emite. Sem ela (quem ainda não a calcula), vale a leitura antiga: qualquer documento original + qualquer comprovante.
   */
  documentacao?: { documentosOk: boolean; comprovanteOk: boolean; exigeComprovante: boolean; faltam: string[] };
  /** Fase 1A da Quitação: um TERCEIRO (Pessoa, Empresa ou Entidade) já pagou o fornecedor — não há mais "a vencer": a despesa fica Em aberto, aguardando a decisão sobre o terceiro, e a igreja NÃO paga o fornecedor */
  terceiroQuitou?: boolean;
  /** quando alguém conferiu à mão (conferido_em): é o que confirma uma obrigação QUITADA POR TERCEIRO, que não tem extrato nem banco */
  conferidoEm?: string | null;
  /**
   * COMO a obrigação será liquidada (`manual`, `boleto_fatura`, `debito_automatico`, `pix_recorrente`, `transferencia_programada`). As três últimas são do BANCO: antes de pagar, a obrigação não está "em aberto"
   * esperando a Tesouraria — está com o débito previsto, e a passagem do tempo só a leva a 🟡 aguardando confirmação e 🔴 possível falha; NUNCA a "paga" (ver `SituacaoDoDebito`).
   */
  formaLiquidacao?: string | null;
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

/** Como a obrigação paga foi confirmada: pelo banco (vínculo), por quem a conferiu à mão, ou é histórico do Omie. null = ainda não confirmada. */
export type Conferencia = "vinculo" | "manual" | "historico" | null;

export interface CicloDaDespesa {
  estado: EstadoDoCiclo;
  /** só para débito/PIX/transferência automáticos ainda não confirmados pelo banco: onde o débito está no tempo */
  debito?: SituacaoDoDebito;
  conferencia?: Conferencia;
  etapas: EtapaDoCiclo[];
  /** o que falta para o malote, em palavras (vazio = pronta) */
  pendencias: string[];
  /** só "Em aberto" (e "Prevista", que aparece na Mesa para quem quiser se antecipar) pede ação — o resto já saiu da fila operacional */
  naFilaOperacional: boolean;
  proximoPasso: string;
  /** só em "Em aberto": quantos dias passou do vencimento (0 = vence hoje). Ausente nos outros estados. */
  atrasoEmDias?: number;
}

/** A marca [ofx:FITID] do vínculo com o extrato (a do PDF do Invest Fácil, `[ofx:PDF:…]`, também é vínculo: veio de um extrato do banco). */
export function ofxVinculado(observacoes: string | null | undefined): string | null {
  return /\[ofx:([^\]]+)\]/.exec(observacoes ?? "")?.[1] ?? null;
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function cicloDaDespesa(e: EntradaDoCiclo): CicloDaDespesa | null {
  if (e.tipo !== "saida") return null;
  const temExtrato = e.contaTipo === "banco";
  const fitid = ofxVinculado(e.observacoes);
  // Fase 1B: QUITADO POR TERCEIRO (oferta) — a obrigação foi extinta sem passar por banco nem caixa: conta como "situação paga", não espera extrato e só a conferência humana a confirma
  const quitado = e.status === "quitado_terceiro";
  const paga = e.status === "realizado" || e.status === "conciliado" || quitado;
  const marcada = e.status === "conciliado";
  const conferencia: Conferencia = !paga ? null : quitado ? (e.conferidoEm ? "manual" : null) : fitid ? "vinculo" : marcada ? (e.origem === "importado_omie" ? "historico" : "manual") : null;
  // conta com extrato: só o vínculo (ou o histórico, aceito como está) concilia; conta sem extrato: a conferência humana basta; quitada por terceiro: só a conferência humana
  const conciliada = quitado ? conferencia !== null : temExtrato ? conferencia === "vinculo" || conferencia === "historico" : conferencia !== null;
  const dataDoPagamento = (e.data_pagamento ?? e.data).slice(0, 10);

  const etapas: EtapaDoCiclo[] = [
    { chave: "documento", rotulo: "Documento original", feita: e.documentacao ? e.documentacao.documentosOk : e.temDocumento || e.dispensaDocumento, naoSeAplica: !e.temDocumento && e.dispensaDocumento, detalhe: !e.temDocumento && e.dispensaDocumento ? "esta categoria não exige documento" : null },
    { chave: "pagamento", rotulo: "Pagamento", feita: paga, naoSeAplica: false, detalhe: quitado ? "quitada por um terceiro (oferta): sem banco, sem caixa" : paga ? dataDoPagamento : null },
    { chave: "ofx", rotulo: "OFX vinculado", feita: quitado || !!fitid || !temExtrato || conferencia === "historico", naoSeAplica: quitado || !temExtrato || conferencia === "historico", detalhe: quitado ? "não passou pelo banco" : fitid ?? (!temExtrato ? "conta sem extrato bancário" : conferencia === "historico" ? "histórico anterior ao extrato" : null) },
    { chave: "conciliacao", rotulo: quitado || !temExtrato ? "Conferência" : "Conciliação", feita: conciliada, naoSeAplica: false,
      detalhe: conferencia === "historico" ? "Conferida (Histórico)" : conferencia === "manual" ? (temExtrato && !quitado ? "Conferida (sem vínculo bancário)" : "Conferida") : quitado ? "não há extrato: conferir a quitação à mão" : !temExtrato ? "conta sem extrato bancário: conferir à mão" : null },
    { chave: "comprovante", rotulo: "Comprovante de pagamento", feita: quitado || (e.documentacao ? e.documentacao.comprovanteOk : e.temComprovante || e.dispensaDocumento), naoSeAplica: quitado || (e.documentacao ? !e.documentacao.exigeComprovante : !e.temComprovante && e.dispensaDocumento), detalhe: quitado ? "a igreja não pagou: a prova está na quitação" : e.documentacao && !e.documentacao.exigeComprovante ? "esta conta não emite comprovante bancário: a nota/fatura (ou a fatura do cartão) é a prova" : !e.temComprovante && e.dispensaDocumento ? "o extrato é o comprovante" : null },
    { chave: "classificacao", rotulo: "Categoria e centro de custo", feita: e.temCategoria && e.temCentro, naoSeAplica: false, detalhe: null },
  ];
  const faltam = (...chaves: EtapaDoCiclo["chave"][]) => chaves.filter(k => !etapas.find(x => x.chave === k)!.feita);
  const NOME: Record<EtapaDoCiclo["chave"], string> = {
    documento: e.documentacao ? "anexar o documento exigido para este tipo de despesa (nota, fatura, guia, RPA, RSP, DPS…)" : "anexar o documento original (boleto, fatura, guia…)", pagamento: "pagar", ofx: "vincular a linha do extrato (importar o OFX)",
    conciliacao: quitado ? "conferir a quitação por terceiro (não há extrato)" : temExtrato ? "conciliar com o extrato" : "conferir o pagamento (conta sem extrato)", comprovante: "anexar o comprovante de pagamento", classificacao: "classificar (categoria e centro de custo)",
  };

  if (e.status === "cancelado") return { estado: "cancelada", etapas, pendencias: [], naFilaOperacional: false, proximoPasso: "Nada a fazer: obrigação cancelada." };

  // ENVIADA / ARQUIVADA (D6): nada regride sozinho depois do envio — os fatos podem mudar (um comprovante que sai, uma conciliação desfeita), o estado não
  if (paga && e.envio) {
    const mm = String(e.envio.mes).padStart(2, "0");
    const faltaAlgo = faltam("ofx", "conciliacao", "comprovante", "documento", "classificacao").map(k => NOME[k]);
    return {
      estado: e.envio.periodoAprovado ? "arquivada" : "enviada", etapas, naFilaOperacional: false, pendencias: faltaAlgo, conferencia,
      proximoPasso: e.envio.periodoAprovado
        ? `Arquivada: o período ${mm}/${e.envio.ano} está aprovado. Para mudar algo, reabra o período e depois a despesa.`
        : `Enviada ao malote de ${mm}/${e.envio.ano}${faltaAlgo.length ? ` — regularizar depois do envio: ${faltaAlgo.join("; ")}` : ""}. Valor, data, categoria, centro e favorecido só mudam com a reabertura (Administrador ou Tesouraria, com motivo).`,
    };
  }

  if (!paga) {
    const venceuOuVenceHoje = e.data.slice(0, 10) <= e.hoje;
    const atraso = venceuOuVenceHoje ? diasEntre(e.data.slice(0, 10), e.hoje) : 0;
    const terceiro = !!e.terceiroQuitou;
    // DÉBITO AUTOMÁTICO (e PIX recorrente / transferência programada): a Tesouraria não paga — acompanha. O estado do ciclo segue o de sempre; o que muda é o acompanhamento e o próximo passo.
    const debito = !terceiro && ehAutomatica(e.formaLiquidacao) ? situacaoDoDebito({ status: "previsto", data: e.data.slice(0, 10) }, e.hoje) : null;
    if (debito && debitoEmAberto(debito)) {
      const dd = e.data.slice(8, 10) + "/" + e.data.slice(5, 7);
      const precisaDeConferencia = debito === "aguardando" || debito === "nao_encontrado";
      return {
        estado: venceuOuVenceHoje ? "em_aberto" : "prevista", debito, etapas, naFilaOperacional: precisaDeConferencia,
        pendencias: faltam("documento", "classificacao").map(k => NOME[k]).concat(precisaDeConferencia ? ["confirmar o débito no banco (extrato ou conferência)"] : []),
        proximoPasso: debito === "previsto" ? `O banco debita sozinho no vencimento (${dd}). Nada a fazer até lá — não pague à mão.`
          : debito === "previsto_hoje" ? "O banco deve debitar hoje. Confira o extrato amanhã; não pague à mão."
          : debito === "aguardando" ? `Aguardando confirmação bancária: o débito de ${dd} ainda não apareceu. Importe o extrato (OFX ou PDF) ou confira no banco.`
          : `Possível falha no débito: venceu em ${dd} (há ${atraso} dias) e o banco não confirmou. Confira no banco — pode ter sido rejeitado, atrasado ou não ter ocorrido.`,
        ...(venceuOuVenceHoje ? { atrasoEmDias: atraso } : {}),
      };
    }
    return {
      estado: venceuOuVenceHoje || terceiro ? "em_aberto" : "prevista", etapas, naFilaOperacional: true,
      // um terceiro já pagou o fornecedor: a igreja não paga de novo — o que falta é decidir a quitação (a Fila diz qual passo)
      pendencias: faltam("documento", "classificacao").map(k => NOME[k]).concat(terceiro ? [] : ["pagar"]),
      proximoPasso: terceiro ? "Um terceiro já pagou o fornecedor: não pague de novo. Conclua a quitação (esclarecer, formalizar, aprovar o reembolso)."
        : !venceuOuVenceHoje ? "Anexar o documento e pagar até o vencimento." : atraso === 0 ? "Pagar hoje — a conta vence hoje." : `Pagar — atrasada há ${atraso} dia${atraso === 1 ? "" : "s"}.`,
      ...(venceuOuVenceHoje ? { atrasoEmDias: atraso } : {}),
    };
  }

  const pendencias = faltam("ofx", "conciliacao", "comprovante", "documento", "classificacao").map(k => NOME[k]);
  if (!conciliada) {
    const cobre = temExtrato && !!e.ultimoExtratoDaConta && e.ultimoExtratoDaConta >= dataDoPagamento;
    // conta sem extrato nunca "espera o banco": o que falta é a conferência humana, que já é o próximo passo
    const aguardando = !quitado && (cobre || !temExtrato);
    return {
      estado: aguardando ? "aguardando_conciliacao" : "pagamento_realizado", etapas, naFilaOperacional: false, pendencias, conferencia,
      proximoPasso: quitado ? "Conferir a quitação por terceiro (não há extrato) e marcá-la como conferida."
        : !temExtrato ? "Conferir o pagamento (conta sem extrato bancário) e marcá-lo como conferido."
        : cobre ? "O extrato já cobre o dia do pagamento e nenhuma linha foi ligada: conferir na Mesa de Conciliação." : "Importar o OFX quando o banco compensar: a conciliação é automática.",
    };
  }
  const prontaParaMalote = pendencias.length === 0;
  return {
    estado: prontaParaMalote ? "pronta_para_malote" : "conciliada", etapas, naFilaOperacional: false, pendencias, conferencia,
    proximoPasso: prontaParaMalote ? "Pronta: o malote já a enxerga." : `Para o malote: ${pendencias.join("; ")}.`,
  };
}

/** A regra do ARQUIVAMENTO (a mesma de vw_fin_ciclo): existe fechamento de período APROVADO cobrindo o mês do envio? */
export function periodoAprovadoCobre(fechamentos: { status: string; ano_inicio: number; mes_inicio: number; qtd_meses: number }[], ano: number, mes: number): boolean {
  const m = ano * 12 + mes;
  return fechamentos.some(f => f.status === "aprovado" && m >= f.ano_inicio * 12 + f.mes_inicio && m < f.ano_inicio * 12 + f.mes_inicio + f.qtd_meses);
}
