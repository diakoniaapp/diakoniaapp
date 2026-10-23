// ─── enviarDiario — manda o e-mail diário aos destinatários e registra o que foi listado (o agendamento e o "Enviar agora" dividem isto) ─────────────────────
//
// Antes este trecho morava inline em `resumo-diario/index.ts`. O botão "Enviar agora" (painel Resumo diário, 23/10/2026) precisa do MESMO envio e do MESMO registro — o registro é o que faz o
// e-mail seguinte avisar "já enviado em 21/10 — confira se já foi pago" (o risco de pagamento em duplicidade enquanto a baixa não chega ao sistema), então não pode haver duas versões dele.
import type { DadosDoDiario, PreparoDoDiario } from "./resumoDiario.ts";

// o cliente do Supabase só precisa de `from(...).insert(...)`; tipado à mão para o módulo não depender do pacote (roda em Deno e é lido pelos testes do app)
interface ClienteQueGrava { from: (tabela: string) => { insert: (linhas: unknown[]) => PromiseLike<{ error: unknown }> } }

export type ResultadoDoEnvio =
  | { ok: true; enviados: number; falharam: number; itens: number; reembolsos: number; registrados: number }
  | { ok: false; erro: string; detalhe: unknown };

export async function enviarDiarioAosDestinatarios(
  supabase: ClienteQueGrava, resendApiKey: string, remetente: string, dados: DadosDoDiario, preparo: PreparoDoDiario,
): Promise<ResultadoDoEnvio> {
  const envios = await Promise.all(dados.destinatarios.map(async d => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remetente, to: [d.email], subject: preparo.email.assunto, html: preparo.email.html, text: preparo.email.texto }),
    });
    return r.ok ? { ok: true as const } : { ok: false as const, detalhe: await r.text() };
  }));
  const enviados = envios.filter(e => e.ok).length;
  const falharam = envios.length - enviados;
  if (enviados === 0) return { ok: false, erro: "Falha ao enviar pelo Resend", detalhe: envios.filter(e => !e.ok) };

  // o registro do que foi listado (é o que evita o pagamento em duplicidade no e-mail seguinte). Uma falha aqui não desfaz o envio — só é avisada.
  // os reembolsos entram no mesmo registro (a obrigação-raiz é a chave): quem pagou ontem pode ainda não ter dado baixa
  let registrados = 0;
  const registro = [
    ...preparo.email.listados.map(i => ({ lancamento_id: i.id, valor: i.valor, vencimento: i.vencimento, destinatarios: enviados })),
    ...preparo.email.reembolsosListados.filter(r => r.obrigacao_id).map(r => ({ lancamento_id: r.obrigacao_id as string, valor: r.valor, vencimento: r.data_despesa ?? null, destinatarios: enviados })),
  ];
  if (registro.length > 0) {
    const { error } = await supabase.from("resumo_diario_enviados").insert(registro);
    if (!error) registrados = registro.length;
  }
  return { ok: true, enviados, falharam, itens: preparo.email.listados.length, reembolsos: preparo.email.reembolsosListados.length, registrados };
}
