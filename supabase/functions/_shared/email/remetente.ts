// ─── remetente — de quem o e-mail sai e para onde vai a RESPOSTA (puro: sem rede, sem Deno; só o `cliente` que o chamador passa) ──────────────────────────────
//
// Antes (até 27/10/2026) o remetente `Diakonia <resumo@diakoniaapp.com.br>` estava escrito em cada uma das 7 Edge Functions de e-mail e nenhuma tinha Reply-To: quem respondia a um resumo
// escrevia para `resumo@`, e o domínio entrega no Google Workspace — se esse endereço não tiver caixa, a resposta volta como "endereço não encontrado" e se perde. Decisão dela: manter
// `resumo@diakoniaapp.com.br` como remetente e usar um **Reply-To configurável pela igreja** (Identidade da Igreja); nunca `nao-responda@`.
//
// O endereço de resposta é, nesta ordem: `identidade_igreja.email_resposta` (campo próprio, "Responder para") → `identidade_igreja.email_contato` (o contato institucional que já existe) → nenhum.
// Sem endereço, o e-mail sai sem Reply-To (a resposta volta para o remetente, como sempre) e o rodapé diz para NÃO responder. Com endereço, o rodapé convida a responder.

/** Os resumos e alertas automáticos. */
export const REMETENTE_AUTOMATICO = "Diakonia <resumo@diakoniaapp.com.br>";
/** Reservado aos relatórios sob demanda (Central de Comunicação e Relatórios — ainda não usado). O Resend verifica o DOMÍNIO, então não exige configuração nova. */
export const REMETENTE_RELATORIOS = "Diakonia <relatorios@diakoniaapp.com.br>";

const PADRAO_DE_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** O endereço limpo, ou `null` se não parece um e-mail (a configuração nunca derruba um envio). */
export function emailDeRespostaValido(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const t = texto.trim();
  return t.length > 0 && t.length <= 160 && PADRAO_DE_EMAIL.test(t) ? t : null;
}

/** O endereço de resposta a partir das duas colunas da Identidade. */
export function enderecoDeResposta(linha: { email_resposta?: unknown; email_contato?: unknown } | null | undefined): string | null {
  return emailDeRespostaValido(linha?.email_resposta) ?? emailDeRespostaValido(linha?.email_contato);
}

/**
 * Lê o endereço de resposta da Identidade ativa. Sem a coluna `email_resposta` (migration ainda não aplicada) cai para `email_contato`; sem nada, ou em qualquer erro, devolve `null`:
 * o e-mail sai do mesmo jeito, sem Reply-To. `cliente` é só o que se usa do supabase-js.
 */
export async function lerEnderecoDeResposta(cliente: { from: (tabela: string) => any }): Promise<string | null> {
  const consulta = async (colunas: string) => {
    const r = await cliente.from("identidade_igreja").select(colunas).eq("ativa", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    return r?.error ? null : (r?.data ?? null);
  };
  try {
    const completa = await consulta("email_resposta, email_contato");
    if (completa) return enderecoDeResposta(completa);
    return enderecoDeResposta(await consulta("email_contato"));   // a coluna nova ainda não existe
  } catch {
    return null;
  }
}

/** O corpo da chamada ao Resend com o `reply_to` quando há endereço (o Resend aceita `reply_to`). */
export function comReplyTo<T extends Record<string, unknown>>(corpo: T, replyTo: string | null | undefined): T & { reply_to?: string } {
  return replyTo ? { ...corpo, reply_to: replyTo } : corpo;
}
