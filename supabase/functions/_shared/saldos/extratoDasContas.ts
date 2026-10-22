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
