// ─── Central de Comunicação e Relatórios — o que a tela sabe sobre si mesma (27/10/2026, Fase 2) ──────────────────────────────────────────────────────────────────────────────────────
// A tela "Resumos por E-mail" (`/admin/resumo-semanal`) virou a Central em `/comunicacao`, com CINCO abas. A decisão de 5 e não 6 (a aba "Conteúdo" do desenho dela é o próprio editor do Modelo) está em
// docs/ANALISE_CENTRAL_DE_COMUNICACAO_E_RELATORIOS_2026-10-27.md §11.1. Este arquivo guarda o que é puro e testável: as abas, o catálogo de relatórios e o texto que a aba Configurações mostra.
export {
  REMETENTE_AUTOMATICO, REMETENTE_RELATORIOS, enderecoDeResposta, emailDeRespostaValido,
} from "../../supabase/functions/_shared/email/remetente";
export { textoDaNotaDeResposta } from "../../supabase/functions/_shared/email/desenho";
export { DIAS_ATE_AVISAR } from "../../supabase/functions/_shared/saldos/extratoDasContas";

export const ABAS_DA_COMUNICACAO = [
  { id: "agendamentos", rotulo: "Agendamentos" },
  { id: "modelos", rotulo: "Modelos" },
  { id: "relatorios", rotulo: "Relatórios" },
  { id: "historico", rotulo: "Histórico" },
  { id: "configuracoes", rotulo: "Configurações" },
] as const;
export type AbaDaComunicacao = typeof ABAS_DA_COMUNICACAO[number]["id"];
export const ABA_PADRAO: AbaDaComunicacao = "agendamentos";

/** A aba pedida na URL, ou a padrão se vier lixo (um favorito antigo nunca deixa a tela em branco). */
export function abaValida(texto: string | null | undefined): AbaDaComunicacao {
  return ABAS_DA_COMUNICACAO.some(a => a.id === texto) ? (texto as AbaDaComunicacao) : ABA_PADRAO;
}

export interface RelatorioDoCatalogo {
  id: string;
  titulo: string;
  descricao: string;
  /** a tela onde o relatório existe hoje (visualizar, Excel, CSV, impressão) */
  rota: string;
  /** o que a tela já entrega hoje */
  formatos: string[];
  /** `disponivel`: a Central já envia este relatório por e-mail; `em_breve`: ainda não — a tela diz isso claramente em vez de esconder */
  envioPorEmail: "em_breve" | "disponivel";
}

/**
 * O catálogo de relatórios que a Central vai enviar por e-mail. Cada um aponta para a tela onde ele já funciona; o ENVIO sob demanda (Fase 4 do roadmap) é o que falta.
 * Só entram aqui relatórios cuja rota existe de verdade (teste confere contra o App.tsx).
 */
export const CATALOGO_DE_RELATORIOS: RelatorioDoCatalogo[] = [
  { id: "doadores", titulo: "Doadores e dizimistas", descricao: "Quem contribui, quanto, com que frequência. Por e-mail vai só o agregado (sem nomes); a lista com nomes fica no sistema, com registro de quem consulta.", rota: "/financas/doadores", formatos: ["Tela", "Excel", "CSV", "E-mail (agregado)"], envioPorEmail: "disponivel" },
  { id: "prestacao", titulo: "Prestação de contas", descricao: "O balanço do período para a diretoria e o conselho.", rota: "/financas/prestacao-de-contas", formatos: ["Tela", "PDF (impressão)"], envioPorEmail: "em_breve" },
  { id: "obrigacoes", titulo: "Extrato de obrigações", descricao: "Todas as obrigações do período, inclusive as quitadas por terceiros.", rota: "/financas/extrato-de-obrigacoes", formatos: ["Excel", "CSV", "PDF (impressão)"], envioPorEmail: "em_breve" },
  { id: "dre", titulo: "DRE", descricao: "Resultado do exercício por categoria e centro.", rota: "/financas/dre", formatos: ["Tela", "PDF (impressão)"], envioPorEmail: "em_breve" },
];

/** O que cada tipo de envio automático é — usado na aba Configurações para dizer, em palavras, quem manda e para onde vai a resposta. */
export const TIPOS_DE_ENVIO = [
  { id: "diario", rotulo: "Resumo diário da Tesouraria", destinatarios: "pessoas escolhidas no cadastro" },
  { id: "semanal", rotulo: "Resumo semanal", destinatarios: "perfis ligados (administração, tesouraria, secretaria, pastoral)" },
  { id: "alertas", rotulo: "Alertas (ata atrasada, visitante esfriando)", destinatarios: "o endereço fixo da administração" },
  { id: "visitante", rotulo: "Mensagens ao visitante (teste)", destinatarios: "quem pediu o teste" },
] as const;
