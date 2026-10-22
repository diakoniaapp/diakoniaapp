// ─── lib/resumoDiarioConfig.ts — as operações da tela do Resumo Diário da Tesouraria (puras, testadas) ───────────────────────────────────────────────
import type { ResumoDiarioConfig, ResumoDiarioDestinatario } from "@/services/sistemaService";

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** Liga ou desliga um dia da semana; devolve a lista ordenada. */
export function alternarDia(dias: number[], dia: number, ligado: boolean): number[] {
  const set = new Set(dias);
  if (ligado) set.add(dia); else set.delete(dia);
  return [...set].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** "segunda a sexta, às 07:00" · "segunda, quarta e sexta, às 07:30" · "todos os dias, às 18:00". */
export function descreverAgenda(c: Pick<ResumoDiarioConfig, "dias_semana" | "hora" | "minuto">): string {
  const dias = [...c.dias_semana].sort((a, b) => a - b);
  const hh = `${String(c.hora).padStart(2, "0")}:${String(c.minuto).padStart(2, "0")}`;
  if (dias.length === 0) return "nenhum dia escolhido";
  let quando: string;
  const seguidos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  if (dias.length === 7) quando = "todos os dias";
  else if (dias.length >= 3 && seguidos) quando = `${DIAS_LONGOS[dias[0]]} a ${DIAS_LONGOS[dias[dias.length - 1]]}`;
  else { const nomes = dias.map(d => DIAS_LONGOS[d]); quando = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`; }
  return `${quando}, às ${hh}`;
}

export const rotuloDaJanela = (n: number) => (n === 0 ? "Só o que vence hoje e o que está atrasado" : `Também o que vence nos próximos ${n} ${n === 1 ? "dia" : "dias"}`);

const normaliza = (c: ResumoDiarioConfig) => ({ ...c, dias_semana: [...c.dias_semana].sort((a, b) => a - b) });
const emails = (d: ResumoDiarioDestinatario[]) => d.map(x => x.email.trim().toLowerCase()).sort();

/** O que a tela mudou em relação ao que está salvo? */
export const houveMudancaNoDiario = (atual: { config: ResumoDiarioConfig; destinatarios: ResumoDiarioDestinatario[] }, salvo: { config: ResumoDiarioConfig; destinatarios: ResumoDiarioDestinatario[] }): boolean =>
  JSON.stringify(normaliza(atual.config)) !== JSON.stringify(normaliza(salvo.config)) || JSON.stringify(emails(atual.destinatarios)) !== JSON.stringify(emails(salvo.destinatarios));

/** O que impede de salvar, em palavras (vazio = pode). */
export function problemasDoDiario(c: ResumoDiarioConfig, destinatarios: ResumoDiarioDestinatario[]): string[] {
  const p: string[] = [];
  if (c.dias_semana.length === 0) p.push("Escolha ao menos um dia da semana.");
  if (!(c.hora >= 0 && c.hora <= 23) || !(c.minuto >= 0 && c.minuto <= 59)) p.push("Horário inválido.");
  if (c.ativo && destinatarios.length === 0) p.push("Cadastre ao menos um destinatário para ligar o resumo diário.");
  return p;
}
