// ─── Ver como — a administradora enxergando pelos olhos de outro perfil ───
//
// ── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// Quem administra este sistema vê tudo, e por isso é a última pessoa capaz de
// saber o que os outros veem. A tela de permissões mostra uma matriz de 43
// concessões por papel — mas matriz não é tela: ela não diz que a liderança
// abre a Home e encontra três cartões onde a administradora encontra sete,
// nem que o voluntário, com duas permissões, chega a uma página quase vazia.
//
// E o repositório já tem cicatriz disso. Está escrito no CLAUDE.md: ao
// comparar `pastor` com `diakonia` pelo TEXTO das políticas, a conclusão foi
// que `pastor` tinha três acessos exclusivos. A medição desmentiu — políticas
// permissivas se somam com OR, e ninguém percebe isso lendo. "Comparar papéis
// exige medir, não ler." Esta é a forma mais direta de medir: olhar.
//
// ── O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────────
//
// É uma prévia da INTERFACE. Troca o que o aplicativo OFERECE — menus, rotas,
// cartões, widgets — pelo que o papel escolhido ofereceria.
//
// NÃO é troca de identidade. O banco continua respondendo à conta de verdade:
// a RLS avalia `auth.uid()`, que não muda, e nenhuma consulta feita durante a
// simulação passa a ser barrada por ela. Uma escrita feita aqui é feita pela
// administradora, com os poderes dela.
//
// Essa distinção não é detalhe técnico — é o que decide se a ferramenta ajuda
// ou engana. Por isso ela está dita em voz alta na faixa que fica na tela
// enquanto a simulação dura, e não escondida num rodapé de ajuda.
//
// ── POR QUE `sessionStorage` ───────────────────────────────────────────────
//
// Para a simulação sobreviver a um F5 — testar um perfil exige navegar, e
// perder o modo a cada recarga tornaria a ferramenta inútil — e morrer junto
// com a aba. A faixa fixa no alto impede que alguém esqueça que está nela.
//
// É a mesma escolha que o portão de LGPD já faz, com a diferença de que aqui
// ela é deliberada e não um efeito colateral (ver §5.8 do CLAUDE.md).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppRole } from "@/hooks/useAuth";

/**
 * Os papéis que se pode simular.
 *
 * Não vem do enum `app_role` inteiro. Ele tem dez valores, e quatro deles —
 * `operador`, `visualizador`, `lider`, `membro` — não têm concessão nenhuma em
 * `role_permissoes` nem usuário nenhum. Simular um deles mostraria uma tela
 * vazia que não descreve pessoa alguma da igreja.
 *
 * Contado em 01/09/2026: admin 43 concessões, diakonia 19, secretaria 18,
 * pastor 15, lideranca 5, voluntario 2.
 */
export const PAPEIS_SIMULAVEIS: AppRole[] = [
  "diakonia", "pastor", "secretaria", "lideranca", "voluntario", "membro",
];

const CHAVE = "ver_como_papel";

interface VerComoValor {
  /** O papel simulado, ou `null` quando se vê como si mesmo. */
  papel: AppRole | null;
  simulando: boolean;
  entrar: (p: AppRole) => void;
  sair: () => void;
}

const Ctx = createContext<VerComoValor>({
  papel: null, simulando: false, entrar: () => {}, sair: () => {},
});

export function VerComoProvider({ children }: { children: ReactNode }) {
  const [papel, setPapel] = useState<AppRole | null>(() => {
    try {
      const g = sessionStorage.getItem(CHAVE);
      return g && PAPEIS_SIMULAVEIS.includes(g as AppRole) ? (g as AppRole) : null;
    } catch {
      // Navegador com armazenamento bloqueado: sem simulação, e sem quebrar.
      return null;
    }
  });

  useEffect(() => {
    try {
      if (papel) sessionStorage.setItem(CHAVE, papel);
      else sessionStorage.removeItem(CHAVE);
    } catch { /* idem */ }
  }, [papel]);

  const entrar = useCallback((p: AppRole) => setPapel(p), []);
  const sair = useCallback(() => setPapel(null), []);

  return (
    <Ctx.Provider value={{ papel, simulando: papel !== null, entrar, sair }}>
      {children}
    </Ctx.Provider>
  );
}

export function useVerComo(): VerComoValor {
  return useContext(Ctx);
}

/** "Pastor titular", "Liderança"… — o rótulo que a igreja usa. */
export const ROTULO_PAPEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor titular", pastor: "Pastor",
  lideranca: "Liderança", voluntario: "Voluntário",
  membro: "Membro",
};

/** Uma frase curta dizendo o que aquele perfil é na igreja. */
export const DESCRICAO_PAPEL: Record<string, string> = {
  diakonia: "Vê pessoas, famílias, visitas e todo o cuidado pastoral",
  pastor: "Cuidado pastoral, com alcance menor que o do pastor titular",
  secretaria: "Cadastro, membresia, agenda e o registro da igreja",
  lideranca: "A própria área: voluntários, escalas e eventos do ministério",
  voluntario: "Quase nada além da própria ficha e da agenda",
  membro: "A própria ficha, a própria EBD, a própria escala e o próprio PGM",
};
