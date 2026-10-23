// ─── resumo-diario — o e-mail diário da Tesouraria com tudo para pagar no dia (Fase 1: dados de pagamento, SEM anexos) ──────────────────────────────────
//
// Pedido dela (22/10/2026): substituir o envio manual de pagamentos. O pg_cron (job `resumo-diario`, criado DESLIGADO pela migration 20261022210000) chama esta função; ela só envia se a
// configuração estiver LIGADA e hoje for um dos dias escolhidos. O que entra, a ordem do meio de pagamento (linha digitável → Pix do documento → Pix do cadastro) e as seções do e-mail estão em
// `_shared/pagamentos/` (`itensDoDia.ts`, `emailDiario.ts`, `resumoDiario.ts`) — as mesmas regras do "Preparar envio" do app, para o e-mail automático não contradizer o manual.
//
// ── O QUE ELA REGISTRA ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Depois de enviar, grava em `resumo_diario_enviados` cada obrigação que foi listada: é o que faz o e-mail seguinte avisar "já enviado em 21/10 — confira se já foi pago" (o risco de pagamento em
// duplicidade enquanto a baixa não chega ao sistema). E recusa repetir o envio dentro de 20 minutos (agendamento duplicado ou a URL pública chamada de novo).
//
// ── SECRETS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   RESEND_API_KEY   obrigatório — sem ele, responde 500 e não envia nada.
//
// ── IMPLANTADA COM --no-verify-jwt, DE PROPÓSITO ───────────────────────────────────────────────────────────────────────────────────────────
// O pg_cron chama sem token. Como qualquer um com a URL também pode acioná-la, a resposta nunca devolve conteúdo nem destinatários — só contagens e o motivo de não ter enviado.
//
// ── ORDEM DE IMPLANTAÇÃO ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   1º aplicar a migration 20261022210000_resumo_diario_tesouraria.sql; 2º `supabase functions deploy resumo-diario --no-verify-jwt` (e `resumo-diario-previa`); 3º, na tela Resumo Semanal →
//   "Resumo diário da Tesouraria", cadastrar os destinatários, conferir com "Visualizar e-mail" / "Enviar teste" e SÓ ENTÃO ligar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { motivoDeNaoEnviar, prepararDiario, type DadosDoDiario } from "../_shared/pagamentos/resumoDiario.ts";
import { lerExtratoDasContas } from "../_shared/saldos/extratoDasContas.ts";
import { lerReembolsosAPagar } from "../_shared/reembolsos/lerReembolsos.ts";
import { lerNomeDaIgreja } from "../_shared/email/identidade.ts";
import { enviarDiarioAosDestinatarios } from "../_shared/pagamentos/enviarDiario.ts";

const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return resposta({ erro: "Configuração do Supabase ausente" }, 500);
  if (!resendApiKey) return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("resumo_diario_dados");
  if (error) return resposta({ erro: error.message }, 500);   // sem a migration: erro claro, nunca um e-mail
  const dados = data as DadosDoDiario;
  dados.contas_extrato = await lerExtratoDasContas(supabase);   // sem a migration 20261022220000 vem vazio: o e-mail sai sem o bloco de saldo
  dados.reembolsos_a_pagar = await lerReembolsosAPagar(supabase);
  dados.igreja_nome = await lerNomeDaIgreja(supabase);   // cabeçalho do e-mail (Identidade da Igreja)

  const preparo = prepararDiario(dados);
  const motivo = motivoDeNaoEnviar(dados, preparo);
  if (motivo) {
    // "sem destinatários" é problema de configuração (alguém ligou sem cadastrar ninguém): avisa alto; os demais são normais e não são erro
    if (motivo === "sem_destinatarios") return resposta({ erro: "O resumo diário está ligado, mas não há destinatários cadastrados.", motivo }, 500);
    return resposta({ ok: true, enviados: 0, motivo });
  }

  const r = await enviarDiarioAosDestinatarios(supabase, resendApiKey, REMETENTE, dados, preparo);
  if (!r.ok) return resposta({ erro: r.erro, detalhe: r.detalhe }, 502);

  // Resposta enxuta: esta função é alcançável sem login. Contagens, nunca destinatário nem conteúdo.
  return resposta({ ok: true, enviados: r.enviados, falharam: r.falharam, itens: r.itens, reembolsos: r.reembolsos, registrados: r.registrados });
});
