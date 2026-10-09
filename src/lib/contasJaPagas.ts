// ─── lib/contasJaPagas.ts — obrigações ABERTAS que já têm um pagamento registrado (puro, testado) ───────────────────────────────
//
// O casamento OFX × obrigação acontece quando a linha do extrato é importada. Obrigação criada DEPOIS (recorrências geradas em 08/10/2026) ou pagamento
// importado como lançamento comum nunca voltavam a se encontrar: a conta ficava aberta na Mesa de Operações e o pagamento no extrato — dois registros
// para um fato só, e a obrigação seria paga de novo. Aqui se acha, entre as obrigações abertas e os pagamentos soltos (sem liquidação, sem recorrência,
// sem vínculo), quem é de quem. Só SUGERE: quem confirma é a tesouraria (`fin_liquidar_com_pagamento_existente` funde os dois, atomicamente).
//
// Dados reais que desenharam as regras (set–out/2026):
//   Denise    obrigação 05/10 estimada em R$ 1.438 · PIX de 02/10 de R$ 1.358 (94%)   → o valor real substitui a estimativa
//   Ana       obrigação 05/10 estimada em R$ 380   · PIX de 02/10 de R$ 760  (200%)   → pagou o dobro do estimado: confira
//   Carlos    obrigação 05/10 estimada em R$ 380   · PIX de 02/10 de R$ 1.630 (4,3×)  → o PIX cobre mais do que esta obrigação: explique a diferença
//   Verisure  obrigação 05/10 de R$ 278,22        · nenhum pagamento registrado        → não é caso desta lista (o OFX ainda não foi processado)

export interface ObrigacaoAberta {
  id: string;
  valor: number;
  /** vencimento AAAA-MM-DD */
  data: string;
  fornecedor_id: string | null;
  pessoa_id: string | null;
  /** o nome que a tesouraria lê (favorecido ou descrição) */
  nome: string;
  /** valor ESTIMADO (recorrência de valor variável) */
  valor_variavel: boolean;
  conta_id: string;
}

export interface PagamentoRegistrado {
  id: string;
  valor: number;
  /** o dia em que o banco debitou: data de pagamento, senão a data (AAAA-MM-DD) */
  data: string;
  nome: string;
  descricao: string;
  fornecedor_id: string | null;
  pessoa_id: string | null;
  origem: string;
  conta_id: string;
}

export type NivelDaSugestao = "segura" | "conferir";

export interface SugestaoDeLiquidacao {
  obrigacao: ObrigacaoAberta;
  pagamento: PagamentoRegistrado;
  /** pago − obrigação */
  diferenca: number;
  /** pago ÷ obrigação */
  razao: number;
  /**
   * a obrigação é uma ESTIMATIVA (valor variável) e o valor pago difere: a tesouraria PODE dizer que o valor real é o do pagamento. Nunca é automático — quem
   * pagou a menos pode ter deixado saldo a pagar (baixa parcial), e trocar o valor sem perguntar perderia esse saldo (caso Denise, 09/10/2026).
   */
  podeSerEstimativa: boolean;
  nivel: NivelDaSugestao;
  motivos: string[];
  /** havia mais de uma obrigação/pagamento possível: a tesouraria deve olhar */
  ambigua: boolean;
}

/** O pagamento pode ter saído até 25 dias antes do vencimento (adiantado) e até 45 depois (atrasado). */
export const DIAS_ANTES_DO_VENCIMENTO = 25;
export const DIAS_DEPOIS_DO_VENCIMENTO = 45;
const c2 = (n: number) => Math.round(n * 100) / 100;
const dia = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`) / 86_400_000;

const SEM_VALOR = new Set(["ltda", "eireli", "epp", "sociedade", "servicos", "comercio", "empresa", "brasil", "companhia", "para", "pix", "enviado", "des", "pagto", "eletron", "cobranca", "transf", "recebido", "rem"]);
function palavras(texto: string): Set<string> {
  return new Set((texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]{4,}/g)?.filter(w => !SEM_VALOR.has(w)) ?? []);
}

function mesmoFavorecido(o: ObrigacaoAberta, p: PagamentoRegistrado): "id" | "nome" | null {
  if ((o.fornecedor_id && o.fornecedor_id === p.fornecedor_id) || (o.pessoa_id && o.pessoa_id === p.pessoa_id)) return "id";
  // o extrato TRUNCA os nomes ("VERISURE BRASIL MONIT"): uma palavra casa com a outra se uma for prefixo da outra
  const a = palavras(o.nome), b = [...palavras(p.nome), ...palavras(p.descricao)];
  const casadas = [...a].filter(w => b.some(x => x === w || (x.length >= 4 && w.startsWith(x)) || (w.length >= 4 && x.startsWith(w))));
  // duas palavras em comum, ou uma só quando é distintiva (7+ letras: "verisure", "localiza")
  return a.size > 0 && (casadas.length >= Math.min(2, a.size) || casadas.some(w => w.length >= 7)) ? "nome" : null;
}

interface Candidato { o: ObrigacaoAberta; p: PagamentoRegistrado; favorecido: "id" | "nome"; razao: number; exato: boolean; dias: number; pontos: number; estimativaRazoavel: boolean }

function avaliar(o: ObrigacaoAberta, p: PagamentoRegistrado): Candidato | null {
  if (o.conta_id !== p.conta_id || !(o.valor > 0) || !(p.valor > 0)) return null;
  const antes = dia(o.data) - dia(p.data);           // positivo = pagou ANTES do vencimento
  if (antes > DIAS_ANTES_DO_VENCIMENTO || -antes > DIAS_DEPOIS_DO_VENCIMENTO) return null;
  const favorecido = mesmoFavorecido(o, p);
  if (!favorecido) return null;
  const razao = p.valor / o.valor;
  const exato = Math.abs(p.valor - o.valor) < 0.005;
  // valor fixo: só se parece com o documento (juros/multa/desconto); estimativa: qualquer valor, mas o de nome parecido precisa ser razoável
  if (!exato && !o.valor_variavel && !(razao >= 0.85 && razao <= 1.2)) return null;
  if (favorecido === "nome" && !exato && !(razao >= 0.85 && razao <= 1.2)) return null;
  const estimativaRazoavel = o.valor_variavel && razao >= 0.75 && razao <= 1.25;
  const dias = Math.abs(antes);
  const pontos = (favorecido === "id" ? 100 : 50) + (exato ? 50 : 0) + (estimativaRazoavel ? 20 : 0) - dias * 0.5 - Math.abs(Math.log(razao)) * 10;
  return { o, p, favorecido, razao, exato, dias, pontos, estimativaRazoavel };
}

export function sugerirLiquidacoes(obrigacoes: ObrigacaoAberta[], pagamentos: PagamentoRegistrado[]): SugestaoDeLiquidacao[] {
  const todos: Candidato[] = [];
  for (const o of obrigacoes) for (const p of pagamentos) { const k = avaliar(o, p); if (k) todos.push(k); }
  const porObrigacao = new Map<string, number>(), porPagamento = new Map<string, number>();
  for (const k of todos) {
    porObrigacao.set(k.o.id, (porObrigacao.get(k.o.id) ?? 0) + 1);
    porPagamento.set(k.p.id, (porPagamento.get(k.p.id) ?? 0) + 1);
  }
  const usadasO = new Set<string>(), usadosP = new Set<string>();
  const out: SugestaoDeLiquidacao[] = [];
  for (const k of [...todos].sort((a, b) => b.pontos - a.pontos || a.o.id.localeCompare(b.o.id))) {
    if (usadasO.has(k.o.id) || usadosP.has(k.p.id)) continue;
    usadasO.add(k.o.id); usadosP.add(k.p.id);
    const ambigua = (porObrigacao.get(k.o.id) ?? 1) > 1 || (porPagamento.get(k.p.id) ?? 1) > 1;
    const motivos: string[] = [k.favorecido === "id" ? "mesmo favorecido" : "nome parecido no extrato"];
    motivos.push(k.dias === 0 ? "no dia do vencimento" : dia(k.p.data) < dia(k.o.data) ? `pago ${k.dias} dia${k.dias !== 1 ? "s" : ""} antes do vencimento` : `pago ${k.dias} dia${k.dias !== 1 ? "s" : ""} depois do vencimento`);
    if (k.exato) motivos.push("valor exato");
    else if (k.p.valor < k.o.valor) motivos.push(`pagou ${c2(k.o.valor - k.p.valor).toLocaleString("pt-BR")} a menos: o saldo pode continuar a pagar (baixa parcial), ser desconto${k.o.valor_variavel ? " ou o valor real de uma estimativa" : ""}`);
    else if (k.o.valor_variavel) motivos.push(`o pagamento é ${k.razao >= 1 ? `${(Math.round(k.razao * 10) / 10).toLocaleString("pt-BR")}×` : `${Math.round(k.razao * 100)}%`} do estimado — pode cobrir outras obrigações`);
    else motivos.push(`diferença de ${c2(k.p.valor - k.o.valor).toLocaleString("pt-BR")}: juros, multa ou desconto?`);
    if (ambigua) motivos.push("há mais de uma combinação possível");
    // SEGURA só quando não há o que decidir: mesmo favorecido, valor exato, sem ambiguidade. Qualquer diferença pede a decisão da tesouraria.
    const segura = k.favorecido === "id" && !ambigua && k.exato && k.dias <= 30;
    out.push({
      obrigacao: k.o, pagamento: k.p, diferenca: c2(k.p.valor - k.o.valor), razao: k.razao, podeSerEstimativa: k.o.valor_variavel && !k.exato,
      nivel: segura ? "segura" : "conferir", motivos, ambigua,
    });
  }
  return out.sort((a, b) => a.obrigacao.data.localeCompare(b.obrigacao.data) || a.obrigacao.nome.localeCompare(b.obrigacao.nome));
}
