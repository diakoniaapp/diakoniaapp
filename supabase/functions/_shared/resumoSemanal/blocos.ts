// ─── blocos.ts — de números do digest a texto do e-mail (puro: sem rede, sem Deno) ──────────────────────────────────────────────────────────────
//
// `resumo_semanal_digest()` (SQL) devolve os NÚMEROS; aqui cada bloco do catálogo vira um título, uma frase e, quando ajuda, uma lista curta. Sem lógica de negócio nova: nada é somado aqui.
// Um bloco sempre diz alguma coisa — "Nenhuma conta atrasada." — nunca uma linha muda. Se o banco ainda não foi atualizado e o número do bloco não veio, o bloco diz isso em vez de sumir.

export interface ItemDeLista { quem: string; vencimento: string; valor: number }
export interface DigestTesouraria {
  fiscal_atrasados: number; fiscal_urgentes: number; caixas_abertos: number; aprovacoes_pendentes: number; centros_criticos: number;
  // acrescentados pela migration 20261022200000 — ausentes se ela ainda não foi aplicada
  contas_atrasadas?: { n: number; total: number; itens: ItemDeLista[] };
  vencimentos_semana?: { ate: string; n: number; total: number; itens: ItemDeLista[] };
  debitos_automaticos?: { ate: string; previstos_n: number; previstos_total: number; aguardando_n: number; possivel_falha_n: number; possivel_falha_total: number; itens: ItemDeLista[] };
  reembolsos?: { n: number; total: number };
  saldo_contas?: { total: number; contas: { nome: string; saldo: number }[] };
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
      return r.n > 0
        ? bloco(id, "Reembolsos", `${plural(r.n, "reembolso", "reembolsos")} a pagar, somando ${brl(r.total)}.`, "atencao")
        : bloco(id, "Reembolsos", "Nenhum reembolso a pagar.", "ok");
    }
    case "saldo_contas": {
      const sc = t.saldo_contas; if (!sc) return semDado(id, "Saldo das contas");
      return bloco(id, "Saldo das contas", `Saldo nas contas: ${brl(sc.total)}${sc.total < 0 ? " — negativo" : ""}.`, sc.total < 0 ? "atencao" : "info", sc.contas.map(c => `${c.nome}: ${brl(c.saldo)}`));
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

// ─── o HTML ─────────────────────────────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COR_DO_TOM: Record<Tom, string> = { atencao: "#b4472b", info: "#a5741f", ok: "#5f7f4c" };

const blocoHtml = (b: BlocoPronto) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #e4e1d3">
      <p style="margin:0 0 6px;font:600 15px Georgia,serif;color:#211d16"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COR_DO_TOM[b.tom]};margin-right:8px"></span>${esc(b.titulo)}</p>
      <p style="margin:0;font:14px -apple-system,sans-serif;color:#5c5646;line-height:1.5">${esc(b.frase)}</p>${b.itens.length > 0 ? `
      <ul style="margin:8px 0 0;padding-left:18px;font:13px -apple-system,sans-serif;color:#5c5646;line-height:1.6">${b.itens.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
    </td></tr>`;

/** O invólucro é o mesmo de sempre (cabeçalho, blocos, link); `aviso` acrescenta uma faixa no topo (prévia e teste). */
export function montarHtml(dataGerado: string, blocos: readonly BlocoPronto[], aviso?: string): string {
  const dataFmt = new Date(dataGerado).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef0e7;font-family:-apple-system,sans-serif">
    <table style="max-width:560px;margin:0 auto;background:#faf9f5;border-radius:10px;padding:24px 28px">${aviso ? `
      <tr><td style="padding-bottom:12px"><p style="margin:0;padding:8px 10px;border-radius:6px;background:#f3e6c8;font:600 12px -apple-system,sans-serif;color:#6b4b10">${esc(aviso)}</p></td></tr>` : ""}
      <tr><td style="padding-bottom:12px">
        <p style="margin:0;font:600 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a5741f">
          Resumo da semana · Diakonia
        </p>
        <p style="margin:4px 0 0;font:14px -apple-system,sans-serif;color:#8a8371;text-transform:capitalize">
          ${dataFmt}
        </p>
      </td></tr>
      ${blocos.map(blocoHtml).join("")}
      <tr><td style="padding-top:16px">
        <a href="https://portal.diakoniaapp.com.br" style="font:600 13px -apple-system,sans-serif;color:#a5741f;text-decoration:none">
          Abrir o Diakonia →
        </a>
      </td></tr>
    </table>
  </body></html>`;
}

export const ASSUNTO = "Diakonia — resumo da semana";
