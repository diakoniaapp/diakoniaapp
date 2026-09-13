// ─── dinheiro.ts — texto digitado por brasileiro → número ────────────────
//
// Achado em 13/09/2026: `<input type="number">` rejeita vírgula (só
// aceita ponto), e qualquer brasileiro digita "928,00" naturalmente — o
// campo "Saldo inicial" de `ContaForm.tsx` mostrou esse bug ao vivo pra
// Telma. Extraído pra cá (antes vivia só em `ContaForm.tsx`) porque o
// mesmo padrão `type="number"` se repete em outros campos de dinheiro do
// sistema (Valor em `LancamentoForm.tsx`, os campos de `ContratadoForm.tsx`)
// — um parser só, usado por todos, em vez de cada tela reinventar o
// próprio (e herdar só parte da correção, como aconteceu antes desta
// extração).
//
// Uso: campo vira `<Input type="text" inputMode="decimal">` guardando o
// TEXTO digitado num state próprio; `paraNumero()` só entra na hora de
// montar o payload pro banco, nunca a cada tecla — parsear a cada tecla
// é o que fazia o cursor pular e o campo "brigar" com quem digita.
export function paraNumero(texto: string): number {
  const limpo = texto.trim();
  if (!limpo) return 0;
  // Vírgula presente = decimal brasileiro; qualquer ponto antes dela é
  // separador de milhar ("1.234,56" → 1234.56).
  if (limpo.includes(",")) return Number(limpo.replace(/\./g, "").replace(",", ".")) || 0;
  // Sem vírgula: um ponto seguido de grupos de exatamente 3 dígitos é
  // milhar, não decimal ("3.500" → 3500, do jeito que se escreve
  // R$3.500,00 sem os centavos) — só um ponto com 1-2 dígitos depois
  // continua valendo como decimal ("928.5" → 928.5).
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, "")) || 0;
  return Number(limpo) || 0;
}
