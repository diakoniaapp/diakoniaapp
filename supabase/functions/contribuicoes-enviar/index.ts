// ─── contribuicoes-enviar — o relatório de contribuições AGREGADO, por e-mail, sob demanda (27/10/2026) ────────────────────────────────────────────────────────────────────────────────────
//
// Decisão dela: o pastor recebe por e-mail só o relatório agregado (período, dizimistas identificados, total, média mensal, semana de maior adesão, novos, recorrentes); a lista com NOMES fica só dentro
// do sistema. Aqui não há como um nome entrar no e-mail: o módulo que o monta (`_shared/contribuicoes/email.ts`) só recebe números.
//
//   { acao: "previa",  periodo: { ini, fim }, blocos?: ["indicadores", …] }                          → { assunto, html, texto, resumo } — como o e-mail sairia, com os dados de AGORA. Nada é enviado nem registrado.
//   { acao: "teste",   periodo }                                         → manda o e-mail marcado "[TESTE]" SÓ para o e-mail cadastrado de quem pediu (nunca um endereço vindo da chamada). Registra origem "teste".
//   { acao: "enviar",  periodo, destinatarios: ["a@b.com", …] }          → envia UM e-mail para cada destinatário (ninguém vê os outros), registra no histórico (`comunicacao_envios`).
//
// NOMES (modelo Pastor, decisão dela de 27/10/2026): só nos dois blocos nominais, sem nenhum valor; cada prévia, teste e envio com nomes é gravado em `contribuicoes_acessos` ANTES de gerar o e-mail, e se a
// gravação falhar o relatório com nomes NÃO é gerado (o agregado segue normalmente).
// Os NÚMEROS não vêm da chamada: a função os calcula do banco com o MESMO código da tela Doadores (`_shared/contribuicoes/*`). O período é conferido e ajustado ao piso de 01/01/2026.
// Quem chama: sessão válida E papel de admin ou diakonia (o gateway só confere o token, e o token público também é um JWT válido — por isso o papel é conferido aqui dentro).
// Recusa o MESMO envio (período + destinatários) repetido em menos de 10 minutos. Sem a tabela do histórico (migration 20261027180000) envia mesmo assim e avisa que não registrou.
// Implantação: `supabase functions deploy contribuicoes-enviar` (com verificação de JWT, o padrão). Ver docs/CONTRIBUICOES_EMAIL_IMPLANTACAO.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  VERSAO_DOS_CRITERIOS, VINCULOS_DA_BASE, aplicarFiltros, analisarContribuicoes, analisarSemContribuicao, analisarTendencia, idsDaBase, linhasDoCabecalho, resumirBase, resumirPessoas, type ResumoDaBase,
} from "../_shared/contribuicoes/analise.ts";
import { lerBaseDePessoas, lerContribuicoesDoPiso, lerNomesDePessoas } from "../_shared/contribuicoes/carregar.ts";
import { temBlocoNominal } from "../_shared/contribuicoes/blocos.ts";
import { listasNominaisDoEmail, totalDeNomes, type ListasNominais } from "../_shared/contribuicoes/nominal.ts";
import { montarEmailDeContribuicoes } from "../_shared/contribuicoes/email.ts";
import { chaveDoEnvio, validarPedido } from "../_shared/contribuicoes/pedido.ts";
import { aplicarNotaDeResposta, aplicarNotaDeRespostaNoTexto } from "../_shared/email/desenho.ts";
import { lerNomeDaIgreja } from "../_shared/email/identidade.ts";
import { REMETENTE_RELATORIOS, comReplyTo, lerEnderecoDeResposta } from "../_shared/email/remetente.ts";
import { hojeEmBrasilia } from "../_shared/saldos/extratoDasContas.ts";

const REMETENTE = REMETENTE_RELATORIOS;   // relatórios sob demanda saem de `relatorios@`; a resposta vai para o Reply-To da Identidade da Igreja
const MINUTOS_ANTI_DUPLICIDADE = 10;
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

  const corpo = await req.json().catch(() => ({})) as { acao?: string; periodo?: { ini?: string; fim?: string }; destinatarios?: unknown; blocos?: unknown; base?: unknown; categorias?: unknown; ordenacao?: unknown };
  if (corpo.acao !== "previa" && corpo.acao !== "teste" && corpo.acao !== "enviar") return resposta({ erro: "Ação desconhecida." }, 400);

  // quem chama: sessão válida E papel de admin ou diakonia
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sessao = token ? await supabase.auth.getUser(token) : { data: { user: null }, error: new Error("sem sessão") };
  if (sessao.error || !sessao.data.user) return resposta({ erro: "Faça login para visualizar ou enviar o relatório." }, 401);
  const usuario = sessao.data.user;
  const { data: papeis } = await supabase.from("user_roles").select("role").eq("user_id", usuario.id).in("role", ["admin", "diakonia"]);
  if (!papeis || papeis.length === 0) return resposta({ erro: "Só a administração e o pastor titular podem visualizar ou enviar este relatório." }, 403);

  const hoje = hojeEmBrasilia(new Date().toISOString());
  const validado = validarPedido(corpo, hoje, corpo.acao === "enviar");
  if (!validado.ok) return resposta({ erro: validado.erro }, 400);
  const pedido = validado.pedido;

  try {
    const todasAsLinhas = await lerContribuicoesDoPiso(supabase, pedido.periodo.fim);
    // os filtros globais: a base escolhida (só quem está nela conta como contribuinte) e as categorias consideradas
    const pessoasDaBase = await lerBaseDePessoas(supabase);
    const filtrado = aplicarFiltros(todasAsLinhas, { base: pedido.base, categorias: pedido.categorias }, idsDaBase(pessoasDaBase, pedido.base), pedido.periodo);
    const linhas = filtrado.linhas;
    const analise = analisarContribuicoes(linhas, pedido.periodo);
    const { data: nomeDoUsuario } = await supabase.rpc("fin_nome_do_usuario", { p_id: usuario.id });   // para o histórico e o registro de acessos
    const comNomes = temBlocoNominal(pedido.blocos);
    const acaoDoRegistro = corpo.acao === "previa" ? "previa_relatorio" : corpo.acao === "teste" ? "teste_relatorio" : "enviar_relatorio";
    // a lista de pessoas existe só aqui dentro; o e-mail recebe os resumos (números) e, se pedido, as linhas nominais SEM valor
    let nominal: ListasNominais | null = null;
    let semContribuicaoAnalisada: ReturnType<typeof analisarSemContribuicao> | null = null;
    // a base de "sem contribuição" é sempre calculada: o cabeçalho diz quantas pessoas foram consideradas e quantas contribuíram
    semContribuicaoAnalisada = analisarSemContribuicao(linhas, pessoasDaBase, pedido.periodo, { considerar: "qualquer", incluirMenores: false, vinculos: VINCULOS_DA_BASE[pedido.base] });
    if (comNomes && semContribuicaoAnalisada) {
      const nomes = await lerNomesDePessoas(supabase, resumirPessoas(linhas, pedido.periodo).map(r => r.pessoaId));
      nominal = listasNominaisDoEmail(linhas, pedido.periodo, nomes, semContribuicaoAnalisada, pedido.ordenacao);
      // sem registro, sem nomes: grava ANTES de seguir; qualquer falha recusa o relatório com nomes
      const reg = await supabase.from("contribuicoes_acessos").insert({
        por: usuario.id, por_nome: typeof nomeDoUsuario === "string" ? nomeDoUsuario : null, acao: acaoDoRegistro,
        filtros: { ini: pedido.periodo.ini, fim: pedido.periodo.fim, blocos: pedido.blocos, base: pedido.base, categorias: pedido.categorias, ordenacao: pedido.ordenacao }, total: totalDeNomes(nominal),
      });
      if (reg.error) return resposta({ erro: "O registro de acessos não está disponível (migration 20261027200000 pendente): o relatório com nomes não foi gerado. Tire os blocos com nomes para enviar só os números." }, 503);
    }
    // a saúde da base usa a lista de pessoas SÓ para contar: o módulo do e-mail recebe o resumo (números), nunca a lista
    const precisaDaBase = pedido.blocos.includes("saude_da_base") || pedido.blocos.includes("nao_contribuiram");
    const resumoDaBase: ResumoDaBase | null = precisaDaBase && semContribuicaoAnalisada ? resumirBase(semContribuicaoAnalisada) : null;
    const tendencia = pedido.blocos.includes("tendencias") ? analisarTendencia(linhas, pedido.periodo) : null;
    // o cabeçalho de rastreabilidade: período, base, contribuições, pessoas, quando e por quem, versão dos critérios (obrigatório em todo relatório)
    const geradoEm = new Date();
    const geradoEmTexto = geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const cabecalho = linhasDoCabecalho({
      periodo: pedido.periodo, base: pedido.base, categorias: pedido.categorias, pessoasNaBase: semContribuicaoAnalisada ? semContribuicaoAnalisada.base : null,
      contribuiram: semContribuicaoAnalisada ? semContribuicaoAnalisada.contribuiram : null, foraDaBase: filtrado.foraDaBase.pessoas,
      geradoEm: geradoEm.toISOString(), geradoPor: typeof nomeDoUsuario === "string" ? nomeDoUsuario : null, versao: VERSAO_DOS_CRITERIOS,
    }, geradoEmTexto);
    const replyTo = await lerEnderecoDeResposta(supabase);
    const igreja = await lerNomeDaIgreja(supabase);
    const aviso = corpo.acao === "previa" ? "PRÉVIA — nada foi enviado" : corpo.acao === "teste" ? "TESTE — e-mail de teste do relatório de contribuições" : undefined;
    const montado = montarEmailDeContribuicoes(analise, { igreja, aviso, blocos: pedido.blocos, base: resumoDaBase, nominal, cabecalho, tendencia, ordenacao: pedido.ordenacao, baseAnalisada: pedido.base });
    const email = { ...montado, html: aplicarNotaDeResposta(montado.html, replyTo), texto: aplicarNotaDeRespostaNoTexto(montado.texto, replyTo) };
    // o que vai para o histórico: só números agregados
    const resumo = { dizimistas: analise.dizimistas, doadores: analise.doadores, arrecadado: analise.arrecadado, novos: analise.novos, recorrentes: analise.recorrentes?.pessoas ?? null, comNomes, nomes: nominal ? totalDeNomes(nominal) : 0 };
    const informacoes = { periodo: pedido.periodo, ajustadoAoPiso: pedido.periodo.ajustado, blocos: pedido.blocos, base: pedido.base, categorias: pedido.categorias, ordenacao: pedido.ordenacao };

    if (corpo.acao === "previa") return resposta({ ok: true, assunto: email.assunto, html: email.html, texto: email.texto, resumo: email.resumo, ...informacoes });

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return resposta({ erro: "RESEND_API_KEY não configurada — ver Project Settings → Edge Functions → Secrets" }, 500);

    const registrar = async (origem: "sob_demanda" | "teste", destinos: { email: string; ok: boolean; erro: string | null }[], ids: string[]) => {
      const ok = destinos.filter(d => d.ok).length;
      const r = await supabase.from("comunicacao_envios").insert({
        tipo: "relatorio_contribuicoes", origem, solicitante: usuario.id, solicitante_nome: typeof nomeDoUsuario === "string" ? nomeDoUsuario : null,
        remetente: REMETENTE, reply_to: replyTo, assunto: origem === "teste" ? `[TESTE] ${email.assunto}` : email.assunto, destinatarios: destinos,
        parametros: { ini: pedido.periodo.ini, fim: pedido.periodo.fim, blocos: pedido.blocos, base: pedido.base, categorias: pedido.categorias, ordenacao: pedido.ordenacao, versao: VERSAO_DOS_CRITERIOS, chave: chaveDoEnvio(pedido) }, resumo,
        resultado: ok === destinos.length ? "enviado" : ok === 0 ? "falhou" : "parcial", resend_ids: ids,
      });
      return !r.error;
    };
    const enviarUm = async (para: string, assunto: string): Promise<{ ok: boolean; erro: string | null; id: string | null }> => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(comReplyTo({ from: REMETENTE, to: [para], subject: assunto, html: email.html, text: email.texto }, replyTo)),
      });
      if (!r.ok) return { ok: false, erro: (await r.text()).slice(0, 200), id: null };
      const j = await r.json().catch(() => ({})) as { id?: string };
      return { ok: true, erro: null, id: j.id ?? null };
    };

    if (corpo.acao === "teste") {
      const { data: prof } = await supabase.from("profiles").select("pessoa_id").eq("id", usuario.id).maybeSingle();
      const { data: pessoa } = prof?.pessoa_id ? await supabase.from("membros").select("email").eq("id", prof.pessoa_id).maybeSingle() : { data: null };
      const para = (pessoa?.email ?? "").trim();
      if (!para) return resposta({ erro: "A sua ficha não tem e-mail cadastrado — cadastre em Pessoas para receber o teste." }, 400);
      const r = await enviarUm(para, `[TESTE] ${email.assunto}`);
      if (!r.ok) return resposta({ erro: "Falha ao enviar pelo Resend", detalhe: r.erro }, 502);
      const gravou = await registrar("teste", [{ email: para, ok: true, erro: null }], r.id ? [r.id] : []);
      return resposta({ ok: true, enviadoPara: para, historicoGravado: gravou, ...informacoes });
    }

    // enviar: recusa o clique duplo (mesmo período e destinatários nos últimos 10 minutos)
    const desde = new Date(Date.now() - MINUTOS_ANTI_DUPLICIDADE * 60_000).toISOString();
    const recente = await supabase.from("comunicacao_envios").select("id").eq("origem", "sob_demanda").eq("tipo", "relatorio_contribuicoes")
      .eq("parametros->>chave", chaveDoEnvio(pedido)).gte("em", desde).limit(1);
    if (!recente.error && (recente.data ?? []).length > 0) return resposta({ ok: true, enviados: 0, motivo: "enviado_ha_pouco" });

    const resultados: { email: string; ok: boolean; erro: string | null }[] = [];
    const ids: string[] = [];
    for (const para of pedido.destinatarios) {
      const r = await enviarUm(para, email.assunto);
      resultados.push({ email: para, ok: r.ok, erro: r.erro });
      if (r.id) ids.push(r.id);
    }
    const gravou = await registrar("sob_demanda", resultados, ids);
    const enviados = resultados.filter(r => r.ok).length;
    // resposta enxuta: contagens, nunca o conteúdo
    return resposta({ ok: enviados > 0, enviados, falharam: resultados.length - enviados, historicoGravado: gravou, ...informacoes, ...(enviados === 0 ? { erro: "Nenhum e-mail foi enviado." } : {}) }, enviados === 0 ? 502 : 200);
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro ao montar o relatório" }, 500);
  }
});
