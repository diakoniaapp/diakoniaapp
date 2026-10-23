// ─── blocos.ts — de números do digest a texto do e-mail (puro: sem rede, sem Deno) ──────────────────────────────────────────────────────────────
//
// `resumo_semanal_digest()` (SQL) devolve os NÚMEROS; aqui cada bloco do catálogo vira um título, uma frase e, quando ajuda, uma lista curta. Sem lógica de negócio nova: nada é somado aqui.
// Um bloco sempre diz alguma coisa — "Nenhuma conta atrasada." — nunca uma linha muda. Se o banco ainda não foi atualizado e o número do bloco não veio, o bloco diz isso em vez de sumir.

import { avisoDeExtratoDefasado, ehContaDeBanco, hojeEmBrasilia, NOTA_DO_SALDO, situacaoDoExtrato, type ExtratoDaConta } from "../saldos/extratoDasContas.ts";

import { textoCurtoDoReembolso, type ReembolsoParaExibir } from "../reembolsos/apresentacao.ts";
import * as D from "../email/desenho.ts";

/** Quantos reembolsos o bloco semanal lista (o resto vira "+ N outros"). */
const LIMITE_DE_REEMBOLSOS = 10;

export interface ItemDeLista { quem: string; vencimento: string; valor: number }
export interface DigestTesouraria {
  fiscal_atrasados: number; fiscal_urgentes: number; caixas_abertos: number; aprovacoes_pendentes: number; centros_criticos: number;
  // acrescentados pela migration 20261022200000 — ausentes se ela ainda não foi aplicada
  contas_atrasadas?: { n: number; total: number; itens: ItemDeLista[] };
  vencimentos_semana?: { ate: string; n: number; total: number; itens: ItemDeLista[] };
  debitos_automaticos?: { ate: string; previstos_n: number; previstos_total: number; aguardando_n: number; possivel_falha_n: number; possivel_falha_total: number; itens: ItemDeLista[] };
  reembolsos?: { n: number; total: number; /** quem recebe, o que quitou, quanto e a conta prevista — juntado pela Edge Function; ausente se a migration 20261022230000 ainda não foi aplicada */ itens?: ReembolsoParaExibir[] };
  // `ultimo_movimento` e `ultima_conciliacao` são juntados pela Edge Function (resumo_ultimo_extrato_das_contas); ausentes se a migration 20261022220000 ainda não foi aplicada
  saldo_contas?: { total: number; contas: { nome: string; saldo: number; ultimo_movimento?: string | null; ultima_conciliacao?: string | null }[] };
}
export interface Digest {
  pastoral: { aniversarios_semana: number; bodas_semana: number; visitantes_sem_contato: number; candidatos_batismo: number };
  secretaria: { sem_telefone: number; membresia_em_andamento: number; atas_pendentes: number; pautas_rascunho: number };
  tesouraria: DigestTesouraria;
  gerado_em: string;
}

/** `atencao` pede o olho da pessoa; `info` é fila; `ok` é "nada a fazer". Só colore o título. */
export type Tom = "atencao" | "info" | "ok";
export interface BlocoPronto { id: string; titulo: string; frase: string; itens: string[]; tom: Tom }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "R$ 1.234,56" com espaço comum (o Intl põe um espaço de largura fixa que alguns leitores de e-mail mostram torto). */
export const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
/** "2026-10-15" → "15/10" (sem Date: nada de fuso). */
const dataCurta = (ymd: string) => `${String(ymd).slice(8, 10)}/${String(ymd).slice(5, 7)}`;

const linhaDoItem = (i: ItemDeLista) => `${dataCurta(i.vencimento)} · ${i.quem} · ${brl(i.valor)}`;
function itensDaLista(itens: ItemDeLista[] | undefined, total: number): string[] {
  const lista = (itens ?? []).map(linhaDoItem);
  if (total > lista.length) lista.push(`+ ${total - lista.length} ${total - lista.length === 1 ? "outra" : "outras"}`);
  return lista;
}

const bloco = (id: string, titulo: string, frase: string, tom: Tom, itens: string[] = []): BlocoPronto => ({ id, titulo, frase, itens, tom });
const semDado = (id: string, titulo: string): BlocoPronto =>
  bloco(id, titulo, "Ainda sem dado: o banco precisa ser atualizado para este bloco (migration do resumo configurável).", "info");

/** Monta UM bloco. `null` = o código não conhece esse id (ou ainda está "em preparação"): o e-mail o omite. */
export function montarBloco(id: string, d: Digest): BlocoPronto | null {
  const t = d.tesouraria, p = d.pastoral, s = d.secretaria;
  switch (id) {
    // ── Pastoral
    case "aniversariantes": {
      const partes: string[] = [];
      if (p.aniversarios_semana > 0) partes.push(plural(p.aniversarios_semana, "aniversariante", "aniversariantes"));
      if (p.bodas_semana > 0) partes.push(plural(p.bodas_semana, "casal em bodas", "casais em bodas"));
      return partes.length > 0 ? bloco(id, "Aniversariantes", `Esta semana: ${partes.join(" e ")}.`, "info") : bloco(id, "Aniversariantes", "Nenhum aniversariante nem casal em bodas nesta semana.", "ok");
    }
    case "visitantes":
      return p.visitantes_sem_contato > 0
        ? bloco(id, "Visitantes", `${plural(p.visitantes_sem_contato, "visitante", "visitantes")} sem contato há mais de 7 dias.`, "atencao")
        : bloco(id, "Visitantes", "Todos os visitantes ativos foram procurados na última semana.", "ok");
    case "batismo":
      return p.candidatos_batismo > 0
        ? bloco(id, "Batismo", `${plural(p.candidatos_batismo, "candidato ao batismo", "candidatos ao batismo")}.`, "info")
        : bloco(id, "Batismo", "Nenhum candidato ao batismo.", "ok");
    // ── Secretaria
    case "membresias":
      return s.membresia_em_andamento > 0
        ? bloco(id, "Membresias", `${plural(s.membresia_em_andamento, "solicitação de membresia em andamento", "solicitações de membresia em andamento")}.`, "info")
        : bloco(id, "Membresias", "Nenhuma solicitação de membresia em andamento.", "ok");
    case "governanca": {
      const partes: string[] = [];
      if (s.atas_pendentes > 0) partes.push(plural(s.atas_pendentes, "ata pendente", "atas pendentes"));
      if (s.pautas_rascunho > 0) partes.push(plural(s.pautas_rascunho, "pauta em rascunho", "pautas em rascunho"));
      return partes.length > 0 ? bloco(id, "Governança", `${partes.join(" e ")}.`, "atencao") : bloco(id, "Governança", "Atas e pautas em dia.", "ok");
    }
    case "pessoas_sem_telefone":
      return s.sem_telefone > 0
        ? bloco(id, "Pessoas sem telefone", `${plural(s.sem_telefone, "pessoa sem telefone cadastrado", "pessoas sem telefone cadastrado")}.`, "info")
        : bloco(id, "Pessoas sem telefone", "Todo mundo tem telefone cadastrado.", "ok");
    // ── Tesouraria
    case "contas_atrasadas": {
      const c = t.contas_atrasadas; if (!c) return semDado(id, "Contas atrasadas");
      return c.n > 0
        ? bloco(id, "Contas atrasadas", `${plural(c.n, "conta atrasada", "contas atrasadas")}, somando ${brl(c.total)}.`, "atencao", itensDaLista(c.itens, c.n))
        : bloco(id, "Contas atrasadas", "Nenhuma conta atrasada.", "ok");
    }
    case "vencimentos_semana": {
      const v = t.vencimentos_semana; if (!v) return semDado(id, "Vencimentos da semana");
      return v.n > 0
        ? bloco(id, "Vencimentos da semana", `${plural(v.n, "vencimento", "vencimentos")} até sábado (${dataCurta(v.ate)}), somando ${brl(v.total)}.`, "info", itensDaLista(v.itens, v.n))
        : bloco(id, "Vencimentos da semana", `Nada vence até sábado (${dataCurta(v.ate)}).`, "ok");
    }
    case "debitos_automaticos": {
      const a = t.debitos_automaticos; if (!a) return semDado(id, "Débitos automáticos");
      const partes: string[] = [];
      if (a.previstos_n > 0) partes.push(`${plural(a.previstos_n, "débito previsto", "débitos previstos")} até sábado (${brl(a.previstos_total)})`);
      if (a.aguardando_n > 0) partes.push(`${a.aguardando_n} aguardando o banco`);
      if (a.possivel_falha_n > 0) partes.push(`${plural(a.possivel_falha_n, "possível falha", "possíveis falhas")} (${brl(a.possivel_falha_total)}) — conferir o extrato`);
      if (partes.length === 0) return bloco(id, "Débitos automáticos", `Nenhum débito automático previsto até sábado (${dataCurta(a.ate)}).`, "ok");
      return bloco(id, "Débitos automáticos", `${partes.join("; ")}.`, a.possivel_falha_n > 0 ? "atencao" : "info", itensDaLista(a.itens, a.possivel_falha_n));
    }
    case "reembolsos": {
      const r = t.reembolsos; if (!r) return semDado(id, "Reembolsos");
      // quem VAI RECEBER vem primeiro: a dívida da igreja é com o terceiro que pagou, não com o fornecedor (pedido dela, 22/10/2026). `itens` é juntado pela Edge Function (resumo_reembolsos_a_pagar).
      const lista = (r.itens ?? []).slice(0, LIMITE_DE_REEMBOLSOS).map(i => textoCurtoDoReembolso(i, brl));
      const restantes = r.n - lista.length;
      if (lista.length > 0 && restantes > 0) lista.push(`+ ${restantes} ${restantes === 1 ? "outro" : "outros"}`);
      return r.n > 0
        ? bloco(id, "Reembolsos", `${plural(r.n, "reembolso", "reembolsos")} a pagar, somando ${brl(r.total)}.`, "atencao", lista)
        : bloco(id, "Reembolsos", "Nenhum reembolso a pagar.", "ok");
    }
    case "saldo_contas": {
      const sc = t.saldo_contas; if (!sc) return semDado(id, "Saldo das contas");
      // até quando cada saldo de banco reflete o extrato: o saldo do app só acompanha o banco até a última importação conciliada (pedido dela, 22/10/2026)
      const hoje = hojeEmBrasilia(d.gerado_em);
      // `undefined` = a data não veio (migration 20261022220000 ainda não aplicada): não se afirma "sem extrato", só vai a nota geral; `null` = a conta nunca recebeu extrato
      const conhecidas = sc.contas.filter(c => c.ultimo_movimento !== undefined);
      const aviso = avisoDeExtratoDefasado(conhecidas.map(c => ({ nome: c.nome, saldo: c.saldo, ultimo_movimento: c.ultimo_movimento ?? null, ultima_conciliacao: c.ultima_conciliacao ?? null })) as ExtratoDaConta[], hoje);
      const linhas = sc.contas.map(c => {
        const ext = c.ultimo_movimento !== undefined && ehContaDeBanco({ nome: c.nome, ultimo_movimento: c.ultimo_movimento })
          ? situacaoDoExtrato({ ultimo_movimento: c.ultimo_movimento ?? null, ultima_conciliacao: c.ultima_conciliacao ?? null }, hoje) : null;
        return `${c.nome}: ${brl(c.saldo)}${ext ? ` — ${ext.texto}${ext.defasado ? " ⚠" : ""}` : ""}`;
      });
      return bloco(id, "Saldo das contas", `Saldo nas contas: ${brl(sc.total)}${sc.total < 0 ? " — negativo" : ""}.${aviso ? ` ${aviso}` : ""}`, sc.total < 0 || aviso ? "atencao" : "info", [...linhas, NOTA_DO_SALDO]);
    }
    case "centros_orcamento":
      return t.centros_criticos > 0
        ? bloco(id, "Centros acima do orçamento", `${plural(t.centros_criticos, "centro de custo acima do orçamento", "centros de custo acima do orçamento")}.`, "atencao")
        : bloco(id, "Centros acima do orçamento", "Nenhum centro de custo acima do orçamento.", "ok");
    case "fiscal": {
      if (t.fiscal_atrasados > 0) return bloco(id, "Obrigações fiscais", `${plural(t.fiscal_atrasados, "obrigação fiscal atrasada", "obrigações fiscais atrasadas")}.`, "atencao");
      if (t.fiscal_urgentes > 0) return bloco(id, "Obrigações fiscais", `${plural(t.fiscal_urgentes, "obrigação fiscal vencendo em breve", "obrigações fiscais vencendo em breve")}.`, "info");
      return bloco(id, "Obrigações fiscais", "Fiscal em dia.", "ok");
    }
    case "caixas_abertos":
      return t.caixas_abertos > 0
        ? bloco(id, "Caixas abertos", `${plural(t.caixas_abertos, "caixa aberto", "caixas abertos")}.`, "atencao")
        : bloco(id, "Caixas abertos", "Nenhum caixa aberto.", "ok");
    default:
      return null;
  }
}

export function montarBlocos(ids: readonly string[], d: Digest): BlocoPronto[] {
  return ids.map(id => montarBloco(id, d)).filter((b): b is BlocoPronto => b !== null);
}

// ─── o HTML — Design System de E-mails (_shared/email/desenho.ts): o mesmo cabeçalho, cartões e rodapé do e-mail de boas-vindas ─────────────────────────────────────────────────

/** O invólucro é o mesmo de todo e-mail do sistema; `aviso` acrescenta uma faixa no topo (prévia e teste) e `igreja` o nome da Identidade no cabeçalho. */
export function montarHtml(dataGerado: string, blocos: readonly BlocoPronto[], aviso?: string, igreja?: string | null): string {
  const dataFmt = new Date(dataGerado).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const pedemAtencao = blocos.filter(b => b.tom === "atencao").length;
  const corpo = D.saudacao("Resumo da semana")
    + D.paragrafo(`${dataFmt.charAt(0).toLocaleUpperCase("pt-BR")}${dataFmt.slice(1)}. ${pedemAtencao > 0 ? `${plural(pedemAtencao, "ponto pede", "pontos pedem")} a sua atenção.` : "Nada pede a sua atenção agora."}`)
    + blocos.map(b => D.cartaoDeLista({ titulo: b.titulo, frase: b.frase, itens: b.itens, tom: b.tom })).join("")
    + D.botao("https://portal.diakoniaapp.com.br", "Abrir o DiakoniaApp");
  return D.moldura({ assunto: ASSUNTO, igreja, aviso, preheader: pedemAtencao > 0 ? `${plural(pedemAtencao, "ponto pede", "pontos pedem")} a sua atenção` : "Resumo da semana", corpo, versiculo: D.VERSICULO_DOS_RELATORIOS });
}

export const ASSUNTO = "Diakonia — resumo da semana";
