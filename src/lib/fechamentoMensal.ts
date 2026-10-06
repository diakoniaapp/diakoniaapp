// ─── lib/fechamentoMensal.ts — "estou pronta para gerar e enviar o malote?" ─────
//
// A aba "4 Fechamento" do Workspace Financeiro vira o CHECKLIST do fechamento mensal
// da Telma (03/10/2026). O processo real dela, nas palavras dela: conferir movimentações,
// conciliações, lançamentos sem classificação, sem centro de custo, sem anexo; alimentar
// a Central de Documentos; gerar o Malote; enviar à contabilidade. A agenda fiscal NÃO faz
// parte (ela não a usa no sistema) e "sem documento" não se repete aqui (a Central de
// Documentos já cuida): a aba só resume.
//
// Aqui só está a REGRA do que impede o fechamento e do que é só atenção. Sem rede e sem
// React — a busca é `services/fechamentoMensalService.ts`.
//
// O QUE IMPEDE O MALOTE (bloqueio) — a lista dela, "pendências que realmente impedem":
//   · conta de BANCO com lançamento ainda só "realizado" (não conciliado) no mês;
//   · lançamento sem categoria;
//   · lançamento sem centro de custo;
//   · saldo inconsistente (saldo da conta ≠ saldo inicial + movimento).
// O QUE É SÓ ATENÇÃO (não impede): lançamento num centro que tem subcentros (ficou no
// pai) e saídas sem documento — o ZIP sai mesmo com pendência (decisão dela, 02/10/2026).
// NÃO entram: eventos fiscais futuros, obrigações a vencer, vencimentos da semana.
//
// Conciliação só vale para conta de tipo `banco` — a única com extrato (OFX) para bater;
// Caixinha, Envelopes e Cartão não têm (mesma régua do Painel da Tesouraria desde 12/09).

export interface ContaFechamento {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  saldoInicial: number;
  saldoAtual: number;
  /** Entradas − saídas realizadas/conciliadas, de todo o histórico da conta. */
  movimentoTotal: number;
}

export interface LancamentoFechamento {
  id: string;
  /** `AAAA-MM-DD` — o dia que conta (data do pagamento, ou a data). */
  dia: string;
  tipo: "entrada" | "saida";
  status: string;
  valor: number;
  contaId: string;
  contaNome: string;
  categoriaId: string | null;
  centroId: string | null;
  origem: string | null;
  /** O vínculo REAL (fornecedor ou pessoa cadastrados); vazio se não há. */
  fornecedor: string;
  /** Texto livre — pode citar quem é, mas NÃO é o fornecedor. */
  descricao?: string;
}

export interface CentroFechamento { id: string; paiId: string | null }

export type TipoBloqueio = "saldo" | "conciliacao" | "sem_categoria" | "sem_centro";

export interface Bloqueio {
  /** Estável e único — serve de chave na lista e de contagem do selo do menu. */
  id: string;
  tipo: TipoBloqueio;
  titulo: string;
  detalhe: string;
  contaId?: string;
  lancamentoId?: string;
}

export interface PendenciaDeConta { conta: ContaFechamento; lancamentos: LancamentoFechamento[] }

export interface Avaliacao {
  periodo: { ano: number; mes: number; ini: string; fim: string; rotulo: string };
  conciliacao: { contas: number; conciliadas: number; pendentes: PendenciaDeConta[] };
  /** Conta de banco ativa SEM nenhum lançamento no mês: o extrato provavelmente não foi
   *  importado. Só atenção — uma conta realmente parada não pode travar o fechamento. */
  semMovimento: ContaFechamento[];
  semCategoria: LancamentoFechamento[];
  semCentro: LancamentoFechamento[];
  semSubcentro: LancamentoFechamento[];
  saldosInconsistentes: { conta: ContaFechamento; esperado: number }[];
  bloqueios: Bloqueio[];
  /** Nada impede gerar o malote. */
  pronto: boolean;
}

// ── datas ───────────────────────────────────────────────────────────────────

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const rotuloDoMes = (ano: number, mes: number) => `${MESES[mes - 1]}/${ano}`;

export function limitesDoMes(ano: number, mes: number): { ini: string; fim: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { ini: `${ano}-${p(mes)}-01`, fim: `${ano}-${p(mes)}-${p(ultimo)}` };
}

/** O mês que se fecha agora: o ANTERIOR ao de `hoje` (`AAAA-MM-DD`). Em 03/10 é setembro. */
export function mesEmFechamento(hoje: string): { ano: number; mes: number } {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/** Os últimos `n` meses terminando em `hoje` (do mais recente para o mais antigo). */
export function ultimosMeses(hoje: string, n: number): { ano: number; mes: number }[] {
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7));
  const out: { ano: number; mes: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ ano, mes });
    mes -= 1;
    if (mes === 0) { mes = 12; ano -= 1; }
  }
  return out;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ── a avaliação ─────────────────────────────────────────────────────────────

export function avaliarFechamento(
  ano: number, mes: number,
  contas: ContaFechamento[],
  lancamentos: LancamentoFechamento[],
  centros: CentroFechamento[],
): Avaliacao {
  const { ini, fim } = limitesDoMes(ano, mes);
  const noMes = lancamentos.filter(l =>
    (l.status === "realizado" || l.status === "conciliado") && l.dia >= ini && l.dia <= fim);

  // conciliação — só contas de banco ativas que tiveram movimento no mês
  const bancos = contas.filter(c => c.ativo && c.tipo === "banco");
  const doBanco = bancos
    .map(conta => ({ conta, lancs: noMes.filter(l => l.contaId === conta.id) }))
    .filter(x => x.lancs.length > 0);
  const pendentes: PendenciaDeConta[] = doBanco
    .map(x => ({ conta: x.conta, lancamentos: x.lancs.filter(l => l.status === "realizado") }))
    .filter(x => x.lancamentos.length > 0);

  const semMovimento = bancos.filter(c => !noMes.some(l => l.contaId === c.id));

  // classificação — transferência entre contas não tem categoria nem centro
  const classificaveis = noMes.filter(l => l.origem !== "transferencia");
  const semCategoria = classificaveis.filter(l => !l.categoriaId);
  const semCentro = classificaveis.filter(l => !l.centroId);
  const centrosComFilhos = new Set(centros.map(c => c.paiId).filter((x): x is string => !!x));
  // SÓ DESPESA. Pedido dela (06/10/2026): a receita entra primeiro — Categoria + Centro já é uma
  // classificação válida (Dízimos no Min. Administração, Ofertas para Missões no centro de missões); o
  // detalhamento em subcentro representa a DESTINAÇÃO do gasto, e a destinação aparece nas despesas.
  // Medido em produção: dos 1.785 lançamentos realizados que caíam aqui, 1.750 (98%) eram ENTRADAS
  // (1.101 de Dízimos, 641 de Ofertas); em setembro/2026 eram 31 entradas e 0 despesas.
  const semSubcentro = classificaveis.filter(l => l.tipo === "saida" && !!l.centroId && centrosComFilhos.has(l.centroId));

  // saldo — o saldo gravado tem de ser saldo inicial + movimento
  const saldosInconsistentes = contas
    .filter(c => c.ativo)
    .map(conta => ({ conta, esperado: Math.round((conta.saldoInicial + conta.movimentoTotal) * 100) / 100 }))
    .filter(x => Math.abs(x.conta.saldoAtual - x.esperado) > 0.005);

  const bloqueios: Bloqueio[] = [
    ...saldosInconsistentes.map(({ conta, esperado }): Bloqueio => ({
      id: `saldo-${conta.id}`, tipo: "saldo", contaId: conta.id,
      titulo: `Saldo inconsistente — ${conta.nome}`,
      detalhe: `mostra ${brl(conta.saldoAtual)}, mas saldo inicial + movimento dá ${brl(esperado)}`,
    })),
    ...pendentes.map((p): Bloqueio => ({
      id: `conciliacao-${p.conta.id}`, tipo: "conciliacao", contaId: p.conta.id,
      titulo: `Conta sem conciliar — ${p.conta.nome}`,
      detalhe: `${plural(p.lancamentos.length, "lançamento aguarda", "lançamentos aguardam")} conciliação com o extrato`,
    })),
    ...semCategoria.map((l): Bloqueio => ({
      id: `categoria-${l.id}`, tipo: "sem_categoria", lancamentoId: l.id, contaId: l.contaId,
      titulo: `Sem categoria — ${l.fornecedor || "(sem fornecedor)"}`,
      detalhe: `${dataBr(l.dia)} · ${l.contaNome} · ${brl(l.valor)}`,
    })),
    ...semCentro.map((l): Bloqueio => ({
      id: `centro-${l.id}`, tipo: "sem_centro", lancamentoId: l.id, contaId: l.contaId,
      titulo: `Sem centro de custo — ${l.fornecedor || "(sem fornecedor)"}`,
      detalhe: `${dataBr(l.dia)} · ${l.contaNome} · ${brl(l.valor)}`,
    })),
  ];

  return {
    periodo: { ano, mes, ini, fim, rotulo: rotuloDoMes(ano, mes) },
    conciliacao: { contas: doBanco.length, conciliadas: doBanco.length - pendentes.length, pendentes },
    semMovimento,
    semCategoria, semCentro, semSubcentro, saldosInconsistentes,
    bloqueios, pronto: bloqueios.length === 0,
  };
}

/** A frase que responde a pergunta da aba. */
export function veredito(a: Avaliacao): string {
  if (a.pronto) return `Pronto para gerar o malote de ${a.periodo.rotulo}.`;
  const n = a.bloqueios.length;
  return `${plural(n, "pendência impede", "pendências impedem")} o fechamento de ${a.periodo.rotulo}.`;
}
