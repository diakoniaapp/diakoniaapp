// ─── pedido — validar o que a tela manda para `contribuicoes-enviar` (puro: sem rede, sem Deno) ─────────────────────────────────────────────────────────────────────────────────────────────
// A função NÃO confia no que vem da chamada: o período é conferido (datas reais, não no futuro, ajustado ao piso de 01/01/2026) e os destinatários são limpos (e-mail válido, sem repetição, no máximo
// `MAXIMO_DE_DESTINATARIOS`). Os NÚMEROS nunca vêm da chamada: a função os calcula sozinha a partir do banco.
import { BASES_ANALISADAS, CATEGORIAS_DE_CONTRIBUICAO, FILTROS_PADRAO, ajustarAoPiso, type BaseAnalisada, type TipoDeContribuicao } from "./analise.ts";
import { validarBlocos, validarOrdenacao, type IdDoBloco, type OrdenacaoDasListas } from "./blocos.ts";
import { emailDeRespostaValido } from "../email/remetente.ts";

export const MAXIMO_DE_DESTINATARIOS = 10;

const dataReal = (s: unknown): string | null => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

/**
 * Os TEXTOS que quem envia pode editar antes de mandar (decisão dela, 27/10/2026): o assunto, uma mensagem de abertura e uma de encerramento. São texto puro (a função os escapa); os NÚMEROS e as listas
 * continuam saindo só do cálculo do banco: não existe como editar um número no e-mail.
 */
export interface TextosDoEmail { assunto?: string; abertura?: string; encerramento?: string }
export const LIMITE_DO_ASSUNTO = 150;
export const LIMITE_DO_TEXTO = 2000;
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function limparTexto(v: unknown, max: number, umaLinha: boolean, rotulo: string): { ok: boolean; valor?: string; erro?: string } {
  if (v === undefined || v === null) return { ok: true };
  if (typeof v !== "string") return { ok: false, erro: `${rotulo} não é um texto válido.` };
  let t = v.replace(/\r\n?/g, "\n").replace(CONTROLE, "");
  t = umaLinha ? t.replace(/\s+/g, " ").trim() : t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length === 0) return { ok: true };
  if (t.length > max) return { ok: false, erro: `${rotulo} passa de ${max} caracteres.` };
  return { ok: true, valor: t };
}
const hashCurto = (s: string) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.codePointAt(0)!) | 0; return (h >>> 0).toString(36); };

export interface PedidoValidado { periodo: { ini: string; fim: string; ajustado: boolean }; destinatarios: string[]; blocos: IdDoBloco[]; base: BaseAnalisada; categorias: TipoDeContribuicao[]; ordenacao: OrdenacaoDasListas; textos?: TextosDoEmail }
export type ResultadoDoPedido = { ok: true; pedido: PedidoValidado } | { ok: false; erro: string };

/** Só as datas e a lista de destinatários; quem chama decide se a ação exige destinatário. */
export function validarPedido(corpo: { periodo?: { ini?: unknown; fim?: unknown }; destinatarios?: unknown; blocos?: unknown; base?: unknown; categorias?: unknown; ordenacao?: unknown; assunto?: unknown; abertura?: unknown; encerramento?: unknown }, hoje: string, exigeDestinatario: boolean): ResultadoDoPedido {
  const ini = dataReal(corpo.periodo?.ini), fimPedido = dataReal(corpo.periodo?.fim);
  if (!ini || !fimPedido) return { ok: false, erro: "Informe o período com datas válidas (AAAA-MM-DD)." };
  const fim = fimPedido > hoje ? hoje : fimPedido;   // não há contribuição no futuro
  if (ini > fim) return { ok: false, erro: "O início do período vem depois do fim." };
  const p = ajustarAoPiso(ini, fim);
  if (p.vazio) return { ok: false, erro: "Este período termina antes de 01/01/2026, início da análise. Escolha um período a partir dessa data." };

  const b = validarBlocos(corpo.blocos);
  if (!b.ok) return { ok: false, erro: b.erro };

  const o = validarOrdenacao(corpo.ordenacao);
  if (!o.ok) return { ok: false, erro: o.erro! };

  // os filtros globais: só valores conhecidos; ausentes = o padrão (membros e congregados; as três categorias)
  const base = corpo.base === undefined || corpo.base === null ? FILTROS_PADRAO.base : corpo.base;
  if (!(BASES_ANALISADAS as unknown[]).includes(base)) return { ok: false, erro: "Base analisada inválida." };
  let categorias: TipoDeContribuicao[] = FILTROS_PADRAO.categorias;
  if (corpo.categorias !== undefined && corpo.categorias !== null) {
    if (!Array.isArray(corpo.categorias) || corpo.categorias.some(c => !CATEGORIAS_DE_CONTRIBUICAO.some(x => x.id === c))) return { ok: false, erro: "Categoria de contribuição inválida." };
    categorias = CATEGORIAS_DE_CONTRIBUICAO.map(c => c.id).filter(id => (corpo.categorias as unknown[]).includes(id));
    if (categorias.length === 0) return { ok: false, erro: "Escolha ao menos uma categoria de contribuição." };
  }

  const textos: TextosDoEmail = {};
  for (const [campo, max, umaLinha, rotulo] of [["assunto", LIMITE_DO_ASSUNTO, true, "O assunto"], ["abertura", LIMITE_DO_TEXTO, false, "A mensagem de abertura"], ["encerramento", LIMITE_DO_TEXTO, false, "A mensagem de encerramento"]] as const) {
    const r = limparTexto((corpo as Record<string, unknown>)[campo], max, umaLinha, rotulo);
    if (!r.ok) return { ok: false, erro: r.erro! };
    if (r.valor) textos[campo] = r.valor;
  }

  const brutos = Array.isArray(corpo.destinatarios) ? corpo.destinatarios : [];
  const destinatarios: string[] = [];
  for (const x of brutos) {
    const e = emailDeRespostaValido(x);
    if (!e) return { ok: false, erro: `E-mail inválido: ${String(x).slice(0, 80)}` };
    if (!destinatarios.includes(e.toLowerCase())) destinatarios.push(e.toLowerCase());
  }
  if (destinatarios.length > MAXIMO_DE_DESTINATARIOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_DESTINATARIOS} destinatários por envio.` };
  if (exigeDestinatario && destinatarios.length === 0) return { ok: false, erro: "Informe ao menos um destinatário." };
  return { ok: true, pedido: { periodo: { ini: p.ini, fim: p.fim, ajustado: p.ajustado }, destinatarios, blocos: b.blocos!, base: base as BaseAnalisada, categorias, ordenacao: o.ordenacao!, textos } };
}

/** A chave que identifica "o mesmo envio" (período + destinatários), para recusar o clique duplo. */
export const chaveDoEnvio = (p: PedidoValidado) => `${p.periodo.ini}|${p.periodo.fim}|${[...p.destinatarios].sort().join(",")}|${p.blocos.join("+")}|${p.base}|${p.categorias.join("+")}|${p.ordenacao}${Object.keys(p.textos ?? {}).length > 0 ? `|t${hashCurto(JSON.stringify(p.textos))}` : ""}`;
