// ─── idade.ts — anos completos a partir de uma data de nascimento ──────────
//
// ── POR QUE SAIU DE DENTRO DO SERVIÇO ──────────────────────────────────────
//
// Esta conta vivia dentro de `painelPastoralService`, privada, servindo só à
// regra dos 9 anos dos candidatos ao batismo. Ao nascer o bloco de membresia,
// que reparte o rol em faixas etárias, ela ia ser escrita uma segunda vez.
//
// Duas cópias da mesma conta é o começo de duas telas discordando sobre a
// idade da mesma pessoa — e aqui a discordância seria visível: alguém de 9
// anos recém-feitos apareceria como candidato numa seção e na faixa "0-17"
// da outra, o que está certo, mas a versão errada por um dia colocaria a
// mesma pessoa fora das duas.
//
// ── A ARMADILHA DO FUSO ────────────────────────────────────────────────────
//
// `new Date("2016-08-26")` é meia-noite **UTC**, e no horário de Brasília
// isso é 21h do dia 25 — a data volta um dia. Por isso o `+ "T00:00"`, que
// força a interpretação local. O mesmo cuidado que `isoLocal` toma no
// Painel Pastoral.

/**
 * Anos completos hoje. Nulo quando não há data — que é diferente de zero.
 *
 * Nulo significa "não sabemos", e quem chama precisa tratar isso à parte:
 * no painel, quem não tem data de nascimento não é "não elegível", é
 * indecidível, e aparece contado separadamente.
 */
export function idadeEm(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento + "T00:00");
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos;
}

// ─── O aniversário quando não se sabe o ano ────────────────────────────────
//
// Medido em 27/08/2026: 53 das 294 pessoas ativas não tinham data de
// nascimento nenhuma, porque o sistema anterior guardava só o dia e o mês de
// muita gente e aqui o campo era tudo-ou-nada.
//
// A coluna `nascimento_dia_mes` recebe essa metade. Ela é uma `date` com o
// ano fixado em 2000 por CHECK — ver a migration 20260828210000, que explica
// por que 2000 e não outro (é bissexto, então 29/02 cabe).
//
// **O ano de 2000 não é dado.** Estas funções existem para que ninguém
// precise lembrar disso: `diaEMesDeNascimento` é o único caminho para ler o
// aniversário, e `idadeEm` continua exigindo a data completa. Quem tem só
// dia e mês tem idade NULA, que é a verdade.

/** O par dia/mês do aniversário, venha ele da data completa ou da parcial. */
export function diaEMesDeNascimento(
  pessoa: { data_nascimento?: string | null; nascimento_dia_mes?: string | null },
): { dia: number; mes: number } | null {
  const iso = pessoa.data_nascimento || pessoa.nascimento_dia_mes;
  if (!iso) return null;
  // Fatiar o ISO em vez de construir uma Date: `new Date("2000-08-29")` é
  // meia-noite UTC, que no horário de Brasília volta um dia — a mesma
  // armadilha que o `+ "T00:00"` de `idadeEm` evita.
  const [, mm, dd] = iso.split("-").map(Number);
  if (!mm || !dd) return null;
  return { dia: dd, mes: mm };
}

/** "14/03" — para escrever o aniversário sem afirmar um ano que não se sabe. */
export function aniversarioCurto(
  pessoa: { data_nascimento?: string | null; nascimento_dia_mes?: string | null },
): string | null {
  const p = diaEMesDeNascimento(pessoa);
  if (!p) return null;
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;
}

/**
 * O que se sabe sobre o nascimento desta pessoa. Três estados, não dois —
 * e é essa terceira caixa que a secretaria precisa ver separada.
 */
export function estadoDoNascimento(
  pessoa: { data_nascimento?: string | null; nascimento_dia_mes?: string | null },
): "completo" | "so_dia_e_mes" | "nada" {
  if (pessoa.data_nascimento) return "completo";
  if (pessoa.nascimento_dia_mes) return "so_dia_e_mes";
  return "nada";
}
