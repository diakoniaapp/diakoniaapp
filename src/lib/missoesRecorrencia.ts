// ─── lib/missoesRecorrencia.ts — o compromisso MENSAL de uma recorrência ───
//
// O painel "Missões permanentes" mostra o compromisso por MÊS. Uma recorrência bimestral de R$ 600
// pesa R$ 300 por mês; trimestral, semestral e anual idem. Separado do serviço para ser testável.

export type FrequenciaDeRecorrencia = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

const MESES: Record<FrequenciaDeRecorrencia, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

export function valorMensalDaRecorrencia(valor: number, frequencia: FrequenciaDeRecorrencia | string): number {
  const meses = MESES[frequencia as FrequenciaDeRecorrencia] ?? 1;
  return Math.round((valor / meses) * 100) / 100;
}
