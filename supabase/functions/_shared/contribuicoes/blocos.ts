// ─── blocos — o que o relatório de contribuições mostra, escolhido antes de enviar (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "escolher o que mostrar no relatório a ser enviado" — blocos independentes que se ligam e desligam, e modelos prontos (Pastor, Diretoria, Tesouraria). Cada bloco aqui é AGREGADO: só números.
// Nome, valor individual, telefone e e-mail NÃO são blocos do e-mail (decisão dela de 27/10/2026: nominal só dentro do sistema, com registro de quem viu): a validação recusa qualquer bloco fora desta lista,
// no servidor também. Se um dia ela autorizar nomes por e-mail, é um bloco novo, de nível "nominal", com confirmação e registro — não uma brecha neste registro.

export const BLOCOS_DE_CONTRIBUICOES = [
  { id: "resumo", titulo: "Resumo em texto", grupo: "Indicadores", descricao: "O parágrafo que abre o relatório" },
  { id: "indicadores", titulo: "Indicadores principais", grupo: "Indicadores", descricao: "Dizimistas, doadores, arrecadado, médias, recorrência, novos, frequência" },
  { id: "categorias", titulo: "Arrecadação por categoria", grupo: "Indicadores", descricao: "Dízimos, ofertas e missões" },
  { id: "curva_adesao", titulo: "Curva de adesão", grupo: "Gráficos", descricao: "Pessoas diferentes que contribuíram em cada semana" },
  { id: "distribuicao_mensal", titulo: "Distribuição mensal", grupo: "Gráficos", descricao: "Valor arrecadado em cada mês" },
  { id: "destaques", titulo: "Semanas de destaque", grupo: "Gráficos", descricao: "Maior adesão, maior arrecadação, maior crescimento" },
  { id: "saude_da_base", titulo: "Saúde da base contribuinte", grupo: "Pastoral", descricao: "Adesão da base, quem não contribuiu (em quantidades) e há quanto tempo" },
  { id: "cobertura", titulo: "Cobertura da identificação", grupo: "Qualidade dos dados", descricao: "Quanto do valor tem pessoa identificada" },
] as const;

export type IdDoBloco = typeof BLOCOS_DE_CONTRIBUICOES[number]["id"];
export const IDS_DOS_BLOCOS: IdDoBloco[] = BLOCOS_DE_CONTRIBUICOES.map(b => b.id);

export type IdDoModelo = "pastor" | "diretoria" | "tesouraria";
export const MODELOS_DE_RELATORIO: { id: IdDoModelo; rotulo: string; descricao: string; blocos: IdDoBloco[] }[] = [
  { id: "pastor", rotulo: "Pastor", descricao: "Visão pastoral: indicadores, adesão da base e quem não contribuiu (só quantidades)", blocos: ["resumo", "indicadores", "saude_da_base", "curva_adesao", "destaques", "cobertura"] },
  { id: "diretoria", rotulo: "Diretoria", descricao: "Visão financeira agregada: indicadores, categorias e evolução mensal", blocos: ["resumo", "indicadores", "categorias", "distribuicao_mensal", "destaques", "cobertura"] },
  { id: "tesouraria", rotulo: "Tesouraria", descricao: "Tudo o que é agregado", blocos: [...IDS_DOS_BLOCOS] },
];

export const modeloPadrao: IdDoModelo = "pastor";
export const blocosDoModelo = (id: IdDoModelo): IdDoBloco[] => [...MODELOS_DE_RELATORIO.find(m => m.id === id)!.blocos];

/** Qual modelo a seleção atual reproduz exatamente, ou `null` (personalizado). */
export function modeloDaSelecao(blocos: IdDoBloco[]): IdDoModelo | null {
  const chave = (l: IdDoBloco[]) => [...l].sort().join("|");
  return MODELOS_DE_RELATORIO.find(m => chave(m.blocos) === chave(blocos))?.id ?? null;
}

export interface ResultadoDosBlocos { ok: boolean; blocos?: IdDoBloco[]; erro?: string }   // sem união discriminada: o TypeScript do projeto não é estrito e não estreitaria por `ok`

/** Confere a lista vinda da chamada: só ids conhecidos, sem repetição, na ordem canônica, ao menos um. Ausente = o modelo padrão (Pastor). */
export function validarBlocos(bruto: unknown): ResultadoDosBlocos {
  if (bruto === undefined || bruto === null) return { ok: true, blocos: blocosDoModelo(modeloPadrao) };
  if (!Array.isArray(bruto)) return { ok: false, erro: "A lista de blocos do relatório é inválida." };
  for (const b of bruto) {
    if (typeof b !== "string" || !(IDS_DOS_BLOCOS as string[]).includes(b)) return { ok: false, erro: `Bloco não permitido no e-mail: ${String(b).slice(0, 40)}. O e-mail leva só números agregados.` };
  }
  const escolhidos = IDS_DOS_BLOCOS.filter(id => (bruto as string[]).includes(id));
  if (escolhidos.length === 0) return { ok: false, erro: "Escolha ao menos um bloco para o relatório." };
  return { ok: true, blocos: escolhidos };
}
