// ============================================================
// visitantesFluxo.ts
// Utilitários para o fluxo de cuidado de visitantes
// ============================================================

import type { Database } from "@/integrations/supabase/types";

/** Espelha o enum status_acolhimento_enum do banco. */
export type StatusAcolhimento = Database["public"]["Enums"]["status_acolhimento_enum"];

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
// Versículos de promessa por etapa
// ------------------------------------------------------------
const VERSICULO: Record<EtapaFluxo, string> = {
  boas_vindas:
    '"Seja forte e corajoso… O Senhor, o seu Deus, estará com você por onde quer que você andar." — Josué 1:9',
  incentivo:
    '"Venham a mim, todos os que estão cansados e sobrecarregados, e eu darei descanso a vocês." — Mateus 11:28',
  cuidado:
    '"O Senhor está perto dos que têm o coração quebrantado e salva os de espírito abatido." — Salmos 34:18',
  nao_voltou:
    '"O Senhor é bom, um refúgio nos tempos de angústia; ele cuida dos que buscam a sua proteção." — Naum 1:7',
  retornou:
    '"Como é bom e agradável quando os irmãos vivem em união!" — Salmos 133:1',
  em_acompanhamento:
    '"Porque eu, o Senhor, sou o seu Deus, que o sustento pela mão direita." — Isaías 41:13',
};

// ------------------------------------------------------------
// Mensagens contextualizadas por etapa (com versículo)
// ------------------------------------------------------------
export function getMensagem(etapa: EtapaFluxo, nomeCompleto: string): string {
  const nome      = nomeCompleto.split(" ")[0];
  const versiculo = VERSICULO[etapa] ?? VERSICULO.em_acompanhamento;

  const corpo: Record<EtapaFluxo, string> = {
    boas_vindas:
      `Foi uma alegria receber você conosco! Você é muito bem-vindo(a) e esperamos te ver por aqui mais vezes.`,
    incentivo:
      `Estamos com saudades! Gostaríamos muito de te ver novamente. As portas estão sempre abertas para você.`,
    cuidado:
      `Estamos orando por você e pensando em como você está. Se precisar de algo, pode contar conosco.`,
    nao_voltou:
      `Sentimos a sua falta! Você tem um lugar especial aqui e gostaríamos muito de te abraçar novamente.`,
    retornou:
      `Que alegria imensa ter você novamente conosco! A sua presença nos alegra muito.`,
    em_acompanhamento:
      `Continuamos aqui, pensando em você e na sua jornada. Que bom caminhar juntos!`,
  };

  const texto = corpo[etapa] ?? corpo.em_acompanhamento;

  return (
    `Olá, ${nome}! 😊\n` +
    `${texto}\n\n` +
    `✨ ${versiculo}\n\n` +
    `Estamos à disposição 💙`
  );
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
  if (dias > 7)  return "media";
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
// O retorno alimenta membros.status_acolhimento, cuja coluna é o enum
// status_acolhimento_enum. Três valores usados aqui não existiam nesse enum
// — "contato_inicial", "tentativa_reengajamento" e "integrado" — então o
// update era rejeitado pelo banco e "marcar contato" falhava nas etapas
// incentivo, nao_voltou e retornou.
//
// Cada um foi trocado pelo valor válido mais próximo em significado. A
// escolha de "contatar" para nao_voltou (em vez de "contatado") assume que a
// etapa indica pendência de reengajamento — vale confirmar com a secretaria.
export function getStatusPorEtapa(etapa: EtapaFluxo): StatusAcolhimento {
  switch (etapa) {
    case "boas_vindas":        return "novo";
    case "incentivo":          return "contatado";
    case "cuidado":            return "em_acompanhamento";
    case "nao_voltou":         return "contatar";
    case "retornou":           return "retornou";
    default:                   return "em_acompanhamento";
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
  alta:  { border: "border-l-destructive", badge: "bg-destructive/10 text-destructive border-destructive/30",  label: "Alta"  },
  media: { border: "border-l-warning",     badge: "bg-warning/15 text-warning border-warning/30",              label: "Média" },
  baixa: { border: "border-l-success",     badge: "bg-success/15 text-success border-success/30",              label: "Baixa" },
};

// ------------------------------------------------------------
// Helper interno
// ------------------------------------------------------------
function diasDesde(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}
