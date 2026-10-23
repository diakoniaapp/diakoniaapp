// ─── avisoDoFechamento — o aviso "Fechamento de setembro: 83% pronto · continuar" na Mesa (23/10/2026) ──────────────────────────────────────────────────
// Decisão dela: o botão "Fechar o mês" saiu de "Meu trabalho" (levava à Prestação de Contas, que é um relatório, e a aba "4 Fechamento" já existe). Em seu lugar, um aviso que só aparece
// quando o fechamento é o assunto: nos primeiros 20 dias do mês seguinte (a janela do malote contábil, a mesma do cartão "Documentos para a contabilidade") e nos últimos dias do mês.
// O percentual é a PRONTIDÃO DO MALOTE (documentação completa + dispensas ÷ total) — a mesma que a aba Fechamento mostra na etapa 3.
import { formatarPercentual } from "@/lib/documentos/cobertura";
import { rotuloDoMes } from "@/lib/fechamentoMensal";

export interface AvisoDoFechamento {
  /** "Setembro/2026" */
  rotulo: string;
  prontidao: number;
  /** 100%: nada impede gerar o malote */
  pronto: boolean;
  /** true nos últimos dias do próprio mês (o mês que ainda vai fechar) */
  fimDeMes: boolean;
  texto: string;
}

/** Até que dia do mês seguinte o malote do mês anterior ainda é assunto (o mesmo `DIA_LIMITE_DO_MALOTE` do serviço da Mesa). */
export const ULTIMO_DIA_DO_FECHAMENTO = 20;
/** Quantos dias antes do fim do mês o aviso do mês corrente começa a aparecer. */
export const DIAS_ANTES_DO_FIM_DO_MES = 3;

export function avisoDoFechamento(
  hoje: string,
  anterior: { rotulo: string; resumo: { prontidao: number } } | null,
  atual: { prontidao: number } | null,
): AvisoDoFechamento | null {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  let rotulo: string; let prontidao: number; let fimDeMes = false;
  if (anterior && dia <= ULTIMO_DIA_DO_FECHAMENTO) { rotulo = anterior.rotulo; prontidao = anterior.resumo.prontidao; }
  else if (atual && dia > ultimoDia - DIAS_ANTES_DO_FIM_DO_MES) { rotulo = rotuloDoMes(ano, mes); prontidao = atual.prontidao; fimDeMes = true; }
  else return null;

  const pronto = prontidao >= 100;
  const texto = pronto
    ? `Fechamento de ${rotulo} · malote pronto para gerar`
    : `Fechamento de ${rotulo} · ${formatarPercentual(prontidao)}% do malote pronto`;
  return { rotulo, prontidao, pronto, fimDeMes, texto };
}
