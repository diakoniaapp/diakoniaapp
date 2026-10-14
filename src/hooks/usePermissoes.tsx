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

// ── Uma consulta só, para todos os componentes ───────────────────────────
//
// Este hook é chamado por onze componentes, vários deles ao mesmo tempo (a
// barra de baixo, a paleta de comandos, a Home, o painel aberto). Cada um fazia
// a SUA consulta, e `minhas_permissoes` chegou a 203 mil chamadas em produção
// (pg_stat_statements, 14/10/2026) para um banco de 6 usuários. A promessa do
// comentário antigo — "ficam em memória durante a sessão" — nunca foi cumprida.
//
// Agora o resultado vive no módulo, por (usuário, papel simulado): quem chega
// enquanto a consulta está no ar espera a mesma promessa, e quem chega depois
// recebe o MESMO conjunto (mesma referência, então nenhum efeito que dependa
// dele roda de novo). Vale `VALIDADE_MS`; `recarregar()` ignora o cache e avisa
// todos os componentes.
const VALIDADE_MS = 5 * 60_000;

interface Entrada { chave: string; em: number; promessa: Promise<Set<string>>; valor: Set<string> | null }
let entrada: Entrada | null = null;
const ouvintes = new Set<() => void>();

async function buscar(papelSimulado: string | null): Promise<Set<string>> {
  // ── Simulando: as concessões do papel escolhido ────────────────────────
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
    return new Set<string>(
      (data ?? [])
        .map((r: any) => r.permissoes?.codigo as string | undefined)
        .filter(Boolean) as string[],
    );
  }
  const { data, error } = await supabase.rpc("minhas_permissoes");
  if (error) throw error;
  return new Set<string>((data ?? []).map((r: any) => r.codigo as string));
}

/** Devolve a entrada vigente para (usuário, papel), criando-a se não houver, tiver vencido ou `forcar`. */
function entradaPara(uid: string, papelSimulado: string | null, forcar: boolean): Entrada {
  const chave = `${uid}|${papelSimulado ?? ""}`;
  if (!forcar && entrada && entrada.chave === chave && Date.now() - entrada.em < VALIDADE_MS) return entrada;
  const nova: Entrada = { chave, em: Date.now(), valor: null, promessa: Promise.resolve(new Set<string>()) };
  nova.promessa = buscar(papelSimulado).then(
    v => { nova.valor = v; return v; },
    e => {
      // Falha não fica guardada: a próxima chamada tenta de novo. Quem falhou
      // fica sem permissão alguma (a RLS do banco continua sendo a barreira).
      console.warn("[usePermissoes]", e);
      if (entrada === nova) entrada = null;
      return new Set<string>();
    },
  );
  entrada = nova;
  return nova;
}

const VAZIO = new Set<string>();

/**
 * Hook que carrega as permissões do usuário atual e disponibiliza
 * helpers `podeFazer(codigo)` para checagem granular.
 *
 * Cache compartilhado (ver acima): uma consulta por usuário e papel simulado,
 * válida por 5 minutos. Atualiza ao trocar usuário ou papel simulado.
 */
export function usePermissoes(): PermissoesContext {
  const { user } = useAuth();
  const { papel: papelSimulado } = useVerComo();
  // Só o id importa: o objeto `user` é trocado a cada renovação de token.
  const uid = user?.id ?? null;
  const [permissoes, setPermissoes] = useState<Set<string>>(() => {
    const chave = uid ? `${uid}|${papelSimulado ?? ""}` : null;
    return chave && entrada?.chave === chave && entrada.valor ? entrada.valor : VAZIO;
  });
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async (forcar = false) => {
    if (!uid) {
      setPermissoes(VAZIO);
      setLoading(false);
      return;
    }
    const e = entradaPara(uid, papelSimulado ?? null, forcar);
    if (!e.valor) setLoading(true);
    const valor = await e.promessa;
    setPermissoes(valor);
    setLoading(false);
  }, [uid, papelSimulado]);

  useEffect(() => { void carregar(); }, [carregar]);

  // `recarregar()` de um componente atualiza todos
  useEffect(() => {
    const avisar = () => { void carregar(); };
    ouvintes.add(avisar);
    return () => { ouvintes.delete(avisar); };
  }, [carregar]);

  const recarregar = useCallback(async () => {
    await carregar(true);
    ouvintes.forEach(f => f());
  }, [carregar]);

  const podeFazer = useCallback((codigo: string) => permissoes.has(codigo), [permissoes]);
  const podeFazerAlguma = useCallback((codigos: string[]) => codigos.some(c => permissoes.has(c)), [permissoes]);
  const podeFazerTodas = useCallback((codigos: string[]) => codigos.every(c => permissoes.has(c)), [permissoes]);

  return { permissoes, loading, podeFazer, podeFazerAlguma, podeFazerTodas, recarregar };
}
