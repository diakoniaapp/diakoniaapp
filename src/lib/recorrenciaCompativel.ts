// ─── lib/recorrenciaCompativel.ts — H2: existe uma RECORRÊNCIA compatível com este pagamento, mas a conta do mês não está em aberto (puro, testado) ─────────
//
// H1 cobre a conta que EXISTE em aberto. H0 cobre a que já foi paga e registrada. O que sobrava era o contrato mensal cuja ocorrência daquele mês
// NUNCA foi gerada (o gerador não despeja meses atrasados — `DIAS_DE_PASSADO_TOLERADO` — e uma ocorrência excluída não volta): o pagamento chegava
// pelo OFX, não achava conta nenhuma e virava despesa NOVA, sem o vínculo com o contrato.
//
// Compatível = contrato ativo do MESMO favorecido, não parcelado, com valor igual (ou, se o valor é variável, entre 50% e 150% do habitual), cuja
// ocorrência (pela agenda do próprio contrato) vence entre 45 dias antes e 10 dias depois do pagamento e AINDA NÃO TEM LINHA — nem aberta, nem
// paga, nem cancelada — naquele mês. É só uma PROPOSTA: "Gerar e liquidar a recorrência" pede o clique da tesouraria.

import { calcularOcorrencias, ocupanteDaOcorrencia, type FrequenciaRec, type LinhaDaSerie, type ParametrosDaSerie } from "./recorrencia";
import { dataFimReal } from "./recorrencia";
import { daquiADias } from "./data";

export interface RecorrenciaDoCadastro {
  id: string;
  descricao: string;
  tipo: string;
  valor: number;
  valor_variavel?: boolean | null;
  fornecedor_id?: string | null;
  pessoa_id?: string | null;
  frequencia: FrequenciaRec;
  dia_vencimento: number;
  data_inicio: string;
  data_fim?: string | null;
  ativo?: boolean | null;
  tipo_recorrencia?: "continua" | "parcelamento" | null;
  total_parcelas?: number | null;
  parcela_inicial?: number | null;
}

/** Uma linha que a recorrência já tem no banco (qualquer situação): é ela que ocupa a ocorrência. */
export interface LinhaDaRecorrencia extends LinhaDaSerie { recorrencia_id: string }

export interface RecorrenciaCompativel {
  recorrenciaId: string;
  rotulo: string;
  /** valor habitual do contrato */
  valor: number;
  valorVariavel: boolean;
  /** a data de vencimento da ocorrência que falta (AAAA-MM-DD) */
  vencimento: string;
  /** pago − habitual (positivo = pagou a mais) */
  diferenca: number;
  motivo: string;
}

const JANELA_ATRASO = 45;    // pagou até 45 dias depois do vencimento
const JANELA_ANTECIPADO = 10; // pagou até 10 dias antes
const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
const c = (n: number) => Math.round(n * 100) / 100;

function parametros(r: RecorrenciaDoCadastro): ParametrosDaSerie {
  return { dataInicio: r.data_inicio, diaVencimento: r.dia_vencimento, frequencia: r.frequencia, tipo: "continua", dataFim: dataFimReal(r.data_fim) };
}

/**
 * A recorrência compatível com um pagamento de SAÍDA (ou null). `ocupantes` = as linhas que as recorrências já têm; `jaUsadas` = "recorrenciaId|vencimento"
 * já propostas a outra linha do mesmo arquivo (cada ocorrência serve a um pagamento só).
 */
export function acharRecorrenciaCompativel(
  tx: { valor: number; data: string; tipo: string },
  favorecidoId: string | null | undefined,
  recorrencias: readonly RecorrenciaDoCadastro[],
  ocupantes: readonly LinhaDaRecorrencia[],
  jaUsadas: ReadonlySet<string> = new Set(),
): RecorrenciaCompativel | null {
  if (tx.tipo !== "saida" || !(tx.valor > 0) || !favorecidoId) return null;
  const achados: (RecorrenciaCompativel & { exato: boolean; distancia: number })[] = [];
  for (const r of recorrencias) {
    if (r.ativo === false || r.tipo !== "saida") continue;
    if (r.tipo_recorrencia === "parcelamento" || r.total_parcelas) continue;       // parcela se gera pelo contrato; aqui só as contínuas
    if (r.fornecedor_id !== favorecidoId && r.pessoa_id !== favorecidoId) continue;
    const variavel = !!r.valor_variavel;
    const exato = Math.abs(tx.valor - r.valor) < 0.005;
    if (!exato && !(variavel && tx.valor >= r.valor * 0.5 && tx.valor <= r.valor * 1.5)) continue;

    const minhas = ocupantes.filter(o => o.recorrencia_id === r.id);
    const agenda = calcularOcorrencias(parametros(r), daquiADias(tx.data, JANELA_ATRASO + 62));
    // SÓ a ocorrência mais próxima do pagamento conta: se ela já tem linha (ou já foi proposta a outra linha), o pagamento pertence a ela — e é caso de
    // H0/H1, não de H2. Cair para a ocorrência vizinha (o mês anterior, pago "45 dias atrasado") seria inventar uma conta que não existe.
    const o = agenda
      .filter(x => { const d = dias(x.data, tx.data); return d >= -JANELA_ATRASO && d <= JANELA_ANTECIPADO; })
      .sort((a, b) => Math.abs(dias(a.data, tx.data)) - Math.abs(dias(b.data, tx.data)))[0];
    if (!o || ocupanteDaOcorrencia(o, minhas) || jaUsadas.has(`${r.id}|${o.data}`)) continue;
    const d = dias(o.data, tx.data);
    achados.push({
      recorrenciaId: r.id, rotulo: r.descricao, valor: r.valor, valorVariavel: variavel, vencimento: o.data, diferenca: c(tx.valor - r.valor), exato,
      distancia: Math.abs(d),
      motivo: `contrato «${r.descricao}» do mesmo favorecido, ${exato ? "valor igual" : "valor variável"}; a ocorrência de ${o.data.slice(8, 10)}/${o.data.slice(5, 7)} não tem conta gerada`
        + (d < 0 ? ` (pago ${-d} dia${-d > 1 ? "s" : ""} depois do vencimento)` : d > 0 ? ` (pago ${d} dia${d > 1 ? "s" : ""} antes)` : ""),
    });
  }
  achados.sort((a, b) => Number(b.exato) - Number(a.exato) || a.distancia - b.distancia);
  const melhor = achados[0];
  if (!melhor) return null;
  const { exato: _e, distancia: _d, ...out } = melhor;
  return out;
}
