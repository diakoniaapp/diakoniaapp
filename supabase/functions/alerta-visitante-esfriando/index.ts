// ─── alerta-visitante-esfriando — alerta pontual, não cadência ─────────────
//
// Top 10 #6 da Bússola do Diakonia — o único item da lista sem "feito":
// "É a única fila do sistema com prazo de validade real — visitante não
// procurado não volta, e hoje nada avisa antes de já ser tarde." Fase 4
// (Automação), represado de propósito até o resumo semanal ser validado —
// já foi (duas sextas + expansão a outros papéis, 22/09/2026).
//
// DIFERENÇA para `resumo-semanal`: aquele é CADÊNCIA (todo mundo, toda
// sexta, o mesmo número mesmo que ninguém tenha mexido em nada). Este é
// EVENTO — avisa da PESSOA, uma vez só, no dia em que ela esfria.
// `visitantes_esfriando_novos()` (migration 20260922100000) já filtra
// quem ainda não foi avisado NESTE ciclo de silêncio — repetir o aviso
// todo dia seria o mesmo ruído que o widget `AcoesHoje` já evita.
//
// ── SECRETS ────────────────────────────────────────────────────────────
//
//   RESEND_API_KEY  mesmo secret do resumo-semanal, já configurado.
//
// ── AGENDAMENTO ────────────────────────────────────────────────────────
//
// Pensado pra rodar 1x por dia (pg_cron), não semanal — é isso que faz
// dele "pontual": pega quem esfriou HOJE, não espera a sexta. Agendamento
// real fica pra depois de validar com ela, mesmo cuidado do resumo
// semanal na v1.
//
// ── COMO TESTAR ────────────────────────────────────────────────────────
//
//   curl -X POST https://prjoftmlkusbjoeptabp.supabase.co/functions/v1/alerta-visitante-esfriando

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";
const EMAIL_ADMIN = "telma@diakoniaapp.com.br";

interface VisitanteEsfriando {
  id: string;
  nome_completo: string;
  telefone_celular: string | null;
  dias_sem_contato: number;
  ultimo_contato_em: string | null;
  created_at: string;
}

function montarHtml(visitantes: VisitanteEsfriando[]): string {
  const linhas = visitantes.map(v => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e4e1d3">
      <p style="margin:0;font:600 14px -apple-system,sans-serif;color:#211d16">${v.nome_completo}</p>
      <p style="margin:2px 0 0;font:13px -apple-system,sans-serif;color:#5c5646">
        ${v.ultimo_contato_em ? `Sem contato há ${v.dias_sem_contato} dias` : `Nunca contatado(a) — ${v.dias_sem_contato} dias desde o cadastro`}
      </p>
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef0e7;font-family:-apple-system,sans-serif">
    <table style="max-width:560px;margin:0 auto;background:#faf9f5;border-radius:10px;padding:24px 28px">
      <tr><td style="padding-bottom:12px">
        <p style="margin:0;font:600 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a5741f">
          Alerta · Diakonia
        </p>
        <p style="margin:6px 0 0;font:600 16px Georgia,serif;color:#211d16">
          ${visitantes.length} visitante${visitantes.length !== 1 ? "s" : ""} esfriando
        </p>
        <p style="margin:4px 0 0;font:13px -apple-system,sans-serif;color:#8a8371">
          Sem contato há mais de 2 dias — quanto mais tempo passa, menor a chance de voltar.
        </p>
      </td></tr>
      ${linhas}
      <tr><td style="padding-top:16px">
        <a href="https://portal.diakoniaapp.com.br/visitantes" style="font:600 13px -apple-system,sans-serif;color:#a5741f;text-decoration:none">
          Abrir Visitantes →
        </a>
      </td></tr>
    </table>
  </body></html>`;
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ erro: "Configuração do Supabase ausente" }), { status: 500 });
  }
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }),
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: visitantes, error } = await supabase.rpc("visitantes_esfriando_novos");
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }
  const lista = (visitantes ?? []) as VisitanteEsfriando[];

  // Nada esfriou desde a última checagem — não manda e-mail vazio dizendo
  // "está tudo bem", mesma régua de `AcoesHoje`/`AlertasInteligentes`:
  // aviso vazio repetido ensina a ignorar o canal.
  if (lista.length === 0) {
    return new Response(JSON.stringify({ ok: true, alertados: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Destinatário: quem tem o papel pastoral (a fila mora em "Quem está
  // entrando", dentro do Painel Pastoral) + o admin/dono do sistema —
  // mesma função de `resumo_semanal_destinatarios()`, já filtrando por
  // quem tem e-mail cadastrado.
  const { data: destinatarios } = await supabase.rpc("resumo_semanal_destinatarios");
  const emailPastoral = (destinatarios ?? []).find((d: { papel: string }) => d.papel === "pastoral")?.email as string | undefined;
  const destinos = Array.from(new Set([EMAIL_ADMIN, ...(emailPastoral ? [emailPastoral] : [])]));

  const html = montarHtml(lista);
  const falhas: string[] = [];
  for (const destino of destinos) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: REMETENTE,
        to: [destino],
        subject: `Diakonia — ${lista.length} visitante${lista.length !== 1 ? "s" : ""} esfriando`,
        html,
      }),
    });
    if (!resp.ok) falhas.push(destino);
  }

  // Marca como alertado só depois de tentar enviar — se TODOS os envios
  // falharem, a lista continua aparecendo na próxima checagem em vez de
  // ficar silenciosamente esquecida (mesmo raciocínio de
  // `marcar_visitantes_alertados`, no comentário da migration).
  if (falhas.length < destinos.length) {
    await supabase.rpc("marcar_visitantes_alertados", { p_ids: lista.map(v => v.id) });
  }

  return new Response(JSON.stringify({ ok: falhas.length < destinos.length, alertados: lista.length, falharam: falhas.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
