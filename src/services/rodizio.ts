// ─── rodizio.ts — o motor que monta a escala do mês ──────────────────────────
//
// Função pura: recebe os eventos do mês e quem serve em cada área, devolve
// quem entra em cada vaga e POR QUÊ. Não fala com o banco, não escreve nada.
// É aqui que mora a justiça da escala, e por isso é aqui que estão os testes.
//
// ── POR QUE RODÍZIO, E NÃO SORTEIO PURO ──────────────────────────────────────
//
// Sorteio puro ignora quem serviu no domingo passado. Funciona uma vez; na
// segunda a igreja percebe que fulana entrou três vezes e sicrano nenhuma, e
// nunca mais confia no botão.
//
// A ordem é: quem tem MENOS escalas no mês → quem serviu há MAIS tempo →
// e só então o sorteio, entre os que empataram em tudo. O acaso continua lá,
// exatamente onde a escolha é de facto arbitrária, e em lugar nenhum antes.
//
// ── O QUE ELE NUNCA FAZ ──────────────────────────────────────────────────────
//
//   • passar do teto que a pessoa declarou — "uma vez por mês" é uma vez no
//     mês inteiro, e o contador sobe DENTRO da própria geração, senão o
//     segundo domingo não sabe do primeiro;
//   • escalar quem MARCOU dias e não marcou aquele — quem não marcou nenhum
//     é caso à parte, ver abaixo;
//   • escalar quem está em descanso;
//   • pôr a mesma pessoa em duas áreas do mesmo culto — Recepção e Introdução
//     acontecem à mesma hora.

import type { DiaSemana, Turno } from "@/services/perfilServico";

export interface EventoParaEscalar {
  evento_id: string;
  titulo: string;
  data: string;              // ISO, "2026-10-04"
  hora_inicio: string | null;
  /** As áreas do ministério que este evento precisa. */
  areas: { area_id: string; area_nome: string; minimo: number }[];
}

export interface CandidatoDaArea {
  pessoa_id: string;
  nome: string;
  area_id: string;
  dias: DiaSemana[];
  turnos: Turno[];
  /** Teto declarado. `null` = a pessoa não declarou número (ver tetoDeclarado). */
  maxMes: number | null;
  /** Quantas escalas ela já tem no mês ANTES desta geração. */
  cargaMes: number;
  /** Dias desde a última escala. `null` = nunca serviu. */
  diasSemServir: number | null;
  emDescanso: boolean;
}

export interface Escalado {
  pessoa_id: string;
  nome: string;
  /** A frase que aparece ao lado do nome. Sem ela o líder não confia. */
  porque: string;
  /**
   * Entrou por presunção: não disse quando pode servir.
   *
   * A igreja decidiu em 03/09/2026 que quem não informou entra na urna — o
   * silêncio dela não é um "não". Mas a escala tem de dizer que foi palpite, e
   * o painel tem de cobrar o preenchimento da ficha: presumir para sempre é
   * transformar a lacuna em regra.
   */
  presumido: boolean;
}

export interface VagaDaEscala {
  evento_id: string;
  titulo: string;
  data: string;
  area_id: string;
  area_nome: string;
  minimo: number;
  escalados: Escalado[];
  /** Quantos faltaram, e a razão de não haver quem. */
  faltam: number;
  motivoDaFalta: string | null;
}

export interface PlanoDoMes {
  vagas: VagaDaEscala[];
  /** Quantas pessoas distintas o plano usa. */
  pessoasUsadas: number;
  /** Vagas que ficaram incompletas. */
  incompletas: number;
  /**
   * Quem está na urna sem ter dito quando pode servir — TODA a equipe, e não
   * só quem calhou de ser sorteado. É a lista que o painel cobra.
   */
  semDisponibilidade: { pessoa_id: string; nome: string }[];
}

const DIA_DA_SEMANA: DiaSemana[] =
  ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

export function diaDe(iso: string): DiaSemana {
  const [a, m, d] = iso.split("-").map(Number);
  return DIA_DA_SEMANA[new Date(a, m - 1, d).getDay()];
}

/**
 * O turno de um evento, pela hora de início.
 *
 * Sem hora não há turno, e a pessoa não é excluída por isso: quem marcou só
 * "noite" continua elegível para um evento sem horário, porque ninguém disse
 * que ele é de manhã. Excluir seria inventar o dado que falta.
 */
export function turnoDe(hora: string | null): Turno | null {
  if (!hora) return null;
  const h = Number(hora.slice(0, 2));
  if (Number.isNaN(h)) return null;
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

/** Um gerador previsível quando se dá uma semente — é o que torna o sorteio testável. */
function sorteador(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Quem não marcou dia nenhum entra por presunção — e a tela diz isso. */
export function presumido(c: CandidatoDaArea): boolean {
  return c.dias.length === 0;
}

function frase(c: CandidatoDaArea, jaNoMes: number): string {
  const partes: string[] = [];
  if (presumido(c)) partes.push("não disse quando pode servir");
  partes.push(c.diasSemServir === null
    ? "nunca serviu"
    : c.diasSemServir === 0 ? "serviu hoje" : `não serve há ${c.diasSemServir} dias`);
  partes.push(c.maxMes === null
    ? `${jaNoMes} no mês, sem teto declarado`
    : `${jaNoMes} de ${c.maxMes} no mês`);
  return partes.join(" · ");
}

/**
 * Monta o mês inteiro.
 *
 * Os eventos são percorridos EM ORDEM DE DATA porque o rodízio é histórico:
 * quem entrou no primeiro domingo desce na fila do segundo. Percorrer fora de
 * ordem daria um resultado válido e injusto.
 */
export function montarRodizio(
  eventos: EventoParaEscalar[],
  candidatos: CandidatoDaArea[],
  semente = 1,
): PlanoDoMes {
  const sorte = sorteador(semente);
  const porArea = new Map<string, CandidatoDaArea[]>();
  for (const c of candidatos) {
    porArea.set(c.area_id, [...(porArea.get(c.area_id) ?? []), c]);
  }

  // O que esta geração já gastou. Começa do que a pessoa já tinha no mês.
  const usoNoMes = new Map<string, number>();
  const ultimaVezNesteMes = new Map<string, number>(); // pessoa → índice do evento
  const usados = new Set<string>();

  const vagas: VagaDaEscala[] = [];
  const ordenados = [...eventos].sort((a, b) => a.data.localeCompare(b.data));

  ordenados.forEach((ev, indice) => {
    const dia = diaDe(ev.data);
    const turno = turnoDe(ev.hora_inicio);
    // Ninguém em duas áreas do mesmo culto.
    const jaNesteEvento = new Set<string>();

    for (const area of ev.areas) {
      const daArea = porArea.get(area.area_id) ?? [];

      const elegiveis = daArea.filter(c => {
        if (c.emDescanso) return false;
        if (jaNesteEvento.has(c.pessoa_id)) return false;
        // Silêncio não é recusa. Quem não marcou dia NENHUM entra — a igreja
        // decidiu assim, e o painel cobra o preenchimento em separado. Quem
        // marcou alguns e não marcou este, esse disse que não pode.
        if (c.dias.length > 0 && !c.dias.includes(dia)) return false;
        if (turno && c.turnos.length > 0
            && !c.turnos.includes(turno) && !c.turnos.includes("dia_todo")) return false;
        const gasto = usoNoMes.get(c.pessoa_id) ?? c.cargaMes;
        if (c.maxMes !== null && gasto >= c.maxMes) return false;
        return true;
      });

      // ── A ORDEM DO RODÍZIO ──────────────────────────────────────────
      // 1. quem tem menos escalas no mês (contando as desta geração)
      // 2. quem foi escalado há mais tempo NESTA geração (nunca > antes)
      // 3. quem serviu há mais tempo de verdade
      // 4. sorteio
      const fila = elegiveis
        .map(c => ({ c, sorteio: sorte() }))
        .sort((x, y) => {
          const gx = usoNoMes.get(x.c.pessoa_id) ?? x.c.cargaMes;
          const gy = usoNoMes.get(y.c.pessoa_id) ?? y.c.cargaMes;
          if (gx !== gy) return gx - gy;

          const ix = ultimaVezNesteMes.get(x.c.pessoa_id) ?? -1;
          const iy = ultimaVezNesteMes.get(y.c.pessoa_id) ?? -1;
          if (ix !== iy) return ix - iy;

          // `null` (nunca serviu) vai à frente de quem já serviu.
          const dx = x.c.diasSemServir ?? Number.POSITIVE_INFINITY;
          const dy = y.c.diasSemServir ?? Number.POSITIVE_INFINITY;
          if (dx !== dy) return dy - dx;

          return x.sorteio - y.sorteio;
        })
        .map(x => x.c);

      const escolhidos = fila.slice(0, area.minimo);
      const escalados: Escalado[] = escolhidos.map(c => {
        const gasto = usoNoMes.get(c.pessoa_id) ?? c.cargaMes;
        const texto = frase(c, gasto);
        usoNoMes.set(c.pessoa_id, gasto + 1);
        ultimaVezNesteMes.set(c.pessoa_id, indice);
        jaNesteEvento.add(c.pessoa_id);
        usados.add(c.pessoa_id);
        return { pessoa_id: c.pessoa_id, nome: c.nome, porque: texto, presumido: presumido(c) };
      });

      const faltam = Math.max(0, area.minimo - escalados.length);
      vagas.push({
        evento_id: ev.evento_id, titulo: ev.titulo, data: ev.data,
        area_id: area.area_id, area_nome: area.area_nome, minimo: area.minimo,
        escalados, faltam,
        motivoDaFalta: faltam === 0 ? null : porQueFaltou(daArea, dia, turno, usoNoMes),
      });
    }
  });

  const mudos = new Map<string, string>();
  for (const c of candidatos) if (presumido(c)) mudos.set(c.pessoa_id, c.nome);

  return {
    vagas,
    pessoasUsadas: usados.size,
    incompletas: vagas.filter(v => v.faltam > 0).length,
    semDisponibilidade: [...mudos.entries()]
      .map(([pessoa_id, nome]) => ({ pessoa_id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/**
 * Por que não houve gente.
 *
 * "Faltou 1" sem motivo manda o líder procurar às cegas. A frase diz onde o
 * funil apertou — e quase sempre a resposta é a mesma: ninguém marcou aquele
 * dia, ou todos já cumpriram o mês.
 */
function porQueFaltou(
  daArea: CandidatoDaArea[], dia: DiaSemana, turno: Turno | null,
  usoNoMes: Map<string, number>,
): string {
  if (daArea.length === 0) return "ninguém serve nesta área";

  const noDia = daArea.filter(c => c.dias.length === 0 || c.dias.includes(dia));
  if (noDia.length === 0) return `ninguém marcou ${dia}`;

  const noTurno = turno
    ? noDia.filter(c => c.turnos.length === 0 || c.turnos.includes(turno) || c.turnos.includes("dia_todo"))
    : noDia;
  if (noTurno.length === 0) return `ninguém marcou ${dia} à ${turno === "manha" ? "manhã" : turno}`;

  const cheios = noTurno.filter(c => {
    const gasto = usoNoMes.get(c.pessoa_id) ?? c.cargaMes;
    return c.maxMes !== null && gasto >= c.maxMes;
  }).length;
  if (cheios === noTurno.length) return "todos já cumpriram o que se dispuseram no mês";

  const descansando = noTurno.filter(c => c.emDescanso).length;
  if (descansando > 0) return `${descansando} em descanso`;

  return "não há candidatos livres";
}
