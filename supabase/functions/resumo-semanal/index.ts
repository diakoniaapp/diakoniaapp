// ─── resumo-semanal — o resumo semanal por e-mail, CONFIGURÁVEL pela administração ─────────────────────────────────────────────────────────────
//
// Fase 4 da Bússola do Diakonia ("Comunicação"). Os NÚMEROS vêm de `resumo_semanal_digest()` (SQL); a escolha de QUEM recebe, O QUE recebe e EM QUE ORDEM vem de duas tabelas que a
// administração edita na tela "Resumo Semanal" (`resumo_semanal_perfis` / `resumo_semanal_blocos`); esta função só junta as duas e envia. Nada é somado aqui.
// A VISUALIZAÇÃO e o E-MAIL DE TESTE moram em outra função, `resumo-semanal-previa` (com login): esta aqui é a que o pg_cron chama sem token e que dispara e-mail de verdade — quanto menos
// coisas ela fizer, menos coisas um estranho com a URL consegue acionar.
//
// ── COMO O CONTEÚDO É DECIDIDO (22/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────
//   · Perfis: Administração (papéis admin e diakonia), Tesouraria, Secretaria, Pastoral (papel pastor). Cada perfil tem um interruptor e uma lista ordenada de blocos
//     (`_shared/resumoSemanal/catalogo.ts` é a lista do que o código sabe montar; `blocos.ts` transforma número em frase).
//   · UMA pessoa recebe UM e-mail: quem tem mais de um perfil recebe os blocos dos perfis dela somados, sem repetir (`blocosDaPessoa`). Quem fica sem nenhum bloco ativo não recebe nada.
//   · O e-mail fixo de `RESUMO_SEMANAL_EMAIL` (a Telma) entra como Administração — desligar o perfil Administração desliga também esse endereço.
//   · Sem nada salvo, vale o padrão do catálogo. As tabelas só guardam as escolhas.
//
// ── SECRETS NECESSÁRIOS (Project Settings → Edge Functions → Secrets) ────────────────────────────────────────────────────────────────────────
//   RESEND_API_KEY        obrigatório — sem ele, a função responde 500 e não tenta enviar nada (melhor falhar alto do que fingir que enviou).
//   RESUMO_SEMANAL_EMAIL  opcional — destinatário fixo (Administração); sem ele, cai no e-mail padrão abaixo.
//
// ── IMPLANTADA COM --no-verify-jwt, DE PROPÓSITO ─────────────────────────────────────────────────────────────────────────────────────────────
// O pg_cron chama sem token (é a esteira de dentro do banco). Como qualquer um com a URL também pode acioná-la sem autenticação, a resposta nunca devolve o conteúdo do resumo
// nem os destinatários — só quantos enviaram.
//
// ── ORDEM DE IMPLANTAÇÃO ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   1º aplicar a migration 20261022200000_resumo_semanal_configuravel.sql; 2º `supabase functions deploy resumo-semanal --no-verify-jwt` e `supabase functions deploy resumo-semanal-previa --no-verify-jwt`.
//   Esta versão sem a migration recusa o envio (500, "configuração ainda não existe") em vez de mandar um e-mail diferente do que a tela promete.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ASSUNTO, montarBlocos, montarHtml, type Digest } from "../_shared/resumoSemanal/blocos.ts";
import { lerNomeDaIgreja } from "../_shared/email/identidade.ts";
import { aplicarNotaDeResposta } from "../_shared/email/desenho.ts";
import { REMETENTE_AUTOMATICO, comReplyTo, lerEnderecoDeResposta } from "../_shared/email/remetente.ts";
import { juntarExtrato, lerExtratoDasContas } from "../_shared/saldos/extratoDasContas.ts";
import { lerReembolsosAPagar } from "../_shared/reembolsos/lerReembolsos.ts";
import { blocosDaPessoa, mesclarConfig, type PerfilConfigurado } from "../_shared/resumoSemanal/catalogo.ts";

const EMAIL_PADRAO = "telma@diakoniaapp.com.br";
// `diakoniaapp.com.br` verificado no Resend em 09/09/2026 (DKIM + SPF, "Domain verified").
const REMETENTE = REMETENTE_AUTOMATICO;   // o mesmo endereço em todas as funções (_shared/email/remetente.ts); a RESPOSTA vai para o Reply-To da Identidade da Igreja

// CORS: a tela "Disparar agora" chama esta função do navegador
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const destinatarioFixo = (Deno.env.get("RESUMO_SEMANAL_EMAIL") ?? EMAIL_PADRAO).trim();

  if (!supabaseUrl || !serviceRoleKey) return resposta({ erro: "Configuração do Supabase ausente" }, 500);
  if (!resendApiKey) {
    // Falha alto e claro. Fingir que enviou, sem chave, seria pior do que um erro visível: a Telma acharia que o resumo está saindo.
    return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let replyTo: string | null = null;   // lido da Identidade antes dos envios (abaixo)
  async function enviar(destino: string, html: string) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(comReplyTo({ from: REMETENTE, to: [destino], subject: ASSUNTO, html: aplicarNotaDeResposta(html, replyTo) }, replyTo)),
    });
    if (!r.ok) return { destino, ok: false as const, detalhe: await r.text() };
    return { destino, ok: true as const };
  }

  // a configuração do banco (com o padrão do catálogo onde nada foi salvo) e os números de agora
  let config: PerfilConfigurado[];
  let digest: Digest;
  try {
    const [p, b] = await Promise.all([
      supabase.from("resumo_semanal_perfis").select("perfil, ativo"),
      supabase.from("resumo_semanal_blocos").select("perfil, bloco, ativo, ordem"),
    ]);
    // sem as tabelas: erro claro, nunca um e-mail diferente do prometido
    if (p.error || b.error) throw new Error("A configuração do resumo ainda não existe no banco — aplique a migration 20261022200000.");
    config = mesclarConfig({ perfis: p.data ?? [], blocos: b.data ?? [] });
    const d = await supabase.rpc("resumo_semanal_digest");
    if (d.error) throw new Error(d.error.message);
    digest = d.data as Digest;
    // até quando cada saldo de banco reflete o extrato (sem a migration 20261022220000 vem vazio e o e-mail sai só com a nota geral)
    if (digest.tesouraria?.saldo_contas) digest.tesouraria.saldo_contas.contas = juntarExtrato(digest.tesouraria.saldo_contas.contas, await lerExtratoDasContas(supabase));
    // quem recebe cada reembolso (sem a migration 20261022230000 vem vazio: o bloco diz só quantos e quanto, como antes)
    if (digest.tesouraria?.reembolsos && digest.tesouraria.reembolsos.n > 0) digest.tesouraria.reembolsos.itens = await lerReembolsosAPagar(supabase);
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro ao ler a configuração" }, 500);
  }
  const nomeDaIgreja = await lerNomeDaIgreja(supabase);   // cabeçalho do e-mail (Identidade da Igreja)
  replyTo = await lerEnderecoDeResposta(supabase);
  const { data: destinatarios, error: errDest } = await supabase.rpc("resumo_semanal_destinatarios_v2");
  if (errDest) return resposta({ erro: errDest.message }, 500);

  // uma pessoa = um e-mail (chave: o endereço em minúsculas); os perfis dela se somam
  const pessoas = new Map<string, { email: string; perfis: Set<string> }>();
  const somar = (email: string, perfil: string) => {
    const k = email.trim().toLowerCase();
    if (!k) return;
    const p = pessoas.get(k) ?? { email: email.trim(), perfis: new Set<string>() };
    p.perfis.add(perfil);
    pessoas.set(k, p);
  };
  somar(destinatarioFixo, "administracao");
  for (const d of (destinatarios ?? []) as { perfil: string; email: string }[]) somar(d.email, d.perfil);

  let ignorados = 0;
  const envios: ReturnType<typeof enviar>[] = [];
  for (const p of pessoas.values()) {
    const ids = blocosDaPessoa([...p.perfis], config);
    if (ids.length === 0) { ignorados++; continue; }   // perfil desligado ou sem bloco ativo: não se manda e-mail vazio
    envios.push(enviar(p.email, montarHtml(digest.gerado_em, montarBlocos(ids, digest), undefined, nomeDaIgreja)));
  }
  const resultados = await Promise.all(envios);
  const falhas = resultados.filter(r => !r.ok);

  if (resultados.length > 0 && resultados.every(r => !r.ok)) {
    return resposta({ erro: "Falha ao enviar pelo Resend", detalhe: falhas }, 502);
  }
  // Resposta enxuta de propósito: esta função é alcançável sem login. "Quantos enviaram" é tudo que uma chamada sem autenticação precisa saber — nunca o destinatário nem o conteúdo.
  return resposta({ ok: true, enviados: resultados.length - falhas.length, falharam: falhas.length, ignorados });
});
