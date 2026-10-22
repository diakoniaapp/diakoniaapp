// ─── visitante-mensagem-teste — manda UM e-mail de teste da mensagem ao visitante, para quem está editando (22/10/2026) ───────────────────────────────────────────────────────────────────────────────
//
// Pedido dela: "visualizar como a mensagem ficará antes de salvar" e "poder enviar mensagem de teste". A prévia é montada na própria tela; este envio é o teste de verdade, no e-mail.
//
//   POST { modelo, config } → monta a mensagem de e-mail com o RASCUNHO recebido (não precisa estar salvo) e manda, marcada "[TESTE]", SÓ para o e-mail cadastrado de quem pediu —
//   nunca para um endereço vindo da chamada, e nunca para um visitante. Os próximos eventos vêm da agenda (visitante_mensagens()), não do rascunho.
//
// Exige sessão de admin, diakonia ou secretaria: o gateway confere o token, mas o token público (anon) também é um JWT válido — por isso o USUÁRIO e o PAPEL são conferidos por dentro, antes de ler qualquer dado.
// Implantação: `supabase functions deploy visitante-mensagem-teste` (com verificação de JWT, o padrão). Depende da migration 20261023100000 e do segredo RESEND_API_KEY (o mesmo dos resumos por e-mail).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { montarMensagem } from "../_shared/mensagensVisitante/montar.ts";
import { sanearConfig, sanearIdentidade, sanearModelo } from "../_shared/mensagensVisitante/sanear.ts";

const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return resposta({ erro: "Configuração do Supabase ausente" }, 500);
  if (!resendApiKey) return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // quem chama: sessão válida E papel de administração
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sessao = token ? await supabase.auth.getUser(token) : { data: { user: null }, error: new Error("sem sessão") };
  if (sessao.error || !sessao.data.user) return resposta({ erro: "Faça login para enviar o teste." }, 401);
  const usuario = sessao.data.user;
  const { data: papeis } = await supabase.from("user_roles").select("role").eq("user_id", usuario.id).in("role", ["admin", "diakonia", "secretaria"]);
  if (!papeis || papeis.length === 0) return resposta({ erro: "Só a administração pode enviar o teste." }, 403);

  // o RASCUNHO vem da tela (modelo e configuração das mensagens); a IDENTIDADE da igreja (nome, redes, endereço…) vem SEMPRE do banco, nunca da chamada
  const corpo = await req.json().catch(() => ({})) as { modelo?: unknown; config?: unknown };
  const modelo = sanearModelo(corpo.modelo);
  if (!modelo) return resposta({ erro: "Modelo inválido." }, 400);
  if (modelo.canal !== "email") return resposta({ erro: "Este teste é só para o canal e-mail." }, 400);
  const config = sanearConfig(corpo.config);

  try {
    // o destino: o e-mail da ficha de quem pediu
    const { data: prof } = await supabase.from("profiles").select("pessoa_id").eq("id", usuario.id).maybeSingle();
    const { data: pessoa } = prof?.pessoa_id ? await supabase.from("membros").select("email, nome_completo").eq("id", prof.pessoa_id).maybeSingle() : { data: null };
    const para = (pessoa?.email ?? "").trim();
    if (!para) return resposta({ erro: "A sua ficha não tem e-mail cadastrado — cadastre em Pessoas para receber o teste." }, 400);

    // a Identidade e os próximos eventos (da agenda) vêm do banco; sem a migration o teste sai só com o nome padrão e sem lista
    const pacote = await supabase.rpc("visitante_mensagens");
    const igreja = sanearIdentidade((pacote.data as { igreja?: unknown } | null)?.igreja);
    const eventos = Array.isArray((pacote.data as { eventos?: unknown } | null)?.eventos)
      ? ((pacote.data as { eventos: Record<string, unknown>[] }).eventos).filter(e => e && typeof e.titulo === "string").map(e => ({ titulo: String(e.titulo), quando: e.quando ? String(e.quando) : null, local: e.local ? String(e.local) : null, link: e.link ? String(e.link) : null }))
      : [];

    const nome = (pessoa?.nome_completo ?? "").trim() || "Maria da Silva";
    const m = montarMensagem(modelo, { config, igreja, eventos, visitante: { nome, culto: "Culto da Manhã" } });
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: `[TESTE] ${m.assunto}`, html: m.html, text: m.texto }),
    });
    if (!r.ok) return resposta({ erro: "Falha ao enviar pelo Resend", detalhe: await r.text() }, 502);
    return resposta({ ok: true, enviadoPara: para });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro ao montar o teste" }, 500);
  }
});
