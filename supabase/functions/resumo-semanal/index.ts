// ─── resumo-semanal — o resumo semanal por e-mail ──────────────────────────
//
// Fase 4 da Bússola do Diakonia ("Comunicação"). Primeiro envio real: só
// para a Telma, juntando os três papéis que ela acumula (pastoral,
// secretaria, tesouraria) numa frase por área — a mesma régua de "urgência
// primeiro, fila depois" que cada painel já usa na tela, remontada aqui
// porque uma Edge Function Deno não importa os arquivos React do app.
//
// Os NÚMEROS vêm de `resumo_semanal_digest()` (ver a migration
// 20260909180000) — uma função SQL que reaproveita as mesmas RPCs dos
// painéis onde elas existem. Esta função só formata e envia; não soma nada
// sozinha.
//
// ── DE PROPÓSITO SEM A DIACONIA NESTA PRIMEIRA VERSÃO ───────────────────
//
// "Quem parou de vir" fica de fora — ver o comentário da migration. Entra
// numa versão seguinte.
//
// ── SECRETS NECESSÁRIOS (Project Settings → Edge Functions → Secrets) ────
//
//   RESEND_API_KEY        obrigatório — sem ele, a função responde 500 e
//                         não tenta enviar nada (melhor falhar alto do que
//                         fingir que enviou).
//   RESUMO_SEMANAL_EMAIL  opcional — destinatário; sem ele, cai no e-mail
//                         padrão abaixo.
//
// ── IMPLANTADA COM --no-verify-jwt, DE PROPÓSITO ─────────────────────────
//
// pg_cron chama via `net.http_post` sem token de autenticação — é a esteira
// de dentro do banco, não um usuário logado. Como qualquer um com a URL
// também pode acionar a função sem autenticação, a resposta nunca devolve
// o conteúdo do resumo (ver o fim do arquivo) — só confirma se enviou.
//
// ── COMO TESTAR SEM ESPERAR A SEXTA ──────────────────────────────────────
//
//   supabase functions invoke resumo-semanal --project-ref prjoftmlkusbjoeptabp --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EMAIL_PADRAO = "telma@diakoniaapp.com.br";
// Provisório: `diakoniaapp.com.br` ainda não está verificado no Resend
// (achado ao testar de verdade em 09/09/2026 — a chamada real devolveu
// 403 "domain is not verified"). `onboarding@resend.dev` é o remetente de
// testes do próprio Resend, funciona sem verificação nenhuma. Trocar para
// "Diakonia <resumo@diakoniaapp.com.br>" assim que o domínio for verificado
// em https://resend.com/domains — a troca é só esta linha.
const REMETENTE = "Diakonia <onboarding@resend.dev>";

interface DigestPastoral {
  aniversarios_semana: number;
  bodas_semana: number;
  visitantes_sem_contato: number;
  candidatos_batismo: number;
}
interface DigestSecretaria {
  sem_telefone: number;
  membresia_em_andamento: number;
  atas_pendentes: number;
  pautas_rascunho: number;
}
interface DigestTesouraria {
  fiscal_atrasados: number;
  fiscal_urgentes: number;
  caixas_abertos: number;
  aprovacoes_pendentes: number;
  centros_criticos: number;
}
interface Digest {
  pastoral: DigestPastoral;
  secretaria: DigestSecretaria;
  tesouraria: DigestTesouraria;
  gerado_em: string;
}

/** "1 obrigação" / "2 obrigações" — plural simples, sem exceção de idioma. */
function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

// ── Uma frase por área, mesma régua dos painéis: urgência junta numa lista,
// e quando não há nada gritando, mostra "em ordem" — nunca uma linha muda.

function frasePastoral(d: DigestPastoral): string {
  const partes: string[] = [];
  if (d.visitantes_sem_contato > 0) partes.push(plural(d.visitantes_sem_contato, "visitante sem contato", "visitantes sem contato"));
  if (d.candidatos_batismo > 0) partes.push(plural(d.candidatos_batismo, "candidato ao batismo", "candidatos ao batismo"));
  const celebra: string[] = [];
  if (d.aniversarios_semana > 0) celebra.push(plural(d.aniversarios_semana, "aniversariante", "aniversariantes"));
  if (d.bodas_semana > 0) celebra.push(plural(d.bodas_semana, "casal em bodas", "casais em bodas"));

  const linhas: string[] = [];
  if (celebra.length > 0) linhas.push(`Esta semana: ${celebra.join(" e ")}.`);
  linhas.push(partes.length > 0 ? `Atenção: ${partes.join(", ")}.` : "Sem pendência pastoral pendente.");
  return linhas.join(" ");
}

function fraseSecretaria(d: DigestSecretaria): string {
  const partes: string[] = [];
  if (d.sem_telefone > 0) partes.push(plural(d.sem_telefone, "pessoa sem telefone cadastrado", "pessoas sem telefone cadastrado"));
  if (d.membresia_em_andamento > 0) partes.push(plural(d.membresia_em_andamento, "solicitação de membresia em andamento", "solicitações de membresia em andamento"));
  const governanca = d.atas_pendentes + d.pautas_rascunho;
  if (governanca > 0) partes.push(plural(governanca, "pendência de governança", "pendências de governança"));
  return partes.length > 0 ? `Atenção: ${partes.join(", ")}.` : "Cadastro e governança em dia.";
}

function fraseTesouraria(d: DigestTesouraria): string {
  const partes: string[] = [];
  if (d.fiscal_atrasados > 0) partes.push(plural(d.fiscal_atrasados, "obrigação fiscal atrasada", "obrigações fiscais atrasadas"));
  if (d.caixas_abertos > 0) partes.push(plural(d.caixas_abertos, "caixa aberto", "caixas abertos"));
  if (d.aprovacoes_pendentes > 0) partes.push(plural(d.aprovacoes_pendentes, "aprovação pendente", "aprovações pendentes"));
  if (d.centros_criticos > 0) partes.push(plural(d.centros_criticos, "centro de custo acima do orçamento", "centros de custo acima do orçamento"));
  if (partes.length > 0) return `Atenção: ${partes.join(", ")}.`;
  const fila: string[] = [];
  if (d.fiscal_urgentes > 0) fila.push(plural(d.fiscal_urgentes, "obrigação vencendo em breve", "obrigações vencendo em breve"));
  return fila.length > 0 ? `Nada urgente. Na fila: ${fila.join(", ")}.` : "Fiscal em dia e nenhum caixa aberto.";
}

function montarHtml(d: Digest): string {
  const dataGerado = new Date(d.gerado_em).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });
  const bloco = (titulo: string, frase: string) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #e4e1d3">
      <p style="margin:0 0 6px;font:600 15px Georgia,serif;color:#211d16">${titulo}</p>
      <p style="margin:0;font:14px -apple-system,sans-serif;color:#5c5646;line-height:1.5">${frase}</p>
    </td></tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef0e7;font-family:-apple-system,sans-serif">
    <table style="max-width:560px;margin:0 auto;background:#faf9f5;border-radius:10px;padding:24px 28px">
      <tr><td style="padding-bottom:12px">
        <p style="margin:0;font:600 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a5741f">
          Resumo da semana · Diakonia
        </p>
        <p style="margin:4px 0 0;font:14px -apple-system,sans-serif;color:#8a8371;text-transform:capitalize">
          ${dataGerado}
        </p>
      </td></tr>
      ${bloco("Pastoral", frasePastoral(d.pastoral))}
      ${bloco("Secretaria", fraseSecretaria(d.secretaria))}
      ${bloco("Tesouraria", fraseTesouraria(d.tesouraria))}
      <tr><td style="padding-top:16px">
        <a href="https://portal.diakoniaapp.com.br" style="font:600 13px -apple-system,sans-serif;color:#a5741f;text-decoration:none">
          Abrir o Diakonia →
        </a>
      </td></tr>
    </table>
  </body></html>`;
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const destinatario = Deno.env.get("RESUMO_SEMANAL_EMAIL") ?? EMAIL_PADRAO;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ erro: "Configuração do Supabase ausente" }), { status: 500 });
  }
  if (!resendApiKey) {
    // Falha alto e claro. Fingir que enviou, sem chave, seria pior do que
    // um erro visível: a Telma acharia que o resumo está saindo.
    return new Response(
      JSON.stringify({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }),
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.rpc("resumo_semanal_digest");
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }
  const digest = data as Digest;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: [destinatario],
      subject: `Diakonia — resumo da semana`,
      html: montarHtml(digest),
    }),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    return new Response(JSON.stringify({ erro: "Falha ao enviar pelo Resend", detalhe: corpo }), { status: 502 });
  }

  // Resposta enxuta de propósito: a função é implantada com
  // `--no-verify-jwt` (pg_cron chama sem token — ver a migration do
  // agendamento), então qualquer um com a URL pode acioná-la. Devolver o
  // `digest` aqui vazaria números reais da igreja pra quem só tem o link,
  // sem precisar estar logado. "Enviou ou não" é tudo que uma chamada sem
  // autenticação precisa saber.
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
