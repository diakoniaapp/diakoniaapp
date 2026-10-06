// ─── centroSubcentro.ts — "Pai · Filho" em dois pedaços ─────────────────────────
//
// Centro de custo e subcentro são o MESMO campo (`centro_custo_id`) — não existe uma segunda
// coluna "subcentro" no banco (medido no Indicador por Centro de Custo, 01/10/2026: um subcentro
// é só um `fin_centros_custo` com `centro_pai_id` preenchido, e o `nome` dele já vem gravado como
// "Pai · Filho", ex. "Administração · Pessoal"). Para exibir como dois campos separados (pedido
// dela), só precisa partir essa string — nenhum dado novo. Extraído de `FinancasConta.tsx` em
// 06/10/2026 para o painel em tela cheia usar a mesma regra.
export function centroESubcentro(nome: string | null | undefined): { centro: string; subcentro: string | null } | null {
  if (!nome) return null;
  const i = nome.indexOf(" · ");
  if (i === -1) return { centro: nome, subcentro: null };
  return { centro: nome.slice(0, i), subcentro: nome.slice(i + 3) };
}
