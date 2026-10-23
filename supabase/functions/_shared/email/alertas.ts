// ─── os e-mails dos alertas pontuais (visitante esfriando, ata atrasada) no Design System (puro) ─────────────────────────────────────────────────────────────────────────────────────────
// Antes cada função escrevia o próprio HTML — com o nome e o título do cadastro colados SEM escapar. Agora os dois usam a mesma moldura dos demais e-mails e o texto do cadastro passa por `esc`.
import * as D from "./desenho.ts";

export interface VisitanteEsfriando { id: string; nome_completo: string; telefone_celular: string | null; dias_sem_contato: number; ultimo_contato_em: string | null; created_at: string }
export interface AtaAtrasada { id: string; titulo: string; tipo: string; data_reuniao: string; dias_sem_ata: number; secretaria_nome: string | null }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");

export const assuntoDosVisitantes = (n: number) => `Diakonia — ${plural(n, "visitante esfriando", "visitantes esfriando")}`;
export const assuntoDasAtas = (n: number) => `Diakonia — ${plural(n, "ata de reunião atrasada", "atas de reunião atrasadas")}`;

export function htmlDosVisitantes(visitantes: readonly VisitanteEsfriando[], igreja?: string | null): string {
  const corpo = D.saudacao(plural(visitantes.length, "visitante esfriando", "visitantes esfriando"))
    + D.paragrafo("Sem contato há mais de 2 dias — quanto mais tempo passa, menor a chance de voltar.")
    + visitantes.map(v => D.cartaoDeObrigacao({
      etiqueta: "Visitante", titulo: v.nome_completo,
      status: { texto: v.ultimo_contato_em ? `Sem contato há ${v.dias_sem_contato} dias` : `Nunca contatado(a) — ${v.dias_sem_contato} dias desde o cadastro`, tom: "atencao" },
    })).join("")
    + D.botao("https://portal.diakoniaapp.com.br/visitantes", "Abrir a Central de Acolhimento");
  return D.moldura({ assunto: assuntoDosVisitantes(visitantes.length), igreja, preheader: "Visitantes que ainda não foram procurados", corpo });
}

export function htmlDasAtas(atas: readonly AtaAtrasada[], igreja?: string | null): string {
  const corpo = D.saudacao(plural(atas.length, "ata de reunião atrasada", "atas de reunião atrasadas"))
    + D.paragrafo("Mais de 7 dias desde a reunião, e a decisão ainda não ficou registrada.")
    + atas.map(a => D.cartaoDeObrigacao({
      etiqueta: "Ata pendente", titulo: a.titulo,
      status: { texto: `${a.dias_sem_ata} dias sem ata`, tom: "atencao" },
      fatos: [{ icone: "📅", rotulo: "Reunião", valor: dataBr(a.data_reuniao) }, ...(a.secretaria_nome ? [{ icone: "✍️", rotulo: "Secretaria", valor: a.secretaria_nome }] : [])],
    })).join("")
    + D.botao("https://portal.diakoniaapp.com.br/governanca", "Abrir Governança");
  return D.moldura({ assunto: assuntoDasAtas(atas.length), igreja, preheader: "Atas de reunião que ainda não foram lançadas", corpo });
}
