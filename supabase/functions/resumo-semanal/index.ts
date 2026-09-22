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
// ── EXPANDIDO EM 22/09/2026 — PASTOR, SECRETARIA E TESOURARIA ───────────
//
// Fase 4 da Bússola, próximo passo depois de duas sexta-feiras (11/09 e
// 18/09) de envio automático confirmado só pra Telma. `resumo_semanal_
// destinatarios()` (migration 20260922080000) devolve quem tem cada papel
// e o e-mail real cadastrado. Decidido com ela: cada um recebe só a
// PRÓPRIA seção — pastor só pastoral, secretaria só secretaria, tesouraria
// só tesouraria — não o resumo inteiro. A Telma continua recebendo o
// resumo completo, como sempre recebeu (ela acumula os três papéis).
// Sem e-mail cadastrado em `membros.email`, a pessoa simplesmente não
// aparece na lista — não é erro, é dado faltando.
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
// `diakoniaapp.com.br` verificado no Resend em 09/09/2026 (DKIM + SPF,
// "Domain verified") — voltou a usar o remetente definitivo. Chegou a rodar
// um dia com "Diakonia <onboarding@resend.dev>" (o remetente de testes do
// próprio Resend), enquanto o domínio ainda propagava.
const REMETENTE = "Diakonia <resumo@diakoniaapp.com.br>";

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

const blocoHtml = (titulo: string, frase: string) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #e4e1d3">
      <p style="margin:0 0 6px;font:600 15px Georgia,serif;color:#211d16">${titulo}</p>
      <p style="margin:0;font:14px -apple-system,sans-serif;color:#5c5646;line-height:1.5">${frase}</p>
    </td></tr>`;

// `blocos` — um por seção (Telma, que acumula os três papéis) ou só um
// (pastor/secretaria/tesouraria, cada um vendo só o que é dele). Mesmo
// invólucro nos dois casos — cabeçalho, blocos, link — só muda quantos
// blocos entram.
function montarHtml(dataGerado: string, blocos: { titulo: string; frase: string }[]): string {
  const dataFmt = new Date(dataGerado).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef0e7;font-family:-apple-system,sans-serif">
    <table style="max-width:560px;margin:0 auto;background:#faf9f5;border-radius:10px;padding:24px 28px">
      <tr><td style="padding-bottom:12px">
        <p style="margin:0;font:600 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a5741f">
          Resumo da semana · Diakonia
        </p>
        <p style="margin:4px 0 0;font:14px -apple-system,sans-serif;color:#8a8371;text-transform:capitalize">
          ${dataFmt}
        </p>
      </td></tr>
      ${blocos.map(b => blocoHtml(b.titulo, b.frase)).join("")}
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
  const [{ data, error }, { data: destinatarios, error: errDest }] = await Promise.all([
    supabase.rpc("resumo_semanal_digest"),
    supabase.rpc("resumo_semanal_destinatarios"),
  ]);
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }
  const digest = data as Digest;

  const FRASE_POR_SECAO: Record<"pastoral" | "secretaria" | "tesouraria", { titulo: string; frase: string }> = {
    pastoral:   { titulo: "Pastoral",   frase: frasePastoral(digest.pastoral) },
    secretaria: { titulo: "Secretaria", frase: fraseSecretaria(digest.secretaria) },
    tesouraria: { titulo: "Tesouraria", frase: fraseTesouraria(digest.tesouraria) },
  };

  async function enviar(destino: string, blocos: { titulo: string; frase: string }[]) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: REMETENTE,
        to: [destino],
        subject: `Diakonia — resumo da semana`,
        html: montarHtml(digest.gerado_em, blocos),
      }),
    });
    if (!resp.ok) return { destino, ok: false as const, detalhe: await resp.text() };
    return { destino, ok: true as const };
  }

  // Telma continua recebendo o resumo INTEIRO — ela acumula os três
  // papéis, então filtrar por seção não faz sentido pra ela. Pastor,
  // secretaria e tesouraria (achados por `resumo_semanal_destinatarios()`,
  // só quem tem e-mail cadastrado) recebem só a própria seção — decidido
  // com ela em 22/09/2026.
  const envios = [
    enviar(destinatario, [FRASE_POR_SECAO.pastoral, FRASE_POR_SECAO.secretaria, FRASE_POR_SECAO.tesouraria]),
    ...(errDest ? [] : (destinatarios ?? [])
      .filter((d: { papel: string; email: string }) => d.email !== destinatario) // não manda 2x pra Telma se ela também aparecer com um papel
      .map((d: { papel: "pastoral" | "secretaria" | "tesouraria"; email: string }) =>
        enviar(d.email, [FRASE_POR_SECAO[d.papel]]))),
  ];
  const resultados = await Promise.all(envios);
  const falhas = resultados.filter(r => !r.ok);

  if (resultados.every(r => !r.ok)) {
    // Nenhum envio saiu — falha total, mesmo status de antes.
    return new Response(JSON.stringify({ erro: "Falha ao enviar pelo Resend", detalhe: falhas }), { status: 502 });
  }

  // Resposta enxuta de propósito: a função é implantada com
  // `--no-verify-jwt` (pg_cron chama sem token — ver a migration do
  // agendamento), então qualquer um com a URL pode acioná-la. Devolver o
  // `digest` aqui vazaria números reais da igreja pra quem só tem o link,
  // sem precisar estar logado. "Quantos enviaram, quantos falharam" é
  // tudo que uma chamada sem autenticação precisa saber — nunca o
  // destinatário nem o conteúdo.
  return new Response(JSON.stringify({ ok: true, enviados: resultados.length - falhas.length, falharam: falhas.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
