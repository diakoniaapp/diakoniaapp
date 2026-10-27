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
import { assuntoDosVisitantes, htmlDosVisitantes, type VisitanteEsfriando } from "../_shared/email/alertas.ts";
import { lerNomeDaIgreja } from "../_shared/email/identidade.ts";
import { aplicarNotaDeResposta } from "../_shared/email/desenho.ts";
import { REMETENTE_AUTOMATICO, comReplyTo, lerEnderecoDeResposta } from "../_shared/email/remetente.ts";

const REMETENTE = REMETENTE_AUTOMATICO;   // o mesmo endereço em todas as funções (_shared/email/remetente.ts); a RESPOSTA vai para o Reply-To da Identidade da Igreja
const EMAIL_ADMIN = "telma@diakoniaapp.com.br";

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

  const replyTo = await lerEnderecoDeResposta(supabase);
  const html = aplicarNotaDeResposta(htmlDosVisitantes(lista, await lerNomeDaIgreja(supabase)), replyTo);
  const falhas: string[] = [];
  for (const destino of destinos) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(comReplyTo({
        from: REMETENTE,
        to: [destino],
        subject: assuntoDosVisitantes(lista.length),
        html,
      }, replyTo)),
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
