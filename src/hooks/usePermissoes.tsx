import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVerComo } from "@/hooks/useVerComo";

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
  const { papel: papelSimulado } = useVerComo();
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
      // ── Simulando: as concessões do papel escolhido ────────────────────
      //
      // `minhas_permissoes()` responde sempre pela conta de quem chama, e por
      // isso não serve aqui — a administradora receberia as 43 dela qualquer
      // que fosse o papel simulado, e o "Ver como" não mudaria nada na tela.
      //
      // A leitura direta de `role_permissoes` vem da MESMA fonte que a RPC
      // consulta, e é aberta a qualquer autenticado (política
      // `role_perm_read`). O que aparece aqui é o que aquele papel teria.
      if (papelSimulado) {
        const { data, error } = await supabase
          .from("role_permissoes")
          .select("permissoes(codigo)")
          .eq("role", papelSimulado as never);
        if (error) throw error;
        const codigos = new Set<string>(
          (data ?? [])
            .map((r: any) => r.permissoes?.codigo as string | undefined)
            .filter(Boolean) as string[],
        );
        setPermissoes(codigos);
        return;
      }

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
  }, [user, papelSimulado]);

  useEffect(() => { carregar(); }, [carregar]);

  const podeFazer = useCallback((codigo: string) => permissoes.has(codigo), [permissoes]);
  const podeFazerAlguma = useCallback((codigos: string[]) => codigos.some(c => permissoes.has(c)), [permissoes]);
  const podeFazerTodas = useCallback((codigos: string[]) => codigos.every(c => permissoes.has(c)), [permissoes]);

  return { permissoes, loading, podeFazer, podeFazerAlguma, podeFazerTodas, recarregar: carregar };
}
