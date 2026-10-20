// ─── perfilDeImpressaoDoExtrato — o que sai no papel do Extrato de Obrigações, por público ──────────────────────────────────────────────────────────────────
// Pedido de 20/10/2026: "evitar PDFs poluídos com informações que não são úteis ao destinatário". A Tesouraria quer tudo; a Contabilidade, o que classifica; a Diretoria, o essencial;
// o "Simplificado", quem e quanto. O valor e a situação (o selo) saem SEMPRE — sem eles não há extrato — e o selo de "quitada por terceiro" e de "reembolso" também: é o que não pode passar batido.
// Puro (sem React): os modelos, a escolha por campo e a memória da escolha neste navegador (localStorage, que pode estar bloqueado: nunca quebra a tela).

export type CampoDeImpressao =
  | "fornecedor" | "documento" | "descricao" | "categoria" | "centro" | "projeto" | "conta"
  | "responsavel" | "intencao" | "grau" | "diasAtraso" | "observacoes" | "anexos" | "totalDoDia" | "assinaturas";

export type ModeloDeImpressao = "tesouraria" | "contabilidade" | "diretoria" | "simplificado" | "personalizado";

export interface PerfilDeImpressao {
  modelo: ModeloDeImpressao;
  campos: Record<CampoDeImpressao, boolean>;
}

/** Os campos na ordem em que o diálogo os mostra. `soExcecao`: só aparecem na linha em que o valor NÃO é o comum ("Igreja"). */
export const CAMPOS_DE_IMPRESSAO: { campo: CampoDeImpressao; rotulo: string; soExcecao?: boolean }[] = [
  { campo: "fornecedor", rotulo: "Fornecedor" }, { campo: "documento", rotulo: "Documento" }, { campo: "descricao", rotulo: "Descrição" },
  { campo: "categoria", rotulo: "Categoria" }, { campo: "centro", rotulo: "Centro de custo" }, { campo: "projeto", rotulo: "Projeto" },
  { campo: "conta", rotulo: "Conta" }, { campo: "responsavel", rotulo: "Responsável pela quitação", soExcecao: true }, { campo: "intencao", rotulo: "Intenção", soExcecao: true },
  { campo: "grau", rotulo: "Grau de prova", soExcecao: true }, { campo: "diasAtraso", rotulo: "Dias em atraso" }, { campo: "observacoes", rotulo: "Observações" },
  { campo: "anexos", rotulo: "Documentos anexados (quantidade e situação)" }, { campo: "totalDoDia", rotulo: "Total do dia" }, { campo: "assinaturas", rotulo: "Assinaturas (Tesouraria e Conselho Fiscal)" },
];

const TODOS_FALSOS = Object.fromEntries(CAMPOS_DE_IMPRESSAO.map(c => [c.campo, false])) as Record<CampoDeImpressao, boolean>;
const so = (...ligados: CampoDeImpressao[]): Record<CampoDeImpressao, boolean> => ({ ...TODOS_FALSOS, ...Object.fromEntries(ligados.map(c => [c, true])) });

export const MODELOS_DE_IMPRESSAO: Record<Exclude<ModeloDeImpressao, "personalizado">, { rotulo: string; descricao: string; campos: Record<CampoDeImpressao, boolean> }> = {
  tesouraria: { rotulo: "Tesouraria", descricao: "Tudo o que a rotina precisa: conta, documento, quem pagou, atraso.",
    campos: so("fornecedor", "documento", "descricao", "categoria", "centro", "projeto", "conta", "responsavel", "intencao", "diasAtraso", "observacoes", "totalDoDia") },
  contabilidade: { rotulo: "Contabilidade", descricao: "O que classifica: fornecedor, documento, categoria, centro e projeto.",
    campos: so("fornecedor", "documento", "categoria", "centro", "projeto", "totalDoDia") },
  diretoria: { rotulo: "Diretoria", descricao: "O essencial, sem detalhe operacional, com assinaturas.",
    campos: so("fornecedor", "documento", "projeto", "diasAtraso", "totalDoDia", "assinaturas") },
  simplificado: { rotulo: "Simplificado", descricao: "Quem e quanto — uma linha por obrigação.",
    campos: so("fornecedor", "totalDoDia") },
};

export const PERFIL_PADRAO: PerfilDeImpressao = { modelo: "tesouraria", campos: { ...MODELOS_DE_IMPRESSAO.tesouraria.campos } };

export function perfilDoModelo(modelo: Exclude<ModeloDeImpressao, "personalizado">): PerfilDeImpressao {
  return { modelo, campos: { ...MODELOS_DE_IMPRESSAO[modelo].campos } };
}

/** O modelo cujos campos são exatamente estes; senão "personalizado". */
export function modeloDosCampos(campos: Record<CampoDeImpressao, boolean>): ModeloDeImpressao {
  for (const [nome, m] of Object.entries(MODELOS_DE_IMPRESSAO) as [Exclude<ModeloDeImpressao, "personalizado">, (typeof MODELOS_DE_IMPRESSAO)[keyof typeof MODELOS_DE_IMPRESSAO]][]) {
    if (CAMPOS_DE_IMPRESSAO.every(c => m.campos[c.campo] === !!campos[c.campo])) return nome;
  }
  return "personalizado";
}

/** O que a tela mostra (não é perfil de papel): tudo, menos assinaturas. */
export const CAMPOS_DA_TELA: Record<CampoDeImpressao, boolean> = { ...so("fornecedor", "documento", "descricao", "categoria", "centro", "projeto", "conta", "responsavel", "intencao", "grau", "diasAtraso", "observacoes", "anexos", "totalDoDia") };

const CHAVE = "diakonia:extrato-obrigacoes:impressao";

/** A escolha guardada neste navegador, validada campo a campo (o que faltar ou vier estranho volta ao padrão). */
export function perfilGuardado(): PerfilDeImpressao {
  try {
    const bruto = JSON.parse(globalThis.localStorage?.getItem(CHAVE) ?? "null") as { campos?: Partial<Record<CampoDeImpressao, unknown>> } | null;
    if (!bruto?.campos || typeof bruto.campos !== "object") return perfilDoModelo("tesouraria");
    const campos = { ...PERFIL_PADRAO.campos };
    for (const c of CAMPOS_DE_IMPRESSAO) if (typeof bruto.campos[c.campo] === "boolean") campos[c.campo] = bruto.campos[c.campo] as boolean;
    return { modelo: modeloDosCampos(campos), campos };
  } catch { return perfilDoModelo("tesouraria"); }
}

export function guardarPerfil(p: PerfilDeImpressao): void {
  try { globalThis.localStorage?.setItem(CHAVE, JSON.stringify({ campos: p.campos })); } catch { /* sem armazenamento: vale só nesta impressão */ }
}
