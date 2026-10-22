// ─── resumo-semanal-previa — VISUALIZAR o e-mail do resumo semanal e mandar um e-mail de TESTE (22/10/2026) ─────────────────────────────────────────
//
// Pedido dela: na tela de configuração do resumo semanal, "Visualizar e-mail" e "Enviar e-mail de teste". Mora numa função À PARTE de `resumo-semanal` (a que o pg_cron chama e que dispara e-mail
// para todos): assim chamar a prévia por engano, ou antes de a função nova estar implantada, nunca aciona o envio geral.
//
//   { acao: "previa", perfil, blocos? } → devolve { assunto, html, blocos } com os números de agora. NADA é enviado.
//   { acao: "teste",  perfil, blocos? } → manda esse e-mail, marcado "[TESTE]", SÓ para o e-mail cadastrado de quem pediu (nunca um endereço vindo da chamada).
//   `blocos` (opcional) é a configuração ainda NÃO salva que a tela está editando — a prévia mostra o que vai acontecer se ela salvar.
//
// Exige sessão de admin ou diakonia: o gateway confere o token, mas o token público (anon) também é um JWT válido — por isso a função confere o USUÁRIO e o PAPEL por dentro.
// Implantação: `supabase functions deploy resumo-semanal-previa` (com verificação de JWT, o padrão). Depende da migration 20261022200000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ASSUNTO, montarBlocos, montarHtml, type Digest } from "../_shared/resumoSemanal/blocos.ts";
import { juntarExtrato, lerExtratoDasContas } from "../_shared/saldos/extratoDasContas.ts";
import { PERFIS, blocosDaPessoa, mesclarConfig, paraSalvar, type Perfil } from "../_shared/resumoSemanal/catalogo.ts";

const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return resposta({ erro: "Configuração do Supabase ausente" }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const corpo = await req.json().catch(() => ({})) as { acao?: string; perfil?: string; blocos?: unknown };
  if (corpo.acao !== "previa" && corpo.acao !== "teste") return resposta({ erro: "Ação desconhecida." }, 400);

  // quem chama: sessão válida E papel de admin ou diakonia
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sessao = token ? await supabase.auth.getUser(token) : { data: { user: null }, error: new Error("sem sessão") };
  if (sessao.error || !sessao.data.user) return resposta({ erro: "Faça login para visualizar ou testar o resumo." }, 401);
  const usuario = sessao.data.user;
  const { data: papeis } = await supabase.from("user_roles").select("role").eq("user_id", usuario.id).in("role", ["admin", "diakonia"]);
  if (!papeis || papeis.length === 0) return resposta({ erro: "Só a administração pode visualizar ou testar o resumo." }, 403);

  const perfil = corpo.perfil as Perfil;
  if (!PERFIS.includes(perfil)) return resposta({ erro: "Perfil desconhecido." }, 400);

  try {
    const [p, b] = await Promise.all([
      supabase.from("resumo_semanal_perfis").select("perfil, ativo"),
      supabase.from("resumo_semanal_blocos").select("perfil, bloco, ativo, ordem"),
    ]);
    if (p.error || b.error) throw new Error("A configuração do resumo ainda não existe no banco — aplique a migration 20261022200000.");
    let config = mesclarConfig({ perfis: p.data ?? [], blocos: b.data ?? [] });
    if (Array.isArray(corpo.blocos)) {
      // a tela edita antes de salvar: vale o que ela mandou (validado contra o catálogo), com o perfil ligado
      const editado = paraSalvar([{ perfil, ativo: true, blocos: (corpo.blocos as { bloco: string; ativo: boolean; ordem: number }[]).filter(x => x && typeof x.bloco === "string") }]);
      config = config.map(c => (c.perfil === perfil ? editado[0] : c));
    } else {
      config = config.map(c => (c.perfil === perfil ? { ...c, ativo: true } : c));
    }
    const ids = blocosDaPessoa([perfil], config);

    const d = await supabase.rpc("resumo_semanal_digest");
    if (d.error) throw new Error(d.error.message);
    const digest = d.data as Digest;
    if (digest.tesouraria?.saldo_contas) digest.tesouraria.saldo_contas.contas = juntarExtrato(digest.tesouraria.saldo_contas.contas, await lerExtratoDasContas(supabase));
    const aviso = ids.length === 0
      ? "Nenhum bloco ativo neste perfil — nada seria enviado."
      : corpo.acao === "teste" ? "TESTE — e-mail de teste do resumo semanal" : "PRÉVIA — nada foi enviado";
    const html = montarHtml(digest.gerado_em, montarBlocos(ids, digest), aviso);

    if (corpo.acao === "previa") return resposta({ ok: true, assunto: ASSUNTO, html, blocos: ids });

    // teste: SÓ para o e-mail cadastrado de quem pediu
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);
    if (ids.length === 0) return resposta({ erro: "Nenhum bloco ativo neste perfil — não há o que testar." }, 400);
    const { data: prof } = await supabase.from("profiles").select("pessoa_id").eq("id", usuario.id).maybeSingle();
    const { data: pessoa } = prof?.pessoa_id ? await supabase.from("membros").select("email").eq("id", prof.pessoa_id).maybeSingle() : { data: null };
    const para = (pessoa?.email ?? "").trim();
    if (!para) return resposta({ erro: "A sua ficha não tem e-mail cadastrado — cadastre em Pessoas para receber o teste." }, 400);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: `[TESTE] ${ASSUNTO}`, html }),
    });
    if (!r.ok) return resposta({ erro: "Falha ao enviar pelo Resend", detalhe: await r.text() }, 502);
    return resposta({ ok: true, enviadoPara: para, blocos: ids });
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro ao montar o resumo" }, 500);
  }
});
