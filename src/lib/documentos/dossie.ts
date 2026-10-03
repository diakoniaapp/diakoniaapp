// ─── lib/documentos/dossie.ts — regras PURAS do Dossiê Contábil ─────────────
//
// Cada lançamento do Pacote Contábil vira UM PDF consolidado (mais o XML ao lado).
// Decisões dela, 03/10/2026 (docs/DOSSIE_CONTABIL.md §8):
//
//   · nome  `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR`  (valor obrigatório);
//   · ordem das páginas por LÓGICA DOCUMENTAL, não por ordem de upload:
//     Nota Fiscal · RPA · RPS · DPS · Fatura · Boleto · Contrato · Outro ·
//     Comprovante de Pagamento (o comprovante SEMPRE por último);
//   · XML fica separado, com o mesmo nome-base, e não entra no merge;
//   · colisão (mesma data + valor + documento + fornecedor): acrescenta o
//     identificador do lançamento (`..._7A44CF`);
//   · nome muito grande: trunca só o fornecedor/funcionário — data, valor e
//     documento nunca se perdem.
//
// Aqui não há PDF nem rede: só decide ordem e nome. Montar o PDF é `dossiePdf.ts`.

import type { FinAnexoTipo } from "@/services/finService";

// ── ordem documental ────────────────────────────────────────────────────────

export const ORDEM_DOCUMENTAL: FinAnexoTipo[] = [
  "nota_fiscal", "rpa", "rps", "dps", "fatura", "boleto", "contrato", "outro", "comprovante",
];

/** Posição na ordem documental. `documento` (tipo antigo) e qualquer tipo
 *  desconhecido contam como "outro"; o XML nunca entra (fica ao lado). */
export function posicaoDocumental(tipo: FinAnexoTipo): number {
  const t: FinAnexoTipo = tipo === "documento" ? "outro" : tipo;
  const i = ORDEM_DOCUMENTAL.indexOf(t);
  return i < 0 ? ORDEM_DOCUMENTAL.indexOf("outro") : i;
}

/** Ordena as partes de um dossiê: ordem documental; dentro do mesmo tipo, a ordem
 *  em que foram enviadas (`enviadoEm` ASC); por último o caminho, pra ser estável. */
export function ordenarPartes<T extends { tipo: FinAnexoTipo; enviadoEm?: string; storagePath: string }>(partes: T[]): T[] {
  return [...partes].sort((a, b) =>
    posicaoDocumental(a.tipo) - posicaoDocumental(b.tipo)
    || (a.enviadoEm ?? "").localeCompare(b.enviadoEm ?? "")
    || a.storagePath.localeCompare(b.storagePath));
}

// ── formato do arquivo ──────────────────────────────────────────────────────

export type FormatoArquivo = "pdf" | "jpg" | "png" | "xml" | "outro";

export function formatoDoArquivo(a: { url: string; nome?: string | null }): FormatoArquivo {
  for (const origem of [a.url, a.nome ?? ""]) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(origem);
    if (!m) continue;
    const e = m[1].toLowerCase();
    if (e === "pdf") return "pdf";
    if (e === "jpg" || e === "jpeg") return "jpg";
    if (e === "png") return "png";
    if (e === "xml") return "xml";
    return "outro";
  }
  return "outro";
}

// ── pedaços do nome ─────────────────────────────────────────────────────────

/** `Ana Patrícia da Silva` → `ANA_PATRICIA_DA_SILVA`: sem acento, sem caractere
 *  especial/barra/aspas/inválido no Windows, espaço vira `_`, tudo em maiúsculas. */
export function normalizarParaNome(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

/** O fornecedor como o Omie o grava às vezes traz o CNPJ-base na frente
 *  (`59.407.727 Marco Antonio …`); no nome do arquivo isso só atrapalha. */
export function limparFornecedor(nome: string | null | undefined): string {
  return (nome ?? "").replace(/^\s*\d{2}\.\d{3}\.\d{3}\s+/, "");
}

/** `DDMMAAAA` a partir de `AAAA-MM-DD`. */
export function ddmmaaaa(ymd: string): string {
  const [a, m, d] = ymd.slice(0, 10).split("-");
  return `${d}${m}${a}`;
}

/** Valor do lançamento no nome: sem moeda e SEM milhar, vírgula decimal
 *  (`12548,92`). Estorno (negativo) usa o valor absoluto — um `-` solto no começo
 *  do nome atrapalha a ordenação e confunde. */
export function valorNoNome(valor: number): string {
  return Math.abs(Number(valor)).toFixed(2).replace(".", ",");
}

/**
 * A sigla do tipo usada no nome quando o lançamento NÃO tem número de documento.
 *
 * ATENÇÃO — `rps`: ela escreveu "RPS" nos exemplos de nome e "RSP" ao corrigir o
 * significado ("Recibo de Sustento Pastoral"). A chave do banco e do sistema é
 * `rps`; a sigla no ARQUIVO é esta constante — uma linha pra trocar quando ela
 * decidir (pergunta em aberto em docs/DOSSIE_CONTABIL.md §8).
 */
export const SIGLA_NO_NOME: Record<FinAnexoTipo, string> = {
  nota_fiscal: "NF",
  boleto: "BOLETO",
  comprovante: "COMPROVANTE",
  fatura: "FATURA",
  contrato: "CONTRATO",
  xml: "NF",
  rpa: "RPA",
  rps: "RPS",
  dps: "DPS",
  outro: "DOCUMENTO",
  documento: "DOCUMENTO",
};

/** Com número, estes tipos mantêm a sigla depois dele (`456_RPS_…`); os demais
 *  levam só o número (`12345_MUNDIAL`). Visto nos exemplos dela, 03/10/2026. */
const SIGLA_DEPOIS_DO_NUMERO = new Set<FinAnexoTipo>(["rpa", "rps", "dps"]);

/** Número do documento pronto pra nome: só letras e números, no máximo 20. */
export function numeroNoNome(numero: string | null | undefined): string {
  return normalizarParaNome(numero).slice(0, 20).replace(/_+$/, "");
}

/** O tipo "principal" do dossiê: o primeiro, na ordem documental, que não seja
 *  comprovante; só havendo comprovante, ele mesmo. Sem nenhuma parte em PDF/imagem
 *  (só XML), conta como nota fiscal. */
export function tipoPrincipal(tipos: FinAnexoTipo[]): FinAnexoTipo {
  if (tipos.length === 0) return "nota_fiscal";
  const ord = [...tipos].sort((a, b) => posicaoDocumental(a) - posicaoDocumental(b));
  return ord.find(t => t !== "comprovante") ?? "comprovante";
}

export function documentoNoNome(numero: string | null | undefined, principal: FinAnexoTipo): string {
  const n = numeroNoNome(numero);
  if (!n) return SIGLA_NO_NOME[principal];
  return SIGLA_DEPOIS_DO_NUMERO.has(principal) ? `${n}_${SIGLA_NO_NOME[principal]}` : n;
}

// ── truncamento inteligente do fornecedor ───────────────────────────────────

const CONECTIVOS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

/**
 * Encurta o nome (já normalizado) até `max` caracteres, em três degraus:
 *   1. tira os conectivos (DE, DA, DO, DAS, DOS, E);
 *   2. tira os nomes do meio, mantendo o PRIMEIRO e o ÚLTIMO (quem lê reconhece
 *      `ANA_..._OLIVEIRA`) e quantos do meio ainda couberem;
 *   3. corte seco, sem deixar `_` pendurado.
 * Quem cabe não é mexido: `ANA_PATRICIA_DA_SILVA_DE_LIMA_DE_OLIVEIRA` sai inteiro.
 */
export function truncarFornecedor(nomeNormalizado: string, max: number): string {
  const limite = Math.max(1, max);
  if (nomeNormalizado.length <= limite) return nomeNormalizado;
  let t = nomeNormalizado.split("_");
  const semConectivos = t.filter(x => !CONECTIVOS.has(x));
  if (semConectivos.length > 0) t = semConectivos;
  let s = t.join("_");
  if (s.length <= limite) return s;
  if (t.length > 2) {
    const primeiro = t[0];
    const ultimo = t[t.length - 1];
    const acc = [primeiro];
    for (const meio of t.slice(1, -1)) {
      if ([...acc, meio, ultimo].join("_").length <= limite) acc.push(meio); else break;
    }
    s = [...acc, ultimo].join("_");
    if (s.length <= limite) return s;
  }
  return s.slice(0, limite).replace(/_+$/, "");
}

// ── o nome ──────────────────────────────────────────────────────────────────

/**
 * Limite do caminho RELATIVO dentro do pacote. O Windows corta em 260 caracteres
 * no total; 60 ficam de reserva para onde o contador extrai (`C:\Users\x\Downloads\`
 * e a pasta que o "Extrair tudo" cria com o nome do ZIP, repetindo a raiz).
 */
export const LIMITE_CAMINHO_RELATIVO = 200;
/** Reserva no fim do nome: extensão + `_ID6` (7) + ` (2)` (4). */
const RESERVA_FIM = 15;
const FORNECEDOR_MINIMO = 8;

export interface EntradaNome {
  /** `AAAA-MM-DD` do pagamento. */
  dia: string;
  valor: number;
  numero?: string | null;
  principal: FinAnexoTipo;
  fornecedor: string | null | undefined;
  /** Nomes dos níveis acima, para calcular quanto sobra de caminho. */
  raiz: string;
  conta: string;
}

/** O nome-base (sem extensão, sem identificador de colisão). */
export function nomeBaseDoDossie(e: EntradaNome): string {
  const prefixo = `${ddmmaaaa(e.dia)}_${valorNoNome(e.valor)}_${documentoNoNome(e.numero, e.principal)}`;
  // `raiz/conta/dd-mm-aaaa/` + nome
  const usado = e.raiz.length + 1 + e.conta.length + 1 + 10 + 1;
  const sobra = LIMITE_CAMINHO_RELATIVO - usado - (prefixo.length + 1) - RESERVA_FIM;
  const fornecedor = truncarFornecedor(
    normalizarParaNome(limparFornecedor(e.fornecedor)) || "SEM_FORNECEDOR",
    Math.max(FORNECEDOR_MINIMO, sobra),
  );
  return `${prefixo}_${fornecedor}`;
}

/** Identificador do lançamento para desempatar colisão: 6 primeiros do ID, maiúsculo. */
export function idCurto(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
