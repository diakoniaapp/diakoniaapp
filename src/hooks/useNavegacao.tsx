// ─── useNavegacao.tsx — o histórico interno e o nome real da tela ──────────────
//
// Duas coisas que a barra de contexto precisa e que o React Router não dá de graça:
//
//  1. SABER SE O "VOLTAR" DO NAVEGADOR LEVA A ALGUM LUGAR ÚTIL. `navigate(-1)` cego (o
//     cabeçalho do celular fazia isso) tira a pessoa do sistema quando a tela atual foi
//     a primeira da aba, ou quando a anterior era o login. Guardamos, por posição do
//     histórico (`history.state.idx`), o caminho de cada tela visitada nesta aba
//     (sessionStorage — sobrevive a recarregar a página). Pura em `lib/navegacao.ts`.
//
//  2. O NOME REAL DA TELA ABERTA. O registro só sabe "Conta"; a tela que carregou o
//     dado sabe "Bradesco" e o informa com `useRotuloDaTela`.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { anteriorValida, registrarNaTrilha, type Trilha } from "@/lib/navegacao";

const CHAVE = "diakonia:trilha";

function lerTrilha(): Trilha {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Trilha) : {};
  } catch { return {}; }
}
function gravarTrilha(t: Trilha) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(t)); } catch { /* aba privada: segue sem histórico */ }
}
const posicaoNoHistorico = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0);

interface Valor {
  /** Caminho da tela anterior DENTRO do app, ou `null` se não há para onde voltar. */
  anterior: string | null;
  /** Nome real da tela aberta, se ela informou. */
  rotulo: string | null;
  definirRotulo: (caminho: string, rotulo: string | null) => void;
  /** Volta pelo histórico se houver; senão vai para `destinoSemHistorico`. */
  voltar: (destinoSemHistorico: string) => void;
}

const Ctx = createContext<Valor | null>(null);

export function NavegacaoProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const tipo = useNavigationType();
  const navigate = useNavigate();
  const [anterior, setAnterior] = useState<string | null>(null);
  const [override, setOverride] = useState<{ caminho: string; rotulo: string } | null>(null);
  const ultimaChave = useRef<string | null>(null);

  useEffect(() => {
    if (ultimaChave.current === location.key) return; // StrictMode monta duas vezes
    ultimaChave.current = location.key;
    const idx = posicaoNoHistorico();
    const trilha = registrarNaTrilha(lerTrilha(), idx, location.pathname + location.search, tipo);
    gravarTrilha(trilha);
    setAnterior(anteriorValida(trilha, idx, location.pathname));
  }, [location.key, location.pathname, location.search, tipo]);

  const definirRotulo = useCallback((caminho: string, rotulo: string | null) => {
    setOverride(rotulo ? { caminho, rotulo } : null);
  }, []);

  const voltar = useCallback((destinoSemHistorico: string) => {
    if (anterior) navigate(-1);
    else navigate(destinoSemHistorico);
  }, [anterior, navigate]);

  // o nome só vale para a tela em que foi informado: ao navegar, some sozinho
  const rotulo = override && override.caminho === location.pathname ? override.rotulo : null;

  const valor = useMemo<Valor>(() => ({ anterior, rotulo, definirRotulo, voltar }), [anterior, rotulo, definirRotulo, voltar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useNavegacao(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNavegacao fora do NavegacaoProvider");
  return v;
}

/**
 * A tela diz como ela se chama de verdade ("Bradesco", "Classe Jovens") e a última
 * migalha da trilha passa a mostrar isso em vez do título genérico. Chamar com
 * `null`/vazio (dado ainda carregando) mantém o genérico. Fora do provider não faz nada.
 */
export function useRotuloDaTela(rotulo: string | null | undefined) {
  const v = useContext(Ctx);
  const location = useLocation();
  const definir = v?.definirRotulo;
  useEffect(() => {
    if (!definir) return;
    definir(location.pathname, rotulo?.trim() || null);
    return () => definir(location.pathname, null);
  }, [definir, location.pathname, rotulo]);
}
