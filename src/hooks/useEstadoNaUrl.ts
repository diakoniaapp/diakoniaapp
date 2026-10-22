// ─── useEstadoNaUrl — "onde eu estava" numa lista (busca, filtros, mês, página) mora na URL ────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): abrir um item e VOLTAR devolve a lista como estava. A tela é remontada ao voltar (`<main key={pathname}>`), então `useState` puro nasce de novo; a URL é o que o
// histórico do navegador guarda. Mesmo padrão que o Extrato da conta já usava à mão: o estado vive em `useState` (a digitação não espera o roteador), NASCE da URL e é espelhado nela com
// `replace` (não empilha uma entrada por tecla). Só valores diferentes do padrão vão para a URL — a URL limpa continua abrindo a lista padrão e os favoritos antigos seguem valendo.
//
// `reiniciar`: o que volta ao padrão quando QUALQUER OUTRO campo muda (a página volta à 1 quando a busca ou o filtro mudam: continuar na página 7 de uma busca que agora tem 3 resultados
// deixaria a tela vazia). Mudar só o próprio campo (virar a página) não reinicia.
// Preferências de VISUALIZAÇÃO (colunas, modo lista/cartão) não vão aqui: são do usuário, não do lugar onde ele estava — localStorage.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

export type EstadoDaUrl = Record<string, string>;

function lerDaUrl<T extends EstadoDaUrl>(padrao: T, params: URLSearchParams): T {
  const e = { ...padrao };
  for (const k of Object.keys(padrao)) { const v = params.get(k); if (v !== null) (e as EstadoDaUrl)[k] = v; }
  return e;
}

/** Os parâmetros com o estado aplicado: valor igual ao padrão sai da URL. Devolve o MESMO texto se nada mudou. Pura (testada). */
export function aplicarEstadoNaUrl<T extends EstadoDaUrl>(params: URLSearchParams, estado: T, padrao: T): URLSearchParams {
  const novo = new URLSearchParams(params);
  for (const k of Object.keys(padrao)) {
    if (estado[k] === padrao[k] || estado[k] === "") novo.delete(k); else novo.set(k, estado[k]);
  }
  return novo;
}

/** Número inteiro ≥ `minimo` guardado como texto (página, ano, mês); qualquer outra coisa vira `padrao`. */
export function numeroDe(texto: string | undefined, padrao: number, minimo = 1): number {
  const n = Number.parseInt(texto ?? "", 10);
  return Number.isFinite(n) && n >= minimo ? n : padrao;
}

export function useEstadoNaUrl<T extends EstadoDaUrl>(padrao: T, reiniciar?: Partial<T>): readonly [T, (parcial: Partial<T>) => void] {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const padraoRef = useRef(padrao);
  const reiniciarRef = useRef(reiniciar);
  reiniciarRef.current = reiniciar;
  const [estado, setEstado] = useState<T>(() => lerDaUrl(padrao, searchParams));

  const mudar = useCallback((parcial: Partial<T>) => {
    setEstado(atual => {
      const novo = { ...atual, ...parcial } as T;
      const volta = reiniciarRef.current;
      if (volta) {
        const camposQueVoltam = Object.keys(volta);
        const mudouOutroCampo = Object.keys(parcial).some(k => !camposQueVoltam.includes(k) && parcial[k] !== atual[k]);
        const escolheuCampoQueVolta = camposQueVoltam.some(k => k in parcial);
        if (mudouOutroCampo && !escolheuCampoQueVolta) Object.assign(novo, volta);
      }
      return novo;
    });
  }, []);

  useEffect(() => {
    const proximo = aplicarEstadoNaUrl(searchParams, estado, padraoRef.current);
    if (proximo.toString() === searchParams.toString()) return;
    // `navigate` (e não `setSearchParams`) para repassar o `#hash` — a aba do Painel da Tesouraria mora nele e `setSearchParams` o apagaria — e o `state` de navegação (ex.: o desvio da LGPD),
    // que um `replace` reescrevendo a entrada do histórico também perderia.
    const texto = proximo.toString();
    navigate({ pathname: location.pathname, search: texto ? `?${texto}` : "", hash: location.hash }, { replace: true, state: location.state });
    // só quando o estado da tela muda; os parâmetros que OUTRO código escreve não devem disparar escrita
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return [estado, mudar] as const;
}
