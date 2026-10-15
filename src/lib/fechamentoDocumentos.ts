// ─── fechamentoDocumentos.ts — os DOCUMENTOS DO FECHAMENTO: o que se manda à contabilidade e não é despesa, obrigação nem fornecedor ───────────────────────────────────────
//
// Pedido dela (15/10/2026). Extratos bancários, OFX, faturas de cartão, relatórios Cielo e Rede, aplicações, rendimentos e outros documentos do mês pertencem ao FECHAMENTO DO MÊS,
// não a um lançamento. Aqui só mora a regra PURA (tipos, checklist, validação do arquivo, nomes e pastas); o banco e o storage estão em
// `services/fechamentoDocumentosService.ts`; a tabela e o bucket, na migration 20261016150000.
//
// O CHECKLIST tem quatro itens: extrato bancário, OFX, cartão e adquirente. Item sem arquivo é ATENÇÃO, não bloqueio: a decisão de 02/10/2026 continua valendo (o malote sai mesmo com pendência).
// Um item que não se aplica ao mês (nenhum cartão usado, por exemplo) é DISPENSADO com motivo, para o checklist poder fechar: a dispensa fica registrada (quem, quando, por quê).
// Aplicações, rendimentos e "outros" entram no malote mas não têm item no checklist: não há como saber se o mês deveria ter.

import { csvPtBr } from "@/lib/pacoteContabil";

export type TipoDeDocumento = "extrato_bancario" | "ofx" | "fatura_cartao" | "adquirente_cielo" | "adquirente_rede" | "aplicacao" | "rendimento" | "outro";
export type GrupoDoChecklist = "extrato" | "ofx" | "cartao" | "adquirente";

export const BUCKET_DOCUMENTOS_DO_FECHAMENTO = "fin-fechamento-docs";
/** Tamanho máximo de um arquivo (o mesmo limite do bucket: 25 MB). */
export const TAMANHO_MAXIMO_BYTES = 26_214_400;
export const EXTENSOES_ACEITAS = ["pdf", "jpg", "jpeg", "png", "ofx", "qfx", "csv", "xls", "xlsx", "txt", "xml", "zip"] as const;

export interface InfoDoTipo {
  tipo: TipoDeDocumento;
  rotulo: string;
  /** A pasta do tipo DENTRO do pacote — e, na fase futura, dentro do `Fechamento_AAAA_MM.zip`. */
  pasta: string;
  /** O item do checklist que este tipo atende; `null` = entra no malote, mas não tem item. */
  grupo: GrupoDoChecklist | null;
}

export const TIPOS_DE_DOCUMENTO: InfoDoTipo[] = [
  { tipo: "extrato_bancario", rotulo: "Extrato bancário", pasta: "Extratos bancários", grupo: "extrato" },
  { tipo: "ofx", rotulo: "OFX", pasta: "OFX", grupo: "ofx" },
  { tipo: "fatura_cartao", rotulo: "Fatura de cartão", pasta: "Cartões", grupo: "cartao" },
  { tipo: "adquirente_cielo", rotulo: "Relatório Cielo", pasta: "Adquirentes/Cielo", grupo: "adquirente" },
  { tipo: "adquirente_rede", rotulo: "Relatório Rede", pasta: "Adquirentes/Rede", grupo: "adquirente" },
  { tipo: "aplicacao", rotulo: "Aplicação financeira", pasta: "Aplicações", grupo: null },
  { tipo: "rendimento", rotulo: "Rendimentos", pasta: "Rendimentos", grupo: null },
  { tipo: "outro", rotulo: "Outro documento do mês", pasta: "Outros", grupo: null },
];
const POR_TIPO = new Map(TIPOS_DE_DOCUMENTO.map(t => [t.tipo, t]));
export const infoDoTipo = (t: TipoDeDocumento): InfoDoTipo => POR_TIPO.get(t) ?? POR_TIPO.get("outro")!;
export const rotuloDoTipo = (t: TipoDeDocumento): string => infoDoTipo(t).rotulo;

// ── o checklist ───────────────────────────────────────────────────────────────────────────────────

export const GRUPOS_DO_CHECKLIST: { grupo: GrupoDoChecklist; rotulo: string; aceita: string }[] = [
  { grupo: "extrato", rotulo: "Extrato bancário anexado", aceita: "Extrato bancário" },
  { grupo: "ofx", rotulo: "OFX anexado", aceita: "OFX" },
  { grupo: "cartao", rotulo: "Cartão anexado", aceita: "Fatura de cartão" },
  { grupo: "adquirente", rotulo: "Adquirente anexado", aceita: "Relatório Cielo ou Rede" },
];

/** O que o checklist precisa saber de um documento (só os ativos, não removidos). */
export interface DocumentoParaChecklist { tipo: TipoDeDocumento; removidoEm?: string | null }
export interface DispensaParaChecklist { grupo: GrupoDoChecklist; desfeitaEm?: string | null; motivo?: string }

export type EstadoDoItem = "anexado" | "dispensado" | "faltando";
export interface ItemDoChecklistDeDocumentos {
  grupo: GrupoDoChecklist;
  rotulo: string;
  estado: EstadoDoItem;
  /** Quantos arquivos ativos atendem o item. */
  arquivos: number;
  motivoDaDispensa: string | null;
}

export function checklistDeDocumentos(docs: DocumentoParaChecklist[], dispensas: DispensaParaChecklist[]): ItemDoChecklistDeDocumentos[] {
  const ativos = docs.filter(d => !d.removidoEm);
  const dispensasAtivas = dispensas.filter(d => !d.desfeitaEm);
  return GRUPOS_DO_CHECKLIST.map(g => {
    const arquivos = ativos.filter(d => infoDoTipo(d.tipo).grupo === g.grupo).length;
    const dispensa = dispensasAtivas.find(d => d.grupo === g.grupo);
    // anexar vale mais que dispensar: se o arquivo chegou depois da dispensa, o item está atendido de verdade
    const estado: EstadoDoItem = arquivos > 0 ? "anexado" : dispensa ? "dispensado" : "faltando";
    return { grupo: g.grupo, rotulo: g.rotulo, estado, arquivos, motivoDaDispensa: estado === "dispensado" ? dispensa?.motivo ?? null : null };
  });
}

export interface ResumoDoChecklist { total: number; atendidos: number; faltando: number; completo: boolean }
export function resumoDoChecklist(itens: ItemDoChecklistDeDocumentos[]): ResumoDoChecklist {
  const faltando = itens.filter(i => i.estado === "faltando").length;
  return { total: itens.length, atendidos: itens.length - faltando, faltando, completo: faltando === 0 };
}

// ── o arquivo ─────────────────────────────────────────────────────────────────────────────────────

export const extensaoDe = (nome: string): string => /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim())?.[1].toLowerCase() ?? "";

/** O que impede de anexar este arquivo, em palavras; `null` = pode. */
export function problemaDoArquivo(arq: { name: string; size: number }): string | null {
  const ext = extensaoDe(arq.name);
  if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) return `Formato não aceito (${ext ? "." + ext : "sem extensão"}). Use ${EXTENSOES_ACEITAS.map(e => "." + e).join(", ")}.`;
  if (arq.size <= 0) return "O arquivo está vazio.";
  if (arq.size > TAMANHO_MAXIMO_BYTES) return `O arquivo passa de ${Math.round(TAMANHO_MAXIMO_BYTES / 1_048_576)} MB.`;
  return null;
}

/** Sugere o tipo pelo nome do arquivo (a pessoa confirma): economiza um clique no caso comum. */
export function sugerirTipo(nome: string): TipoDeDocumento | null {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const ext = extensaoDe(n);
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (/cielo/.test(n)) return "adquirente_cielo";
  if (/\brede\b|_rede|rede_|-rede|rede-/.test(n)) return "adquirente_rede";
  if (/fatura|cartao/.test(n)) return "fatura_cartao";
  if (/rendiment/.test(n)) return "rendimento";
  if (/aplicac|invest/.test(n)) return "aplicacao";
  if (/extrato/.test(n)) return "extrato_bancario";
  return null;
}

/** O nome do arquivo, sem acento nem caractere que o storage não aceite. */
export function nomeSeguro(nome: string): string {
  const ext = extensaoDe(nome);
  const base = ext ? nome.trim().slice(0, -(ext.length + 1)) : nome.trim();
  const limpo = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 80) || "documento";
  return ext ? `${limpo}.${ext}` : limpo;
}

/** O caminho no bucket: o mês, um id único e o nome seguro (nunca colide, nunca sobrescreve). */
export function caminhoNoStorage(ano: number, mes: number, id: string, nomeOriginal: string): string {
  return `${ano}-${String(mes).padStart(2, "0")}/${id}-${nomeSeguro(nomeOriginal)}`;
}

// ── a estrutura do pacote (e do ZIP do fechamento, na fase futura) ─────────────────────────────────

export const PASTA_DOCUMENTOS_DO_FECHAMENTO = "Documentos do fechamento";

/** O caminho de um documento DENTRO do pacote contábil (`<raiz>/Documentos do fechamento/<pasta do tipo>/<arquivo>`); `usados` evita dois arquivos com o mesmo nome na mesma pasta. */
export function caminhoNoPacote(raiz: string, doc: { tipo: TipoDeDocumento; arquivoNome: string }, usados: Set<string>): string {
  const pasta = `${raiz}/${PASTA_DOCUMENTOS_DO_FECHAMENTO}/${infoDoTipo(doc.tipo).pasta}`;
  const nome = nomeSeguro(doc.arquivoNome);
  const ext = extensaoDe(nome);
  const base = ext ? nome.slice(0, -(ext.length + 1)) : nome;
  let candidato = `${pasta}/${nome}`;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${pasta}/${base}_${n}${ext ? "." + ext : ""}`;
  usados.add(candidato.toLowerCase());
  return candidato;
}

/**
 * FASE FUTURA — `Fechamento_AAAA_MM.zip`: a estrutura já está decidida, para o gerador futuro só montar o ZIP.
 *   Fechamento_2026_09/
 *     Malote/                (o pacote contábil de hoje, inteiro)
 *     Extratos bancários/ · OFX/ · Cartões/ · Adquirentes/Cielo/ · Adquirentes/Rede/ · Aplicações/ · Rendimentos/ · Outros/
 *     INDICE_DOCUMENTOS.csv
 * Hoje os mesmos documentos vão DENTRO do pacote, em "Documentos do fechamento/<pasta do tipo>", com as mesmas pastas.
 */
export function estruturaDoFechamentoZip(ano: number, mes: number): { raiz: string; arquivoZip: string; malote: string; pastas: Record<TipoDeDocumento, string>; indice: string } {
  const raiz = `Fechamento_${ano}_${String(mes).padStart(2, "0")}`;
  return {
    raiz, arquivoZip: `${raiz}.zip`, malote: `${raiz}/Malote`,
    pastas: Object.fromEntries(TIPOS_DE_DOCUMENTO.map(t => [t.tipo, `${raiz}/${t.pasta}`])) as Record<TipoDeDocumento, string>,
    indice: `${raiz}/INDICE_DOCUMENTOS.csv`,
  };
}

// ── o índice dos documentos (CSV do malote) ───────────────────────────────────────────────────────

/** O que o pacote precisa de cada documento do mês (o serviço preenche; o nome da conta já vem resolvido). */
export interface DocumentoDoPacote {
  id: string; tipo: TipoDeDocumento; arquivoNome: string; storagePath: string; descricao: string | null; contaNome: string | null; tamanhoBytes: number;
  incluidoEm: string; incluidoPorNome: string | null;
}

export interface LinhaDoIndice {
  tipo: TipoDeDocumento; arquivoNome: string; caminho: string; descricao: string | null; contaNome: string | null; tamanhoBytes: number;
  incluidoEm: string; incluidoPorNome: string | null;
}
export function indiceDosDocumentosCsv(linhas: LinhaDoIndice[], dataHoraBr: (iso: string) => string): string {
  const cab = ["Tipo", "Arquivo", "Caminho no pacote", "Descrição", "Conta", "Tamanho (KB)", "Incluído em", "Incluído por"];
  return csvPtBr([cab, ...linhas.map(l => [rotuloDoTipo(l.tipo), l.arquivoNome, l.caminho, l.descricao ?? "", l.contaNome ?? "", (l.tamanhoBytes / 1024).toFixed(1).replace(".", ","), dataHoraBr(l.incluidoEm), l.incluidoPorNome ?? ""])]);
}
