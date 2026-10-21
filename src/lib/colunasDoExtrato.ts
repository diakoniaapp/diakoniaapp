// ─── lib/colunasDoExtrato.ts — quais colunas o Extrato da conta mostra (puro, testado) ──────────────────────────────────────────────────────────────────────
//
// Substitui o par Resumido/Analítico (21/10/2026, "OK PARA TUDO" — Opção A do ⚙ Colunas). O par antigo era dois modos fixos (25 ramificações `modoResumido` na tela): o Resumido
// escondia até o Saldo — justamente o que se espera de um extrato — e Favorecido, Projeto e Documento não eram coluna em nenhum dos dois.
//
// Data, Descrição e Valor são fixas. O resto liga e desliga; dois atalhos (Compacto, Completo) só marcam as caixas.
//   · Compacto = Data · Descrição · Valor · Saldo (o Resumido que ela queria, com o Saldo que faltava).
//   · Completo = todas as colunas.
//   · PADRÃO (nada guardado, tela larga) = o Analítico de sempre — quem já usa a tela continua vendo o que via.
//
// A escolha fica no aparelho (localStorage), e o celular nasce em Compacto. Quem tinha guardado `diakonia-extrato-modo` (resumido/analitico) é migrado, não perde a escolha.

export type ColunaId = "saldo" | "categoria" | "centro" | "favorecido" | "projeto" | "documento" | "detalhe" | "conta";

export interface DefinicaoDeColuna {
  id: ColunaId;
  rotulo: string;
  dica?: string;
  /** só existe no extrato de "Todas as Contas" */
  soTodasContas?: boolean;
}

export const COLUNAS_OPCIONAIS: DefinicaoDeColuna[] = [
  { id: "saldo", rotulo: "Saldo", dica: "O acumulado da conta depois de cada linha" },
  { id: "categoria", rotulo: "Categoria" },
  { id: "centro", rotulo: "Centro de custo" },
  { id: "favorecido", rotulo: "Favorecido", dica: "Em coluna própria; a descrição fica só com o texto digitado" },
  { id: "projeto", rotulo: "Projeto" },
  { id: "documento", rotulo: "Documento", dica: "Número da nota, boleto ou guia" },
  { id: "detalhe", rotulo: "Detalhe da descrição", dica: "2ª linha da descrição e o detalhe de juros, multa e desconto" },
  { id: "conta", rotulo: "Conta", dica: "Qual conta é cada linha", soTodasContas: true },
];

const TODOS: ColunaId[] = COLUNAS_OPCIONAIS.map(c => c.id);

export const COLUNAS_COMPACTO: ColunaId[] = ["saldo"];
export const COLUNAS_COMPLETO: ColunaId[] = TODOS;
export const COLUNAS_PADRAO: ColunaId[] = ["saldo", "categoria", "centro", "detalhe", "conta"];

export type PresetDeColunas = "compacto" | "completo";

export const CHAVE_COLUNAS = "diakonia-extrato-colunas";
const CHAVE_MODO_ANTIGO = "diakonia-extrato-modo";

type Armazem = Pick<Storage, "getItem" | "setItem">;

const ehColuna = (x: unknown): x is ColunaId => typeof x === "string" && (TODOS as string[]).includes(x);

/** O que mostrar ao abrir a tela: o que a pessoa guardou; senão o modo antigo dela; senão Compacto no celular e o padrão de sempre na tela larga. */
export function lerColunas(armazem: Armazem | null, celular: boolean): Set<ColunaId> {
  try {
    const bruto = armazem?.getItem(CHAVE_COLUNAS);
    if (bruto) {
      const lista = JSON.parse(bruto);
      if (Array.isArray(lista)) return new Set(lista.filter(ehColuna));
    }
    const antigo = armazem?.getItem(CHAVE_MODO_ANTIGO);
    if (antigo === "resumido") return new Set(COLUNAS_COMPACTO);
    if (antigo === "analitico") return new Set(COLUNAS_PADRAO);
  } catch { /* armazenamento bloqueado ou texto estragado: cai no padrão */ }
  return new Set(celular ? COLUNAS_COMPACTO : COLUNAS_PADRAO);
}

export function gravarColunas(armazem: Armazem | null, colunas: Set<ColunaId>) {
  try { armazem?.setItem(CHAVE_COLUNAS, JSON.stringify(Array.from(colunas))); } catch { /* privado/bloqueado — vale só nesta visita */ }
}

/** Fora de "Todas as Contas" a coluna Conta não existe — não conta para saber se um atalho casa. */
const semConta = (s: Iterable<ColunaId>, todasContas: boolean) => new Set(Array.from(s).filter(c => todasContas || c !== "conta"));

export function colunasDoPreset(preset: PresetDeColunas): Set<ColunaId> {
  return new Set(preset === "compacto" ? COLUNAS_COMPACTO : COLUNAS_COMPLETO);
}

/** Qual atalho as colunas marcadas formam exatamente (para destacá-lo), ou null quando é uma combinação própria. */
export function presetQueCasa(colunas: Set<ColunaId>, todasContas: boolean): PresetDeColunas | null {
  const atual = semConta(colunas, todasContas);
  for (const p of ["compacto", "completo"] as PresetDeColunas[]) {
    const alvo = semConta(colunasDoPreset(p), todasContas);
    if (alvo.size === atual.size && Array.from(alvo).every(c => atual.has(c))) return p;
  }
  return null;
}

/** Colunas de dados que a tabela desenha (Data, Descrição e Valor sempre estão — contadas à parte). */
export function colunasVisiveis(colunas: Set<ColunaId>, todasContas: boolean): Set<ColunaId> {
  return semConta(colunas, todasContas);
}
