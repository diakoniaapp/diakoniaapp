// ─── blocos — o que o relatório de contribuições mostra, escolhido antes de enviar (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "escolher o que mostrar no relatório a ser enviado" — blocos independentes que se ligam e desligam, e modelos prontos (Pastor, Diretoria, Tesouraria).
// Dois níveis: AGREGADO (só números) e NOMINAL (nomes). Decisão dela (27/10/2026, 2ª rodada): o padrão de TODO modelo é só agregado — o Pastor também —; os dois blocos nominais abaixo existem como OPÇÃO
// ("Incluir lista nominal"), desligada, com aviso e registro de quem viu/enviou. Nome, última contribuição, quantidade e situação; nunca valor individual, média individual, total contribuído, telefone ou e-mail.
// São os ÚNICOS blocos que levam nomes; a validação recusa qualquer outro id, no servidor também. Valor individual não é bloco de e-mail: não existe como pedir.

export const BLOCOS_DE_CONTRIBUICOES = [
  { id: "resumo", titulo: "Resumo em texto", grupo: "Indicadores", descricao: "O parágrafo que abre o relatório" },
  { id: "indicadores", titulo: "Indicadores principais", grupo: "Indicadores", descricao: "Dizimistas, doadores, arrecadado, médias, recorrência, novos, frequência" },
  { id: "categorias", titulo: "Arrecadação por categoria", grupo: "Indicadores", descricao: "Dízimos, ofertas e missões" },
  { id: "saude_da_base", titulo: "Saúde da base contribuinte", grupo: "Pastoral", descricao: "Membros ativos, contribuíram, sem contribuição registrada, adesão, novos e recorrentes" },
  { id: "nao_contribuiram", titulo: "Não contribuíram no período", grupo: "Pastoral", descricao: "Sem contribuição no período e sem registro anterior, contribuíram antes e não agora, e há quanto tempo (30/60/90/180 dias)" },
  { id: "tendencias", titulo: "Tendências", grupo: "Gráficos", descricao: "Comparação com o período anterior ou direção da série" },
  { id: "curva_adesao", titulo: "Curva de adesão", grupo: "Gráficos", descricao: "Pessoas diferentes que contribuíram em cada semana" },
  { id: "distribuicao_mensal", titulo: "Distribuição mensal", grupo: "Gráficos", descricao: "Valor arrecadado em cada mês" },
  { id: "destaques", titulo: "Semanas de destaque", grupo: "Gráficos", descricao: "Maior adesão, maior arrecadação, maior crescimento" },
  { id: "criterios", titulo: "Critérios da análise", grupo: "Qualidade dos dados", descricao: "As definições usadas: piso, contribuição, dizimista, recorrente, novo, base" },
  { id: "cobertura", titulo: "Cobertura da identificação", grupo: "Qualidade dos dados", descricao: "Quanto do valor tem pessoa identificada" },
  { id: "contribuintes_nominal", titulo: "Quem contribuiu — com nomes", grupo: "Com nomes", descricao: "Nome, última contribuição, quantidade de contribuições e situação (recorrente, novo). Sem valores." },
  { id: "sem_contribuicao_nominal", titulo: "Quem não contribuiu — com nomes", grupo: "Com nomes", descricao: "Nome e perfil de contribuição (sem contribuições no período; sem registro anterior ou última há mais de 90 ou 180 dias). Sem valores." },
] as const;

export type IdDoBloco = typeof BLOCOS_DE_CONTRIBUICOES[number]["id"];
export const IDS_DOS_BLOCOS: IdDoBloco[] = BLOCOS_DE_CONTRIBUICOES.map(b => b.id);
/** Os blocos que levam NOMES de pessoas: exigem aviso, confirmação e registro de acesso. */
export const IDS_NOMINAIS: IdDoBloco[] = ["contribuintes_nominal", "sem_contribuicao_nominal"];
export const IDS_AGREGADOS: IdDoBloco[] = IDS_DOS_BLOCOS.filter(id => !IDS_NOMINAIS.includes(id));
/** A seleção leva nomes de pessoas? */
export const temBlocoNominal = (blocos: readonly string[]) => IDS_NOMINAIS.some(id => blocos.includes(id));

export type IdDoModelo = "pastor" | "diretoria" | "tesouraria";
export const MODELOS_DE_RELATORIO: { id: IdDoModelo; rotulo: string; descricao: string; blocos: IdDoBloco[] }[] = [
  { id: "pastor", rotulo: "Pastor", descricao: "Visão pastoral, sem nomes: indicadores, saúde da base, quem não contribuiu (quantidades), tendências e gráficos", blocos: ["resumo", "indicadores", "saude_da_base", "nao_contribuiram", "tendencias", "curva_adesao", "destaques", "cobertura"] },
  { id: "diretoria", rotulo: "Diretoria", descricao: "Visão financeira agregada: indicadores, categorias e evolução mensal", blocos: ["resumo", "indicadores", "categorias", "tendencias", "distribuicao_mensal", "destaques", "cobertura"] },
  { id: "tesouraria", rotulo: "Tesouraria", descricao: "Tudo o que é agregado (sem nomes)", blocos: [...IDS_AGREGADOS] },
];

// ── a ORDENAÇÃO das listas com nomes (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: o padrão deixa de ser alfabético. Passa a ser a QUANTIDADE de contribuições no período (maior para menor), com a coluna "#" de classificação, e o construtor deixa escolher.
// Desempate do padrão: quantidade → data da última contribuição (mais recente primeiro) → nome. "Valor total contribuído" só ORDENA: o valor nunca aparece na lista.
export type OrdenacaoDasListas = "quantidade" | "valor_total" | "ultima_contribuicao" | "nome_az" | "nome_za" | "tempo_sem_contribuir";
export const ORDENACOES_DAS_LISTAS: { id: OrdenacaoDasListas; rotulo: string; descricao: string }[] = [
  { id: "quantidade", rotulo: "Quantidade de contribuições", descricao: "Maior para menor; desempate pela última contribuição e pelo nome" },
  { id: "valor_total", rotulo: "Valor total contribuído", descricao: "Maior para menor; os valores não aparecem na lista, só ordenam; desempate pela quantidade, pela última contribuição e pelo nome" },
  { id: "ultima_contribuicao", rotulo: "Última contribuição", descricao: "Mais recente primeiro; desempate pela quantidade e pelo nome" },
  { id: "nome_az", rotulo: "Nome A–Z", descricao: "Ordem alfabética" },
  { id: "nome_za", rotulo: "Nome Z–A", descricao: "Ordem alfabética inversa" },
  { id: "tempo_sem_contribuir", rotulo: "Tempo sem contribuir", descricao: "Quem está há mais tempo sem contribuir primeiro (quem não tem registro anterior vem antes); desempate pelo nome" },
];
export const ORDENACAO_PADRAO: OrdenacaoDasListas = "quantidade";

export interface ResultadoDaOrdenacao { ok: boolean; ordenacao?: OrdenacaoDasListas; erro?: string }
/** Ausente = o padrão (quantidade de contribuições). Só valores da lista. */
export function validarOrdenacao(bruto: unknown): ResultadoDaOrdenacao {
  if (bruto === undefined || bruto === null) return { ok: true, ordenacao: ORDENACAO_PADRAO };
  const achada = ORDENACOES_DAS_LISTAS.find(o => o.id === bruto);
  return achada ? { ok: true, ordenacao: achada.id } : { ok: false, erro: "Ordenação inválida." };
}

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
    if (typeof b !== "string" || !(IDS_DOS_BLOCOS as string[]).includes(b)) return { ok: false, erro: `Bloco não permitido no e-mail: ${String(b).slice(0, 40)}. O e-mail leva números e, no modelo Pastor, nomes sem valores.` };
  }
  const escolhidos = IDS_DOS_BLOCOS.filter(id => (bruto as string[]).includes(id));
  if (escolhidos.length === 0) return { ok: false, erro: "Escolha ao menos um bloco para o relatório." };
  return { ok: true, blocos: escolhidos };
}
