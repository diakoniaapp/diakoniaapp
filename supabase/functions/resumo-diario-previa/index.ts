// ─── resumo-diario-previa — VISUALIZAR o e-mail diário da Tesouraria e mandar um e-mail de TESTE (22/10/2026) ───────────────────────────────────────────
//
//   (opcional nos dois: `incluir_sigilosos` — a escolha ainda não salva que a tela está mostrando; sem ela vale a configuração salva)
//   { acao: "previa" } → devolve { assunto, html, texto, contagem, total } com os dados de AGORA, como o e-mail das 7h sairia. NADA é enviado e nada é registrado.
//   { acao: "teste"  } → manda esse e-mail, marcado "[TESTE]", SÓ para o e-mail cadastrado de quem pediu (nunca um endereço vindo da chamada). NÃO registra "já enviado" (não conta como envio).
//
// Ignora o interruptor e os dias da semana (a prévia existe para conferir ANTES de ligar). Exige sessão de admin ou diakonia: o gateway confere o token, mas o token público (anon) também é um JWT
// válido — por isso a função confere o USUÁRIO e o PAPEL por dentro. Mora numa função à parte da que o agendamento chama: chamar a prévia nunca aciona o envio geral.
// Implantação: `supabase functions deploy resumo-diario-previa` (com verificação de JWT, o padrão). Depende da migration 20261022210000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { prepararDiario, type DadosDoDiario } from "../_shared/pagamentos/resumoDiario.ts";
import { lerExtratoDasContas } from "../_shared/saldos/extratoDasContas.ts";
import { lerReembolsosAPagar } from "../_shared/reembolsos/lerReembolsos.ts";
import { lerNomeDaIgreja } from "../_shared/email/identidade.ts";

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
  if (!supabaseUrl || !serviceRoleKey) return resposta({ erro: "Configuração do Supabase ausente" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const corpo = await req.json().catch(() => ({})) as { acao?: string; incluir_sigilosos?: boolean };
  if (corpo.acao !== "previa" && corpo.acao !== "teste") return resposta({ erro: "Ação desconhecida." }, 400);

  // quem chama: sessão válida E papel de admin ou diakonia
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sessao = token ? await supabase.auth.getUser(token) : { data: { user: null }, error: new Error("sem sessão") };
  if (sessao.error || !sessao.data.user) return resposta({ erro: "Faça login para visualizar ou testar o resumo diário." }, 401);
  const usuario = sessao.data.user;
  const { data: papeis } = await supabase.from("user_roles").select("role").eq("user_id", usuario.id).in("role", ["admin", "diakonia"]);
  if (!papeis || papeis.length === 0) return resposta({ erro: "Só a administração pode visualizar ou testar o resumo diário." }, 403);

  try {
    const { data, error } = await supabase.rpc("resumo_diario_dados");
    if (error) throw new Error(error.message);
    const dados = data as DadosDoDiario;
    dados.contas_extrato = await lerExtratoDasContas(supabase);
    dados.reembolsos_a_pagar = await lerReembolsosAPagar(supabase);
  dados.igreja_nome = await lerNomeDaIgreja(supabase);   // cabeçalho do e-mail (Identidade da Igreja)
    const preparo = prepararDiario(dados, corpo.acao === "teste" ? "TESTE — e-mail de teste do resumo diário" : "PRÉVIA — nada foi enviado", typeof corpo.incluir_sigilosos === "boolean" ? corpo.incluir_sigilosos : undefined);
    const { email } = preparo;

    if (corpo.acao === "previa") return resposta({ ok: true, assunto: email.assunto, html: email.html, texto: email.texto, contagem: email.contagem, total: email.total, hoje: dados.hoje });

    // teste: SÓ para o e-mail cadastrado de quem pediu
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);
    const { data: prof } = await supabase.from("profiles").select("pessoa_id").eq("id", usuario.id).maybeSingle();
    const { data: pessoa } = prof?.pessoa_id ? await supabase.from("membros").select("email").eq("id", prof.pessoa_id).maybeSingle() : { data: null };
    const para = (pessoa?.email ?? "").trim();
    if (!para) return resposta({ erro: "A sua ficha não tem e-mail cadastrado — cadastre em Pessoas para receber o teste." }, 400);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: `[TESTE] ${email.assunto}`, html: email.html, text: email.texto }),
    });
    if (!r.ok) return resposta({ erro: "Falha ao enviar pelo Resend", detalhe: await r.text() }, 502);
    return resposta({ ok: true, enviadoPara: para, itens: email.listados.length });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro ao montar o resumo diário" }, 500);
  }
});
