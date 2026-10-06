// ─── lib/documentos/sugestaoPagamento.ts — o que o documento lido SUGERE (fornecedor, categoria, centro) ───
//
// A "Central de Pagamentos inteligente" (pedido dela, 06/10/2026): depois de LER o boleto/guia/fatura
// (`pagamento.ts`), sugerir fornecedor, categoria e centro — "aprendendo com correções futuras". PURA:
// recebe o documento lido e a BASE (fornecedores, plano de contas, o que já foi aprendido) e devolve a sugestão
// com o MOTIVO. Quem busca a base e grava o aprendizado é `services/documentoPagamentoService.ts`.
//
// Ordem de confiança (do que a tesouraria JÁ decidiu para o que o sistema supõe):
//   1. APRENDIDO — a última vez que este CNPJ / convênio / guia / beneficiário foi pago, ela escolheu X;
//   2. FORNECEDOR pelo CNPJ (medido: o CNPJ do beneficiário confere em 13 de 13 boletos com CNPJ) + o
//      categoria/centro padrão que o fornecedor já lembra;
//   3. FORNECEDOR pelo NOME (palavras iguais) — palpite, confiança menor;
//   4. PADRÃO PELO TIPO do documento — fatura de energia → "Energia Elétrica", FGTS/GPS/DARF → "Encargos
//      Trabalhistas", ISS/IPTU/taxas → "Impostos e Taxas" (é o que a tesouraria usa em todos os anexos reais).
// Nada é gravado aqui e nada é aplicado sozinho: a tela mostra a sugestão e o PORQUÊ.

import type { DocumentoDePagamento } from "./pagamento";

export type ChaveTipo = "cnpj" | "convenio" | "guia" | "beneficiario";
export interface Chave { tipo: ChaveTipo; chave: string }

export interface FornecedorBase {
  id: string; nome: string; cnpj_cpf: string | null;
  categoria_padrao_id: string | null; centro_custo_padrao_id: string | null;
}
export interface CategoriaBase { id: string; nome: string; tipo: string; centro_custo_padrao_id: string | null }
export interface ConhecimentoBase {
  chave_tipo: ChaveTipo; chave: string;
  fornecedor_id: string | null; categoria_id: string | null; centro_custo_id: string | null; projeto_id: string | null;
  usos: number;
}
export interface BaseDeSugestao {
  fornecedores: FornecedorBase[]; categorias: CategoriaBase[]; conhecimento: ConhecimentoBase[];
}

export type OrigemDaSugestao = "aprendido" | "cnpj" | "nome" | "tipo";

export interface Sugestao {
  fornecedorId: string | null;
  categoriaId: string | null;
  centroId: string | null;
  projetoId: string | null;
  origem: OrigemDaSugestao | null;
  /** Em português, para a tela mostrar "por quê". */
  motivos: string[];
  /** 0–100. */
  confianca: number;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, "");

const SUFIXOS = new Set(["ltda", "sa", "s", "a", "me", "epp", "eireli", "mei", "cia", "de", "do", "da", "dos", "das", "e", "ei", "filial"]);

/** "ECOPRINT IMPRESSORAS LTDA" → "ecoprint impressoras" (sem acento, sem sufixo societário, sem pontuação). */
export function normalizarNome(s: string): string {
  return semAcento(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(t => t && !SUFIXOS.has(t)).join(" ");
}

/** As chaves por onde um documento é reconhecido, da mais confiável para a menos. */
export function chavesDoDocumento(d: DocumentoDePagamento): Chave[] {
  const chaves: Chave[] = [];
  if (d.cnpjBeneficiario) chaves.push({ tipo: "cnpj", chave: d.cnpjBeneficiario });
  // A GUIA vem ANTES do convênio: o ISS e o IPTU da Prefeitura têm o MESMO convênio e centros diferentes
  // (medido ao validar o aprendizado nos documentos reais: o 2º ensinamento sobrescrevia o 1º).
  if (d.tipo === "guia" && d.subtipoGuia) {
    // DARF distingue pela receita (1708 ≠ 0561); as demais guias, pelo subtipo
    chaves.push({ tipo: "guia", chave: d.codigoReceita ? `${d.subtipoGuia}:${d.codigoReceita}` : d.subtipoGuia });
  }
  if (d.convenio) chaves.push({ tipo: "convenio", chave: d.convenio });
  const nome = d.beneficiario ? normalizarNome(d.beneficiario) : "";
  if (nome.length >= 5) chaves.push({ tipo: "beneficiario", chave: nome });
  return chaves;
}

/** A categoria que a tesouraria usa para este tipo de documento (nome exato do plano de contas). */
export function nomeDaCategoriaPadrao(d: DocumentoDePagamento): string | null {
  if (d.tipo === "fatura") {
    switch (d.subtipoFatura) {
      case "energia": return "Energia Elétrica";
      case "agua": return "Água e Esgoto";
      case "gas": return "Gás";
      case "telefonia": case "internet": return "Internet e Telefonia";
      case "condominio": return "Condomínio";
      default: return null;
    }
  }
  if (d.tipo === "guia") {
    switch (d.subtipoGuia) {
      case "fgts": case "gps": case "darf": case "irrf": return "Encargos Trabalhistas";
      case "iss": case "iptu": case "das": case "taxa": case "outra": return "Impostos e Taxas";
      default: return null;
    }
  }
  return null;
}

function fornecedorPorCnpj(cnpj: string | null, fornecedores: FornecedorBase[]): FornecedorBase | null {
  if (!cnpj) return null;
  return fornecedores.find(f => f.cnpj_cpf && soDigitos(f.cnpj_cpf) === cnpj) ?? null;
}

/** Mesmas palavras (depois de tirar LTDA/S.A.): igual, ou um nome contido no outro com 2+ palavras. */
function fornecedorPorNome(beneficiario: string | null, fornecedores: FornecedorBase[]): FornecedorBase | null {
  if (!beneficiario) return null;
  const alvo = normalizarNome(beneficiario);
  const tAlvo = alvo.split(" ").filter(Boolean);
  if (tAlvo.length === 0 || alvo.length < 5) return null;
  let melhor: { f: FornecedorBase; nota: number } | null = null;
  for (const f of fornecedores) {
    const n = normalizarNome(f.nome);
    const t = n.split(" ").filter(Boolean);
    if (t.length === 0) continue;
    const comum = t.filter(x => tAlvo.includes(x)).length;
    const nota = comum / Math.max(t.length, tAlvo.length);
    const exato = n === alvo;
    const contido = comum >= 2 && (comum === t.length || comum === tAlvo.length);
    if ((exato || contido || nota >= 0.75) && (!melhor || nota > melhor.nota)) melhor = { f, nota };
  }
  return melhor?.f ?? null;
}

const VAZIA: Sugestao = { fornecedorId: null, categoriaId: null, centroId: null, projetoId: null, origem: null, motivos: [], confianca: 0 };

export function sugerirClassificacao(d: DocumentoDePagamento, base: BaseDeSugestao): Sugestao {
  const s: Sugestao = { ...VAZIA, motivos: [] };
  const categoriaPorId = new Map(base.categorias.map(c => [c.id, c]));
  const fornecedorPorId = new Map(base.fornecedores.map(f => [f.id, f]));

  // 1. o que a tesouraria JÁ ensinou — a primeira chave (mais confiável) que tem registro
  for (const k of chavesDoDocumento(d)) {
    const c = base.conhecimento.find(x => x.chave_tipo === k.tipo && x.chave === k.chave);
    if (!c) continue;
    s.fornecedorId = c.fornecedor_id; s.categoriaId = c.categoria_id; s.centroId = c.centro_custo_id; s.projetoId = c.projeto_id;
    s.origem = "aprendido";
    s.confianca = Math.min(97, (k.tipo === "cnpj" ? 90 : k.tipo === "beneficiario" ? 78 : 86) + Math.min(c.usos, 5));
    s.motivos.push(`da última vez que você pagou ${k.tipo === "guia" ? "esta guia" : k.tipo === "convenio" ? "esta empresa (convênio)" : "este beneficiário"}, escolheu isto (${c.usos}×)`);
    break;
  }

  // 2/3. fornecedor pelo CNPJ (exato) ou pelo nome (palpite) — completa o que o aprendizado não trouxe
  const porCnpj = fornecedorPorCnpj(d.cnpjBeneficiario, base.fornecedores);
  const forn = s.fornecedorId ? fornecedorPorId.get(s.fornecedorId) ?? null : (porCnpj ?? fornecedorPorNome(d.beneficiario, base.fornecedores));
  if (forn && !s.fornecedorId) {
    s.fornecedorId = forn.id;
    if (!s.origem) { s.origem = porCnpj ? "cnpj" : "nome"; s.confianca = porCnpj ? 82 : 58; }
    s.motivos.push(porCnpj ? `CNPJ do beneficiário confere com o fornecedor "${forn.nome}"` : `o nome do beneficiário se parece com o fornecedor "${forn.nome}"`);
  }
  if (forn) {
    if (!s.categoriaId && forn.categoria_padrao_id) { s.categoriaId = forn.categoria_padrao_id; s.motivos.push("categoria padrão do fornecedor"); if (s.origem !== "aprendido") s.confianca += 6; }
    if (!s.centroId && forn.centro_custo_padrao_id) { s.centroId = forn.centro_custo_padrao_id; s.motivos.push("centro padrão do fornecedor"); }
  }

  // 4. padrão pelo tipo do documento
  if (!s.categoriaId) {
    const nome = nomeDaCategoriaPadrao(d);
    const cat = nome ? base.categorias.find(c => c.tipo === "saida" && semAcento(c.nome) === semAcento(nome)) : null;
    if (cat) {
      s.categoriaId = cat.id;
      s.motivos.push(`${d.rotulo} costuma ser "${cat.nome}"`);
      if (!s.origem) { s.origem = "tipo"; s.confianca = 55; }
    }
  }
  if (!s.centroId && s.categoriaId) {
    const centro = categoriaPorId.get(s.categoriaId)?.centro_custo_padrao_id ?? null;
    if (centro) { s.centroId = centro; s.motivos.push("centro padrão da categoria"); }
  }

  s.confianca = Math.max(0, Math.min(97, s.confianca));
  return s;
}

/**
 * Quando a tesouraria SALVA um lançamento a partir de um documento lido, o que gravar para a próxima vez:
 * uma linha por chave do documento, com o que ela de fato escolheu (a correção vence a sugestão).
 */
export interface Escolha { fornecedorId: string | null; categoriaId: string | null; centroId: string | null; projetoId: string | null }

export function aprendizadoDaEscolha(d: DocumentoDePagamento, e: Escolha): (Chave & Escolha)[] {
  if (!e.fornecedorId && !e.categoriaId && !e.centroId) return [];
  return chavesDoDocumento(d).map(k => ({ ...k, ...e }));
}
