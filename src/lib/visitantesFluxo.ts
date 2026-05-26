// ============================================================
// visitantesFluxo.ts
// Utilitários para o fluxo de cuidado de visitantes
// ============================================================

export type EtapaFluxo =
  | "boas_vindas"
  | "incentivo"
  | "cuidado"
  | "nao_voltou"
  | "retornou"
  | "em_acompanhamento";

export type Prioridade = "alta" | "media" | "baixa";

export interface VisitanteFluxo {
  id: string;
  nome_completo: string;
  telefone: string | null;
  numero_visitas: number;
  status_acolhimento: string | null;
  ultimo_contato_em: string | null;
  created_at: string;
  dias_desde_cadastro: number;
  etapa_fluxo: EtapaFluxo;
  prioridade: Prioridade;
  precisa_acao: boolean;
}

// ------------------------------------------------------------
// Mensagens contextualizadas por etapa
// ------------------------------------------------------------
export function getMensagem(etapa: EtapaFluxo, nomeCompleto: string): string {
  const nome = nomeCompleto.split(" ")[0];
  switch (etapa) {
    case "boas_vindas":
      return `Olá, ${nome}! Foi uma alegria receber você na igreja 😊 Você é muito bem-vindo(a)! 🙏`;
    case "incentivo":
      return `Olá, ${nome}! Como você está? 😊 Esperamos te ver novamente em breve! 🙏`;
    case "cuidado":
      return `Olá, ${nome}! Estamos orando por você 🙏 Se precisar de algo, conte conosco 💙`;
    case "nao_voltou":
      return `Olá, ${nome}! Sentimos sua falta! Esperamos te ver novamente em breve 💙🙏`;
    case "retornou":
      return `Que alegria ter você novamente conosco, ${nome}! 😊`;
    default:
      return `Olá, ${nome}! Estamos pensando em você 💙`;
  }
}

// ------------------------------------------------------------
// Link WhatsApp clicável
// ------------------------------------------------------------
export function buildWhatsAppLink(
  telefone: string | null | undefined,
  mensagem: string
): string | null {
  if (!telefone) return null;
  const numeros = telefone.replace(/\D/g, "");
  if (!numeros) return null;
  // Adiciona DDI 55 (Brasil) se ainda não tiver
  const comDDI = numeros.startsWith("55") ? numeros : `55${numeros}`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(mensagem)}`;
}

// ------------------------------------------------------------
// Calcular etapa do fluxo a partir dos dados do membro
// ------------------------------------------------------------
export function calcularEtapa(
  numero_visitas: number,
  created_at: string
): EtapaFluxo {
  if (numero_visitas >= 2) return "retornou";
  const dias = diasDesde(created_at);
  if (dias <= 1) return "boas_vindas";
  if (dias <= 3) return "incentivo";
  if (dias <= 7) return "cuidado";
  if (dias > 15) return "nao_voltou";
  return "em_acompanhamento";
}

// ------------------------------------------------------------
// Calcular prioridade
// ------------------------------------------------------------
export function calcularPrioridade(
  numero_visitas: number,
  created_at: string
): Prioridade {
  if (numero_visitas >= 2) return "baixa";
  const dias = diasDesde(created_at);
  if (dias > 15) return "alta";
  if (dias > 7) return "media";
  return "baixa";
}

// ------------------------------------------------------------
// Verificar se precisa de ação (sem contato há +2 dias)
// ------------------------------------------------------------
export function precisaAcao(ultimo_contato_em: string | null | undefined): boolean {
  if (!ultimo_contato_em) return true;
  const dias = (Date.now() - new Date(ultimo_contato_em).getTime()) / 86_400_000;
  return dias > 2;
}

// ------------------------------------------------------------
// Status a registrar conforme etapa ao marcar contato
// ------------------------------------------------------------
export function getStatusPorEtapa(etapa: EtapaFluxo): string {
  switch (etapa) {
    case "boas_vindas":
      return "novo";
    case "incentivo":
      return "contato_inicial";
    case "cuidado":
      return "em_acompanhamento";
    case "nao_voltou":
      return "tentativa_reengajamento";
    case "retornou":
      return "integrado";
    default:
      return "em_acompanhamento";
  }
}

// ------------------------------------------------------------
// Labels e estilos visuais
// ------------------------------------------------------------
export const ETAPA_LABEL: Record<EtapaFluxo | string, string> = {
  boas_vindas:       "🎉 Boas-vindas",
  incentivo:         "💬 Incentivo",
  cuidado:           "💙 Cuidado",
  nao_voltou:        "🔴 Não voltou",
  retornou:          "✅ Retornou",
  em_acompanhamento: "📋 Acompanhamento",
};

export const PRIORIDADE_STYLE: Record<
  Prioridade,
  { border: string; badge: string; label: string }
> = {
  alta:  { border: "border-l-destructive", badge: "bg-destructive/10 text-destructive border-destructive/30",  label: "Alta" },
  media: { border: "border-l-warning",     badge: "bg-warning/15 text-warning border-warning/30",              label: "Média" },
  baixa: { border: "border-l-success",     badge: "bg-success/15 text-success border-success/30",              label: "Baixa" },
};

// ------------------------------------------------------------
// Helper interno
// ------------------------------------------------------------
function diasDesde(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}
