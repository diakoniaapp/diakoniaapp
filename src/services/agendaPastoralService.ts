// ─── agendaPastoralService.ts — Agenda + WhatsApp ─────────────────────────
import { supabase } from "@/integrations/supabase/client";

/**
 * Efemérides da vida da igreja.
 *
 * "membresia" e "pastorado" saíram de duas colunas que já existiam e já
 * tinham dado — `data_entrada` e `data_consagracao_pastoral`. Todo o cálculo
 * de recorrência mora na view `vw_agenda_pastoral` e não conhece os tipos:
 * opera sobre a data de origem, seja ela qual for. Somar uma efeméride foi
 * somar um ramo à view.
 */
export type TipoEfemeride = "aniversario" | "casamento" | "membresia" | "pastorado";

export interface EventoPastoral {
  tipo: TipoEfemeride;
  ref_id: string;
  pessoa_id?: string | null;
  familia_id?: string | null;
  titulo: string;
  subtitulo: string;
  proxima_data: string;
  anos_vai_completar: number;
  data_evento?: string;
  dias_ate_evento?: number;
  telefone?: string | null;
  telefone_secundario?: string | null;
  passou?: boolean;
  /**
   * membro, congregado ou visitante — nulo no ramo de casamento, que
   * pertence a uma família e não a uma pessoa.
   *
   * Veio da migration 20260820150000. Sem ele não havia como conferir,
   * olhando a tela, que os três tipos aparecem: a lista mostrava nome e
   * idade, e um congregado era indistinguível de um membro.
   */
  tipo_pessoa?: "membro" | "congregado" | "visitante" | null;
}

// ── Buscar eventos do mês (default: mês atual) ─────────────────────────────
export async function agendaDoMes(ano?: number, mes?: number): Promise<EventoPastoral[]> {
  const { data, error } = await supabase.rpc("agenda_pastoral_mes", {
    p_ano: ano ?? null,
    p_mes: mes ?? null,
  });
  if (error) throw error;
  return (data ?? []) as EventoPastoral[];
}

// ── Próximos N dias ────────────────────────────────────────────────────────
// As duas RPCs divergem no nome do campo: agenda_pastoral_mes devolve
// `anos_vai_completar` e agenda_pastoral_proximos_dias devolve
// `anos_completar`. Normalizamos aqui para que EventoPastoral seja verdadeiro
// nas duas origens.
//
// Sem isso o campo chegava `undefined` a quem consome esta função (painel,
// Vida das Famílias, Painel Pastoral) e `undefined > 0` silenciosamente
// derrubava a contagem de anos da mensagem de bodas no WhatsApp.
export async function proximosDias(dias = 7): Promise<EventoPastoral[]> {
  const { data, error } = await supabase.rpc("agenda_pastoral_proximos_dias", {
    p_dias: dias,
  });
  if (error) throw error;
  return (data ?? []).map((ev) => {
    const { anos_completar, ...resto } = ev as EventoPastoral & { anos_completar?: number };
    return { ...resto, anos_vai_completar: anos_completar ?? resto.anos_vai_completar ?? 0 };
  });
}

// ─── Templates de mensagem pastoral ───────────────────────────────────────

const VERSICULOS_ANIVERSARIO = [
  { ref: "Salmos 90:12", texto: "Ensina-nos a contar os nossos dias, para que alcancemos coração sábio." },
  { ref: "Jeremias 29:11", texto: "Eu bem sei os pensamentos que tenho a vosso respeito, diz o SENHOR; pensamentos de paz e não de mal, para vos dar o fim que esperais." },
  { ref: "Salmos 91:16", texto: "Saciá-lo-ei com longura de dias, e lhe mostrarei a minha salvação." },
  { ref: "Eclesiastes 3:1", texto: "Tudo tem o seu tempo determinado, e há tempo para todo o propósito debaixo do céu." },
  { ref: "Salmos 118:24", texto: "Este é o dia que fez o Senhor; regozijemo-nos, e alegremo-nos nele." },
];

const VERSICULOS_CASAMENTO = [
  { ref: "Mateus 19:6", texto: "Portanto, o que Deus uniu, não o separe o homem." },
  { ref: "1 Coríntios 13:4-5", texto: "O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha." },
  { ref: "Eclesiastes 4:9", texto: "Melhor é serem dois do que um, porque têm melhor paga do seu trabalho." },
  { ref: "Provérbios 18:22", texto: "Quem encontrou uma esposa, encontrou uma coisa boa, e alcançou a benevolência do SENHOR." },
  { ref: "Cânticos 8:7", texto: "As muitas águas não podem apagar o amor, nem os rios afogá-lo." },
];

const VERSICULOS_MEMBRESIA = [
  { ref: "Efésios 2:19", texto: "Assim, vocês já não são estrangeiros nem forasteiros, mas concidadãos dos santos e membros da família de Deus." },
  { ref: "1 Coríntios 12:27", texto: "Ora, vocês são o corpo de Cristo, e cada um de vocês, individualmente, é membro desse corpo." },
  { ref: "Salmos 92:13", texto: "Plantados na casa do SENHOR, florescerão nos átrios do nosso Deus." },
  { ref: "Romanos 12:5", texto: "Assim também nós, que somos muitos, somos um só corpo em Cristo, e cada membro está ligado a todos os outros." },
  { ref: "Salmos 133:1", texto: "Como é bom e agradável quando os irmãos vivem em união!" },
];

const VERSICULOS_PASTORADO = [
  { ref: "1 Pedro 5:2", texto: "Pastoreiem o rebanho de Deus que está aos seus cuidados, não por obrigação, mas de boa vontade." },
  { ref: "Jeremias 3:15", texto: "E lhes darei pastores segundo o meu coração, que os apascentem com conhecimento e com inteligência." },
  { ref: "2 Timóteo 4:5", texto: "Você, porém, seja moderado em tudo, suporte os sofrimentos, faça a obra de um evangelista, cumpra plenamente o seu ministério." },
  { ref: "Atos 20:28", texto: "Cuidem de vocês mesmos e de todo o rebanho sobre o qual o Espírito Santo os colocou como bispos." },
  { ref: "Hebreus 13:17", texto: "Eles cuidam de vocês como quem deve prestar contas." },
];

function escolherVersiculo(arr: { ref: string; texto: string }[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Gerar mensagem WhatsApp ────────────────────────────────────────────────
export function mensagemPastoral(evento: EventoPastoral): string {
  if (evento.tipo === "aniversario") {
    const primeiroNome = evento.titulo.split(" ")[0];
    const v = escolherVersiculo(VERSICULOS_ANIVERSARIO);
    return [
      `Olá ${primeiroNome}! 🎂🙏`,
      ``,
      `Hoje a igreja celebra com você este novo ano de vida.`,
      `Que Deus continue te abençoando ricamente!`,
      ``,
      `📖 "${v.texto}"`,
      `(${v.ref})`,
      ``,
      `Que seu dia seja repleto de paz e alegria. Estamos orando por você!`,
    ].join("\n");
  }
  if (evento.tipo === "membresia") {
    const primeiroNome = evento.titulo.split(" ")[0];
    const v = escolherVersiculo(VERSICULOS_MEMBRESIA);
    const anos = evento.anos_vai_completar;
    return [
      `Olá ${primeiroNome}! 🕊️`,
      ``,
      anos > 0
        ? `Hoje faz ${anos} ano${anos > 1 ? "s" : ""} que você faz parte desta família.`
        : `Hoje lembramos com alegria a sua entrada nesta família.`,
      `A igreja é mais igreja com você aqui.`,
      ``,
      `📖 "${v.texto}"`,
      `(${v.ref})`,
      ``,
      `Obrigado por caminhar conosco. Estamos orando por você!`,
    ].join("\n");
  }

  if (evento.tipo === "pastorado") {
    const primeiroNome = evento.titulo.split(" ")[0];
    const v = escolherVersiculo(VERSICULOS_PASTORADO);
    const anos = evento.anos_vai_completar;
    return [
      `Pastor ${primeiroNome}, que alegria! 🙏`,
      ``,
      anos > 0
        ? `Hoje se completam ${anos} ano${anos > 1 ? "s" : ""} de ministério pastoral.`
        : `Hoje lembramos com gratidão a sua consagração ao ministério.`,
      `Somos gratos a Deus pela sua vida e pelo seu cuidado conosco.`,
      ``,
      `📖 "${v.texto}"`,
      `(${v.ref})`,
      ``,
      `Que o Senhor continue sustentando o senhor. Estamos orando!`,
    ].join("\n");
  }

  // Casamento
  const v = escolherVersiculo(VERSICULOS_CASAMENTO);
  return [
    `Olá ${evento.titulo} 💙💍`,
    ``,
    `Hoje celebramos com vocês o aniversário de casamento de vocês`,
    evento.anos_vai_completar > 0 ? `(${evento.anos_vai_completar} ano${evento.anos_vai_completar > 1 ? "s" : ""} de união abençoada!)` : `(que data especial!)`,
    ``,
    `📖 "${v.texto}"`,
    `(${v.ref})`,
    ``,
    `Que Deus continue fortalecendo o vínculo de vocês.`,
    `Estamos orando por essa família!`,
  ].join("\n");
}

// ── Link WhatsApp ──────────────────────────────────────────────────────────
export function linkWhatsApp(evento: EventoPastoral, telefoneSelecionado?: string): string {
  const tel = (telefoneSelecionado || evento.telefone || "").replace(/\D/g, "");
  const msg = encodeURIComponent(mensagemPastoral(evento));
  return tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

// ─── Inteligência Pastoral ─────────────────────────────────────────────────

export interface FamiliaSemResponsavel {
  familia_id: string;
  nome_familia: string;
  qtd_membros: number;
  primeiro_membro_id: string;
  primeiro_membro_nome: string;
}

export interface PessoaSemFamilia {
  pessoa_id: string;
  nome_completo: string;
  sobrenome: string;
  qtd_pessoas_mesmo_sobrenome: number;
  familia_sugerida_id: string | null;
  familia_sugerida_nome: string | null;
}

export interface ResumoPastoral {
  aniversarios_hoje: number;
  bodas_hoje: number;
  aniversarios_semana: number;
  bodas_semana: number;
  familias_sem_resp: number;
  pessoas_sem_familia_sugerida: number;
}

export async function familiasSemResponsavel(): Promise<FamiliaSemResponsavel[]> {
  const { data, error } = await supabase.rpc("familias_sem_responsavel");
  if (error) throw error;
  return (data ?? []) as FamiliaSemResponsavel[];
}

export async function pessoasSemFamiliaSugerida(): Promise<PessoaSemFamilia[]> {
  const { data, error } = await supabase.rpc("pessoas_sem_familia_sobrenome_conhecido");
  if (error) throw error;
  return (data ?? []) as PessoaSemFamilia[];
}

export async function resumoPainel(): Promise<ResumoPastoral | null> {
  const { data, error } = await supabase.rpc("resumo_painel_pastoral");
  if (error) throw error;
  const linhas = (data ?? []) as ResumoPastoral[];
  return linhas[0] ?? null;
}
