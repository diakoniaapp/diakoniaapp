// ─── A agenda do ministério ───────────────────────────────────────────────
//
// ── O BURACO QUE ISTO FECHA ────────────────────────────────────────────────
//
// O painel de ministério mostra ESCALAS. Escala e agenda não são a mesma
// coisa: a escala diz quem serve, a agenda diz o que acontece. Medido nos
// onze em 02/09/2026:
//
//   ministério            eventos   escalas
//   Música                     14         1
//   Famílias                   11         0
//   Pastoral                    8         0
//   Celebrando                  5         2
//   Administração               4         0
//   Comunhão/Integração         3         6
//   Oração                      3         0
//   Diaconia                    2         1
//   Educação Cristã             2         0
//   Evangelismo                 2         0
//
// São 54 vínculos evento↔ministério contra 10 escalas. **A agenda é onde os
// ministérios vivem; a escala é usada por um deles.** E o painel de quem tem
// onze eventos e nenhuma escala dizia "Nenhuma escala criada para este
// ministério" e mais nada — o calendário inteiro invisível.
//
// ── A OCASIÃO ──────────────────────────────────────────────────────────────
//
// Isto nasceu olhando o Ministério de Oração, cujas duas áreas são LIVES
// ("Live Matinal de Oração", "Live Orando Sobre a Palavra"). Para ele o
// evento não é o contexto do trabalho: **é o trabalho**. Um painel que lhe
// mostra escalas e esconde as transmissões mostra tudo menos o ministério.
//
// Como aconteceu com a composição por função, o que parecia particularidade
// de um serve os onze — e é no Oração que mais significa.
//
// ── E O ALERTA QUE SÓ O DADO PODIA CONTAR ──────────────────────────────────
//
// `eventos.transmissao_online` e `transmissao_url` existem, e
// `AgendaDaSemana` já os usa: quando marcados, o convite que a pessoa
// compartilha ganha o link para assistir.
//
// Medido: **0 dos 34 eventos da igreja têm transmissão marcada** — inclusive
// as duas lives do Ministério de Oração, cujo nome começa com "Live". Quem
// abre a agenda na Home não recebe link nenhum para elas.

import { supabase } from "@/integrations/supabase/client";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import type { EventoRow } from "@/lib/agenda/types";

export interface CompromissoDoMinisterio {
  id: string;
  titulo: string;
  tipo: string | null;
  /** ISO da ocorrência — já expandida, se o evento for recorrente. */
  data: string;
  hora: string | null;
  local: string | null;
  recorrente: boolean;
  /** `tipo = 'live'`, que é o que a igreja usa para transmissão. */
  ehLive: boolean;
  transmissaoMarcada: boolean;
}

export interface AgendaDoMinisterio {
  proximos: CompromissoDoMinisterio[];
  /** Quantos eventos distintos o ministério tem, contando os passados. */
  totalDeEventos: number;
  /**
   * Lives sem `transmissao_online` marcada.
   *
   * A tela usa isto para avisar que o convite compartilhado sai sem link —
   * e não para dizer que a transmissão não vai acontecer, que ela não sabe.
   */
  livesSemTransmissao: CompromissoDoMinisterio[];
}

/** Quantos dias para a frente a bancada olha. Duas semanas cobrem o mensal. */
const JANELA_DIAS = 21;

export async function carregarAgendaDoMinisterio(
  ministerioId: string,
): Promise<AgendaDoMinisterio | null> {
  const { data: vinculos } = await supabase
    .from("evento_ministerios")
    .select("evento_id")
    .eq("ministerio_id", ministerioId);

  const ids = (vinculos ?? []).map((v) => v.evento_id);
  if (ids.length === 0) {
    return { proximos: [], totalDeEventos: 0, livesSemTransmissao: [] };
  }

  const { data: eventos } = await supabase.from("eventos").select("*").in("id", ids);
  if (!eventos) return null;

  // ── A janela começa à MEIA-NOITE ────────────────────────────────────
  //
  // `expandirOcorrencias` compara com a data, e `new Date()` traz a hora.
  // Abrir o painel às 22h faria os eventos de hoje caírem fora da janela —
  // o mesmo defeito que a Agenda da Home teve em 01/09, quando o painel
  // pastoral mostrava quatro itens e a Home mostrava um traço.
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + JANELA_DIAS);

  const ocorrencias = expandirOcorrencias(eventos as unknown as EventoRow[], inicio, fim);

  const proximos: CompromissoDoMinisterio[] = ocorrencias.map((o) => {
    const ev = o.evento as any;
    return {
      id: ev.id,
      titulo: ev.titulo ?? "Sem título",
      tipo: ev.tipo ?? null,
      data: o.data,
      hora: ev.hora_inicio ?? null,
      local: ev.local_nome ?? ev.local ?? null,
      recorrente: !!ev.recorrencia_regra,
      ehLive: (ev.tipo ?? "") === "live",
      transmissaoMarcada: !!ev.transmissao_online,
    };
  });

  // Uma live recorrente vira várias ocorrências na janela; o aviso é sobre o
  // EVENTO, não sobre cada repetição dele.
  const jaVistos = new Set<string>();
  const livesSemTransmissao = proximos.filter((c) => {
    if (!c.ehLive || c.transmissaoMarcada || jaVistos.has(c.id)) return false;
    jaVistos.add(c.id);
    return true;
  });

  return { proximos, totalDeEventos: eventos.length, livesSemTransmissao };
}
