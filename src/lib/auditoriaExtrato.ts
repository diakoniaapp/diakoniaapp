// ─── lib/auditoriaExtrato.ts — por que o saldo do sistema não bate com o do banco, linha por linha (puro, testado) ──────────────
//
// Pedido dela (08/10/2026): "explique matematicamente cada diferença entre saldo bancário e saldo do sistema" e "não presuma que toda
// divergência seja erro de importação". Esta lib recebe as linhas do BANCO (o PDF do extrato consolidado: completo, com aplicação e
// resgate) e as do SISTEMA (os lançamentos realizados/conciliados da conta) e faz três coisas:
//
//   1. PAREIA cada linha do banco com a(s) do sistema — mesmo dia e valor; mesmo valor em até 5 dias; ou AGRUPADO (um pagamento do banco
//      que o sistema lançou em duas partes: principal + juros/multa; ou o inverso);
//   2. CLASSIFICA o que ficou sem par — no banco (aplicação, resgate, rendimento, entrada/saída que o OFX nem trouxe, que a Mesa
//      escondeu, que a Mesa ainda espera) e no sistema (recorrência baixada com outro valor/dia, perna de transferência sem banco…);
//   3. DECOMPÕE a diferença de saldo em qualquer data de corte: saldo do sistema − saldo do banco = diferença do saldo inicial
//      − (o que o banco tem e o sistema não) + (o que o sistema tem e o banco não) ± (o mesmo lançamento em dias diferentes, quando o
//      corte passa entre os dois). A soma dos componentes TEM de dar a diferença; o que sobrar é o "resíduo" e deve ser zero.
//
// Nada aqui grava ou corrige: só mede e explica.

/** `fitid`: o identificador da MESMA linha no OFX (achado pela data, valor e texto) — quando existe, é a ligação certa com o lançamento que traz a marca [ofx:FITID]. */
export interface LinhaBanco { data: string; valor: number; historico: string; documento?: string; fitid?: string }
/** `fitids`: as marcas [ofx:…] que o lançamento carrega (veio de uma linha do OFX). */
export interface LinhaSistema { id: string; data: string; valor: number; origem: string; status: string; descricao: string; fitids?: string[];
  /** transferência criada a partir do PDF do Invest Fácil: de qual arquivo e linha veio */
  evidencia?: string }
export type ClasseBanco = "aplicacao" | "resgate" | "rendimento" | "outro";

export interface ItemBanco extends LinhaBanco {
  classe: ClasseBanco;
  /** a mesma linha (data + valor) existe no OFX importado? `undefined` = não se sabe (sem OFX) */
  noOfx?: boolean;
  /** o que a Mesa de Conciliação faz com a linha do OFX: "nova", "ja_registrada: …", "conciliar"… */
  mesa?: string;
}

export interface Par { banco: LinhaBanco[]; sistema: LinhaSistema[]; regra: "fitid" | "mesmo_dia" | "data_diferente" | "agrupado"; dias: number }

export const JANELA_DE_PAREAMENTO = 5;
const c2 = (n: number) => Math.round(n * 100) / 100;
const dia = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000;
const soma = (xs: { valor: number }[]) => c2(xs.reduce((s, x) => s + x.valor, 0));

export function classeDoHistorico(h: string): ClasseBanco {
  if (/RESGATE\s+INVEST|RESG\.?\s*AUTOM\.?\s*INVEST/i.test(h)) return "resgate";
  if (/APLIC\.?\s*INVEST/i.test(h)) return "aplicacao";
  if (/RENTAB\.?\s*INVEST/i.test(h)) return "rendimento";
  return "outro";
}

// ── 1. o pareamento ──────────────────────────────────────────────────────────────

/** Combinações de 2 e 3 lançamentos de MESMO sinal, dentro da janela, que somam `alvo`. */
function subconjuntoQueSoma(candidatos: LinhaSistema[], alvo: number): LinhaSistema[] | null {
  const xs = candidatos.slice(0, 24);
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    if (Math.abs(xs[i].valor + xs[j].valor - alvo) < 0.005) return [xs[i], xs[j]];
    for (let k = j + 1; k < xs.length; k++) if (Math.abs(xs[i].valor + xs[j].valor + xs[k].valor - alvo) < 0.005) return [xs[i], xs[j], xs[k]];
  }
  return null;
}

export function parear(banco: LinhaBanco[], sistema: LinhaSistema[]): { pares: Par[]; soBanco: LinhaBanco[]; soSistema: LinhaSistema[] } {
  const livresB = banco.map((b, i) => ({ b, i, usado: false }));
  const livresS = sistema.map(s => ({ s, usado: false }));
  const pares: Par[] = [];
  const iguais = (a: number, b: number) => Math.abs(a - b) < 0.005;

  // 0ª passada: a MARCA do OFX. Duas linhas do banco iguais no mesmo dia (vários PIX de R$ 20) são indistinguíveis por data e valor — sem a marca,
  // qual delas "falta" no sistema seria sorteio. O lançamento que carrega [ofx:FITID] já diz a qual linha pertence.
  for (const x of livresB) {
    if (!x.b.fitid) continue;
    const par = livresS.find(y => !y.usado && y.s.fitids?.includes(x.b.fitid!) && iguais(y.s.valor, x.b.valor));
    if (par) { x.usado = par.usado = true; pares.push({ banco: [x.b], sistema: [par.s], regra: "fitid", dias: Math.abs(Math.round(dia(par.s.data) - dia(x.b.data))) }); }
  }
  // 1ª passada: mesmo dia, mesmo valor
  for (const x of livresB) {
    if (x.usado) continue;
    const par = livresS.find(y => !y.usado && y.s.data === x.b.data && iguais(y.s.valor, x.b.valor));
    if (par) { x.usado = par.usado = true; pares.push({ banco: [x.b], sistema: [par.s], regra: "mesmo_dia", dias: 0 }); }
  }
  // 2ª passada: mesmo valor, o dia mais próximo da janela
  for (const x of livresB) {
    if (x.usado) continue;
    const cands = livresS.filter(y => !y.usado && iguais(y.s.valor, x.b.valor) && Math.abs(dia(y.s.data) - dia(x.b.data)) <= JANELA_DE_PAREAMENTO)
      .sort((a, b) => Math.abs(dia(a.s.data) - dia(x.b.data)) - Math.abs(dia(b.s.data) - dia(x.b.data)));
    if (cands[0]) { x.usado = cands[0].usado = true; pares.push({ banco: [x.b], sistema: [cands[0].s], regra: "data_diferente", dias: Math.round(dia(cands[0].s.data) - dia(x.b.data)) }); }
  }
  // 3ª passada: AGRUPADO — um pagamento do banco lançado em 2–3 partes no sistema (principal + juros/multa)…
  for (const x of livresB.filter(l => !l.usado).sort((a, b) => Math.abs(b.b.valor) - Math.abs(a.b.valor))) {
    const cands = livresS.filter(y => !y.usado && Math.sign(y.s.valor) === Math.sign(x.b.valor) && Math.abs(y.s.valor) < Math.abs(x.b.valor) - 0.004
      && Math.abs(dia(y.s.data) - dia(x.b.data)) <= JANELA_DE_PAREAMENTO);
    const achado = subconjuntoQueSoma(cands.map(y => y.s), x.b.valor);
    if (achado) {
      x.usado = true; for (const s of achado) livresS.find(y => y.s === s)!.usado = true;
      pares.push({ banco: [x.b], sistema: achado, regra: "agrupado", dias: Math.max(...achado.map(s => Math.abs(Math.round(dia(s.data) - dia(x.b.data))))) });
    }
  }
  // …e o inverso: UM lançamento do sistema que cobre 2–3 linhas do banco
  for (const y of livresS.filter(l => !l.usado)) {
    const cands = livresB.filter(x => !x.usado && Math.sign(x.b.valor) === Math.sign(y.s.valor) && Math.abs(x.b.valor) < Math.abs(y.s.valor) - 0.004
      && Math.abs(dia(x.b.data) - dia(y.s.data)) <= JANELA_DE_PAREAMENTO).slice(0, 24);
    let achado: typeof cands | null = null;
    for (let i = 0; i < cands.length && !achado; i++) for (let j = i + 1; j < cands.length && !achado; j++) {
      if (Math.abs(cands[i].b.valor + cands[j].b.valor - y.s.valor) < 0.005) achado = [cands[i], cands[j]];
    }
    if (achado) { y.usado = true; for (const x of achado) x.usado = true; pares.push({ banco: achado.map(x => x.b), sistema: [y.s], regra: "agrupado", dias: 0 }); }
  }
  return { pares, soBanco: livresB.filter(x => !x.usado).map(x => x.b), soSistema: livresS.filter(y => !y.usado).map(y => y.s) };
}

// ── 2. as causas ────────────────────────────────────────────────────────────────

export type CausaBanco =
  | "aplicacao_nao_registrada" | "resgate_nao_registrado" | "rendimento_nao_registrado"
  | "fora_do_ofx" | "oculta_pela_mesa" | "pendente_na_mesa" | "nao_lancada";
export type CausaSistema = "duplicata_no_sistema" | "recorrencia_sem_banco" | "transferencia_sem_banco" | "manual_sem_banco" | "importado_sem_banco" | "outra_sem_banco";

export const ROTULO_CAUSA_BANCO: Record<CausaBanco, { rotulo: string; oQueFazer: string }> = {
  aplicacao_nao_registrada: { rotulo: "Aplicação (Invest Fácil) sem transferência no sistema", oQueFazer: "Registrar como Transferência Bradesco → Caixa de Aplicação. O OFX não traz esta linha: ela só existe no PDF do extrato." },
  resgate_nao_registrado: { rotulo: "Resgate (Invest Fácil) sem transferência no sistema", oQueFazer: "Registrar como Transferência Caixa de Aplicação → Bradesco. O OFX não traz esta linha: ela só existe no PDF do extrato." },
  rendimento_nao_registrado: { rotulo: "Rendimento do Invest Fácil sem lançamento", oQueFazer: "Importar pelo OFX (RENTAB.INVEST FACILCRED vem nele) e classificar como receita financeira." },
  fora_do_ofx: { rotulo: "Movimento do banco que NÃO está no OFX", oQueFazer: "Falta de importação de verdade: baixar o OFX de novo (período completo) ou lançar à mão." },
  oculta_pela_mesa: { rotulo: "Movimento no OFX que a Mesa dá como 'já registrado' sem haver lançamento", oQueFazer: "A regra de 'já existe lançamento conciliado com este valor e data' escondeu a linha. Corrigida em 08/10/2026 — reabrir a Mesa e confirmar." },
  pendente_na_mesa: { rotulo: "Movimento no OFX ainda não confirmado na Mesa", oQueFazer: "Confirmar na Mesa de Conciliação (é o fluxo normal)." },
  nao_lancada: { rotulo: "Movimento do banco sem lançamento (OFX não conferido)", oQueFazer: "Importar o OFX do período junto da auditoria para saber se é importação ou conciliação." },
};
export const ROTULO_CAUSA_SISTEMA: Record<CausaSistema, { rotulo: string; oQueFazer: string }> = {
  duplicata_no_sistema: { rotulo: "Provável DUPLICATA: o sistema tem dois lançamentos para o mesmo movimento do banco", oQueFazer: "Um veio da Mesa/OFX (conciliado) e o outro foi digitado à mão (realizado) com o mesmo valor, no mesmo dia ou perto. Apagar o digitado — a mesma correção das 12 obrigações duplicadas." },
  recorrencia_sem_banco: { rotulo: "Lançamento de recorrência marcado como pago sem linha igual no banco", oQueFazer: "Valor ou data diferem do débito real (ou foi baixado sem o pagamento existir). Conferir e acertar o valor/data ou voltar a previsto." },
  transferencia_sem_banco: { rotulo: "Perna de transferência sem movimento igual no banco desta conta", oQueFazer: "A outra perna pode estar em outra conta, ou a transferência foi lançada com valor/dia diferentes do banco." },
  manual_sem_banco: { rotulo: "Lançamento manual sem linha igual no banco", oQueFazer: "Conferir se é duplicata do que veio do OFX, de outro dia, ou de valor diferente." },
  importado_sem_banco: { rotulo: "Lançamento importado sem linha igual no banco", oQueFazer: "Importado de arquivo de outro período/conta, ou o banco reclassificou a linha. Conferir." },
  outra_sem_banco: { rotulo: "Outro lançamento sem linha igual no banco", oQueFazer: "Conferir manualmente." },
};

export function causaDoBanco(b: ItemBanco): CausaBanco {
  if (b.classe === "aplicacao") return "aplicacao_nao_registrada";
  if (b.classe === "resgate") return "resgate_nao_registrado";
  if (b.classe === "rendimento") return "rendimento_nao_registrado";
  if (b.noOfx === undefined) return "nao_lancada";
  if (!b.noOfx) return "fora_do_ofx";
  return b.mesa?.startsWith("ja_registrada") ? "oculta_pela_mesa" : "pendente_na_mesa";
}
export function causaDoSistema(s: LinhaSistema, duplicatas?: ReadonlySet<string>): CausaSistema {
  if (duplicatas?.has(s.id)) return "duplicata_no_sistema";
  if (s.origem === "recorrencia" || s.origem === "liquidacao") return "recorrencia_sem_banco";
  if (s.origem === "transferencia") return "transferencia_sem_banco";
  if (s.origem === "manual") return "manual_sem_banco";
  if (s.origem === "importado_ofx" || s.origem === "importado_omie") return "importado_sem_banco";
  return "outra_sem_banco";
}

// ── 3. a auditoria e a decomposição ──────────────────────────────────────────────

export interface EntradaDaAuditoria {
  banco: LinhaBanco[];
  sistema: LinhaSistema[];
  /** saldo do banco e do sistema ANTES da primeira data do período (o "saldo anterior") */
  saldoInicialBanco: number;
  saldoInicialSistema: number;
  /** anota cada linha do banco com o que se sabe do OFX/Mesa (opcional) */
  anotar?: (b: LinhaBanco) => { noOfx?: boolean; mesa?: string };
}

export interface Auditoria {
  saldoInicialBanco: number;
  saldoInicialSistema: number;
  pares: Par[];
  soBanco: ItemBanco[];
  soSistema: LinhaSistema[];
  /** ids dos lançamentos sem par que repetem o valor de um lançamento JÁ pareado, a até 5 dias: provável duplicata */
  duplicatas: string[];
  banco: LinhaBanco[];
  sistema: LinhaSistema[];
}

export function auditar(e: EntradaDaAuditoria): Auditoria {
  const { pares, soBanco, soSistema } = parear(e.banco, e.sistema);
  // duplicata provável: sobrou sem par, e há OUTRO lançamento do sistema, esse com par, do mesmo valor a até 5 dias
  const pareados = pares.flatMap(p => p.sistema);
  const duplicatas = soSistema.filter(s => pareados.some(q => Math.abs(q.valor - s.valor) < 0.005 && Math.abs(dia(q.data) - dia(s.data)) <= JANELA_DE_PAREAMENTO)).map(s => s.id);
  return {
    duplicatas,
    saldoInicialBanco: e.saldoInicialBanco, saldoInicialSistema: e.saldoInicialSistema, pares, banco: e.banco, sistema: e.sistema, soSistema,
    soBanco: soBanco.map(b => ({ ...b, classe: classeDoHistorico(b.historico), ...(e.anotar ? e.anotar(b) : {}) })),
  };
}

export interface Componente {
  chave: string; rotulo: string; oQueFazer?: string;
  /** contribuição para (saldo do sistema − saldo do banco): positiva = o sistema tem a mais */
  valor: number; n: number;
  tipo: "saldo_inicial" | "banco_sem_sistema" | "sistema_sem_banco" | "tempo";
}
export interface Decomposicao {
  corte: string;
  saldoBanco: number; saldoSistema: number; diferenca: number;
  componentes: Componente[];
  /** diferença − soma dos componentes: TEM de ser 0,00 */
  residuo: number;
}

/** Saldo de cada lado no fim do dia `corte`: o saldo inicial mais os movimentos até ele. */
export function saldosNoCorte(a: Auditoria, corte: string): { banco: number; sistema: number } {
  return {
    banco: c2(a.saldoInicialBanco + soma(a.banco.filter(l => l.data <= corte))),
    sistema: c2(a.saldoInicialSistema + soma(a.sistema.filter(l => l.data <= corte))),
  };
}

export function decompor(a: Auditoria, corte: string): Decomposicao {
  const { banco: saldoBanco, sistema: saldoSistema } = saldosNoCorte(a, corte);
  const diferenca = c2(saldoSistema - saldoBanco);
  const componentes: Componente[] = [];

  const dSaldoInicial = c2(a.saldoInicialSistema - a.saldoInicialBanco);
  if (Math.abs(dSaldoInicial) > 0.004) componentes.push({ chave: "saldo_inicial", rotulo: "Saldo anterior ao período (sistema − banco)", valor: dSaldoInicial, n: 0, tipo: "saldo_inicial" });

  const porCausaB = new Map<CausaBanco, ItemBanco[]>();
  for (const b of a.soBanco.filter(x => x.data <= corte)) { const k = causaDoBanco(b); (porCausaB.get(k) ?? porCausaB.set(k, []).get(k)!).push(b); }
  for (const [k, xs] of porCausaB) componentes.push({ chave: k, rotulo: ROTULO_CAUSA_BANCO[k].rotulo, oQueFazer: ROTULO_CAUSA_BANCO[k].oQueFazer, valor: c2(-soma(xs)), n: xs.length, tipo: "banco_sem_sistema" });

  const dups = new Set(a.duplicatas);
  const porCausaS = new Map<CausaSistema, LinhaSistema[]>();
  for (const s of a.soSistema.filter(x => x.data <= corte)) { const k = causaDoSistema(s, dups); (porCausaS.get(k) ?? porCausaS.set(k, []).get(k)!).push(s); }
  for (const [k, xs] of porCausaS) componentes.push({ chave: k, rotulo: ROTULO_CAUSA_SISTEMA[k].rotulo, oQueFazer: ROTULO_CAUSA_SISTEMA[k].oQueFazer, valor: c2(soma(xs)), n: xs.length, tipo: "sistema_sem_banco" });

  // o mesmo movimento em dias diferentes: só pesa quando o corte passa ENTRE os dois dias
  let tempo = 0, nTempo = 0;
  for (const p of a.pares) {
    const sis = soma(p.sistema.filter(s => s.data <= corte));
    const ban = soma(p.banco.filter(b => b.data <= corte));
    const d = c2(sis - ban);
    if (Math.abs(d) > 0.004) { tempo = c2(tempo + d); nTempo++; }
  }
  if (nTempo > 0) componentes.push({ chave: "tempo", rotulo: "Mesmo movimento em dias diferentes, com o corte entre eles", oQueFazer: "Não é erro de saldo: some quando o dia seguinte entra no período. O lançamento do sistema está datado em outro dia que o do banco.", valor: tempo, n: nTempo, tipo: "tempo" });

  const somaComp = c2(componentes.reduce((s, c) => s + c.valor, 0));
  return { corte, saldoBanco, saldoSistema, diferenca, componentes, residuo: c2(diferenca - somaComp) };
}

/** Dia a dia: o que o banco e o sistema movimentaram e a diferença acumulada — onde o saldo deixa de bater. */
export function porDia(a: Auditoria): { data: string; banco: number; sistema: number; diferenca: number; acumulada: number }[] {
  const datas = [...new Set([...a.banco.map(l => l.data), ...a.sistema.map(l => l.data)])].sort();
  let acumulada = c2(a.saldoInicialSistema - a.saldoInicialBanco);
  return datas.map(data => {
    const banco = soma(a.banco.filter(l => l.data === data)), sistema = soma(a.sistema.filter(l => l.data === data));
    const diferenca = c2(sistema - banco);
    acumulada = c2(acumulada + diferenca);
    return { data, banco, sistema, diferenca, acumulada };
  });
}

/** Em que dia a diferença acumulada passa a ser diferente do saldo inicial pela PRIMEIRA vez. */
export function primeiroDiaQueDiverge(a: Auditoria): string | null {
  const base = c2(a.saldoInicialSistema - a.saldoInicialBanco);
  return porDia(a).find(d => Math.abs(d.acumulada - base) > 0.004)?.data ?? null;
}

// ── 4. o relatório (texto para copiar e guardar) ─────────────────────────────────

const reais = (n: number) => `${n < 0 ? "−" : ""}R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBr = (d: string) => d.split("-").reverse().join("/");

export interface MetaDoRelatorio { conta: string; de: string; ate: string; arquivos: string[]; avisos: string[] }

export function relatorioMarkdown(a: Auditoria, cortes: string[], meta: MetaDoRelatorio): string {
  const out: string[] = [];
  out.push(`# Auditoria do extrato — ${meta.conta} — ${dataBr(meta.de)} a ${dataBr(meta.ate)}`, "", `Arquivos: ${meta.arquivos.join(" · ")}`, "");
  for (const av of meta.avisos) out.push(`> ⚠ ${av}`);
  if (meta.avisos.length) out.push("");

  out.push("## 1. Saldo do banco × saldo do sistema", "", "| Corte | Banco | Sistema | Diferença (sistema − banco) | Resíduo |", "|---|---:|---:|---:|---:|");
  const ds = cortes.map(c => decompor(a, c));
  for (const d of ds) out.push(`| ${dataBr(d.corte)} | ${reais(d.saldoBanco)} | ${reais(d.saldoSistema)} | ${reais(d.diferenca)} | ${reais(d.residuo)} |`);
  out.push("", "_Resíduo = diferença − soma dos componentes abaixo. Tem de ser R$ 0,00: é a prova de que cada centavo está explicado._", "");

  const ultimo = ds[ds.length - 1];
  out.push(`## 2. De onde vem a diferença em ${dataBr(ultimo.corte)}`, "", "| Causa | Lançamentos | Efeito no saldo do sistema − banco | O que fazer |", "|---|---:|---:|---|");
  for (const c of ultimo.componentes) out.push(`| ${c.rotulo} | ${c.n || ""} | ${reais(c.valor)} | ${c.oQueFazer ?? ""} |`);
  out.push(`| **Total** | | **${reais(ultimo.diferenca)}** | |`, "");

  const primeiro = primeiroDiaQueDiverge(a);
  out.push("## 3. Onde o saldo deixa de bater", "", primeiro ? `A diferença aparece pela primeira vez em **${dataBr(primeiro)}**.` : "O saldo bate em todos os dias do período.", "");
  const dias = porDia(a).filter(d => Math.abs(d.diferenca) > 0.004);
  if (dias.length) {
    out.push("| Dia | Banco | Sistema | Diferença do dia | Acumulada |", "|---|---:|---:|---:|---:|");
    for (const d of dias) out.push(`| ${dataBr(d.data)} | ${reais(d.banco)} | ${reais(d.sistema)} | ${reais(d.diferenca)} | ${reais(d.acumulada)} |`);
    out.push("");
  }

  out.push("## 4. As linhas", "");
  const porCausa = new Map<CausaBanco, ItemBanco[]>();
  for (const x of a.soBanco) { const k = causaDoBanco(x); (porCausa.get(k) ?? porCausa.set(k, []).get(k)!).push(x); }
  for (const [k, xs] of porCausa) {
    out.push(`### No banco, sem lançamento no sistema — ${ROTULO_CAUSA_BANCO[k].rotulo} (${xs.length} · ${reais(soma(xs))})`, "");
    for (const x of xs) out.push(`- ${dataBr(x.data)} · ${reais(x.valor)} · ${x.historico.slice(0, 80)}${x.mesa ? ` · Mesa: ${x.mesa.slice(0, 50)}` : ""}`);
    out.push("");
  }
  const sisPorCausa = new Map<CausaSistema, LinhaSistema[]>();
  for (const x of a.soSistema) { const k = causaDoSistema(x, new Set(a.duplicatas)); (sisPorCausa.get(k) ?? sisPorCausa.set(k, []).get(k)!).push(x); }
  for (const [k, xs] of sisPorCausa) {
    out.push(`### No sistema, sem linha igual no banco — ${ROTULO_CAUSA_SISTEMA[k].rotulo} (${xs.length} · ${reais(soma(xs))})`, "");
    for (const x of xs) out.push(`- ${dataBr(x.data)} · ${reais(x.valor)} · ${x.origem} · ${x.descricao.slice(0, 70)}`);
    out.push("");
  }
  const deslocados = a.pares.filter(p => p.regra === "data_diferente" || p.regra === "agrupado");
  if (deslocados.length) {
    out.push(`### Pareados com dia diferente ou em partes (${deslocados.length}) — não mudam o saldo final, só o dia`, "");
    for (const p of deslocados) out.push(`- banco ${p.banco.map(l => `${dataBr(l.data)} ${reais(l.valor)}`).join(" + ")} ↔ sistema ${p.sistema.map(l => `${dataBr(l.data)} ${reais(l.valor)} [${l.origem}]`).join(" + ")}`);
    out.push("");
  }
  out.push(`Pareados pela marca do OFX: ${a.pares.filter(p => p.regra === "fitid").length} · no mesmo dia e valor: ${a.pares.filter(p => p.regra === "mesmo_dia").length} · de ${a.banco.length} linhas do banco.`);
  return out.join("\n");
}
