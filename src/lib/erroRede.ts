// ─── erroRede.ts ─────────────────────────────────────────────────────────
//
// Achado ao vivo pela Telma (17/09/2026): tentou confirmar um pagamento na
// Agenda Financeira e o toast mostrou "TypeError: Failed to fetch" — a
// mensagem crua do navegador (o `fetch` do `supabase-js` sem conseguir
// completar, quase sempre internet caindo um instante ou o Supabase
// momentaneamente fora do ar), sem tradução nenhuma pro que aconteceu de
// verdade. `enderecoService.ts` já tinha esse mesmo cuidado só pra CEP
// ("Sem conexão para consultar o CEP"); aqui vira uma função pequena e
// reaproveitável em vez de escrever a checagem nesse handler específico.
export function mensagemErro(e: unknown, contexto = "Não foi possível completar a ação"): string {
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return `${contexto} — sem conexão com o servidor. Verifique a internet e tente de novo.`;
  }
  return (e as any)?.message ?? "Erro";
}
