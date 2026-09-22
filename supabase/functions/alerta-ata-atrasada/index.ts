// ─── alerta-ata-atrasada — alerta pontual, mesmo molde do de visitante ──────
//
// Segundo dos três alertas pontuais citados na Bússola do Diakonia (seção 2,
// card da Secretaria: "alerta pontual quando uma ata passa de 7 dias sem
// lançar"; seção 12, roadmap de 12 meses). O primeiro foi
// `alerta-visitante-esfriando` (22/09/2026) — este segue o mesmo padrão:
// EVENTO (a reunião cruzou 7 dias sem ata), não CADÊNCIA, e só avisa uma vez
// por reunião (`atas_atrasadas_novas()`, migration 20260922110000, já filtra
// quem tem `ata_alertada_em` preenchido).
//
// DIFERENÇA para o Painel da Secretaria: aquele já mostra "reuniões
// encerradas sem ata" HOJE, sem corte de tempo — é a fila viva, sempre
// visível quando ela abre o painel. Este é o empurrão: só quando a demora já
// passou dos 7 dias que o próprio card de papel da Secretaria da Bússola
// definiu como o limite razoável.
//
// ── SECRETS ────────────────────────────────────────────────────────────
//
//   RESEND_API_KEY  mesmo secret do resumo-semanal e do alerta de visitante.
//
// ── AGENDAMENTO ────────────────────────────────────────────────────────
//
// Pensado pra rodar 1x por dia (pg_cron), como o de visitante. Agendamento
// real fica pra depois de validar com ela — mesmo cuidado, ainda represado
// em 22/09/2026.
//
// ── COMO TESTAR ────────────────────────────────────────────────────────
//
//   curl -X POST https://prjoftmlkusbjoeptabp.supabase.co/functions/v1/alerta-ata-atrasada

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";
const EMAIL_ADMIN = "telma@diakoniaapp.com.br";

interface AtaAtrasada {
  id: string;
  titulo: string;
  tipo: string;
  data_reuniao: string;
  dias_sem_ata: number;
  secretaria_nome: string | null;
}

function montarHtml(atas: AtaAtrasada[]): string {
  const linhas = atas.map(a => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e4e1d3">
      <p style="margin:0;font:600 14px -apple-system,sans-serif;color:#211d16">${a.titulo}</p>
      <p style="margin:2px 0 0;font:13px -apple-system,sans-serif;color:#5c5646">
        ${a.dias_sem_ata} dias sem ata — reunião de ${new Date(a.data_reuniao + "T12:00:00").toLocaleDateString("pt-BR")}
        ${a.secretaria_nome ? ` · secretariada por ${a.secretaria_nome}` : ""}
      </p>
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef0e7;font-family:-apple-system,sans-serif">
    <table style="max-width:560px;margin:0 auto;background:#faf9f5;border-radius:10px;padding:24px 28px">
      <tr><td style="padding-bottom:12px">
        <p style="margin:0;font:600 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a5741f">
          Alerta · Diakonia
        </p>
        <p style="margin:6px 0 0;font:600 16px Georgia,serif;color:#211d16">
          ${atas.length} ata${atas.length !== 1 ? "s" : ""} de reunião atrasada${atas.length !== 1 ? "s" : ""}
        </p>
        <p style="margin:4px 0 0;font:13px -apple-system,sans-serif;color:#8a8371">
          Mais de 7 dias desde a reunião, e a decisão ainda não ficou registrada.
        </p>
      </td></tr>
      ${linhas}
      <tr><td style="padding-top:16px">
        <a href="https://portal.diakoniaapp.com.br/governanca" style="font:600 13px -apple-system,sans-serif;color:#a5741f;text-decoration:none">
          Abrir Governança →
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

  const { data: atas, error } = await supabase.rpc("atas_atrasadas_novas");
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }
  const lista = (atas ?? []) as AtaAtrasada[];

  // Nenhuma ata nova cruzou os 7 dias desde a última checagem — mesma régua
  // do alerta de visitante: não manda e-mail vazio dizendo "está tudo bem".
  if (lista.length === 0) {
    return new Response(JSON.stringify({ ok: true, alertados: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Destinatário: quem tem o papel de secretaria — "a ata é da secretaria",
  // como o próprio comentário de `gov_reunioes.secretaria_id` já registra —
  // + o admin/dono do sistema. Mesma função de `resumo_semanal_destinatarios()`.
  const { data: destinatarios } = await supabase.rpc("resumo_semanal_destinatarios");
  const emailSecretaria = (destinatarios ?? []).find((d: { papel: string }) => d.papel === "secretaria")?.email as string | undefined;
  const destinos = Array.from(new Set([EMAIL_ADMIN, ...(emailSecretaria ? [emailSecretaria] : [])]));

  const html = montarHtml(lista);
  const falhas: string[] = [];
  for (const destino of destinos) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: REMETENTE,
        to: [destino],
        subject: `Diakonia — ${lista.length} ata${lista.length !== 1 ? "s" : ""} de reunião atrasada${lista.length !== 1 ? "s" : ""}`,
        html,
      }),
    });
    if (!resp.ok) falhas.push(destino);
  }

  // Marca como alertado só depois de tentar enviar — mesmo raciocínio do
  // alerta de visitante: se todos os envios falharem, a ata continua
  // aparecendo na próxima checagem em vez de ficar silenciosamente esquecida.
  if (falhas.length < destinos.length) {
    await supabase.rpc("marcar_atas_alertadas", { p_ids: lista.map(a => a.id) });
  }

  return new Response(JSON.stringify({ ok: falhas.length < destinos.length, alertados: lista.length, falharam: falhas.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
