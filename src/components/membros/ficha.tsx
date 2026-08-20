// ─── ficha.tsx — abrir a ficha de alguém de qualquer lugar ─────────────────
//
// ── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// O nome de uma pessoa aparece em 69 lugares do sistema — na escala, no
// organograma, na chamada da EBD, no painel pastoral, na lista de voluntários
// de uma área. Em quase todos era texto morto.
//
// E a ficha existe: `PessoaCard` mostra vínculos, ministérios, áreas e a linha
// do tempo da pessoa. Só que abri-la exigia que a tela declarasse um estado
// (`fichaDe`), renderizasse o diálogo e o fechasse — três coisas por tela. Por
// isso só três telas tinham: Pessoas, Organograma e Estrutura. Nas outras 27,
// ver um nome e querer saber quem é levava a voltar ao catálogo e buscar.
//
// ── COMO FUNCIONA ──────────────────────────────────────────────────────────
//
// O provider mora uma vez no AppLayout e guarda o diálogo. Qualquer componente
// abaixo dele chama `abrirFicha(id)` — ou, mais simples, usa `<NomePessoa>`, e
// nem precisa saber que existe um diálogo.
//
// ── SEM ID, SEM LINK ───────────────────────────────────────────────────────
//
// `NomePessoa` sem `id` renderiza texto puro. É deliberado: há listas onde o
// nome vem de um campo de texto, sem pessoa por trás — um convidado externo,
// um nome digitado à mão. Um link que abre uma ficha vazia é pior que texto,
// porque promete e não entrega.

import {
  createContext, useCallback, useContext, useState, type ReactNode,
} from "react";
import PessoaCard from "@/components/membros/PessoaCard";

interface FichaCtx {
  abrirFicha: (pessoaId: string) => void;
}

const Ctx = createContext<FichaCtx | null>(null);

export function FichaProvider({ children }: { children: ReactNode }) {
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const abrirFicha = useCallback((id: string) => setPessoaId(id), []);

  return (
    <Ctx.Provider value={{ abrirFicha }}>
      {children}
      <PessoaCard
        pessoaId={pessoaId}
        open={!!pessoaId}
        onClose={() => setPessoaId(null)}
      />
    </Ctx.Provider>
  );
}

/**
 * Fora do provider devolve `null` em vez de estourar.
 *
 * Assim `NomePessoa` pode ser usado numa tela que ainda não está dentro do
 * AppLayout — a de login, um preview isolado — e o nome simplesmente não vira
 * link, em vez de a tela inteira quebrar.
 */
export function useFicha(): FichaCtx | null {
  return useContext(Ctx);
}

interface NomePessoaProps {
  id?: string | null;
  nome?: string | null;
  className?: string;
  /** Texto mostrado quando não há nome. Padrão: um travessão. */
  vazio?: string;
}

/**
 * O nome de uma pessoa, clicável quando dá para abrir a ficha dela.
 *
 * `<button>` e não `<a>`: não há rota `/pessoa/:id` — a ficha é um diálogo
 * sobre a tela atual, e quem clica não perde onde estava. Um link de verdade
 * prometeria navegação e o botão do "voltar" do navegador não desfaria.
 *
 * `stopPropagation` porque o nome quase sempre mora dentro de uma linha que
 * também é clicável (abre a escala, o evento, a classe). Sem isso, clicar no
 * nome dispararia as duas coisas.
 */
export function NomePessoa({ id, nome, className = "", vazio = "—" }: NomePessoaProps) {
  const ficha = useFicha();
  const texto = nome?.trim() || vazio;

  if (!id || !ficha || !nome?.trim()) {
    return <span className={className}>{texto}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); ficha.abrirFicha(id); }}
      title={`Ver a ficha de ${texto}`}
      className={`text-left hover:underline underline-offset-2 decoration-dotted ${className}`}
    >
      {texto}
    </button>
  );
}
