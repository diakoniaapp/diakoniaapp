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
