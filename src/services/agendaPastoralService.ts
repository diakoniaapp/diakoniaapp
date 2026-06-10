// ─── agendaPastoralService.ts — Agenda + WhatsApp ─────────────────────────
import { supabase } from "@/integrations/supabase/client";

export interface EventoPastoral {
  tipo: "aniversario" | "casamento";
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
export async function proximosDias(dias = 7): Promise<EventoPastoral[]> {
  const { data, error } = await supabase.rpc("agenda_pastoral_proximos_dias", {
    p_dias: dias,
  });
  if (error) throw error;
  return (data ?? []) as EventoPastoral[];
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
