// ─── analise — o cálculo ÚNICO das contribuições (puro: sem rede, sem Deno, sem React) ───────────────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (27/10/2026): evoluir a tela Doadores com indicadores, gráficos e o bloco "Não contribuíram no período". A lição dos e-mails vale aqui: **o MESMO cálculo** na tela, no Excel e (na próxima
// fatia) no e-mail ao pastor — por isso mora em `supabase/functions/_shared/` e é re-exportado em `src/lib/contribuicoes.ts`. Nada aqui lê banco: recebe linhas mínimas e devolve números.
//
// O PISO (decisão dela): **01/01/2026** é o início oficial de toda análise de doadores/dizimistas. Medido em 27/10/2026: em 2025 só ~30–35% dos dízimos têm uma pessoa ligada; de 2026 em diante, ~92%
// das entradas (93–98% do valor). Antes do piso, "novo", "recorrente" e "nunca contribuiu" seriam falsos — o período é ajustado ao piso e a tela diz que foi.
//
// DEFINIÇÕES (as que ela não fixou ficam como padrão explícito, mudável aqui num lugar só):
//   · Contribuição = entrada realizada/conciliada de categoria Dízimos, Ofertas ou Ofertas para Missões. Transferências (sem categoria), rendimentos, descontos e estornos NÃO são contribuição.
//   · Dizimista = pessoa com ≥1 Dízimo identificado no período. Doador = pessoa com ≥1 contribuição (qualquer das três) identificada.
//   · Recorrente = dizimista que deu Dízimo em TODOS os meses COMPLETOS do período; a % é sobre os dizimistas. Sem mês completo, não se calcula.
//   · Novo = primeira contribuição identificada dentro do período, SEM nenhuma identificada entre o piso e o início do período. Com o período começando no piso, não há histórico: não se calcula.
//   · Média mensal = arrecadado ÷ (dias do período ÷ 30,4375).
//   · Semana = segunda a domingo (identificada pela segunda-feira).

export const PISO_DE_IDENTIFICACAO = "2026-01-01";
export const DIAS_NO_MES_MEDIO = 30.4375;

export type TipoDeContribuicao = "dizimo" | "oferta" | "missoes";

/** Uma entrada do caixa, no mínimo necessário. `categoria` é o NOME da categoria (ou nulo para transferência/sem categoria). */
export interface LinhaDeContribuicao { pessoa_id: string | null; data: string; valor: number; categoria: string | null }

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O tipo de contribuição pelo NOME da categoria (o cadastro grafa "Dizimos" sem acento), ou `null` se a entrada não é contribuição. */
export function tipoDaContribuicao(categoria: string | null | undefined): TipoDeContribuicao | null {
  if (!categoria) return null;
  const n = semAcento(categoria);
  if (n.startsWith("dizim")) return "dizimo";
  if (n.includes("missoes") || n.includes("missao")) return "missoes";
  if (n.startsWith("oferta")) return "oferta";
  return null;
}

// ── datas (tudo em UTC: "AAAA-MM-DD" nunca passa por fuso — o defeito de 60 pontos corrigido em 29/09) ──
const parse = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
export const somarDias = (ymd: string, n: number) => fmt(parse(ymd) + n * 86_400_000);
export const diasEntre = (de: string, ate: string) => Math.round((parse(ate) - parse(de)) / 86_400_000);
const mesDe = (ymd: string) => ymd.slice(0, 7);

/** A segunda-feira da semana de `ymd`. */
export function segundaDaSemana(ymd: string): string {
  const dia = new Date(parse(ymd)).getUTCDay();   // 0 = domingo
  return somarDias(ymd, -((dia + 6) % 7));
}

function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return fmt(Date.UTC(a, m, 0));
}

/** Todos os meses (AAAA-MM) que o período toca, em ordem. */
export function mesesQueOPeriodoToca(ini: string, fim: string): string[] {
  const out: string[] = [];
  let [a, m] = [Number(ini.slice(0, 4)), Number(ini.slice(5, 7))];
  const [af, mf] = [Number(fim.slice(0, 4)), Number(fim.slice(5, 7))];
  while (a < af || (a === af && m <= mf)) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}

/** Só os meses que cabem INTEIROS dentro do período. */
export function mesesCompletos(ini: string, fim: string): string[] {
  return mesesQueOPeriodoToca(ini, fim).filter(m => `${m}-01` >= ini && ultimoDiaDoMes(m) <= fim);
}

// ── períodos ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PresetDePeriodo = "90d" | "6m" | "12m" | "ano" | "desde_piso" | "personalizado";
export const PRESETS_DE_PERIODO: { id: PresetDePeriodo; rotulo: string }[] = [
  { id: "90d", rotulo: "Últimos 90 dias" }, { id: "6m", rotulo: "Últimos 6 meses" }, { id: "12m", rotulo: "Últimos 12 meses" },
  { id: "ano", rotulo: "Este ano" }, { id: "desde_piso", rotulo: "Desde 01/01/2026" }, { id: "personalizado", rotulo: "Personalizado" },
];

export interface PeriodoAjustado { ini: string; fim: string; ajustado: boolean; vazio: boolean }

/** Aplica o piso: o início nunca é anterior a 01/01/2026. `ajustado` avisa a tela de que o pedido começava antes; `vazio` = o período inteiro cai antes do piso ou é invertido. */
export function ajustarAoPiso(ini: string, fim: string): PeriodoAjustado {
  const novoIni = ini < PISO_DE_IDENTIFICACAO ? PISO_DE_IDENTIFICACAO : ini;
  return { ini: novoIni, fim, ajustado: novoIni !== ini, vazio: fim < novoIni };
}

/** O intervalo de cada atalho, a partir de "hoje" (AAAA-MM-DD, em Brasília — quem chama passa o hoje certo). "6 meses" = do mesmo dia seis meses atrás, +1 dia, até hoje. */
export function intervaloDoPreset(preset: Exclude<PresetDePeriodo, "personalizado">, hoje: string): { ini: string; fim: string } {
  switch (preset) {
    case "90d": return { ini: somarDias(hoje, -89), fim: hoje };
    case "6m": return { ini: somarDias(mesesAtras(hoje, 6), 1), fim: hoje };
    case "12m": return { ini: somarDias(mesesAtras(hoje, 12), 1), fim: hoje };
    case "ano": return { ini: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
    case "desde_piso": return { ini: PISO_DE_IDENTIFICACAO, fim: hoje };
  }
}

function mesesAtras(ymd: string, n: number): string {
  let a = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)) - n;
  while (m < 1) { m += 12; a--; }
  const dia = Math.min(Number(ymd.slice(8, 10)), Number(ultimoDiaDoMes(`${a}-${String(m).padStart(2, "0")}`).slice(8, 10)));
  return `${a}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ── a análise do período ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SemanaDeContribuicao { inicio: string; contribuintes: number; valor: number }
export interface MesDeContribuicao { mes: string; contribuintes: number; valor: number }
export interface Destaques {
  maiorAdesao: SemanaDeContribuicao | null;
  maiorArrecadacao: SemanaDeContribuicao | null;
  /** a semana de maior alta de arrecadação sobre a semana anterior (só entre semanas consecutivas) */
  maiorCrescimento: { semana: SemanaDeContribuicao; anterior: SemanaDeContribuicao; variacao: number } | null;
}
export interface AnaliseDoPeriodo {
  periodo: { ini: string; fim: string; dias: number; mesesCompletos: number };
  arrecadado: number;
  porTipo: Record<TipoDeContribuicao, number>;
  /** a parte que tem pessoa ligada — a "cobertura" de identificação que a tela mostra ao lado dos números */
  cobertura: { valorIdentificado: number; valorNaoIdentificado: number; pctDoValor: number | null; entradasSemPessoa: number };
  dizimistas: number;
  doadores: number;
  mediaMensal: number;
  mediaPorDoador: number | null;
  /** contribuições identificadas por doador no período */
  frequenciaMedia: number | null;
  recorrentes: { pessoas: number; pct: number | null; meses: number } | null;
  /** NOVOS CONTRIBUINTES: a primeira contribuição identificada (de qualquer tipo) caiu no período. `null` quando o período começa no piso: sem histórico anterior confiável para dizer quem é novo */
  novos: number | null;
  /** NOVOS DIZIMISTAS: o primeiro DÍZIMO identificado caiu no período — mesmo que a pessoa já tivesse dado ofertas ou missões antes (decisão dela, 27/10/2026). `null` pelo mesmo motivo */
  novosDizimistas: number | null;
  semanas: SemanaDeContribuicao[];
  meses: MesDeContribuicao[];
  destaques: Destaques;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function analisarContribuicoes(linhas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }): AnaliseDoPeriodo {
  const { ini, fim } = periodo;
  const doPeriodo = linhas.filter(l => l.data >= ini && l.data <= fim && tipoDaContribuicao(l.categoria) !== null);
  const identificadas = doPeriodo.filter(l => !!l.pessoa_id);

  const porTipo: Record<TipoDeContribuicao, number> = { dizimo: 0, oferta: 0, missoes: 0 };
  for (const l of doPeriodo) porTipo[tipoDaContribuicao(l.categoria)!] += Number(l.valor);
  const arrecadado = arred(porTipo.dizimo + porTipo.oferta + porTipo.missoes);
  const valorIdent = arred(identificadas.reduce((s, l) => s + Number(l.valor), 0));

  const dizimistas = new Set(identificadas.filter(l => tipoDaContribuicao(l.categoria) === "dizimo").map(l => l.pessoa_id!));
  const doadores = new Set(identificadas.map(l => l.pessoa_id!));

  const dias = Math.max(1, diasEntre(ini, fim) + 1);
  const completos = mesesCompletos(ini, fim);

  // recorrência: o dizimista deu dízimo em TODOS os meses completos do período
  let recorrentes: AnaliseDoPeriodo["recorrentes"] = null;
  if (completos.length > 0 && dizimistas.size > 0) {
    const mesesPorPessoa = new Map<string, Set<string>>();
    for (const l of identificadas.filter(x => tipoDaContribuicao(x.categoria) === "dizimo")) { const s = mesesPorPessoa.get(l.pessoa_id!) ?? new Set<string>(); s.add(mesDe(l.data)); mesesPorPessoa.set(l.pessoa_id!, s); }
    const n = [...mesesPorPessoa.values()].filter(s => completos.every(m => s.has(m))).length;
    recorrentes = { pessoas: n, pct: arred((n / dizimistas.size) * 100), meses: completos.length };
  }

  // novos: sem contribuição identificada entre o piso e o início do período
  let novos: number | null = null;
  if (ini > PISO_DE_IDENTIFICACAO) {
    const antes = new Set(linhas.filter(l => !!l.pessoa_id && l.data >= PISO_DE_IDENTIFICACAO && l.data < ini && tipoDaContribuicao(l.categoria) !== null).map(l => l.pessoa_id!));
    novos = [...doadores].filter(p => !antes.has(p)).length;
  }
  // novos dizimistas: nenhum DÍZIMO identificado entre o piso e o início do período (ofertas e missões anteriores não impedem)
  let novosDizimistas: number | null = null;
  if (ini > PISO_DE_IDENTIFICACAO) {
    const antesDizimo = new Set(linhas.filter(l => !!l.pessoa_id && l.data >= PISO_DE_IDENTIFICACAO && l.data < ini && tipoDaContribuicao(l.categoria) === "dizimo").map(l => l.pessoa_id!));
    novosDizimistas = [...dizimistas].filter(p => !antesDizimo.has(p)).length;
  }

  // semanas e meses (contribuintes DISTINTOS e valor, só das linhas do período)
  const sem = new Map<string, { pessoas: Set<string>; valor: number }>();
  const mes = new Map<string, { pessoas: Set<string>; valor: number }>();
  for (const l of doPeriodo) {
    for (const [mapa, chave] of [[sem, segundaDaSemana(l.data)], [mes, mesDe(l.data)]] as const) {
      const e = mapa.get(chave) ?? { pessoas: new Set<string>(), valor: 0 };
      if (l.pessoa_id) e.pessoas.add(l.pessoa_id);
      e.valor += Number(l.valor);
      mapa.set(chave, e);
    }
  }
  // todas as semanas do período aparecem, inclusive as vazias (o gráfico não pode esconder uma semana sem contribuição)
  const semanas: SemanaDeContribuicao[] = [];
  for (let s = segundaDaSemana(ini); s <= fim; s = somarDias(s, 7)) {
    const e = sem.get(s);
    semanas.push({ inicio: s, contribuintes: e?.pessoas.size ?? 0, valor: arred(e?.valor ?? 0) });
  }
  const meses: MesDeContribuicao[] = mesesQueOPeriodoToca(ini, fim).map(m => ({ mes: m, contribuintes: mes.get(m)?.pessoas.size ?? 0, valor: arred(mes.get(m)?.valor ?? 0) }));

  return {
    periodo: { ini, fim, dias, mesesCompletos: completos.length },
    arrecadado,
    porTipo: { dizimo: arred(porTipo.dizimo), oferta: arred(porTipo.oferta), missoes: arred(porTipo.missoes) },
    cobertura: {
      valorIdentificado: valorIdent,
      valorNaoIdentificado: arred(arrecadado - valorIdent),
      pctDoValor: arrecadado > 0 ? arred((valorIdent / arrecadado) * 100) : null,
      entradasSemPessoa: doPeriodo.length - identificadas.length,
    },
    dizimistas: dizimistas.size,
    doadores: doadores.size,
    mediaMensal: arred(arrecadado / (dias / DIAS_NO_MES_MEDIO)),
    mediaPorDoador: doadores.size > 0 ? arred(valorIdent / doadores.size) : null,
    frequenciaMedia: doadores.size > 0 ? arred(identificadas.length / doadores.size) : null,
    recorrentes, novos, novosDizimistas, semanas, meses,
    destaques: destaquesDasSemanas(semanas),
  };
}

export function destaquesDasSemanas(semanas: SemanaDeContribuicao[]): Destaques {
  const comAlgo = semanas.filter(s => s.contribuintes > 0 || s.valor > 0);
  const maior = (f: (s: SemanaDeContribuicao) => number) => comAlgo.reduce<SemanaDeContribuicao | null>((m, s) => (m === null || f(s) > f(m) ? s : m), null);
  let crescimento: Destaques["maiorCrescimento"] = null;
  for (let i = 1; i < semanas.length; i++) {
    const ant = semanas[i - 1], cur = semanas[i];
    if (ant.valor <= 0 || cur.valor <= ant.valor) continue;
    const variacao = arred(((cur.valor - ant.valor) / ant.valor) * 100);
    if (!crescimento || variacao > crescimento.variacao) crescimento = { semana: cur, anterior: ant, variacao };
  }
  return { maiorAdesao: maior(s => s.contribuintes), maiorArrecadacao: maior(s => s.valor), maiorCrescimento: crescimento };
}

// ── "Não contribuíram no período" ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PessoaDaBase {
  id: string;
  nome: string;
  tipo_pessoa: string;
  status: string;
  data_nascimento: string | null;
  /** a família (vínculos familiares) — pessoas com o mesmo valor contam como da mesma família */
  familia_id: string | null;
}

export type ClassificacaoSemContribuicao = "nunca" | "antes";
export const FAIXAS_SEM_CONTRIBUICAO = [
  { id: "ate30", rotulo: "Até 30 dias", de: 0, ate: 30 },
  { id: "de31a60", rotulo: "31 a 60 dias", de: 31, ate: 60 },
  { id: "de61a90", rotulo: "61 a 90 dias", de: 61, ate: 90 },
  { id: "de91a180", rotulo: "91 a 180 dias", de: 91, ate: 180 },
  { id: "mais180", rotulo: "Mais de 180 dias", de: 181, ate: Infinity },
] as const;
export type FaixaSemContribuicao = typeof FAIXAS_SEM_CONTRIBUICAO[number]["id"];

export interface PessoaSemContribuicao {
  id: string;
  nome: string;
  tipo: string;
  classificacao: ClassificacaoSemContribuicao;
  /** a última contribuição identificada (desde o piso) ANTES do período; `null` = sem registro anterior ao período */
  ultima: string | null;
  /** dias entre a última contribuição e o fim do período */
  dias: number | null;
  faixa: FaixaSemContribuicao | null;
  /** alguém da mesma família contribuiu no período — pode ser que a família contribua por outra pessoa */
  familiaContribui: boolean;
  menor: boolean;
  semNascimento: boolean;
}

export interface OpcoesDosSemContribuicao {
  /** o que conta como "contribuiu": qualquer das três categorias, ou só Dízimo */
  considerar: "qualquer" | "dizimo";
  incluirMenores: boolean;
  /** o vínculo da base; ausente = membros e congregados (o padrão de sempre) */
  vinculos?: VinculoDaBase[];
}

/** Quantas pessoas da base fizeram a coisa medida e a adesão. */
export interface RecorteDeAdesao { base: number; contribuiram: number; adesaoPct: number | null }
/** A adesão geral da base e a quebra por vínculo (só os vínculos que fazem parte da base escolhida). */
export interface SaudeDeUmTipo extends RecorteDeAdesao { porVinculo: Partial<Record<VinculoDaBase, RecorteDeAdesao>> }
/**
 * As DUAS saúdes (decisão dela, 27/10/2026): a da CONTRIBUIÇÃO (quem deu dízimo, oferta ou missões) e a do DÍZIMO (quem deu dízimo). Mesma base, mesmo período; respondem perguntas diferentes —
 * "quanto da igreja participa financeiramente" × "quanto da igreja dizima".
 */
export interface SaudeDaContribuicao { contribuicao: SaudeDeUmTipo; dizimo: SaudeDeUmTipo }

export interface AnaliseDosSemContribuicao {
  base: number;
  contribuiram: number;
  naoContribuiram: number;
  /** contribuíram ÷ base */
  adesaoPct: number | null;
  nuncaDesdeOPiso: number;
  jaContribuiuAntes: number;
  faixas: Record<FaixaSemContribuicao, number>;
  /** quem saiu da base por ser menor de 18 anos (a lista os esconde por padrão) */
  menoresFora: number;
  /** a adesão por tipo (qualquer contribuição × só dízimo) e por vínculo; independe de `considerar` */
  saude: SaudeDaContribuicao;
  /** dos que não contribuíram, quantos têm alguém da família contribuindo */
  comFamiliaQueContribui: number;
  lista: PessoaSemContribuicao[];
}

export function idadeEm(nascimento: string | null, ymd: string): number | null {
  if (!nascimento) return null;
  let idade = Number(ymd.slice(0, 4)) - Number(nascimento.slice(0, 4));
  if (ymd.slice(5) < nascimento.slice(5, 10)) idade--;
  return idade;
}

/** Quem faz parte da base: membros e congregados ATIVOS. Visitante, ex-membro, inativo, transferido, desligado e falecido ficam fora. */
export const fazParteDaBase = (p: Pick<PessoaDaBase, "tipo_pessoa" | "status">) => p.status === "ativo" && (p.tipo_pessoa === "membro" || p.tipo_pessoa === "congregado");

export function analisarSemContribuicao(
  linhas: LinhaDeContribuicao[], pessoas: PessoaDaBase[], periodo: { ini: string; fim: string }, opcoes: OpcoesDosSemContribuicao,
): AnaliseDosSemContribuicao {
  const { ini, fim } = periodo;
  const conta = (l: LinhaDeContribuicao) => {
    const t = tipoDaContribuicao(l.categoria);
    return !!l.pessoa_id && t !== null && (opcoes.considerar === "qualquer" || t === "dizimo");
  };
  const noPeriodo = new Set<string>();
  const ultimaAntes = new Map<string, string>();
  for (const l of linhas) {
    if (!conta(l) || l.data < PISO_DE_IDENTIFICACAO) continue;
    if (l.data >= ini && l.data <= fim) noPeriodo.add(l.pessoa_id!);
    else if (l.data < ini) { const u = ultimaAntes.get(l.pessoa_id!); if (!u || l.data > u) ultimaAntes.set(l.pessoa_id!, l.data); }
  }

  const vinculos: string[] = opcoes.vinculos ?? ["membro", "congregado"];
  const todos = pessoas.filter(p => p.status === "ativo" && vinculos.includes(p.tipo_pessoa));
  const ehMenor = (p: PessoaDaBase) => { const i = idadeEm(p.data_nascimento, fim); return i !== null && i < 18; };
  const menoresFora = opcoes.incluirMenores ? 0 : todos.filter(ehMenor).length;
  const base = opcoes.incluirMenores ? todos : todos.filter(p => !ehMenor(p));

  const familiasQueContribuem = new Map<string, number>();   // familia_id → quantas pessoas da família contribuíram no período
  for (const p of todos) if (p.familia_id && noPeriodo.has(p.id)) familiasQueContribuem.set(p.familia_id, (familiasQueContribuem.get(p.familia_id) ?? 0) + 1);

  const faixas = Object.fromEntries(FAIXAS_SEM_CONTRIBUICAO.map(f => [f.id, 0])) as Record<FaixaSemContribuicao, number>;
  const lista: PessoaSemContribuicao[] = [];
  let contribuiram = 0;
  for (const p of base) {
    if (noPeriodo.has(p.id)) { contribuiram++; continue; }
    const ultima = ultimaAntes.get(p.id) ?? null;
    const dias = ultima ? diasEntre(ultima, fim) : null;
    const faixa = dias === null ? null : FAIXAS_SEM_CONTRIBUICAO.find(f => dias >= f.de && dias <= f.ate)!.id;
    if (faixa) faixas[faixa]++;
    lista.push({
      id: p.id, nome: p.nome, tipo: p.tipo_pessoa, classificacao: ultima ? "antes" : "nunca", ultima, dias, faixa,
      familiaContribui: !!p.familia_id && (familiasQueContribuem.get(p.familia_id) ?? 0) > 0,
      menor: ehMenor(p), semNascimento: p.data_nascimento === null,
    });
  }
  // ordem padrão: ALFABÉTICA — a lista não vira ranking nem placar
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // as duas saúdes, sempre as duas (a opção `considerar` só decide quem aparece na lista de "sem contribuição")
  const noPeriodoQualquer = new Set<string>(), noPeriodoDizimo = new Set<string>();
  for (const l of linhas) {
    const t = tipoDaContribuicao(l.categoria);
    if (!l.pessoa_id || t === null || l.data < PISO_DE_IDENTIFICACAO || l.data < ini || l.data > fim) continue;
    noPeriodoQualquer.add(l.pessoa_id);
    if (t === "dizimo") noPeriodoDizimo.add(l.pessoa_id);
  }
  const recorte = (ps: PessoaDaBase[], fizeram: Set<string>): RecorteDeAdesao => { const c = ps.filter(p => fizeram.has(p.id)).length; return { base: ps.length, contribuiram: c, adesaoPct: ps.length > 0 ? arred((c / ps.length) * 100) : null }; };
  const umTipo = (fizeram: Set<string>): SaudeDeUmTipo => ({
    ...recorte(base, fizeram),
    porVinculo: Object.fromEntries((vinculos as VinculoDaBase[]).map(v => [v, recorte(base.filter(p => p.tipo_pessoa === v), fizeram)])) as SaudeDeUmTipo["porVinculo"],
  });
  const saude: SaudeDaContribuicao = { contribuicao: umTipo(noPeriodoQualquer), dizimo: umTipo(noPeriodoDizimo) };

  return {
    base: base.length, contribuiram, naoContribuiram: lista.length,
    adesaoPct: base.length > 0 ? arred((contribuiram / base.length) * 100) : null,
    nuncaDesdeOPiso: lista.filter(p => p.classificacao === "nunca").length,
    jaContribuiuAntes: lista.filter(p => p.classificacao === "antes").length,
    faixas, menoresFora, saude,
    comFamiliaQueContribui: lista.filter(p => p.familiaContribui).length,
    lista,
  };
}

// ── a lista de pessoas (aba Pessoas) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ResumoDePessoa {
  pessoaId: string;
  total: number;
  quantidade: number;
  /** a última contribuição DENTRO do período */
  ultima: string;
  dizimista: boolean;
  /** deu dízimo em todos os meses completos do período; `null` se o período não tem mês completo */
  recorrente: boolean | null;
  /** em quantos dos meses completos do período deu dízimo (o numerador da regra de recorrente) e quantos meses completos o período tem (o denominador) */
  mesesComDizimo: number;
  mesesCompletos: number;
  /** primeira contribuição identificada desde o piso cai dentro do período; `null` se o período começa no piso */
  nova: boolean | null;
  /** o primeiro DÍZIMO identificado desde o piso cai dentro do período (e a pessoa é dizimista); `null` se o período começa no piso */
  novaDizimista: boolean | null;
}

/** Quem contribuiu no período (só contribuição identificada), uma linha por pessoa. Sem ordem: a tela ordena (por nome, por padrão). */
export function resumirPessoas(linhas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }): ResumoDePessoa[] {
  const { ini, fim } = periodo;
  const completos = mesesCompletos(ini, fim);
  const antes = new Set(linhas.filter(l => !!l.pessoa_id && l.data >= PISO_DE_IDENTIFICACAO && l.data < ini && tipoDaContribuicao(l.categoria) !== null).map(l => l.pessoa_id!));
  const antesDizimo = new Set(linhas.filter(l => !!l.pessoa_id && l.data >= PISO_DE_IDENTIFICACAO && l.data < ini && tipoDaContribuicao(l.categoria) === "dizimo").map(l => l.pessoa_id!));
  const por = new Map<string, { total: number; quantidade: number; ultima: string; dizimista: boolean; meses: Set<string> }>();   // `meses`: só os meses com DÍZIMO
  for (const l of linhas) {
    if (!l.pessoa_id || l.data < ini || l.data > fim || tipoDaContribuicao(l.categoria) === null) continue;
    const e = por.get(l.pessoa_id) ?? { total: 0, quantidade: 0, ultima: l.data, dizimista: false, meses: new Set<string>() };
    e.total += Number(l.valor); e.quantidade++;
    if (l.data > e.ultima) e.ultima = l.data;
    if (tipoDaContribuicao(l.categoria) === "dizimo") { e.dizimista = true; e.meses.add(mesDe(l.data)); }
    por.set(l.pessoa_id, e);
  }
  return [...por.entries()].map(([pessoaId, e]) => ({
    pessoaId, total: arred(e.total), quantidade: e.quantidade, ultima: e.ultima, dizimista: e.dizimista,
    recorrente: completos.length > 0 ? completos.every(m => e.meses.has(m)) : null,
    mesesComDizimo: completos.filter(m => e.meses.has(m)).length, mesesCompletos: completos.length,
    nova: ini > PISO_DE_IDENTIFICACAO ? !antes.has(pessoaId) : null,
    novaDizimista: ini > PISO_DE_IDENTIFICACAO ? e.dizimista && !antesDizimo.has(pessoaId) : null,
  }));
}

// ── o resumo da base, SEM nomes (o que o e-mail pode levar) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Só números: a lista nominal (`lista`) nunca sai daqui. É o que o e-mail ao pastor recebe no bloco "Saúde da base contribuinte". */
export interface ResumoDaBase {
  base: number;
  contribuiram: number;
  naoContribuiram: number;
  adesaoPct: number | null;
  nuncaDesdeOPiso: number;
  jaContribuiuAntes: number;
  /** quantas pessoas (que contribuíram antes, mas não no período) estão sem contribuir há MAIS de 30, 60, 90 e 180 dias — acumulado, como ela pediu */
  haMaisDe: { dias30: number; dias60: number; dias90: number; dias180: number };
  menoresFora: number;
  /** a saúde da contribuição × a saúde do dízimo, com a quebra por vínculo */
  saude: SaudeDaContribuicao;
}

export function resumirBase(a: AnaliseDosSemContribuicao): ResumoDaBase {
  const f = a.faixas;
  const mais180 = f.mais180, ate180 = f.de91a180 + mais180, ate90 = f.de61a90 + ate180, ate60 = f.de31a60 + ate90;
  return {
    base: a.base, contribuiram: a.contribuiram, naoContribuiram: a.naoContribuiram, adesaoPct: a.adesaoPct,
    nuncaDesdeOPiso: a.nuncaDesdeOPiso, jaContribuiuAntes: a.jaContribuiuAntes,
    haMaisDe: { dias30: ate60, dias60: ate90, dias90: ate180, dias180: mais180 },
    menoresFora: a.menoresFora, saude: a.saude,
  };
}

// ── os filtros globais: BASE analisada e CONTRIBUIÇÕES consideradas (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela: "todos os indicadores e gráficos respeitam a base escolhida" e as categorias são cumulativas. Regras:
//   · Base = ativos do vínculo escolhido (membros; membros e congregados — o padrão; membros, congregados e visitantes ativos). Menores de 18 anos fazem parte da base para QUEM CONTRIBUIU (uma criança que
//     dá oferta não é "de fora"); só saem do denominador de "quem não contribuiu" (opção de incluir, como antes).
//   · Quem contribuiu e NÃO está na base (inativo, ex-membro, visitante quando não incluído) não entra nos indicadores: aparece à parte em `foraDaBase` (pessoas e valor).
//   · Entrada sem pessoa identificada continua no total e na cobertura (é a qualidade do dado), como antes.
export type BaseAnalisada = "membros" | "membros_congregados" | "membros_congregados_visitantes";
export type VinculoDaBase = "membro" | "congregado" | "visitante";
export const VINCULOS_DA_BASE: Record<BaseAnalisada, VinculoDaBase[]> = {
  membros: ["membro"], membros_congregados: ["membro", "congregado"], membros_congregados_visitantes: ["membro", "congregado", "visitante"],
};
export const ROTULO_DA_BASE: Record<BaseAnalisada, string> = { membros: "Membros", membros_congregados: "Membros e congregados", membros_congregados_visitantes: "Membros, congregados e visitantes ativos" };
export const BASES_ANALISADAS: BaseAnalisada[] = ["membros", "membros_congregados", "membros_congregados_visitantes"];
export const CATEGORIAS_DE_CONTRIBUICAO: { id: TipoDeContribuicao; rotulo: string }[] = [
  { id: "dizimo", rotulo: "Dízimos" }, { id: "oferta", rotulo: "Ofertas" }, { id: "missoes", rotulo: "Ofertas para Missões" },
];
export interface FiltrosDeAnalise { base: BaseAnalisada; categorias: TipoDeContribuicao[] }
export const FILTROS_PADRAO: FiltrosDeAnalise = { base: "membros_congregados", categorias: CATEGORIAS_DE_CONTRIBUICAO.map(c => c.id) };

/** O texto das categorias escolhidas: "Dízimos, Ofertas e Ofertas para Missões". */
export function rotuloDasCategorias(cats: TipoDeContribuicao[]): string {
  const nomes = CATEGORIAS_DE_CONTRIBUICAO.filter(c => cats.includes(c.id)).map(c => c.rotulo);
  return nomes.length <= 1 ? (nomes[0] ?? "nenhuma") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Os ids de quem faz parte da base (ativos do vínculo escolhido; menores incluídos — ver acima). */
export function idsDaBase(pessoas: PessoaDaBase[], base: BaseAnalisada): Set<string> {
  const vinculos = VINCULOS_DA_BASE[base];
  return new Set(pessoas.filter(p => p.status === "ativo" && (vinculos as string[]).includes(p.tipo_pessoa)).map(p => p.id));
}

export interface ForaDaBase { pessoas: number; valor: number }

/**
 * Aplica as categorias e a base às linhas. Devolve as linhas que contam (histórico completo de quem está na base, mais as entradas sem pessoa) e quem ficou de fora no período.
 * `ids` nulo = sem filtro de base (só categorias).
 */
export function aplicarFiltros(
  linhas: LinhaDeContribuicao[], filtros: FiltrosDeAnalise, ids: Set<string> | null, periodo: { ini: string; fim: string },
): { linhas: LinhaDeContribuicao[]; foraDaBase: ForaDaBase } {
  const porCategoria = linhas.filter(l => { const t = tipoDaContribuicao(l.categoria); return t !== null && filtros.categorias.includes(t); });
  if (!ids) return { linhas: porCategoria, foraDaBase: { pessoas: 0, valor: 0 } };
  const contam: LinhaDeContribuicao[] = [];
  const foraPessoas = new Set<string>();
  let foraValor = 0;
  for (const l of porCategoria) {
    if (!l.pessoa_id || ids.has(l.pessoa_id)) { contam.push(l); continue; }
    if (l.data >= periodo.ini && l.data <= periodo.fim) { foraPessoas.add(l.pessoa_id); foraValor += Number(l.valor); }
  }
  return { linhas: contam, foraDaBase: { pessoas: foraPessoas.size, valor: Math.round(foraValor * 100) / 100 } };
}

// ── tendências (modelo Diretoria) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Dois modos, sem inventar o que o dado não sustenta: (1) comparação com o período ANTERIOR equivalente (mesma duração, terminando na véspera), SÓ quando esse período também começa em 01/01/2026
// ou depois (antes disso a identificação não é confiável); (2) senão, a inclinação da própria série: média semanal da segunda metade do período contra a da primeira.
export interface VariacaoDeTendencia { atual: number; anterior: number; variacaoPct: number | null }
export interface TendenciaDoPeriodo {
  modo: "periodo_anterior" | "serie";
  /** modo "periodo_anterior": o período usado na comparação */
  anterior?: { ini: string; fim: string };
  arrecadado?: VariacaoDeTendencia;
  contribuintes?: VariacaoDeTendencia;
  dizimistas?: VariacaoDeTendencia;
  /** modo "serie": a direção e a variação da segunda metade sobre a primeira */
  direcao?: "alta" | "estavel" | "queda";
  variacaoPct?: number | null;
}

const variacao = (atual: number, anterior: number): VariacaoDeTendencia => ({ atual, anterior, variacaoPct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 10000) / 100 : null });
const LIMITE_DE_ESTABILIDADE_PCT = 5;

export function analisarTendencia(linhasFiltradas: LinhaDeContribuicao[], periodo: { ini: string; fim: string }): TendenciaDoPeriodo | null {
  const dias = diasEntre(periodo.ini, periodo.fim) + 1;
  const anteriorFim = somarDias(periodo.ini, -1);
  const anteriorIni = somarDias(anteriorFim, -(dias - 1));
  if (anteriorIni >= PISO_DE_IDENTIFICACAO) {
    const atual = analisarContribuicoes(linhasFiltradas, periodo), ant = analisarContribuicoes(linhasFiltradas, { ini: anteriorIni, fim: anteriorFim });
    return {
      modo: "periodo_anterior", anterior: { ini: anteriorIni, fim: anteriorFim },
      arrecadado: variacao(atual.arrecadado, ant.arrecadado), contribuintes: variacao(atual.doadores, ant.doadores), dizimistas: variacao(atual.dizimistas, ant.dizimistas),
    };
  }
  const a = analisarContribuicoes(linhasFiltradas, periodo);
  if (a.semanas.length < 4 || a.arrecadado === 0) return null;   // série curta demais para dizer uma direção
  const metade = Math.floor(a.semanas.length / 2);
  const media = (s: SemanaDeContribuicao[]) => s.reduce((t, x) => t + x.valor, 0) / Math.max(1, s.length);
  const primeira = media(a.semanas.slice(0, metade)), segunda = media(a.semanas.slice(a.semanas.length - metade));
  if (primeira <= 0) return { modo: "serie", direcao: "alta", variacaoPct: null };
  const pct = Math.round(((segunda - primeira) / primeira) * 10000) / 100;
  return { modo: "serie", direcao: pct > LIMITE_DE_ESTABILIDADE_PCT ? "alta" : pct < -LIMITE_DE_ESTABILIDADE_PCT ? "queda" : "estavel", variacaoPct: pct };
}

// ── o cabeçalho de rastreabilidade (toda saída) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Muda quando uma regra de cálculo muda (piso, definição de recorrência, base, categorias): permite dizer, meses depois, com QUAIS critérios um relatório foi gerado. */
export const VERSAO_DOS_CRITERIOS = "2026-10-27.1";

export interface CabecalhoDoRelatorio {
  periodo: { ini: string; fim: string };
  base: BaseAnalisada;
  categorias: TipoDeContribuicao[];
  /** o tamanho da base analisada (ativos do vínculo, sem os menores quando a opção está desligada) */
  pessoasNaBase: number | null;
  contribuiram: number | null;
  foraDaBase: number;
  /** ISO do momento da geração */
  geradoEm: string;
  geradoPor: string | null;
  versao: string;
}

const dataBrCompleta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** As linhas do cabeçalho obrigatório, em texto (tela, Excel, e-mail e impressão usam as mesmas). `geradoEmTexto` já vem formatado em Brasília. */
export function linhasDoCabecalho(c: CabecalhoDoRelatorio, geradoEmTexto: string): { rotulo: string; valor: string }[] {
  const linhas = [
    { rotulo: "Período analisado", valor: `${dataBrCompleta(c.periodo.ini)} a ${dataBrCompleta(c.periodo.fim)}` },
    { rotulo: "Base analisada", valor: `${ROTULO_DA_BASE[c.base]} (ativos)` },
    { rotulo: "Contribuições consideradas", valor: rotuloDasCategorias(c.categorias) },
  ];
  if (c.pessoasNaBase !== null) linhas.push({ rotulo: "Pessoas consideradas", valor: `${c.pessoasNaBase} na base${c.contribuiram !== null ? `, ${c.contribuiram} contribuíram` : ""}; contribuintes fora da base: ${c.foraDaBase}` });
  linhas.push({ rotulo: "Gerado em", valor: `${geradoEmTexto}${c.geradoPor ? ` por ${c.geradoPor}` : ""}` }, { rotulo: "Versão dos critérios", valor: c.versao });
  return linhas;
}
