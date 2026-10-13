// ─── pacoteContabil.ts — regras PURAS do Pacote Contábil mensal ──────────
//
// O pacote que o escritório de contabilidade recebe:
//
//   Pacote_Contabil_2026_09/
//     ├── INDICE.csv · PENDENCIAS.csv · ERROS.txt (só se algo falhar)
//     └── {Conta}/{dd-mm-aaaa}/01092026_86,13_12345_MUNDIAL.pdf   ← o DOSSIÊ
//                              01092026_86,13_12345_MUNDIAL.xml   ← XML ao lado
//
// DOSSIÊ CONTÁBIL (03/10/2026): cada lançamento vira UM PDF com todos os seus
// documentos (NF + boleto + comprovante…), na ordem documental, com o nome
// `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR`. As regras de ordem e de nome estão em
// `lib/documentos/dossie.ts`; montar o PDF, em `lib/documentos/dossiePdf.ts`.
// Antes disso eram N arquivos por lançamento (`Fornecedor_NotaFiscal.pdf`,
// `Fornecedor_Boleto.pdf`…) e, até 02/10, ainda uma pasta de fornecedor.
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
//
// POLÍTICA DE COMPRAS POR TERCEIROS (Fase 1C-b): duas coisas passam a entrar, SEM mudar o formato do que já existia:
//   · COMPRAS OFERTADAS — a obrigação extinta por oferta (`quitado_terceiro`) não passou pelo banco da igreja, mas é despesa da igreja e o escritório precisa da nota. Entra na
//     pasta "Compras ofertadas", pelo dia da NOTA (não há dia de pagamento), com o selo do grau de prova (Formal ou Relatado) na coluna de observação do índice;
//   · AVISOS DE REEMBOLSO — o reembolso APROVADO e ainda não pago é uma dívida da igreja com a pessoa desde a aprovação. Entra, na pasta "Reembolsos - aviso", pelo dia da nota, só como
//     INFORMAÇÃO (nota, prova do pagamento do terceiro, Pedido de Reembolso e quem aprovou). Quando o reembolso for pago, entra de novo, agora no mês do PAGAMENTO e com o comprovante.
// A coluna de observação só existe no índice quando há alguma dessas linhas: sem quitação por terceiro, o INDICE.csv é byte a byte o de antes.

import {
  FIN_ANEXO_TIPO_LABEL, nomeExtrato,
  type FinAnexoTipo, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  formatoDoArquivo, idCurto, nomeBaseDoDossie, ordenarPartes, tipoPrincipal,
  type FormatoArquivo,
} from "@/lib/documentos/dossie";
import { lerNomeDeArquivo } from "@/lib/documentos/nomeArquivo";

/** Onde uma linha da Política vai no pacote e o que o escritório precisa ler sobre ela. Só as obrigações com quitação por terceiro têm. */
export interface RotuloDoPacote {
  tipo: "ofertada" | "aviso_reembolso";
  /** A pasta (no lugar do nome da conta). */
  pasta: string;
  /** Texto da coluna de observação do índice. */
  observacao: string;
}
export const PASTA_OFERTADAS = "Compras ofertadas";
export const PASTA_AVISOS = "Reembolsos - aviso";

export interface AnexoPacote {
  lancamento_id: string;
  tipo: FinAnexoTipo;
  /** Caminho no bucket `fin-comprovantes`. */
  url: string;
  nome: string | null;
  enviado_em?: string;
}

/** Uma página (ou mais) do dossiê: um anexo em PDF ou imagem. */
export interface ParteDossie {
  tipo: FinAnexoTipo;
  storagePath: string;
  nomeOriginal: string | null;
  formato: Exclude<FormatoArquivo, "xml" | "outro">;
  enviadoEm?: string;
}

/** Arquivo que NÃO entra no merge e vai ao lado do PDF (XML, formato fora do comum). */
export interface ArquivoAoLado {
  tipo: FinAnexoTipo;
  storagePath: string;
  nomeOriginal: string | null;
  /** Caminho dentro do ZIP, já com a pasta raiz. */
  caminhoZip: string;
}

/** O que sai no pacote para UM lançamento: um PDF consolidado + os arquivos ao lado. */
export interface DossiePlanejado {
  lancamentoId: string;
  /** Caminho do PDF no ZIP, com a raiz; `null` se o lançamento só tem XML. */
  caminhoZip: string | null;
  /** Nome-base (com raiz, sem extensão) — o XML usa o mesmo. */
  caminhoBase: string;
  /** Na ORDEM DOCUMENTAL (comprovante por último). */
  partes: ParteDossie[];
  aoLado: ArquivoAoLado[];
}

export interface LinhaIndice {
  conta: string;
  dataPagamento: string;
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: number;
  documentoNumero: string;
  /** "Nota Fiscal + Comprovante de Pagamento", na ordem das páginas. */
  tipo: string;
  /** PDF consolidado, sem a raiz; vazio se o lançamento não tem anexo. */
  arquivoNoPacote: string;
  /** XML(s) ao lado, sem a raiz. */
  arquivosAoLado: string;
  /** Nomes originais, na ordem das páginas, separados por " | ". */
  arquivoOriginal: string;
  lancamentoId: string;
  /** `storagePath` de TODOS os arquivos do lançamento, pra marcar falha depois. */
  storagePaths: string[];
  semAnexo: boolean;
  /** Sem anexo, mas de categoria que não exige (tarifa) — não é pendência. */
  dispensa: boolean;
  /** O que a Política diz desta linha (compra ofertada, aviso de reembolso); vazio nas demais. */
  observacao: string;
}

export interface PlanoPacote {
  ano: number;
  mes: number;
  raiz: string;
  totalSaidas: number;
  /** Saídas com pelo menos um anexo (de qualquer categoria). */
  comAnexo: number;
  /** Saídas sem anexo que dispensam documento (tarifa bancária). Total =
   *  comAnexo + dispensam + pendencias.length — nenhuma é contada duas vezes. */
  dispensam: number;
  /** Quantos nomes a rede final (`unico`) precisou ajustar com "(2)": o que o
   *  identificador do lançamento não resolveu (é raro — não deveria acontecer). */
  nomesAjustados: number;
  /** Quantos nomes ganharam o identificador do lançamento (colisão real: mesma
   *  data, valor, documento e fornecedor) — o desenho, não um defeito. */
  nomesComId: number;
  dossies: DossiePlanejado[];
  /** Arquivos a baixar do armazenamento (partes + ao lado) — a base do progresso. */
  totalArquivos: number;
  totalXml: number;
  indice: LinhaIndice[];
  pendencias: FinLancamentoExtenso[];
  /** Quantas linhas são compras ofertadas e quantas são avisos de reembolso (já contadas em totalSaidas). */
  ofertadas: number;
  avisos: number;
  /** As quitações por terceiro ainda sem resposta (Investigar, A esclarecer, Formalizar, Aprovar/Pagar reembolso): vira o PENDENCIAS_QUITACAO.csv. O serviço preenche; vazia ⇒ o arquivo não entra. */
  quitacoesPendentes: PendenciaDeQuitacao[];
}

// ─── o que NÃO precisa de documento ──────────────────────────────────────

/**
 * Categorias de saída que, por natureza, não têm documento fiscal pra anexar:
 * a tarifa o banco debita sozinho. Medido em 03/10/2026 sobre as 19 saídas que
 * precisaram de ID no nome do arquivo em setembro: 15 eram Tarifas Bancárias
 * (R$ 9,80 do Bradesco repetidas até 10 vezes no mesmo dia) e 4 eram contas de
 * energia; em junho/julho/agosto, 31 de 31 eram tarifas. No arquivo real de
 * agosto (103 PDFs da tesouraria) não há UM arquivo de tarifa, e 33 das 40
 * saídas sem arquivo eram tarifas.
 *
 * Sem esta exceção, 21 saídas de setembro entrariam na lista de "sem documento"
 * pra sempre (a conferência nunca chegaria a zero), e as repetições delas
 * sujariam o nome dos documentos reais (`..._281,46_a1b2c3_...`).
 *
 * A regra é por CATEGORIA, nunca por fornecedor (decisão dela, 03/10/2026) —
 * medido em 2026: o MESMO fornecedor, Banco Bradesco S.A. 237, tem 271
 * lançamentos de "Tarifas Bancárias", 1 de "Título de Capitalização" e 1 sem
 * categoria; os dois últimos PRECISAM de documento, e uma regra por
 * fornecedor os dispensaria por engano.
 *
 * E é por NOME EXATO, não por padrão de texto: existe a categoria "Encargos
 * Trabalhistas" (10 saídas, R$ 42.509 em 2026 — guias de FGTS/INSS, com
 * documento) e uma regra tipo /encargos/ a dispensaria. Das categorias que ela
 * listou, hoje existem "Tarifas Bancárias" (273 saídas em 2026) e "Juros" (0
 * uso); "IOF" e "Encargos Bancários" NÃO existem — ficam na lista porque a
 * regra passa a valer sozinha no dia em que forem criadas. "Multas" existe
 * mas fica de fora de propósito: multa de tributo se paga por guia, que é
 * documento.
 *
 * Por NOME porque não há coluna `exige_documento` em `fin_categorias` (evita
 * migration); quebra se a categoria for renomeada. A saída robusta é essa
 * coluna + um interruptor na tela de categorias — não feita ainda.
 */
const CATEGORIAS_SEM_DOCUMENTO = new Set([
  "tarifas bancarias", "tarifa bancaria", "iof", "juros", "encargos bancarios",
]);

export function dispensaDocumento(l: { categoria_nome?: string | null }): boolean {
  const nome = (l.categoria_nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return CATEGORIAS_SEM_DOCUMENTO.has(nome);
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
  "Valor (R$)", "Documento nº", "Documentos no dossiê", "Páginas", "Arquivo no pacote",
  "XML ao lado", "Arquivos originais", "Situação",
];

/**
 * Uma linha por LANÇAMENTO (o dossiê). `falhas`: `storagePath` dos arquivos que não
 * puderam ser baixados ou mesclados. `paginas`: por lançamento, o mapa de páginas
 * ("Nota Fiscal: 1-2 · Comprovante de Pagamento: 3"), preenchido depois do merge —
 * sem carimbo nas páginas (decisão dela), é ele que diz onde cada documento está.
 */
export function indiceCsv(
  plano: PlanoPacote, falhas: Set<string> = new Set(), paginas: Map<string, string> = new Map(),
): string {
  const comPolitica = plano.indice.some(l => l.observacao);
  const linhas = plano.indice.map(l => [
    l.conta, l.dataPagamento, l.fornecedor, l.descricao, l.categoria,
    valorBr(l.valor), l.documentoNumero, l.tipo, paginas.get(l.lancamentoId) ?? "",
    l.arquivoNoPacote, l.arquivosAoLado, l.arquivoOriginal,
    l.semAnexo ? (l.dispensa ? "Dispensa documento (tarifa)" : "SEM ANEXO")
      : l.storagePaths.some(p => falhas.has(p)) ? "FALHA NO DOWNLOAD" : "Ok",
    ...(comPolitica ? [l.observacao] : []),
  ]);
  return csvPtBr([comPolitica ? [...CABECALHO_INDICE, "Compras por terceiros"] : CABECALHO_INDICE, ...linhas]);
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

// ─── auditoria de anexos ─────────────────────────────────────────────────
//
// A conferência da tela de auditoria usa a MESMA classificação do pacote:
// toda saída cai em exatamente uma de três situações, então
// `total = com + sem + dispensa` sempre fecha.
//   · com      — tem pelo menos um anexo (de qualquer tipo);
//   · dispensa — sem anexo e de categoria que não exige (tarifa bancária);
//   · sem      — sem anexo e exige: é a lista de trabalho antes do ZIP.

export type SituacaoDocumento = "com" | "sem" | "dispensa";

export interface LinhaAuditoria {
  lancamento: FinLancamentoExtenso;
  /** Tipos distintos de anexo que o lançamento tem. */
  tipos: FinAnexoTipo[];
  qtd: number;
  situacao: SituacaoDocumento;
}

export function auditarAnexos(saidas: FinLancamentoExtenso[], anexos: AnexoPacote[]): LinhaAuditoria[] {
  const porLanc = new Map<string, AnexoPacote[]>();
  for (const a of anexos) {
    const lista = porLanc.get(a.lancamento_id) ?? [];
    lista.push(a);
    porLanc.set(a.lancamento_id, lista);
  }
  return saidas.map(l => {
    const lista = porLanc.get(l.id) ?? [];
    const situacao: SituacaoDocumento = lista.length > 0 ? "com" : dispensaDocumento(l) ? "dispensa" : "sem";
    return { lancamento: l, tipos: [...new Set(lista.map(a => a.tipo))], qtd: lista.length, situacao };
  });
}

export interface ResumoAuditoria {
  total: number;
  com: number;
  sem: number;
  dispensa: number;
  /** Quantas saídas têm pelo menos um anexo DE CADA TIPO (uma saída com NF e
   *  boleto conta nos dois — por isso a soma pode passar de `com`). */
  porTipo: Record<FinAnexoTipo, number>;
}

export function resumirAuditoria(linhas: LinhaAuditoria[]): ResumoAuditoria {
  const porTipo = Object.fromEntries(
    (Object.keys(FIN_ANEXO_TIPO_LABEL) as FinAnexoTipo[]).map(t => [t, 0]),
  ) as Record<FinAnexoTipo, number>;
  let com = 0, sem = 0, dispensa = 0;
  for (const l of linhas) {
    if (l.situacao === "com") com += 1;
    else if (l.situacao === "sem") sem += 1;
    else dispensa += 1;
    for (const t of l.tipos) porTipo[t] += 1;
  }
  return { total: linhas.length, com, sem, dispensa, porTipo };
}

// ─── o plano ─────────────────────────────────────────────────────────────

interface PreDossie {
  l: FinLancamentoExtenso;
  /** O número que entrou no nome: `documento_numero` ou o derivado do nome do anexo. */
  numero: string | null;
  conta: string;
  dia: string;
  partes: ParteDossie[];
  aoLado: { tipo: FinAnexoTipo; storagePath: string; nomeOriginal: string | null; formato: FormatoArquivo }[];
  base: string;
}

/**
 * Monta o plano a partir das saídas do mês e dos anexos. Não filtra nada:
 * quem chama já entrega só as saídas do período (ver o serviço).
 *
 * UM dossiê por lançamento com anexo. O número que entra no nome é o
 * `documento_numero` do lançamento; sem ele, o número que o NOME de um dos
 * anexos já traz (`NF215273` → `215273`); sem nenhum, a sigla do tipo.
 */
export function planejarPacote(
  ano: number, mes: number,
  saidas: FinLancamentoExtenso[],
  anexos: AnexoPacote[],
  rotulos: Map<string, RotuloDoPacote> = new Map(),
): PlanoPacote {
  const raiz = nomeRaiz(ano, mes);
  /** A "conta" da pasta e do índice: a da despesa, ou a pasta da Política (compra ofertada, aviso de reembolso). */
  const contaDe = (l: FinLancamentoExtenso) => rotulos.get(l.id)?.pasta ?? l.conta_nome ?? "";
  const observacaoDe = (l: FinLancamentoExtenso) => rotulos.get(l.id)?.observacao ?? "";

  const anexosPorLanc = new Map<string, AnexoPacote[]>();
  for (const a of anexos) {
    const lista = anexosPorLanc.get(a.lancamento_id) ?? [];
    lista.push(a);
    anexosPorLanc.set(a.lancamento_id, lista);
  }

  // Ordem estável: conta, dia, fornecedor, valor, id. Sem isso o "(2)" cairia
  // em lançamentos diferentes a cada geração e o pacote mudaria de um
  // download pro outro sem que nada tivesse mudado.
  const ordenadas = [...saidas].sort((a, b) =>
    contaDe(a).localeCompare(contaDe(b), "pt-BR")
    || diaDoPagamento(a).localeCompare(diaDoPagamento(b))
    || nomeExtrato(a).principal.localeCompare(nomeExtrato(b).principal, "pt-BR")
    || Number(a.valor) - Number(b.valor)
    || a.id.localeCompare(b.id));

  const indice: LinhaIndice[] = [];
  const pendencias: FinLancamentoExtenso[] = [];
  const pre: PreDossie[] = [];
  let comAnexo = 0;
  let dispensam = 0;

  const baseIndice = (l: FinLancamentoExtenso, dia: string) => ({
    conta: contaDe(l), observacao: observacaoDe(l), dataPagamento: dataBr(dia), fornecedor: nomeExtrato(l).principal,
    descricao: l.descricao ?? "", categoria: l.categoria_nome ?? "",
    valor: Number(l.valor), documentoNumero: l.documento_numero ?? "", lancamentoId: l.id,
  });

  // 1ª passada: o que cada lançamento leva e o nome-base do seu dossiê
  for (const l of ordenadas) {
    const conta = nomeSeguro(contaDe(l), 40);
    const dia = diaDoPagamento(l);
    const lista = anexosPorLanc.get(l.id) ?? [];

    if (lista.length === 0) {
      const dispensa = dispensaDocumento(l);
      if (dispensa) dispensam += 1; else pendencias.push(l);
      indice.push({
        ...baseIndice(l, dia), tipo: "", arquivoNoPacote: "", arquivosAoLado: "", arquivoOriginal: "",
        storagePaths: [], semAnexo: true, dispensa,
      });
      continue;
    }

    comAnexo += 1;
    const partes: ParteDossie[] = [];
    const aoLado: PreDossie["aoLado"] = [];
    for (const a of lista) {
      const formato = formatoDoArquivo(a);
      if (formato === "pdf" || formato === "jpg" || formato === "png") {
        partes.push({ tipo: a.tipo, storagePath: a.url, nomeOriginal: a.nome, formato, enviadoEm: a.enviado_em });
      } else {
        // XML (e qualquer formato que não dê pra virar página) vai ao lado, intacto
        aoLado.push({ tipo: a.tipo, storagePath: a.url, nomeOriginal: a.nome, formato });
      }
    }

    const numero = l.documento_numero
      || lista.map(a => (a.nome ? lerNomeDeArquivo(a.nome).nf : null)).find(Boolean)
      || null;
    const partesOrdenadas = ordenarPartes(partes);
    // o tipo principal considera só o que vira página; só XML → nota fiscal
    const principal = tipoPrincipal(partesOrdenadas.map(p => p.tipo));
    pre.push({
      l, numero, conta, dia, partes: partesOrdenadas, aoLado,
      base: nomeBaseDoDossie({ dia, valor: Number(l.valor), numero, principal, fornecedor: nomeExtrato(l).principal, raiz, conta }),
    });
  }

  // Colisão: mesma conta + dia + nome-base (= mesma data, valor, documento e
  // fornecedor). Só nesse caso entra o identificador do lançamento, em TODOS os do
  // grupo — assim o nome de um não muda conforme o outro foi ou não anexado.
  const tamanhoDoGrupo = new Map<string, number>();
  const chave = (p: PreDossie) => `${p.conta}|${p.dia}|${p.base}`.toLowerCase();
  for (const p of pre) tamanhoDoGrupo.set(chave(p), (tamanhoDoGrupo.get(chave(p)) ?? 0) + 1);

  const dossies: DossiePlanejado[] = [];
  const usadosNoDia = new Map<string, Set<string>>(); // por conta+dia, sem diferenciar maiúscula
  let nomesAjustados = 0;
  let nomesComId = 0;
  let totalArquivos = 0;
  let totalXml = 0;

  for (const p of pre) {
    const comId = (tamanhoDoGrupo.get(chave(p)) ?? 0) > 1;
    if (comId) nomesComId += 1;
    const desejado = comId ? `${p.base}_${idCurto(p.l.id)}` : p.base;
    const pasta = `${p.conta}/${dataPasta(p.dia)}`;
    const usados = usadosNoDia.get(`${p.conta}|${p.dia}`.toLowerCase()) ?? new Set<string>();
    usadosNoDia.set(`${p.conta}|${p.dia}`.toLowerCase(), usados);

    // Rede final: dois lançamentos que nem o ID separou (não deveria ocorrer) não
    // podem se sobrescrever — o JSZip troca um pelo outro em silêncio.
    const nomeBase = unico(desejado, usados);
    if (nomeBase !== desejado) nomesAjustados += 1;
    const caminhoBase = `${raiz}/${pasta}/${nomeBase}`;

    const aoLado: ArquivoAoLado[] = [];
    const usadosAoLado = new Set<string>();
    for (const x of p.aoLado) {
      const ext = x.formato === "xml" ? "xml" : extensao({ url: x.storagePath, nome: x.nomeOriginal });
      const nomeArq = unico(`${nomeBase}.${ext}`, usadosAoLado, true);
      aoLado.push({ tipo: x.tipo, storagePath: x.storagePath, nomeOriginal: x.nomeOriginal, caminhoZip: `${raiz}/${pasta}/${nomeArq}` });
    }
    totalXml += aoLado.filter(a => /\.xml$/i.test(a.caminhoZip)).length;
    totalArquivos += p.partes.length + aoLado.length;

    dossies.push({
      lancamentoId: p.l.id,
      caminhoZip: p.partes.length > 0 ? `${caminhoBase}.pdf` : null,
      caminhoBase,
      partes: p.partes,
      aoLado,
    });

    const todas = [...p.partes.map(x => x.storagePath), ...aoLado.map(x => x.storagePath)];
    indice.push({
      ...baseIndice(p.l, p.dia),
      documentoNumero: p.numero ?? "",
      tipo: [...new Set(p.partes.map(x => FIN_ANEXO_TIPO_LABEL[x.tipo] ?? x.tipo))].join(" + ")
        || aoLado.map(x => FIN_ANEXO_TIPO_LABEL[x.tipo] ?? x.tipo).join(" + "),
      arquivoNoPacote: p.partes.length > 0 ? `${pasta}/${nomeBase}.pdf` : "",
      arquivosAoLado: aoLado.map(x => x.caminhoZip.slice(raiz.length + 1)).join(" | "),
      arquivoOriginal: [...p.partes, ...aoLado].map(x => x.nomeOriginal ?? "").filter(Boolean).join(" | "),
      storagePaths: todas, semAnexo: false, dispensa: false,
    });
  }

  // O índice sai na mesma ordem das saídas (as sem anexo foram empilhadas na 1ª
  // passada, as com anexo na 2ª): reordena pelo critério do plano.
  const posicao = new Map(ordenadas.map((l, i) => [l.id, i]));
  indice.sort((a, b) => (posicao.get(a.lancamentoId) ?? 0) - (posicao.get(b.lancamentoId) ?? 0));

  return {
    ano, mes, raiz, totalSaidas: ordenadas.length, comAnexo, dispensam,
    nomesAjustados, nomesComId, dossies, totalArquivos, totalXml, indice, pendencias,
    ofertadas: ordenadas.filter(l => rotulos.get(l.id)?.tipo === "ofertada").length,
    avisos: ordenadas.filter(l => rotulos.get(l.id)?.tipo === "aviso_reembolso").length,
    quitacoesPendentes: [],
  };
}

// ─── a Política no pacote (Fase 1C-b) ────────────────────────────────────

/** O que o índice precisa saber de uma quitação por terceiro. Vem de vw_fin_quitacao; nada aqui é calculado de novo. */
export interface QuitacaoParaOPacote {
  responsavelNome: string | null;
  intencao: "reembolso" | "oferta" | "compensacao_adiantamento" | "nao_declarada" | "nao_se_aplica";
  /** formal | relatado | nenhum */
  grauConjunto: string;
  valorDaObrigacao: number;
  saldoAReembolsar: number | null;
  /** quem aprovou o reembolso e quando (do histórico); vazio se não houve */
  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
}

const GRAU_TEXTO: Record<string, string> = { formal: "prova Formal", relatado: "prova Relatada", nenhum: "sem prova" };

/** Texto da coluna de observação de uma COMPRA OFERTADA. */
export function observacaoDeOferta(q: QuitacaoParaOPacote): string {
  return `Compra ofertada por ${q.responsavelNome ?? "terceiro"} (${GRAU_TEXTO[q.grauConjunto] ?? q.grauConjunto}): obrigação extinta sem pagamento da igreja; não saiu dinheiro do banco nem do caixa.`;
}

/** Texto da coluna de observação de um AVISO DE REEMBOLSO. Informativo: o pagamento entra no mês em que for feito. */
export function observacaoDeAvisoDeReembolso(q: QuitacaoParaOPacote): string {
  const quem = q.responsavelNome ?? "terceiro";
  const aprovou = q.aprovadoPor ? ` Aprovado por ${q.aprovadoPor}${q.aprovadoEm ? ` em ${dataBr(q.aprovadoEm)}` : ""}.` : "";
  return `AVISO — reembolso a pagar: ${quem} pagou esta nota; a igreja deve ${valorBr(q.saldoAReembolsar ?? q.valorDaObrigacao)}.${aprovou} Informativo: ainda não houve pagamento; ele entra no mês em que for feito, com o comprovante.`;
}

/** Uma linha da lista de quitações pendentes (PENDENCIAS_QUITACAO.csv). */
export interface PendenciaDeQuitacao {
  fila: "investigar" | "a_esclarecer" | "formalizar" | "aprovar_reembolso" | "reembolso_a_pagar";
  emitente: string;
  descricao: string;
  quem: string;
  intencao: string;
  valor: number;
  /** dias desde a data da nota */
  idadeEmDias: number;
  dataDaNota: string;
}

const ROTULO_FILA_PACOTE: Record<PendenciaDeQuitacao["fila"], string> = {
  investigar: "Investigar (quem pagou?)", a_esclarecer: "A esclarecer (qual a intenção?)", formalizar: "Formalizar (falta o documento assinado)",
  aprovar_reembolso: "Aprovar reembolso", reembolso_a_pagar: "Reembolso a pagar",
};

/** A lista que o escritório lê para saber o que ainda está sem resposta. Vazia ⇒ o arquivo nem entra no ZIP. */
export function pendenciasDeQuitacaoCsv(itens: PendenciaDeQuitacao[]): string {
  return csvPtBr([
    ["Fila", "Data da nota", "Dias desde a nota", "Emitente", "Descrição", "Quem pagou", "Intenção", "Valor (R$)"],
    ...itens.map(i => [ROTULO_FILA_PACOTE[i.fila], dataBr(i.dataDaNota), String(i.idadeEmDias), i.emitente, i.descricao, i.quem, i.intencao, valorBr(i.valor)]),
  ]);
}
