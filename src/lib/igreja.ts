/**
 * Configuração da Igreja — preparação para multi-tenant futuro
 *
 * Por enquanto o sistema opera com UMA única igreja.
 * Quando o multi-tenant for implementado, este valor virá do
 * contexto de autenticação do usuário (user_metadata.igreja_id).
 *
 * Para migrar futuramente:
 *   import { useIgrejaId } from "@/hooks/useIgrejaId";
 *   const IGREJA_ID = useIgrejaId(); // virá do auth context
 */

/** UUID fixo da Quarta Igreja Batista do Rio de Janeiro */
export const IGREJA_ID = "00000000-0000-0000-0000-000000000001";

/** Nome oficial da igreja (exibição) */
export const IGREJA_NOME = "Quarta Igreja Batista do Rio de Janeiro";

/**
 * Retorna o IGREJA_ID atual.
 * Ponto único de substituição quando o multi-tenant for ativado.
 *
 * @example
 * const id = getIgrejaId();
 * supabase.from("membros").select("*").eq("igreja_id", id)
 */
export function getIgrejaId(): string {
  return IGREJA_ID;
}
