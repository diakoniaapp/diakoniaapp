// ─── pacoteContabil.ts — regras PURAS do Pacote Contábil mensal ──────────
//
// O pacote que o escritório de contabilidade recebe:
//
//   Pacote_Contabil_2026_09/
//     ├── INDICE.csv · PENDENCIAS.csv · ERROS.txt (só se algo falhar)
//     └── {Conta}/{dd-mm-aaaa}/{Fornecedor}_NotaFiscal.pdf, {Fornecedor}_Boleto.pdf, ...
//
// Até 02/10/2026 havia um nível a mais ({Conta}/{dia}/{Fornecedor}/...); ela
// pediu pra tirar — o contador abre Conta → Dia e vê tudo, sem entrar em
// pasta de fornecedor.
//
// Aqui só se decide ONDE cada arquivo vai e O QUE entra no índice. Buscar
// do banco e baixar do storage é `services/pacoteContabilService.ts`.
//
// Regras de entrada decididas por ela em 02/10/2026:
//   · só SAÍDAS precisam de documento (entrada não entra);
//   · o dia da pasta é `data_pagamento`;
//   · saída sem anexo vai pra PENDENCIAS.csv e o ZIP sai mesmo assim.
//
// `data_pagamento` é nula em 5.186 das 5.189 saídas (medido em 02/10/2026) —
// só o diálogo de "confirmar pagamento" a preenche, e a importação do Omie
// não. Nas 3 que têm, é igual a `data`. Então vale `data_pagamento ?? data`:
// em lançamento realizado/conciliado, `data` é a data do movimento. Sem esse
// fallback, 99,9% das saídas ficariam sem pasta.
//
// Mesma exclusão do Malote (`resumoMensal`): status realizado/conciliado e
// nada de perna de transferência.

import {
  FIN_ANEXO_TIPO_LABEL, nomeExtrato,
  type FinAnexoTipo, type FinLancamentoExtenso,
} from "@/services/finService";

/** Nome do arquivo DENTRO da pasta do lançamento, por tipo. */
export const TIPO_NOME_ARQUIVO: Record<FinAnexoTipo, string> = {
  nota_fiscal: "NotaFiscal",
  boleto: "Boleto",
  comprovante: "Comprovante",
  fatura: "Fatura",
  contrato: "Contrato",
  xml: "NotaFiscal-XML",
  outro: "Outro",
  documento: "Documento",
};

export interface AnexoPacote {
  lancamento_id: string;
  tipo: FinAnexoTipo;
  /** Caminho no bucket `fin-comprovantes`. */
  url: string;
  nome: string | null;
  enviado_em?: string;
}

export interface ArquivoPlanejado {
  lancamentoId: string;
  tipo: FinAnexoTipo;
  storagePath: string;
  nomeOriginal: string | null;
  /** Caminho dentro do ZIP, já com a pasta raiz. */
  caminhoZip: string;
}

export interface LinhaIndice {
  conta: string;
  dataPagamento: string;
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: number;
  documentoNumero: string;
  tipo: string;
  /** Caminho no ZIP, sem a raiz; vazio se o lançamento não tem anexo. */
  arquivoNoPacote: string;
  arquivoOriginal: string;
  /** `storagePath` do arquivo, pra marcar falha de download depois. */
  storagePath: string | null;
  semAnexo: boolean;
}

export interface PlanoPacote {
  ano: number;
  mes: number;
  raiz: string;
  totalSaidas: number;
  comAnexo: number;
  arquivos: ArquivoPlanejado[];
  indice: LinhaIndice[];
  pendencias: FinLancamentoExtenso[];
}

// ─── datas ───────────────────────────────────────────────────────────────

/** Dia que conta pro pacote: `data_pagamento`, ou `data` quando vazia. */
export function diaDoPagamento(l: Pick<FinLancamentoExtenso, "data" | "data_pagamento">): string {
  return l.data_pagamento || l.data;
}

/** `2026-09-15` → `15-09-2026` (nome de pasta). */
export function dataPasta(ymd: string): string {
  const [a, m, d] = ymd.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

/** `2026-09-15` → `15/09/2026` (índice). */
export function dataBr(ymd: string): string {
  return dataPasta(ymd).replace(/-/g, "/");
}

export function nomeRaiz(ano: number, mes: number): string {
  return `Pacote_Contabil_${ano}_${String(mes).padStart(2, "0")}`;
}

// ─── nomes ───────────────────────────────────────────────────────────────

/**
 * Nome seguro pra pasta/arquivo no Windows e no macOS: sem `\ / : * ? " < > |`
 * nem controle, sem ponto/espaço no fim (o Windows os descarta e a pasta
 * "some"), e com teto de tamanho (caminho longo estoura o limite de 260 do
 * Windows na hora de extrair). Medido: 18 de 325 fornecedores têm caractere
 * inválido ou mais de 60 caracteres.
 */
export function nomeSeguro(texto: string | null | undefined, max = 50): string {
  const limpo = (texto ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cortado = limpo.length > max ? limpo.slice(0, max).trim() : limpo;
  const semFim = cortado.replace(/[. ]+$/, "");
  return semFim || "Sem nome";
}

function valorBr(v: number): string {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extensao(a: Pick<AnexoPacote, "url" | "nome">): string {
  for (const origem of [a.url, a.nome ?? ""]) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(origem);
    if (m) return m[1].toLowerCase();
  }
  return "bin";
}

/** Devolve `base`, ou `base (2)`, `base (3)`... se já estiver em `usados`
 *  (sem diferenciar maiúscula: o Windows trata `A` e `a` como a mesma pasta,
 *  e o JSZip sobrescreve em silêncio um nome repetido). Registra o escolhido. */
function unico(base: string, usados: Set<string>, sufixoAntesDaExtensao = false): string {
  const ponto = sufixoAntesDaExtensao ? base.lastIndexOf(".") : -1;
  const nome = ponto > 0 ? base.slice(0, ponto) : base;
  const ext = ponto > 0 ? base.slice(ponto) : "";
  let n = 1;
  let candidato = base;
  while (usados.has(candidato.toLowerCase())) {
    n += 1;
    candidato = `${nome} (${n})${ext}`;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// ─── CSV ─────────────────────────────────────────────────────────────────

/**
 * CSV pro Excel em português: separador `;`, vírgula decimal (o chamador já
 * formata o número em texto), BOM UTF-8 pra o Excel não quebrar os acentos,
 * CRLF. Texto que começa com `= + - @` ganha `'` na frente — descrição e
 * nome de fornecedor vêm do Omie e uma célula `=...` seria executada como
 * fórmula ao abrir a planilha.
 */
export function csvPtBr(linhas: string[][]): string {
  const celula = (c: string) => {
    const t = /^[=+\-@\t\r]/.test(c) && !/^-?\d+([.,]\d+)?$/.test(c) ? `'${c}` : c;
    return `"${t.replace(/"/g, '""')}"`;
  };
  return "﻿" + linhas.map(l => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

const CABECALHO_INDICE = [
  "Conta", "Data do pagamento", "Fornecedor", "Descrição", "Categoria",
  "Valor (R$)", "Documento nº", "Tipo do documento", "Arquivo no pacote", "Arquivo original", "Situação",
];

/** `falhas`: `storagePath` dos arquivos que não puderam ser baixados. */
export function indiceCsv(plano: PlanoPacote, falhas: Set<string> = new Set()): string {
  const linhas = plano.indice.map(l => [
    l.conta, l.dataPagamento, l.fornecedor, l.descricao, l.categoria,
    valorBr(l.valor), l.documentoNumero, l.tipo, l.arquivoNoPacote, l.arquivoOriginal,
    l.semAnexo ? "SEM ANEXO" : l.storagePath && falhas.has(l.storagePath) ? "FALHA NO DOWNLOAD" : "Ok",
  ]);
  return csvPtBr([CABECALHO_INDICE, ...linhas]);
}

export function pendenciasCsv(plano: PlanoPacote): string {
  const linhas = plano.pendencias.map(l => [
    l.conta_nome ?? "", dataBr(diaDoPagamento(l)), nomeExtrato(l).principal,
    l.descricao ?? "", l.categoria_nome ?? "", valorBr(l.valor), l.documento_numero ?? "",
  ]);
  return csvPtBr([
    ["Conta", "Data do pagamento", "Fornecedor", "Descrição", "Categoria", "Valor (R$)", "Documento nº"],
    ...linhas,
  ]);
}

// ─── o plano ─────────────────────────────────────────────────────────────

/**
 * Monta o plano a partir das saídas do mês e dos anexos. Não filtra nada:
 * quem chama já entrega só as saídas do período (ver o serviço).
 */
export function planejarPacote(
  ano: number, mes: number,
  saidas: FinLancamentoExtenso[],
  anexos: AnexoPacote[],
): PlanoPacote {
  const raiz = nomeRaiz(ano, mes);

  const anexosPorLanc = new Map<string, AnexoPacote[]>();
  for (const a of anexos) {
    const lista = anexosPorLanc.get(a.lancamento_id) ?? [];
    lista.push(a);
    anexosPorLanc.set(a.lancamento_id, lista);
  }
  for (const lista of anexosPorLanc.values()) {
    lista.sort((x, y) => (x.enviado_em ?? "").localeCompare(y.enviado_em ?? ""));
  }

  // Ordem estável: conta, dia, fornecedor, valor, id. Sem isso o "(2)" cairia
  // em lançamentos diferentes a cada geração e o pacote mudaria de um
  // download pro outro sem que nada tivesse mudado.
  const ordenadas = [...saidas].sort((a, b) =>
    (a.conta_nome ?? "").localeCompare(b.conta_nome ?? "", "pt-BR")
    || diaDoPagamento(a).localeCompare(diaDoPagamento(b))
    || nomeExtrato(a).principal.localeCompare(nomeExtrato(b).principal, "pt-BR")
    || Number(a.valor) - Number(b.valor)
    || a.id.localeCompare(b.id));

  // SEM subpasta de fornecedor (pedido dela, 03/10/2026): o contador abre
  // Conta → Dia e vê todos os documentos do dia de uma vez. O fornecedor passou
  // pro NOME do arquivo (`Ecoprint_NotaFiscal.pdf`). Colisão — mesmo fornecedor
  // mais de uma vez no mesmo dia (medido em setembro/2026: 15 de 90 pares
  // fornecedor+dia) — se resolve em dois degraus:
  //   1. o valor:  `Light_281,46_Fatura.pdf`;
  //   2. se nem o valor desempata (Light, 15/09: R$ 281,46 duas vezes), o início
  //      do ID do lançamento: `Light_281,46_a1b2c3_Fatura.pdf`. O ID é estável —
  //      "(2)" mudaria de dono se um lançamento fosse acrescentado — e o
  //      INDICE.csv liga cada nome ao lançamento.
  // Os grupos contam TODAS as saídas do dia, com ou sem anexo: o nome de um
  // arquivo não pode mudar só porque outro lançamento do dia ganhou documento.
  const NOME_MAX = 40;
  const chaveFornecedorDia = (l: FinLancamentoExtenso) =>
    `${l.conta_nome ?? ""}|${diaDoPagamento(l)}|${nomeSeguro(nomeExtrato(l).principal, NOME_MAX).toLowerCase()}`;
  const valorNome = (l: FinLancamentoExtenso) => Number(l.valor).toFixed(2).replace(".", ",");
  const tamanhoFornecedorDia = new Map<string, number>();
  const tamanhoComValor = new Map<string, number>();
  for (const l of ordenadas) {
    const k = chaveFornecedorDia(l);
    tamanhoFornecedorDia.set(k, (tamanhoFornecedorDia.get(k) ?? 0) + 1);
    tamanhoComValor.set(`${k}|${valorNome(l)}`, (tamanhoComValor.get(`${k}|${valorNome(l)}`) ?? 0) + 1);
  }
  function rotuloDoLancamento(l: FinLancamentoExtenso): string {
    const k = chaveFornecedorDia(l);
    let rotulo = nomeSeguro(nomeExtrato(l).principal, NOME_MAX);
    if ((tamanhoFornecedorDia.get(k) ?? 0) > 1) rotulo += `_${valorNome(l)}`;
    if ((tamanhoComValor.get(`${k}|${valorNome(l)}`) ?? 0) > 1) rotulo += `_${l.id.replace(/-/g, "").slice(0, 6)}`;
    return rotulo;
  }

  const nomesUsadosNoDia = new Map<string, Set<string>>(); // por conta+dia
  const arquivos: ArquivoPlanejado[] = [];
  const indice: LinhaIndice[] = [];
  const pendencias: FinLancamentoExtenso[] = [];
  let comAnexo = 0;

  for (const l of ordenadas) {
    const conta = nomeSeguro(l.conta_nome, 40);
    const dia = diaDoPagamento(l);
    const fornecedor = nomeExtrato(l).principal;
    const rotulo = rotuloDoLancamento(l);

    const chaveDia = `${conta}|${dia}`.toLowerCase();
    const usadosNoDia = nomesUsadosNoDia.get(chaveDia) ?? new Set<string>();
    nomesUsadosNoDia.set(chaveDia, usadosNoDia);

    const base = {
      conta: l.conta_nome ?? "", dataPagamento: dataBr(dia), fornecedor,
      descricao: l.descricao ?? "", categoria: l.categoria_nome ?? "",
      valor: Number(l.valor), documentoNumero: l.documento_numero ?? "",
    };

    const lista = anexosPorLanc.get(l.id) ?? [];
    if (lista.length === 0) {
      pendencias.push(l);
      indice.push({ ...base, tipo: "", arquivoNoPacote: "", arquivoOriginal: "", storagePath: null, semAnexo: true });
      continue;
    }

    comAnexo += 1;
    for (const a of lista) {
      // `unico` é a rede de segurança final: dois anexos do mesmo tipo no
      // mesmo lançamento (`..._NotaFiscal (2).pdf`) e qualquer colisão que os
      // degraus acima não previram — o JSZip sobrescreve nome repetido em silêncio.
      const arquivo = unico(`${rotulo}_${TIPO_NOME_ARQUIVO[a.tipo] ?? "Outro"}.${extensao(a)}`, usadosNoDia, true);
      const relativo = `${conta}/${dataPasta(dia)}/${arquivo}`;
      arquivos.push({
        lancamentoId: l.id, tipo: a.tipo, storagePath: a.url,
        nomeOriginal: a.nome, caminhoZip: `${raiz}/${relativo}`,
      });
      indice.push({
        ...base, tipo: FIN_ANEXO_TIPO_LABEL[a.tipo] ?? a.tipo,
        arquivoNoPacote: relativo, arquivoOriginal: a.nome ?? "", storagePath: a.url, semAnexo: false,
      });
    }
  }

  return {
    ano, mes, raiz, totalSaidas: ordenadas.length, comAnexo,
    arquivos, indice, pendencias,
  };
}
