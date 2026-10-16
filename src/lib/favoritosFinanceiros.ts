// ─── favoritosFinanceiros — quais telas do Financeiro podem ser fixadas nos Favoritos da Tesouraria ────────────────────────────────────────────────
// Antes (23/09/2026) o diálogo "Fixar atalho" tinha uma lista FIXA de relatórios; toda tela nova do Financeiro (Prestação de Contas, Extrato de Obrigações…) ficava de fora até alguém
// lembrar de acrescentá-la à mão. Agora a elegibilidade vem do REGISTRO ÚNICO das telas (`lib/navegacao.ts`, que um teste obriga a cobrir todas as rotas do App.tsx): toda tela do módulo
// Financeiro é fixável por padrão. Exceção só com motivo técnico, escrito na própria entrada do registro (`naoFixavel: "motivo"`).
import { SECOES_FINANCEIRO, TELAS, casarTela, type Tela } from "@/lib/navegacao";
import type { FinFavoritoTipo } from "@/services/favoritosService";

export interface DestinoFixavel {
  /** caminho exato que o favorito abre */
  rota: string;
  rotulo: string;
  /** aba do Painel da Tesouraria a que a tela pertence, quando tem */
  secao: string | null;
  tipo: FinFavoritoTipo;
}

const temParametro = (padrao: string) => padrao.split("/").some(s => s.startsWith(":"));

/** O tipo gravado em `fin_favoritos.tipo` (a tabela só aceita os da lista): contas, favorecidos, centros e projetos mantêm o seu; o resto é "relatorio" (tela sem parâmetro) ou "outro". */
export function tipoDoFavorito(padrao: string): FinFavoritoTipo {
  if (padrao.startsWith("/financas/conta/")) return "conta";
  if (padrao.startsWith("/financas/favorecido/")) return "fornecedor";
  if (/^\/financas\/centro\/:centroId$/.test(padrao)) return "centro_custo";
  if (padrao.startsWith("/financas/projeto/")) return "projeto";
  return temParametro(padrao) ? "outro" : "relatorio";
}

/** Uma tela é fixável quando é do Financeiro, não é o próprio painel (a Mesa) e ninguém registrou um motivo técnico em contrário. */
export function ehFixavel(t: Tela): boolean {
  return t.modulo === "financeiro" && t.padrao !== "/painel-tesouraria" && !t.naoFixavel;
}

/** As telas SEM parâmetro (as que se escolhem numa lista): relatórios, painéis e cadastros do Financeiro, na ordem das abas do workspace. */
export function telasFixaveis(): DestinoFixavel[] {
  const ordemDaSecao = (s?: Tela["secao"]) => (s ? Object.keys(SECOES_FINANCEIRO).indexOf(s) : 99);
  return TELAS.filter(t => ehFixavel(t) && !temParametro(t.padrao))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => ordemDaSecao(a.t.secao) - ordemDaSecao(b.t.secao) || a.i - b.i)
    .map(({ t }) => ({ rota: t.padrao, rotulo: t.titulo, secao: t.secao ? SECOES_FINANCEIRO[t.secao] : null, tipo: tipoDoFavorito(t.padrao) }));
}

/** A tela aberta agora, se puder ser favoritada (botão ★ da barra de contexto). `rotuloReal` é o nome do que está aberto ("Bradesco · Extrato completo"). */
export function destinoDaRota(pathname: string, rotuloReal?: string | null): DestinoFixavel | null {
  const c = casarTela(pathname);
  if (!c || !ehFixavel(c.tela)) return null;
  const caminho = pathname.split(/[?#]/)[0];
  return {
    rota: caminho,
    rotulo: (temParametro(c.tela.padrao) && rotuloReal) || c.tela.titulo,
    secao: c.tela.secao ? SECOES_FINANCEIRO[c.tela.secao] : null,
    tipo: tipoDoFavorito(c.tela.padrao),
  };
}
