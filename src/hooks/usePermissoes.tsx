import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PermissoesContext {
  permissoes: Set<string>;
  loading: boolean;
  podeFazer: (codigo: string) => boolean;
  podeFazerAlguma: (codigos: string[]) => boolean;
  podeFazerTodas: (codigos: string[]) => boolean;
  recarregar: () => Promise<void>;
}

/**
 * Hook que carrega as permissões do usuário atual e disponibiliza
 * helpers `podeFazer(codigo)` para checagem granular.
 *
 * Cache: as permissões ficam em memória durante a sessão.
 * Atualiza ao trocar usuário.
 */
export function usePermissoes(): PermissoesContext {
  const { user } = useAuth();
  const [permissoes, setPermissoes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) {
      setPermissoes(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("minhas_permissoes");
      if (error) throw error;
      const codigos = new Set<string>((data ?? []).map((r: any) => r.codigo as string));
      setPermissoes(codigos);
    } catch (e) {
      console.warn("[usePermissoes]", e);
      setPermissoes(new Set());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { carregar(); }, [carregar]);

  const podeFazer = useCallback((codigo: string) => permissoes.has(codigo), [permissoes]);
  const podeFazerAlguma = useCallback((codigos: string[]) => codigos.some(c => permissoes.has(c)), [permissoes]);
  const podeFazerTodas = useCallback((codigos: string[]) => codigos.every(c => permissoes.has(c)), [permissoes]);

  return { permissoes, loading, podeFazer, podeFazerAlguma, podeFazerTodas, recarregar: carregar };
}
