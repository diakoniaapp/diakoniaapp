// ─── lib/recursosReservados.ts — Saldo nas contas × Reservado × Saldo livre (puro, testado) ─────────────────────────────────────────────────────────────
//
// Decisões dela (21/10/2026):
//   · só PROJETOS marcados "com Reserva Financeira" reservam; cada um vale (receitas realizadas − despesas realizadas) do MESMO projeto;
//   · NÃO entram previstos nem transferências entre contas; só dinheiro que de fato passou pela conta (realizado/conciliado);
//   · reserva mínima = ZERO: não existe saldo reservado negativo — o que passou da reserva aparece como "gasto além da reserva";
//   · o Fundo Missionário entra no mesmo card, calculado pela lógica própria dele (`fundoComAjustes`), também com piso zero;
//   · Saldo livre = saldo nas contas − reservado. Não bloqueia pagamento: o dinheiro está na mesma conta bancária.
// Nada aqui altera lançamento: é uma LEITURA sobre o que já existe.

export interface ProjetoDeReserva { id: string; nome: string }

/** O mínimo que o cálculo lê de um lançamento. */
export interface LancamentoDeReserva {
  projeto_id: string | null;
  tipo: string;
  status: string;
  valor: number | string;
  origem?: string | null;
}

export type OrigemDaReserva = "projeto" | "fundo_missionario";

export interface ItemReservado {
  origem: OrigemDaReserva;
  id: string;
  nome: string;
  /** o que entrou (receitas realizadas do projeto; arrecadado do fundo) */
  entradas: number;
  /** o que saiu (despesas realizadas do projeto; enviado do fundo) */
  saidas: number;
  /** nunca negativo */
  reservado: number;
  /** quanto saiu a mais do que entrou (a reserva já era zero): "Gasto além da reserva" */
  alemDaReserva: number;
  /** só o Fundo Missionário: ajustes gerenciais já somados ao saldo (entradas − saídas + ajustes = o saldo que reserva) */
  ajustes?: number;
}

const arredondar = (n: number) => Math.round(n * 100) / 100;
const valorDe = (l: LancamentoDeReserva) => Number(l.valor) || 0;
const REALIZADO = new Set(["realizado", "conciliado"]);

/** Receitas e despesas realizadas de cada projeto com reserva. Projeto sem nenhum lançamento aparece com zero (a tesouraria vê que ele existe). */
export function calcularReservaDosProjetos(projetos: ProjetoDeReserva[], lancamentos: LancamentoDeReserva[]): ItemReservado[] {
  return projetos.map(p => {
    let entradas = 0, saidas = 0;
    for (const l of lancamentos) {
      if (l.projeto_id !== p.id || !REALIZADO.has(l.status) || l.origem === "transferencia") continue;
      if (l.tipo === "entrada") entradas += valorDe(l); else saidas += valorDe(l);
    }
    return itemDe("projeto", p.id, p.nome, entradas, saidas);
  });
}

/** Fundo Missionário: arrecadado, enviado e os ajustes gerenciais — o saldo é o MESMO do painel de Missões (`saldoAjustado` de `fundoComAjustes`), com piso zero. */
export function itemDoFundoMissionario(arrecadado: number, enviado: number, ajustes = 0): ItemReservado {
  const base = itemDe("fundo_missionario", "fundo-missionario", "Fundo Missionário", arrecadado, enviado);
  return { ...base, ...partesDoSaldo(arredondar(arrecadado - enviado + ajustes)), ajustes: arredondar(ajustes) };
}

function partesDoSaldo(saldo: number) {
  return { reservado: Math.max(0, arredondar(saldo)), alemDaReserva: Math.max(0, arredondar(-saldo)) };
}

function itemDe(origem: OrigemDaReserva, id: string, nome: string, entradas: number, saidas: number): ItemReservado {
  const e = arredondar(entradas), s = arredondar(saidas);
  return { origem, id, nome, entradas: e, saidas: s, ...partesDoSaldo(e - s) };
}

export interface RecursosReservados {
  saldoNasContas: number;
  reservado: number;
  /** pode ser negativo: as reservas passam do que há nas contas (alerta) */
  saldoLivre: number;
  /** quanto, somando todos os itens, foi gasto além da reserva */
  alemDaReserva: number;
  itens: ItemReservado[];
}

/** O card: por ordem de tamanho da reserva (o maior primeiro), o Fundo Missionário junto dos projetos. */
export function montarRecursosReservados(saldoNasContas: number, itens: ItemReservado[]): RecursosReservados {
  const ordenados = [...itens].sort((a, b) => b.reservado - a.reservado || a.nome.localeCompare(b.nome, "pt-BR"));
  const reservado = arredondar(ordenados.reduce((s, i) => s + i.reservado, 0));
  return {
    saldoNasContas: arredondar(saldoNasContas),
    reservado,
    saldoLivre: arredondar(saldoNasContas - reservado),
    alemDaReserva: arredondar(ordenados.reduce((s, i) => s + i.alemDaReserva, 0)),
    itens: ordenados,
  };
}
