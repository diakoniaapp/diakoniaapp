// ─── A bancada do Bazar e da Cantina ──────────────────────────────────────
//
// A bancada do ministério que opera o módulo de arrecadação
// (`ministerios.modulo = 'arrecadacao'`). Hoje é a Administração, cujas
// quatro áreas são Apoio Adm, Bazar, Cantina e Ornamentação — duas delas
// vivem aqui.
//
// ── O CICLO QUE ESTA TELA ACOMPANHA ────────────────────────────────────────
//
//   alguém RESERVA o espaço para um evento
//   abre-se um CAIXA para essa reserva
//   vendem-se PRODUTOS
//   fecha-se o caixa e concilia-se
//   confere-se o CHECKLIST de entrega, e o que estiver errado vira um
//   problema de MANUTENÇÃO
//
// Cada etapa que não fecha deixa um rastro, e é isso que a bancada mostra —
// não o total vendido, que é relatório.
//
// ── O QUE ESTAVA ACONTECENDO, MEDIDO EM 02/09/2026 ─────────────────────────
//
//   4 caixas sem fechamento, abertos há 67 a 79 dias — três no Bazar e um na
//     Cantina, este parado em "conciliando"
//   9 reservas em aberto (4 em uso, 4 aprovadas, 1 solicitada) e TODAS com o
//     período já vencido
//   2 pendências de manutenção, ambas na Cantina, ambas vindas de itens de
//     checklist não cumpridos ("deixar o local limpo", "recolher o lixo")
//
// ── O QUE ESTA BANCADA NÃO DIZ, DE PROPÓSITO ───────────────────────────────
//
// Não fala de estoque. Os dois produtos têm `estoque_minimo = 5` e
// `estoque_atual` NULO, com zero movimentos registrados. Anunciar "2 produtos
// abaixo do mínimo" seria afirmar como fato o que é ausência de dado — o
// defeito que este projeto já cometeu várias vezes. Enquanto ninguém lançar
// estoque, a tela cala sobre estoque.

import { supabase } from "@/integrations/supabase/client";

export interface CaixaAberto {
  id: string;
  espaco: string | null;
  /** "aberto" · "conciliando" — o estado em que ele parou. */
  estado: string;
  abertoEm: string;
  diasAberto: number;
}

export interface ReservaEmAberto {
  id: string;
  espaco: string | null;
  finalidade: string | null;
  status: string;
  /** ISO do início do período reservado. */
  inicio: string | null;
  /** O período já terminou e a reserva não foi encerrada. */
  vencida: boolean;
}

export interface PendenciaManutencao {
  id: string;
  titulo: string;
  espaco: string | null;
  prioridade: string | null;
  status: string;
}

export interface BancadaArrecadacao {
  espacos: { id: string; nome: string }[];
  caixasAbertos: CaixaAberto[];
  reservasEmAberto: ReservaEmAberto[];
  manutencao: PendenciaManutencao[];
  /** Quantas reservas em aberto já passaram da data. */
  vencidas: number;
  produtos: number;
  /**
   * `false` quando nenhum produto tem `estoque_atual` preenchido. A tela usa
   * isto para não inventar alerta de estoque onde não há controle de estoque.
   */
  estoqueControlado: boolean;
}

const DIA = 86400000;

function diasDesde(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje.getTime() - d.getTime()) / DIA));
}

/**
 * O `tstzrange` do Postgres chega como texto — `["2026-06-20 18:00+00",...)`.
 * Só precisamos das duas pontas, e sem biblioteca para isso.
 */
function pontasDoPeriodo(periodo: unknown): { inicio: string | null; fim: string | null } {
  if (typeof periodo !== "string") return { inicio: null, fim: null };
  const m = periodo.match(/^[[(]"?([^",]*)"?,\s*"?([^",)\]]*)"?[)\]]$/);
  if (!m) return { inicio: null, fim: null };
  return { inicio: m[1] || null, fim: m[2] || null };
}

export async function carregarBancadaArrecadacao(): Promise<BancadaArrecadacao | null> {
  const [{ data: espacos }, { data: caixas }, { data: reservas }, { data: problemas }, { data: produtos }] =
    await Promise.all([
      supabase.from("arr_espacos").select("id, nome").order("nome"),
      // `fechado_em IS NULL` é a definição de "ainda aberto" — o `estado` diz
      // em que ponto parou, mas quem fecha de verdade é a data.
      supabase.from("arr_caixas")
        .select("id, estado, aberto_em, reserva_id")
        .is("fechado_em", null),
      supabase.from("arr_reservas")
        .select("id, status, finalidade, periodo, espaco_id")
        .in("status", ["solicitada", "aprovada", "em_uso"]),
      supabase.from("arr_problemas_manutencao")
        .select("id, titulo, prioridade, status, espaco_id")
        .not("status", "in", '("resolvido","descartado")'),
      supabase.from("arr_produtos").select("id, estoque_atual").eq("ativo", true),
    ]);

  if (!espacos) return null;

  const nomeDoEspaco = new Map((espacos ?? []).map((e) => [e.id, e.nome]));

  // O caixa aponta para a reserva, e a reserva para o espaço — dois saltos.
  const idsReservaDosCaixas = (caixas ?? []).map((c) => c.reserva_id).filter(Boolean) as string[];
  const { data: reservasDoCaixa } = idsReservaDosCaixas.length
    ? await supabase.from("arr_reservas").select("id, espaco_id").in("id", idsReservaDosCaixas)
    : { data: [] as { id: string; espaco_id: string }[] };
  const espacoDaReserva = new Map((reservasDoCaixa ?? []).map((r) => [r.id, r.espaco_id]));

  const agora = Date.now();

  const caixasAbertos: CaixaAberto[] = (caixas ?? [])
    .map((c) => ({
      id: c.id,
      espaco: c.reserva_id
        ? nomeDoEspaco.get(espacoDaReserva.get(c.reserva_id) ?? "") ?? null
        : null,
      estado: (c.estado as string) ?? "aberto",
      abertoEm: c.aberto_em as string,
      diasAberto: diasDesde(c.aberto_em as string),
    }))
    .sort((a, b) => b.diasAberto - a.diasAberto);

  const reservasEmAberto: ReservaEmAberto[] = (reservas ?? [])
    .map((r) => {
      const { inicio, fim } = pontasDoPeriodo(r.periodo);
      return {
        id: r.id,
        espaco: nomeDoEspaco.get(r.espaco_id) ?? null,
        finalidade: r.finalidade ?? null,
        status: r.status as string,
        inicio,
        vencida: !!fim && new Date(fim).getTime() < agora,
      };
    })
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));

  return {
    espacos: (espacos ?? []).map((e) => ({ id: e.id, nome: e.nome })),
    caixasAbertos,
    reservasEmAberto,
    manutencao: (problemas ?? []).map((p) => ({
      id: p.id,
      titulo: p.titulo ?? "Sem título",
      espaco: nomeDoEspaco.get(p.espaco_id ?? "") ?? null,
      prioridade: (p.prioridade as string) ?? null,
      status: (p.status as string) ?? "aberto",
    })),
    vencidas: reservasEmAberto.filter((r) => r.vencida).length,
    produtos: (produtos ?? []).length,
    estoqueControlado: (produtos ?? []).some((p) => p.estoque_atual != null),
  };
}
