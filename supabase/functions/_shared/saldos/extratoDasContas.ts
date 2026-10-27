// ─── extratoDasContas — "até quando o saldo reflete o banco" (puro: sem rede, sem Deno; os e-mails diário e semanal o dividem) ──────────────────────────
//
// Pedido dela (22/10/2026): o saldo do Bradesco e o da conta Investimento que vão nos e-mails precisam dizer QUANDO foi a última atualização, porque o saldo do DiakoniaApp só acompanha o
// banco até onde alguém importou e conciliou o extrato (OFX no Bradesco; o PDF do Invest Fácil na Investimento). Sem a data, o saldo parece o da conta real da igreja e não é.
//
// A data vem de `resumo_ultimo_extrato_das_contas()` (SQL): `ultimo_movimento` = o dia da linha mais recente do banco que já entrou na conta (qualquer marca `[ofx:…]`, inclusive a do PDF);
// `ultima_conciliacao` = quando alguém ligou a última linha do banco a um lançamento. Aqui só se transforma isso em texto — nada é recalculado.

export interface ExtratoDaConta {
  nome: string;
  saldo: number;
  /** AAAA-MM-DD: o dia da linha mais recente do extrato do banco que já está na conta; nulo = nunca entrou extrato */
  ultimo_movimento: string | null;
  /** instante (ISO) da última ligação de uma linha do banco a um lançamento */
  ultima_conciliacao: string | null;
}

/** Passando de quantos dias sem extrato o e-mail avisa em destaque (fim de semana e feriado não devem disparar o aviso à toa). */
export const DIAS_ATE_AVISAR = 3;

/** O que vai junto de todo saldo que sai nos e-mails. */
export const NOTA_DO_SALDO = "Saldo do DiakoniaApp: acompanha o banco só até a data do último extrato importado e conciliado — pode não ser o saldo real da conta.";

const dd = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const diaDeBrasilia = (iso: string): string => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
/** Dias do 1º ao 2º (AAAA-MM-DD), sem fuso. */
export const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);
/** A data de hoje em Brasília a partir de um instante. */
export const hojeEmBrasilia = (iso: string): string => diaDeBrasilia(iso);

export interface SituacaoDoExtrato {
  /** "extrato do banco até 20/10 (há 2 dias) · conciliado em 21/10" */
  texto: string;
  /** passou de `DIAS_ATE_AVISAR` dias, ou nunca entrou extrato */
  defasado: boolean;
  /** dias desde a linha mais recente; nulo quando nunca entrou extrato */
  dias: number | null;
}

export function situacaoDoExtrato(c: Pick<ExtratoDaConta, "ultimo_movimento" | "ultima_conciliacao">, hojeYmd: string): SituacaoDoExtrato {
  if (!c.ultimo_movimento) return { texto: "nenhum extrato do banco importado", defasado: true, dias: null };
  const ate = String(c.ultimo_movimento).slice(0, 10);
  const dias = Math.max(0, diasEntre(ate, hojeYmd));
  const quando = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  const conc = c.ultima_conciliacao ? ` · conciliado em ${dd(diaDeBrasilia(c.ultima_conciliacao))}` : "";
  return { texto: `extrato do banco até ${dd(ate)} (${quando})${conc}`, defasado: dias > DIAS_ATE_AVISAR, dias };
}

/** Conta que acompanha banco: já recebeu extrato, ou é o Bradesco/Investimento mesmo que ainda sem nenhuma linha. A de caixa (dinheiro físico) não tem extrato e não leva o aviso. */
export const ehContaDeBanco = (c: Pick<ExtratoDaConta, "nome" | "ultimo_movimento">): boolean =>
  c.ultimo_movimento != null || /bradesco|invest|banco|aplica/i.test(c.nome);

/** Uma frase para o topo do e-mail quando alguma conta de banco está defasada; vazia quando todas estão em dia. */
export function avisoDeExtratoDefasado(contas: readonly ExtratoDaConta[], hojeYmd: string): string {
  const velhas = contas.filter(c => ehContaDeBanco(c) && situacaoDoExtrato(c, hojeYmd).defasado);
  if (velhas.length === 0) return "";
  const lista = velhas.map(c => `${c.nome} (${situacaoDoExtrato(c, hojeYmd).texto.replace(/ · conciliado em \d{2}\/\d{2}$/, "")})`).join("; ");
  return `⚠ Extrato desatualizado: ${lista}. Os saldos abaixo podem não refletir o banco.`;
}

/** Junta, por nome, a data do extrato às contas que o resumo semanal já traz. Conta sem correspondência fica como veio. */
export function juntarExtrato<T extends { nome: string }>(contas: readonly T[], extratos: readonly ExtratoDaConta[]): (T & Partial<Pick<ExtratoDaConta, "ultimo_movimento" | "ultima_conciliacao">>)[] {
  const porNome = new Map(extratos.map(e => [e.nome, e]));
  return contas.map(c => {
    const e = porNome.get(c.nome);
    return e ? { ...c, ultimo_movimento: e.ultimo_movimento, ultima_conciliacao: e.ultima_conciliacao } : { ...c };
  });
}

/**
 * Lê `resumo_ultimo_extrato_das_contas()`. Se a função ainda não existe no banco (migration não aplicada) devolve lista vazia: o e-mail sai sem a data, com a nota geral do saldo — nunca deixa de sair por isso.
 * `cliente` é só o que se usa do supabase-js (o módulo não importa a biblioteca).
 */
export async function lerExtratoDasContas(cliente: { rpc: (nome: string) => PromiseLike<{ data: unknown; error: unknown }> }): Promise<ExtratoDaConta[]> {
  try {
    const r = await cliente.rpc("resumo_ultimo_extrato_das_contas");
    if (r.error || !Array.isArray(r.data)) return [];
    return (r.data as Record<string, unknown>[]).map(x => ({
      nome: String(x.nome), saldo: Number(x.saldo ?? 0),
      ultimo_movimento: x.ultimo_movimento ? String(x.ultimo_movimento).slice(0, 10) : null,
      ultima_conciliacao: x.ultima_conciliacao ? String(x.ultima_conciliacao) : null,
    }));
  } catch {
    return [];
  }
}

// ─── A REGRA DO SALDO (decisão dela, 27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// O saldo do DiakoniaApp só acompanha o banco até o último extrato importado; um saldo desatualizado, num e-mail, parece o saldo real da conta da igreja. Por isso:
//   · o RESUMO DIÁRIO não mostra saldo (não é um item de ação);
//   · o RESUMO SEMANAL mostra o saldo de uma conta de banco SÓ SE o extrato dela tem no máximo `DIAS_ATE_AVISAR` (3) dias; senão o saldo daquela conta é OCULTADO e o e-mail diz até quando vai o extrato.
// A regra é por conta (o Bradesco pode estar em dia e o Investimento não) e vale também quando a data não veio (migration ausente): sem como conferir, não se mostra.

export interface SaldoOculto { nome: string; /** "extrato do banco até 15/10 (há 7 dias)" · "nenhum extrato do banco importado" */ motivo: string }
export interface DecisaoDosSaldos<T extends { nome: string; saldo: number }> {
  /** as contas cujo saldo pode ir no e-mail (caixas físicos e contas de banco com extrato em dia) */
  visiveis: T[];
  ocultas: SaldoOculto[];
  /** AAAA-MM-DD do extrato mais recente entre as contas de banco; `null` = nenhuma recebeu extrato (ou a data não veio) */
  ultimaAtualizacaoBancaria: string | null;
}

/** A frase que acompanha todo saldo ocultado. */
export const EXPLICACAO_DO_SALDO_OCULTO = "Os saldos foram ocultados para evitar interpretações baseadas em dados desatualizados.";

/** AAAA-MM-DD → dd/mm/aaaa. */
export const ddmmaaaa = (ymd: string): string => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** `ultimo_movimento` `undefined` = a data não veio (migration não aplicada); `null` = a conta nunca recebeu extrato. */
export function decidirSaldos<T extends { nome: string; saldo: number; ultimo_movimento?: string | null; ultima_conciliacao?: string | null }>(contas: readonly T[], hojeYmd: string): DecisaoDosSaldos<T> {
  const visiveis: T[] = [];
  const ocultas: SaldoOculto[] = [];
  let maisRecente: string | null = null;
  for (const c of contas) {
    if (!ehContaDeBanco({ nome: c.nome, ultimo_movimento: c.ultimo_movimento })) { visiveis.push(c); continue; }   // caixa físico: não tem extrato
    if (c.ultimo_movimento === undefined) { ocultas.push({ nome: c.nome, motivo: "não foi possível conferir a data do último extrato" }); continue; }
    const ate = c.ultimo_movimento ? String(c.ultimo_movimento).slice(0, 10) : null;
    if (ate && (!maisRecente || ate > maisRecente)) maisRecente = ate;
    const sit = situacaoDoExtrato({ ultimo_movimento: ate, ultima_conciliacao: c.ultima_conciliacao ?? null }, hojeYmd);
    if (sit.defasado) ocultas.push({ nome: c.nome, motivo: sit.texto.replace(/ · conciliado em \d{2}\/\d{2}$/, "") });
    else visiveis.push(c);
  }
  return { visiveis, ocultas, ultimaAtualizacaoBancaria: maisRecente };
}
