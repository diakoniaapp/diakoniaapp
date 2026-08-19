// ─── tipoPessoa.ts ───────────────────────────────────────────────────────────
// Como o sistema pinta membro, congregado e visitante. Um lugar só.
//
// ── O QUE ISTO CONSERTA ──────────────────────────────────────────────────────
//
// "Congregado" tinha QUATRO cores diferentes, uma por arquivo:
//
//   Membros.tsx (o catálogo) ....... dourado
//   PessoaCard.tsx ................. verde
//   AcolhimentoPanel.tsx ........... roxo
//   types/visitante.ts ............. roxo
//
// E "Membro" tinha duas: cobre no catálogo, azul nos outros três.
//
// Isso não é detalhe de estilo. A pessoa abre o catálogo, decora que dourado
// quer dizer congregado, abre a ficha de alguém e vê verde. Ou ela conclui que
// verde significa outra coisa — e passa a desconfiar da cor em geral —, ou
// nem repara e só sente que o sistema é meio desalinhado. Nos dois casos a
// cor deixou de informar, que era o único trabalho dela.
//
// Foi assim que quatro arquivos divergiram: cada tela escolheu a sua quando
// precisou, e nunca houve um lugar onde a escolha morasse.
//
// ── POR QUE ESTES TONS ───────────────────────────────────────────────────────
//
// Venceu a versão do CATÁLOGO, por dois motivos. É a tela mais aberta do
// sistema, então é a associação que as pessoas já têm. E é a única das quatro
// que usa a paleta da casa — cobre, dourado, âmbar — em vez de pedir três
// cores emprestadas ao vocabulário de estado.
//
// Isso importa: verde no resto do sistema quer dizer "deu certo" e âmbar quer
// dizer "atenção". Pintar congregado de verde faz o tipo de vínculo de alguém
// parecer um resultado bom, e visitante parecer um problema pendente. Não é
// nem uma coisa nem outra: é só o vínculo que a pessoa tem com a igreja hoje.
//
// Visitante fica em âmbar por herança do catálogo, e ali tem um sentido que
// se sustenta: visitante é a única das três situações que pede uma ação de
// alguém.

export type TipoPessoa = "membro" | "congregado" | "visitante";

export const TIPO_PESSOA_LABEL: Record<TipoPessoa, string> = {
  membro: "Membro",
  congregado: "Congregado",
  visitante: "Visitante",
};

/** Etiqueta completa: tinta de fundo, letra e borda. */
export const TIPO_PESSOA_COR: Record<TipoPessoa, string> = {
  membro:     "bg-primary/10 text-primary border-primary/30",
  congregado: "bg-gold/15 text-gold-text border-gold/30",
  visitante:  "bg-warning/15 text-warning-text border-warning/30",
};

/** Só a tinta de fundo, para quem monta a etiqueta em duas partes. */
export const TIPO_PESSOA_FUNDO: Record<TipoPessoa, string> = {
  membro:     "bg-primary/10",
  congregado: "bg-gold/15",
  visitante:  "bg-warning/15",
};

/** Só a letra. */
export const TIPO_PESSOA_TEXTO: Record<TipoPessoa, string> = {
  membro:     "text-primary",
  congregado: "text-gold-text",
  visitante:  "text-warning-text",
};

export function corDoTipo(tipo: string | null | undefined): string {
  return TIPO_PESSOA_COR[tipo as TipoPessoa] ?? "bg-muted text-muted-foreground border-border";
}

export function rotuloDoTipo(tipo: string | null | undefined): string {
  return TIPO_PESSOA_LABEL[tipo as TipoPessoa] ?? (tipo ?? "—");
}
