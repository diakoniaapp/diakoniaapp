// ─── painelTesourariaService.ts — os dados do Painel da Tesouraria ────────
//
// Sprint 1 do plano "Bancada da Tesouraria" (08/09/2026): fiscal e caixa, os
// dois riscos que custam dinheiro de verdade quando alguém deixa passar
// (multa e dinheiro em espécie sem responsável claro).
//
// Sprint 2: Pendências, Próximos vencimentos e Orçamento. Nenhum dos três
// precisou de tabela nova — `finService.ts` já tinha tudo, só nunca reunido
// num lugar que prioriza. `listarOrcamentoVsReal()` ficou de fora de
// propósito: `alertasCentros()` já entrega os MESMOS centros, só que
// classificados por severidade e com frase pronta — reconstruir o
// julgamento aqui a partir dos números crus duplicaria uma régua que já
// existe em `fin_alertas_centros` (RPC do banco).
//
// O bloco Fiscal não duplica lógica: reaproveita `carregarResumoFiscal()` de
// `fiscalService.ts`, o mesmo dado que já vira o widget `AgendaFiscalUrgente`
// — e é por isso que este painel EMBUTE aquele componente em vez de reler o
// resumo fiscal aqui dentro. Só o de Caixa é novo, porque não havia, em lugar
// nenhum do sistema, uma lista de "todos os caixas abertos agora".
//
// Sprint 4: Alertas (anomalias do mês + alertas financeiros gerais, os dois
// já existentes em `finService.ts`) e o cruzamento com a Diaconia — cestas
// compradas × pessoas atendidas, pedido explícito da liderança. Esta última
// é a única peça do painel inteiro sem par pronto no banco: as duas metades
// existem (`carregarBancadaDiaconia()` já soma confirmações do mês;
// `fin_centros_custo` já pode vincular a um ministério ou área), mas nunca
// se encontraram numa consulta. Ver `carregarCruzamentoDiaconia()` abaixo
// para a decisão de como ligar as duas.

import { supabase } from "@/integrations/supabase/client";
import { hojeMaisDias, hojeLocal, daquiADias, toYmd } from "@/lib/data";
import {
  listarLancamentos, listarLancamentosSemTeto, listarProximosVencimentos, alertasCentros,
  anomaliasMes, alertasFinanceiros, listarContas, brl,
  type FinLancamentoExtenso, type FinVencimento, type FinAlertaCentro,
  type FinAnomalia, type FinAlertaFinanceiro,
} from "@/services/finService";
import { carregarBancadaDiaconia } from "@/services/diaconiaService";
import { existeFechamentoParaMes } from "@/services/fechamentoPeriodoService";
import { NOME_MES } from "@/services/prestacaoContasService";

// Caixa (arr_caixas, Bazar e Cantina) SAIU deste arquivo em 22/09/2026 —
// pedido dela: "todas as informações de caixa do bazar e cantina devem
// morar no painel do ministério de administração e não na tesouraria ou
// financeiro". Já existe lá, em `bancadaArrecadacaoService.ts` (própria
// cópia de `CaixaAberto`, correta desde sempre — só esta aqui, usada pelo
// Painel da Tesouraria, é que estava no lugar errado).

// ─── Pendências ─────────────────────────────────────────────────────────
//
// Quatro naturezas diferentes, por isso o `motivo` em vez de uma lista só:
// "aguardando aprovação" é decisão (alguém precisa dizer sim ou não),
// "sem comprovante" é documentação faltando na prestação de contas do mês,
// "aguardando conciliação" (12/09/2026, junto com a conciliação bancária
// em si) é lançamento `realizado` numa conta banco que ainda não foi
// batido com o extrato, e "fechamento" (12/09/2026, Fase 6 do projeto
// Tesouraria) é o mês anterior com movimento real e ainda sem fechamento
// formal. Confundir as quatro na mesma frase esconderia qual delas trava
// o quê — cada uma é um tipo de decisão diferente que "sai da cabeça" se
// não tiver um lugar fixo pra aparecer todo dia.
//
// "fechamento" não é um `FinLancamentoExtenso` — é um período, não um
// lançamento — por isso a união discriminada `ItemPendencia` em vez de
// forçar `valor`/`conta_id`/etc. fictícios só para caber no mesmo molde
// das outras três. Forçar o molde seria escrita que mente, o mesmo
// defeito que `escritaConferida.ts` existe para evitar do outro lado.

export type MotivoPendencia = "aprovacao" | "comprovante" | "conciliacao" | "fechamento";

export interface PendenciaLancamento extends FinLancamentoExtenso {
  motivo: "aprovacao" | "comprovante" | "conciliacao";
}

export interface PendenciaFechamento {
  id: string;
  motivo: "fechamento";
  ano: number;
  mes: number;
  rotuloMes: string;
}

export type ItemPendencia = PendenciaLancamento | PendenciaFechamento;

/** Janela do "sem comprovante"/"aguardando conciliação": mais que isto é história, não pendência do dia a dia. */
export const DIAS_JANELA_COMPROVANTE = 30;

/**
 * Só o mês anterior ao atual — não uma varredura desde sempre. O
 * fechamento de período (Fase 6) é recente; sinalizar todo mês antes dele
 * existir encheria a lista de pendência que ninguém poderia ter fechado
 * na época. E só entra se o mês teve lançamento `realizado`/`conciliado`
 * de verdade — mês sem movimento nenhum não precisa ser fechado.
 */
export async function listarFechamentosPendentes(): Promise<PendenciaFechamento[]> {
  const inicioMesAtual = hojeLocal().slice(0, 7) + "-01";
  const fimMesAnterior = daquiADias(inicioMesAtual, -1);
  const inicioMesAnterior = fimMesAnterior.slice(0, 7) + "-01";
  const [ano, mes] = inicioMesAnterior.split("-").map(Number);

  const [lancsMesAnterior, jaFechado] = await Promise.all([
    listarLancamentos({ dataInicio: inicioMesAnterior, dataFim: fimMesAnterior }),
    existeFechamentoParaMes(ano, mes),
  ]);
  const teveMovimento = lancsMesAnterior.some(l => l.status === "realizado" || l.status === "conciliado");
  if (!teveMovimento || jaFechado) return [];

  return [{
    id: `fechamento-${ano}-${mes}`,
    motivo: "fechamento",
    ano, mes,
    rotuloMes: `${NOME_MES[mes]}/${ano}`,
  }];
}

export async function listarPendencias(): Promise<ItemPendencia[]> {
  const [aguardando, realizadosRecentes, contas, fechamentosPendentes] = await Promise.all([
    // Sem `dataInicio`: aprovação parada é decisão em aberto, e fica mais
    // urgente com o tempo — não menos. Não faz sentido ela "expirar" da
    // lista — por isso é `listarLancamentosSemTeto`, não `listarLancamentos`
    // (teto de 300): um backlog grande faria a aprovação MAIS antiga (a
    // mais urgente) ser exatamente a que some da tela, ao contrário do que
    // o comentário acima pede. Zero pendências hoje, mas é o mesmo bug de
    // `gerarPrestacaoContas` se um dia crescer.
    listarLancamentosSemTeto({ status: "aguardando_aprovacao" }),
    listarLancamentos({ status: "realizado", dataInicio: hojeMaisDias(-DIAS_JANELA_COMPROVANTE) }),
    listarContas(),
    listarFechamentosPendentes(),
  ]);

  const semComprovante = realizadosRecentes.filter(l => !l.comprovante_url);

  // Conciliação só faz sentido em conta `tipo: banco` — é a única com
  // extrato de verdade pra bater (Caixinha/Envelope/Cartão não têm OFX).
  const contasBanco = new Set(contas.filter(c => c.tipo === "banco").map(c => c.id));
  const aguardandoConciliacao = realizadosRecentes.filter(l => contasBanco.has(l.conta_id));

  return [
    ...aguardando.map(l => ({ ...l, motivo: "aprovacao" as const })),
    ...semComprovante.map(l => ({ ...l, motivo: "comprovante" as const })),
    ...aguardandoConciliacao.map(l => ({ ...l, motivo: "conciliacao" as const })),
    ...fechamentosPendentes,
  ];
}

// ─── Próximos vencimentos ───────────────────────────────────────────────
//
// Janela de 7 dias — o mesmo horizonte que "esta semana" já nomeia dentro de
// `FinVencimento.urgencia`. Vencimento mais distante que isto é recorrência
// ou orçamento, não "próximo".
export const DIAS_JANELA_VENCIMENTOS = 7;

export async function listarVencimentosDaSemana(): Promise<FinVencimento[]> {
  return listarProximosVencimentos({ ateData: hojeMaisDias(DIAS_JANELA_VENCIMENTOS) });
}

// ─── Orçamento ──────────────────────────────────────────────────────────
//
// Só os dois tipos de alerta que falam de ORÇAMENTO ("acima_orcamento" e
// "orcamento_atencao"). `alertasCentros()` também devolve "crescimento" e
// "sem_movimento" — sinais reais, mas de outra pergunta ("este centro mudou
// de padrão?"), não da que este bloco responde ("algum centro estourou?").
// Misturar os quatro tipos aqui repetiria o defeito que o Painel Pastoral já
// corrigiu: uma seção que promete uma coisa e mostra outra.
export async function listarAlertasOrcamento(): Promise<FinAlertaCentro[]> {
  const todos = await alertasCentros();
  return todos.filter(a => a.tipo_alerta === "acima_orcamento" || a.tipo_alerta === "orcamento_atencao");
}

// ─── Alertas ────────────────────────────────────────────────────────────
//
// Duas fontes que já existem em `finService.ts`, nunca priorizadas juntas:
// `anomaliasMes()` (uma categoria fugindo do próprio padrão dos últimos 6
// meses) e `alertasFinanceiros()` (avisos gerais, cada um já com link
// pronto). As duas viram uma lista só, ordenada por severidade — quem olha
// este bloco quer "o que foge do padrão", não de qual RPC o dado veio.
//
// Só "crítico" e "atenção" entram — "normal" não é alerta, e "info" (só em
// `alertasFinanceiros`) é a mesma categoria que os outros blocos já deixam
// de fora: não compete por atenção com o que realmente pede decisão.

export type SeveridadeAlerta = "critico" | "atencao";

export interface AlertaTesouraria {
  id: string;
  titulo: string;
  descricao: string;
  severidade: SeveridadeAlerta;
  to: string | null;
}

/** "R$ 1.200 gasto este mês, 40% acima da média dos últimos 6 meses (R$ 860)". */
function descreverAnomalia(a: FinAnomalia): string {
  const tipoLabel = a.tipo === "saida" ? "gasto" : "recebido";
  if (a.severidade === "novo" || !a.media_6m) {
    return `${brl(a.valor_mes)} ${tipoLabel} este mês — categoria sem histórico nos últimos 6 meses`;
  }
  const pct = Math.abs(Math.round(a.variacao_pct ?? 0));
  const direcao = (a.variacao_pct ?? 0) >= 0 ? "acima" : "abaixo";
  return `${brl(a.valor_mes)} ${tipoLabel} este mês, ${pct}% ${direcao} da média dos últimos 6 meses (${brl(a.media_6m)})`;
}

export async function listarAlertasTesouraria(): Promise<AlertaTesouraria[]> {
  const [anomalias, gerais] = await Promise.all([
    anomaliasMes(),
    alertasFinanceiros(),
  ]);

  const deAnomalias: AlertaTesouraria[] = anomalias
    .filter((a): a is FinAnomalia & { severidade: "critico" | "atencao" } =>
      a.severidade === "critico" || a.severidade === "atencao")
    .map(a => ({
      id: `anomalia-${a.categoria_id}`,
      titulo: `${a.categoria_nome} fora do padrão`,
      descricao: descreverAnomalia(a),
      severidade: a.severidade,
      to: null,
    }));

  const deGerais: AlertaTesouraria[] = gerais
    .filter((a): a is FinAlertaFinanceiro & { severidade: "critico" | "atencao" } =>
      a.severidade === "critico" || a.severidade === "atencao")
    .map(a => ({
      id: `geral-${a.tipo}`,
      titulo: a.titulo,
      descricao: a.descricao,
      severidade: a.severidade,
      to: a.link,
    }));

  // Crítico primeiro — mesma régua de prioridade do resto do painel.
  return [...deGerais, ...deAnomalias].sort((x, y) =>
    (x.severidade === "critico" ? 0 : 1) - (y.severidade === "critico" ? 0 : 1));
}

// ─── Mesa do Tesoureiro ─────────────────────────────────────────────────
//
// Fase 9 do roadmap Financeiro ERP (22/09/2026). Dos seis números que a
// seção mostra, quatro (vence hoje/amanhã, atrasados, valor da semana,
// conciliações pendentes) nascem de `vencimentos` e `pendencias`, que o
// painel já carrega — por isso são calculados no componente, não aqui,
// para não duplicar a mesma consulta. Só os dois que não tinham par
// pronto no banco entram nesta função:
//
// PIX pendentes — mede "quantos compromissos já têm tudo pronto pra pagar
// AGORA": saída ainda não paga (`previsto` ou `aguardando_aprovacao`) cujo
// fornecedor já tem chave Pix cadastrada (Fase 7). Medido em produção em
// 22/09/2026: só 1 dos fornecedores com lançamento pendente tem chave_pix
// — o número costuma ser 0 hoje, e isso é o retrato real do cadastro
// incompleto que a Fase 7 começou a corrigir, não um bug desta consulta.
//
// Anexos faltando — `realizado`/`conciliado` sem `comprovante_url` (o
// campo legado, de antes da Fase 7) E sem nenhuma linha em
// `fin_lancamento_anexos` (o novo, múltiplo — Fase 7). Contado em
// produção: 60 dos 179 lançamentos. É a métrica que mostra se o hábito de
// anexar está pegando de verdade — por isso o rótulo é "faltando", não
// "documentos".
//
// Lotes de 150 ids no segundo `.in()`: mesmo motivo do `emLotes` em
// `finService.ts` — a lista de candidatos cresce com o tempo, e um único
// `.in()` estoura a URL do PostgREST bem antes de mil ids.

export interface MesaTesoureiro {
  pixPendentes: number;
  anexosFaltando: number;
}

export async function carregarMesaTesoureiro(): Promise<MesaTesoureiro> {
  const { data: pendentes } = await supabase
    .from("fin_lancamentos")
    .select("fornecedor_id")
    .eq("tipo", "saida")
    .in("status", ["previsto", "aguardando_aprovacao"])
    .not("fornecedor_id", "is", null);
  const listaPendentes = (pendentes ?? []) as { fornecedor_id: string }[];

  let pixPendentes = 0;
  const fornecedorIds = Array.from(new Set(listaPendentes.map(p => p.fornecedor_id)));
  if (fornecedorIds.length > 0) {
    const { data: forns } = await supabase
      .from("fin_fornecedores").select("id, chave_pix").in("id", fornecedorIds);
    const comPix = new Set(
      ((forns ?? []) as { id: string; chave_pix: string | null }[])
        .filter(f => f.chave_pix).map(f => f.id),
    );
    pixPendentes = listaPendentes.filter(p => comPix.has(p.fornecedor_id)).length;
  }

  const { data: semComprovanteLegado } = await supabase
    .from("fin_lancamentos")
    .select("id")
    .in("status", ["realizado", "conciliado"])
    .is("comprovante_url", null);
  const candidatos = ((semComprovanteLegado ?? []) as { id: string }[]).map(l => l.id);

  let anexosFaltando = candidatos.length;
  if (candidatos.length > 0) {
    const comAnexo = new Set<string>();
    for (let i = 0; i < candidatos.length; i += 150) {
      const lote = candidatos.slice(i, i + 150);
      const { data } = await supabase
        .from("fin_lancamento_anexos").select("lancamento_id").in("lancamento_id", lote);
      ((data ?? []) as { lancamento_id: string }[]).forEach(a => comAnexo.add(a.lancamento_id));
    }
    anexosFaltando = candidatos.filter(id => !comAnexo.has(id)).length;
  }

  return { pixPendentes, anexosFaltando };
}

// ─── Cruzamento com a Diaconia ────────────────────────────────────────────
//
// Pedido dela, verbatim (03/09/2026, ao desenhar a porta de entrada da
// Diaconia): "podemos medir a qtdd de cestas compradas X quantidade de
// pessoas atendidas". As duas metades já existiam, cada uma no módulo dela:
//
//   pessoas atendidas   `carregarBancadaDiaconia()` já soma confirmações do
//                       mês em qualquer área do ministério de Diaconia —
//                       hoje só "Cestas Básicas" está ativa (nem "Culto de
//                       Rua" nem "Jantar Pós-Culto" viraram área ainda), mas
//                       a consulta já é por MINISTÉRIO, então não precisa
//                       mudar quando essas áreas nascerem.
//
//   cestas compradas    não existe pronto: seguido pelo dinheiro, via
//                       `fin_centros_custo`, que pode se vincular a um
//                       MINISTÉRIO ou a uma ÁREA (`FinCentroVinculo`). Este
//                       cruzamento soma os dois níveis — o centro pode ter
//                       sido criado com qualquer um dos dois vínculos,
//                       dependendo de quem rodou `seedCentrosCusto()`.
//                       + subgrupo contábil (17/09/2026): "Cestas
//                       Básicas", "Condolências" etc. são centros filhos
//                       de "Min. Diaconia e Ação Social" por
//                       `centro_pai_id`, não por `vinculo_id` — o filtro
//                       original só olhava `vinculo_id`, então o gasto de
//                       verdade da Diaconia (que agora é lançado nos
//                       subgrupos, não no ministério direto) ficava fora
//                       da soma. Achado perguntando "o cálculo de quanto
//                       esse ministério já gastou pode não estar somando
//                       os subgrupos dele" na mesma sessão que
//                       generalizou subgrupo pra qualquer ministério.
//
// Se nenhum centro de custo estiver vinculado ainda, `gastoMes` volta
// `null` — não `0`. Zero seria mentir por omissão, o mesmo erro que
// `v_voluntarios_completo` já ensinou a não repetir: "não gastamos nada" e
// "ninguém configurou onde isso é lançado" são fatos diferentes, e só o
// segundo é verdade aqui até a administração vincular um centro.

export interface CruzamentoDiaconia {
  atendimentosMes: number;
  gastoMes: number | null;
  temCentroCusto: boolean;
}

export async function carregarCruzamentoDiaconia(): Promise<CruzamentoDiaconia | null> {
  const { data: ministerio } = await supabase
    .from("ministerios").select("id").eq("modulo", "diaconia").maybeSingle();
  if (!ministerio) return null;

  const bancada = await carregarBancadaDiaconia(ministerio.id);
  if (!bancada) return null;

  const { data: areas } = await supabase
    .from("areas").select("id").eq("ministerio_id", ministerio.id).eq("ativo", true);
  const vinculoIds = [ministerio.id, ...((areas ?? []) as { id: string }[]).map(a => a.id)];

  const { data: centros } = await supabase
    .from("fin_centros_custo").select("id").in("vinculo_id", vinculoIds);
  const centroIdsDiretos = ((centros ?? []) as { id: string }[]).map(c => c.id);

  // Subgrupos contábeis dos centros diretos (ministério/área) — segunda
  // rodada porque `centro_pai_id` aponta pro CENTRO, não pro
  // ministério/área em `vinculo_id`; precisa achar os diretos primeiro
  // pra depois achar quem tem um deles como pai.
  const { data: subgrupos } = centroIdsDiretos.length
    ? await supabase.from("fin_centros_custo").select("id").in("centro_pai_id", centroIdsDiretos)
    : { data: [] as { id: string }[] };
  const centroIds = [...centroIdsDiretos, ...((subgrupos ?? []) as { id: string }[]).map(c => c.id)];

  if (centroIds.length === 0) {
    return { atendimentosMes: bancada.atendimentosMes, gastoMes: null, temCentroCusto: false };
  }

  const hoje = new Date();
  const inicioMes = toYmd(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const { data: lancs } = await supabase
    .from("fin_lancamentos")
    .select("valor")
    .in("centro_custo_id", centroIds)
    .eq("tipo", "saida")
    .in("status", ["realizado", "conciliado"])
    .gte("data", inicioMes);

  const gastoMes = ((lancs ?? []) as { valor: number }[]).reduce((s, l) => s + Number(l.valor), 0);
  return { atendimentosMes: bancada.atendimentosMes, gastoMes, temCentroCusto: true };
}
