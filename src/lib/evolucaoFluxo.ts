/**
 * evolucaoFluxo.ts
 * Critérios e utilitários para sugestão de evolução pastoral:
 * Visitante → Congregado → Membro
 *
 * IMPORTANTE: nada aqui altera dados automaticamente.
 * A função apenas SUGERE — a equipe decide e age.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SugestaoEvolucao = "congregado" | "membro" | null;

export interface AvaliacaoEvolucao {
    sugestao: SugestaoEvolucao;
    /** Mensagem pastoral humanizada para mostrar ao usuário */
  descricao: string | null;
    /** Label do próximo passo, ex: "Congregado" */
  proximo: string | null;
    /** Texto principal do banner de evolução */
  mensagemPrincipal: string | null;
    /** Sugestão de ação pastoral */
  sugestaoAcao: string | null;
}

// ── Constantes ────────────────────────────────────────────────────────────────

/** Rótulos de exibição para cada tipo de pessoa */
export const TIPO_LABEL: Record<string, string> = {
    visitante: "Visitante",
    congregado: "Congregado",
    membro: "Membro",
    ex_membro: "Ex-Membro",
};

/** Ordem na jornada pastoral (para barra de progresso) */
export const ETAPAS_JORNADA = [
  { key: "visitante", label: "Visitante" },
  { key: "congregado", label: "Congregado" },
  { key: "membro", label: "Membro" },
  ] as const;

// ── Critérios de evolução ─────────────────────────────────────────────────────

/**
 * Visitante → Congregado:
 * - 3 ou mais visitas registradas
 * - Último contato marcado como "Demonstrou interesse"
 *
 * Congregado → Membro:
 * - 60 ou mais dias desde o cadastro
 */
export function avaliarEvolucao(params: {
    tipo_pessoa: string;
    numero_visitas: number;
    ultimo_contato_tipo: string | null;
    created_at: string;
}): AvaliacaoEvolucao {
    const { tipo_pessoa, numero_visitas, ultimo_contato_tipo, created_at } = params;

  const diasDesde = Math.floor(
        (Date.now() - new Date(created_at).getTime()) / 86_400_000
      );

  // ─ Visitante → Congregado ─────────────────────────────────────────────────
  if (tipo_pessoa === "visitante") {
        const visitasSuficientes = numero_visitas >= 3;
        const demonstrouInteresse = ultimo_contato_tipo === "Demonstrou interesse";

      if (visitasSuficientes && demonstrouInteresse) {
              return {
                        sugestao: "congregado",
                        descricao: `${numero_visitas} visitas e demonstrou interesse`,
                        proximo: "Congregado",
                        mensagemPrincipal: "✨ Este visitante pode estar pronto para dar o próximo passo",
                        sugestaoAcao: "Que tal convidá-lo para uma célula ou agendar uma conversa pastoral?",
              };
      }
  }

  // ─ Congregado → Membro ────────────────────────────────────────────────────
  if (tipo_pessoa === "congregado") {
        if (diasDesde >= 60) {
                return {
                          sugestao: "membro",
                          descricao: `${diasDesde} dias na congregação`,
                          proximo: "Membro",
                          mensagemPrincipal: "✨ Este congregado pode estar pronto para dar o próximo passo",
                          sugestaoAcao: "Considere convidá-lo para uma conversa sobre membresia.",
                };
        }
  }

  return { sugestao: null, descricao: null, proximo: null, mensagemPrincipal: null, sugestaoAcao: null };
}
