// ─── documentacaoDaObrigacao — TODOS os documentos de uma obrigação, em quatro blocos ───────────────────────────────────────────────────────────────────────
// Pedido de 20/10/2026 (Extrato de Obrigações): o tesoureiro abre UM painel e confere a NF, a declaração e o comprovante, e decide — sem sair do extrato.
//   1. DOCUMENTOS DA OBRIGAÇÃO — o que justifica a despesa: nota fiscal, fatura, boleto, guias (DARF, FGTS, INSS, ISS…), XML, contrato, recibos de folha;
//   2. DOCUMENTOS DA QUITAÇÃO  — o que prova QUEM pagou e por quê: declaração do terceiro, pedido de reembolso, prova do pagamento do terceiro;
//   3. COMPROVANTES            — o que prova que o dinheiro SAIU (Pix, TED, transferência, comprovante bancário);
//   4. VÍNCULOS                — a linha do extrato (OFX ou PDF bancário), a liquidação e a conciliação.
// Regras puras sobre o que `carregarDetalhesDaDespesa` já devolve (sem banco, sem React). Nada aqui inventa dado: o que não existe vira "não há", e a lista de ausências só repete fatos
// ("não há Declaração do Terceiro anexada") — a decisão de aceitar ou não continua sendo da Tesouraria e da Política de Quitação.
import { ehAnexoDaQuitacao } from "@/lib/quitacao";
import { origemDoAnexo, type ParcelaDoGrupo } from "@/lib/grupoDaObrigacao";
import { FIN_ANEXO_TIPO_DICA, FIN_ANEXO_TIPO_LABEL, type FinAnexoTipo } from "@/services/finService";
import type { DetalhesDaDespesa } from "@/services/cicloDaDespesaService";

export interface ItemDeDocumento {
  id: string;
  tipo: string;
  rotulo: string;
  nome: string | null;
  /** caminho no bucket (para gerar o link de abertura) */
  url: string;
  enviadoEm: string;
  /** "da obrigação" / "da parcela de 08/10" — de qual linha do grupo veio (nada quando é da própria) */
  origem: string | null;
}

export interface GrupoDeDocumentos { tipo: string; rotulo: string; dica: string | null; itens: ItemDeDocumento[] }

export interface LinhaDeVinculo {
  rotulo: string;
  texto: string;
  /** "ativo": vale hoje · "historico": já foi desfeito, fica de memória · "aviso": falta algo para fechar o ciclo */
  tom: "ativo" | "historico" | "aviso";
}

export interface DocumentacaoAgrupada {
  documentos: GrupoDeDocumentos[];
  quitacao: {
    existe: boolean;
    resumo: string | null;
    itens: ItemDeDocumento[];
    /** fatos, não regras: o que NÃO está anexado — a Política de Quitação (Matriz) é quem diz o que cada caso exige; uma oferta simples, por exemplo, não precisa da prova do pagamento */
    ausencias: string[];
  };
  comprovantes: { itens: ItemDeDocumento[]; comprovanteAntigo: string | null; forma: string | null };
  vinculos: LinhaDeVinculo[];
  total: number;
}

/** A ordem em que a Tesouraria quer ler os documentos da obrigação. */
export const ORDEM_DOS_DOCUMENTOS: FinAnexoTipo[] = ["nota_fiscal", "fatura", "boleto", "guia", "xml", "contrato", "rpa", "rsp", "dps", "outro", "documento"];
const ORDEM_DA_QUITACAO: FinAnexoTipo[] = ["declaracao_terceiro", "pedido_reembolso", "prova_pagamento_terceiro", "prova_cancelamento"];

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function agruparDocumentacao(d: DetalhesDaDespesa, atualId: string, forma?: string | null): DocumentacaoAgrupada {
  const parcelas: ParcelaDoGrupo[] = d.parcelas;
  const item = (a: DetalhesDaDespesa["anexos"][number]): ItemDeDocumento => ({
    id: a.id, tipo: a.tipo, rotulo: FIN_ANEXO_TIPO_LABEL[a.tipo] ?? String(a.tipo), nome: a.nome, url: a.url, enviadoEm: a.enviado_em,
    origem: origemDoAnexo(a.lancamento_id, atualId, parcelas),
  });
  const ordenar = (tipos: FinAnexoTipo[]) => (x: ItemDeDocumento, y: ItemDeDocumento) =>
    (tipos.indexOf(x.tipo as FinAnexoTipo) + 1 || 99) - (tipos.indexOf(y.tipo as FinAnexoTipo) + 1 || 99) || y.enviadoEm.localeCompare(x.enviadoEm);

  const todos = d.anexos.map(item);
  const doComprovante = todos.filter(i => i.tipo === "comprovante");
  const daQuitacao = todos.filter(i => ehAnexoDaQuitacao(i.tipo) || i.tipo === "prova_cancelamento").sort(ordenar(ORDEM_DA_QUITACAO));
  const daObrigacao = todos.filter(i => i.tipo !== "comprovante" && !ehAnexoDaQuitacao(i.tipo) && i.tipo !== "prova_cancelamento").sort(ordenar(ORDEM_DOS_DOCUMENTOS));

  // por tipo, na ordem pedida (só os tipos que existem — o que falta aparece como ausência, não como bloco vazio)
  const documentos: GrupoDeDocumentos[] = [];
  for (const i of daObrigacao) {
    const g = documentos.find(x => x.tipo === i.tipo);
    if (g) g.itens.push(i); else documentos.push({ tipo: i.tipo, rotulo: i.rotulo, dica: FIN_ANEXO_TIPO_DICA[i.tipo as FinAnexoTipo] ?? null, itens: [i] });
  }

  // QUITAÇÃO
  const q = d.quitacao;
  const ausencias: string[] = [];
  if (q) {
    const tem = (...tipos: string[]) => daQuitacao.some(i => tipos.includes(i.tipo));
    if (!tem("declaracao_terceiro", "pedido_reembolso")) ausencias.push(q.intencao === "reembolso" ? "Pedido de Reembolso / Declaração do Terceiro: não anexados." : "Declaração do Terceiro: não anexada.");
    if (!tem("prova_pagamento_terceiro")) ausencias.push("Prova do pagamento do terceiro (cupom, fatura do cartão, Pix/TED): não anexada.");
    if (!documentos.some(g => ["nota_fiscal", "fatura"].includes(g.tipo))) ausencias.push("Nota Fiscal da obrigação: não anexada.");
  }
  const resumo = q
    ? `Quitação registrada${q.responsavelNome ? ` por ${q.responsavelNome}` : ""} · intenção: ${q.intencao === "reembolso" ? "reembolso" : q.intencao === "oferta" ? "oferta" : q.intencao === "compensacao_adiantamento" ? "compensação de adiantamento" : "não declarada"}`
      + (q.saldoAReembolsar !== null && q.saldoAReembolsar !== undefined && q.intencao === "reembolso" ? ` · saldo a reembolsar ${brl(q.saldoAReembolsar)}` : "")
    : null;

  // VÍNCULOS
  const vinculos: LinhaDeVinculo[] = [];
  const ativos = d.vinculos.filter(v => v.ativo);
  if (d.ofx && ativos.length === 0) vinculos.push({ rotulo: d.ofx.startsWith("PDF:") ? "Extrato em PDF" : "Extrato OFX", texto: d.ofx, tom: "ativo" });
  for (const v of ativos) vinculos.push({ rotulo: v.origem === "pdf" ? "Extrato em PDF" : "Extrato OFX", texto: `${v.fitid} · vinculado em ${dataBr(v.vinculadoEm)}${v.daLinha ? "" : " (a outra parcela da obrigação)"}`, tom: "ativo" });
  for (const v of d.vinculos.filter(x => !x.ativo)) vinculos.push({ rotulo: `Vínculo anterior (${v.origem === "pdf" ? "PDF" : "OFX"})`, texto: `${v.fitid} · de ${dataBr(v.vinculadoEm)}, desfeito em ${dataBr(v.desfeitoEm)}${v.desfeitoMotivo ? ` — ${v.desfeitoMotivo}` : ""}`, tom: "historico" });
  if (d.liquidacao) vinculos.push({ rotulo: "Liquidação", texto: `${dataBr(d.liquidacao.data_pagamento)} · ${brl(d.liquidacao.valor_total)} saiu do banco`, tom: "ativo" });
  const conferencia = d.ciclo?.conferencia;
  if (d.conferidoPor) vinculos.push({ rotulo: "Conciliação", texto: `Conferida${d.conferidoPor.nome ? ` por ${d.conferidoPor.nome}` : ""} em ${dataBr(d.conferidoPor.em)}${d.conferidoPor.nota ? ` — ${d.conferidoPor.nota}` : ""}`, tom: "ativo" });
  else if (conferencia === "historico") vinculos.push({ rotulo: "Conciliação", texto: "Conferida (histórico) — anterior ao extrato, sem vínculo com o banco.", tom: "historico" });
  else if (conferencia === "manual") vinculos.push({ rotulo: "Conciliação", texto: "Conferida à mão — sem vínculo com o banco.", tom: "ativo" });
  else if (ativos.length > 0 || d.ofx) vinculos.push({ rotulo: "Conciliação", texto: "Conciliada pelo vínculo com a linha do banco.", tom: "ativo" });
  else if (d.ciclo && ["aguardando_conciliacao"].includes(d.ciclo.estado)) vinculos.push({ rotulo: "Conciliação", texto: "Aguardando conciliação: ainda não há linha do banco vinculada.", tom: "aviso" });

  const total = daObrigacao.length + daQuitacao.length + doComprovante.length + (d.comprovanteAntigo && doComprovante.length === 0 ? 1 : 0);
  return {
    documentos,
    quitacao: { existe: !!q, resumo, itens: daQuitacao, ausencias },
    comprovantes: { itens: doComprovante, comprovanteAntigo: doComprovante.length === 0 ? d.comprovanteAntigo : null, forma: forma ?? null },
    vinculos,
    total,
  };
}
