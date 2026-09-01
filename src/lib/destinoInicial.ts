// ─── Onde cada pessoa começa ──────────────────────────────────────────────
//
// ── O DEFEITO QUE ISTO CONSERTA ────────────────────────────────────────────
//
// `rotaInicialPorPapel` decide o destino do login olhando só o PAPEL:
// secretaria vai para o painel dela, pastor para o Pastoral, e **todo o resto
// cai em `/`**. "Todo o resto" inclui a liderança — que é quem tem bancada mas
// não tem papel próprio de bancada.
//
// A consequência, dita pela própria igreja: "hoje o que temos é o meu painel,
// administrador do sistema que vê tudo". Quem lidera o Ministério de
// Administração entrava numa tela pessoal e tinha de procurar o próprio
// ministério, enquanto a secretária já caía na bancada dela.
//
// ── POR QUE UM ARQUIVO NOVO, E NÃO MAIS UMA LINHA LÁ ───────────────────────
//
// `rotaInicialPorPapel` é SÍNCRONA e recebe só `roles` — é config pura, vive
// em `navConfig.ts` junto do menu, e tem nove testes. Saber qual ministério
// alguém lidera exige ir ao banco.
//
// Então este arquivo COMPÕE em vez de substituir: pergunta primeiro à função
// antiga e só entra em cena quando ela responde `/`. Quem tinha bancada por
// papel continua com o destino que tinha, e os nove testes seguem valendo.
//
// ── A ORDEM, E POR QUÊ ─────────────────────────────────────────────────────
//
//   1. secretaria            a bancada dela
//   2. pastor titular        o Painel Pastoral
//   3. lidera UM ministério  a bancada dele
//   4. qualquer outro caso   a Home
//
// A liderança vem depois do papel de propósito: quem é secretária E lidera uma
// área está fazendo trabalho de secretaria — é o mesmo raciocínio que já põe
// `secretaria` antes de `admin` na função antiga.
//
// ── POR QUE "EXATAMENTE UM" ────────────────────────────────────────────────
//
// Quem lidera dois ministérios não tem um destino óbvio, e escolher por ela
// seria inventar uma prioridade que a igreja não declarou. Cai na Home, onde
// "Seus painéis" mostra os dois lado a lado com o papel de cada um.
//
// Não é caso raro: medido em 01/09/2026, a única conta que lidera algo lidera
// três áreas em DOIS ministérios distintos.

import type { AppRole } from "@/hooks/useAuth";
import { rotaInicialPorPapel } from "@/components/layout/navConfig";
import { meusMinisterios } from "@/services/painelMinisterioService";

/**
 * O destino do login para ESTA pessoa.
 *
 * Nunca lança: uma falha ao descobrir a liderança devolve o destino por papel,
 * que é o comportamento de antes. Prender alguém no login por causa de uma
 * consulta acessória seria pior que a tela genérica.
 */
export async function destinoInicial(
  roles: AppRole[],
  pessoaId: string | null,
): Promise<string> {
  const porPapel = rotaInicialPorPapel(roles);
  if (porPapel !== "/") return porPapel;
  if (!pessoaId) return "/";

  try {
    const meus = await meusMinisterios(pessoaId);
    return meus.length === 1 ? `/ministerios/${meus[0].id}/painel` : "/";
  } catch {
    return "/";
  }
}
