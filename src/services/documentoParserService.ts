// ============================================================
// documentoParserService.ts — Parser sem IA para documentos
// institucionais (Estatuto + Regimento).
//
// Entrada:  texto extraído (string)
// Saída:    array hierárquico de itens reconhecidos
//
// REGRAS RECONHECIDAS (regex):
//   • "MINISTÉRIO DE <Nome>"  → tipo:"ministerio"
//   • "Área de <Nome>" / "ÁREA DE <Nome>"  → tipo:"area" (filho do último ministério)
//   • "Setor de <Nome>" → tipo:"setor" (filho da última área)
//   • "Art. N" / "Artigo N" → guarda como `artigo` no item seguinte
//   • Cargos: Presidente, Vice-Presidente, Secretário, Tesoureiro,
//     Pastor Presidente, Diretor, Conselheiro → tipo:"cargo"
//
// Modular: cada padrão é uma função pequena; fácil de testar.
// Pronto para integrar com SyncEstruturaModal (output compatível com
// ItemEstruturaPreview se necessário).
// ============================================================

// ── Tipos públicos ─────────────────────────────────────────────────────────

export type ItemParsed =
  | {
      tipo: "ministerio";
      nome: string;
      artigo?: string;
      areas: string[];
      base_institucional?: string;
    }
  | {
      tipo: "area";
      nome: string;
      parent_ministerio?: string;
      artigo?: string;
      base_institucional?: string;
    }
  | {
      tipo: "setor";
      nome: string;
      parent_area?: string;
      artigo?: string;
      base_institucional?: string;
    }
  | {
      tipo: "cargo";
      nome: string;
      nivel: "diretoria" | "conselho" | "ministerial" | string;
      artigo?: string;
      base_institucional?: string;
    };

export interface ResultadoParse {
  itens: ItemParsed[];
  estatisticas: {
    ministerios: number;
    areas: number;
    setores: number;
    cargos: number;
    artigos_encontrados: number;
  };
  ignoradas: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza espaços e remove caracteres invisíveis. */
function limpar(s: string): string {
  return s
    .replace(/[ ​-‍﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case respeitando preposições. */
function titleCase(s: string): string {
  const minusc = new Set(["de", "do", "da", "dos", "das", "e", "a", "o"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && minusc.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

// ── Padrões (regex) ────────────────────────────────────────────────────────

// "MINISTÉRIO DE LOUVOR", "Ministério de Música" etc.
// Captura tudo depois de "Ministério de" até quebra de linha ou ponto.
const RX_MINISTERIO = /MINIST[ÉE]RIO\s+(?:DE|DA|DO|DOS|DAS)\s+([A-ZÀ-Ú][\wÀ-ú\s\-]{2,80}?)(?=[.;,\n:]|$)/gim;

// "Área de Comunicação", "ÁREA DE ENSINO" etc.
const RX_AREA = /[ÁA]REA\s+(?:DE|DA|DO)\s+([A-ZÀ-Ú][\wÀ-ú\s\-]{2,80}?)(?=[.;,\n:]|$)/gim;

// "Setor de X" — variação adicional do Regimento
const RX_SETOR = /SETOR\s+(?:DE|DA|DO)\s+([A-ZÀ-Ú][\wÀ-ú\s\-]{2,80}?)(?=[.;,\n:]|$)/gim;

// "Art. 23", "Artigo 5º", "Art. 14 §1º"
const RX_ARTIGO = /\bArt(?:igo)?\.?\s*(\d+[º°]?)/i;

// Cargos comuns — lista controlada (pode crescer)
const CARGOS = [
  { pattern: /\bPastor\s+Presidente\b/i,     nome: "Pastor Presidente", nivel: "diretoria" as const },
  { pattern: /\bVice-?Presidente\b/i,        nome: "Vice-Presidente",   nivel: "diretoria" as const },
  { pattern: /\bPresidente\b/i,              nome: "Presidente",         nivel: "diretoria" as const },
  { pattern: /\b(?:Primeiro|1º)\s+Secret[áa]rio\b/i, nome: "1º Secretário", nivel: "diretoria" as const },
  { pattern: /\b(?:Segundo|2º)\s+Secret[áa]rio\b/i,  nome: "2º Secretário", nivel: "diretoria" as const },
  { pattern: /\bSecret[áa]rio\b/i,           nome: "Secretário",         nivel: "diretoria" as const },
  { pattern: /\b(?:Primeiro|1º)\s+Tesoureiro\b/i, nome: "1º Tesoureiro", nivel: "diretoria" as const },
  { pattern: /\b(?:Segundo|2º)\s+Tesoureiro\b/i,  nome: "2º Tesoureiro", nivel: "diretoria" as const },
  { pattern: /\bTesoureiro\b/i,              nome: "Tesoureiro",         nivel: "diretoria" as const },
  { pattern: /\bConselh(?:eiro|al)\b/i,      nome: "Conselheiro",        nivel: "conselho" as const },
  { pattern: /\bDiretor(?:a)?\b/i,           nome: "Diretor",            nivel: "ministerial" as const },
];

// ── Função principal ───────────────────────────────────────────────────────

/**
 * Parseia o texto de um documento institucional e retorna a estrutura
 * hierárquica detectada. Idempotente, não consulta banco.
 *
 * @param texto         texto bruto extraído (PDF/DOCX)
 * @param documentoTitulo  título do documento (para base_institucional)
 */
export function parsearTextoDocumento(
  texto: string,
  documentoTitulo?: string
): ResultadoParse {
  const itens: ItemParsed[] = [];
  let ministerios = 0;
  let areas = 0;
  let setores = 0;
  let cargos = 0;
  let artigosEncontrados = 0;
  let ignoradas = 0;

  if (!texto || !texto.trim()) {
    return {
      itens,
      estatisticas: { ministerios, areas, setores, cargos, artigos_encontrados: 0 },
      ignoradas,
    };
  }

  const t = limpar(texto);

  // Quebra em "blocos" separados por ponto-e-vírgula ou parágrafo,
  // para que cada padrão possa olhar contexto próximo (artigo + cargo).
  const blocos = t.split(/(?<=[.;])\s+|\n+/g).filter((b) => b.length > 5);

  let ultimoMinisterio: string | undefined;
  let ultimaArea: string | undefined;
  // Conjunto para deduplicar nomes idênticos dentro do mesmo parse.
  const vistosMinisterios = new Set<string>();
  const vistosAreas = new Set<string>();
  const vistosSetores = new Set<string>();
  const vistosCargos = new Set<string>();

  for (const bloco of blocos) {
    const artigo = RX_ARTIGO.exec(bloco)?.[1];
    if (artigo) artigosEncontrados++;

    // 1) Ministérios
    let m: RegExpExecArray | null;
    RX_MINISTERIO.lastIndex = 0;
    while ((m = RX_MINISTERIO.exec(bloco)) !== null) {
      const nome = titleCase(limpar(m[1]));
      if (vistosMinisterios.has(nome)) continue;
      vistosMinisterios.add(nome);
      itens.push({
        tipo: "ministerio",
        nome: "Ministério de " + nome,
        artigo,
        areas: [],
        base_institucional: documentoTitulo,
      });
      ministerios++;
      ultimoMinisterio = "Ministério de " + nome;
      ultimaArea = undefined;
    }

    // 2) Áreas (vinculadas ao último ministério)
    RX_AREA.lastIndex = 0;
    while ((m = RX_AREA.exec(bloco)) !== null) {
      const nome = titleCase(limpar(m[1]));
      const key = (ultimoMinisterio ?? "") + "|" + nome;
      if (vistosAreas.has(key)) continue;
      vistosAreas.add(key);
      itens.push({
        tipo: "area",
        nome: "Área de " + nome,
        parent_ministerio: ultimoMinisterio,
        artigo,
        base_institucional: documentoTitulo,
      });
      areas++;
      // Anexa também ao ministério pai (se houver) para fácil visualização.
      if (ultimoMinisterio) {
        const min = itens.find(
          (i) => i.tipo === "ministerio" && i.nome === ultimoMinisterio
        );
        if (min && min.tipo === "ministerio") min.areas.push("Área de " + nome);
      }
      ultimaArea = "Área de " + nome;
    }

    // 3) Setores
    RX_SETOR.lastIndex = 0;
    while ((m = RX_SETOR.exec(bloco)) !== null) {
      const nome = titleCase(limpar(m[1]));
      const key = (ultimaArea ?? "") + "|" + nome;
      if (vistosSetores.has(key)) continue;
      vistosSetores.add(key);
      itens.push({
        tipo: "setor",
        nome: "Setor de " + nome,
        parent_area: ultimaArea,
        artigo,
        base_institucional: documentoTitulo,
      });
      setores++;
    }

    // 4) Cargos (lista controlada — preferimos precisão a recall)
    for (const c of CARGOS) {
      if (c.pattern.test(bloco) && !vistosCargos.has(c.nome)) {
        vistosCargos.add(c.nome);
        itens.push({
          tipo: "cargo",
          nome: c.nome,
          nivel: c.nivel,
          artigo,
          base_institucional: documentoTitulo,
        });
        cargos++;
      }
    }
  }

  if (itens.length === 0) ignoradas = blocos.length;

  return {
    itens,
    estatisticas: {
      ministerios,
      areas,
      setores,
      cargos,
      artigos_encontrados: artigosEncontrados,
    },
    ignoradas,
  };
}

// ── Adaptador para SyncEstruturaModal ──────────────────────────────────────

/**
 * Converte ItemParsed → payload compatível com `documento_estrutura`.
 * O SyncEstruturaModal pode receber este payload pronto.
 */
export function parseToEstruturaPayload(
  item: ItemParsed,
  ordem: number,
  igrejaId: string
) {
  const nivelMap: Record<ItemParsed["tipo"], string> = {
    ministerio: "ministerial",
    area: "area",
    setor: "setor",
    cargo: "institucional",
  };

  return {
    tipo: item.tipo,
    nivel: nivelMap[item.tipo],
    nome: item.nome,
    descricao: null,
    responsabilidades: null,
    base_institucional: item.base_institucional ?? "",
    referencia_documento:
      (item.base_institucional ?? "") +
      (item.artigo ? " — Art. " + item.artigo : ""),
    ordem,
    ativo: true,
    igreja_id: igrejaId,
  };
}
