// ─── lib/missoesModelo.ts — a modelagem aprovada de Missões (06/10/2026) ───
//
// Modelagem em docs/INDICADORES_MISSIONARIOS_MODELAGEM.md; evidências em
// docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md. Cinco conceitos, cada um com a sua conta:
//
//   Fundo Missionário  = ofertas para missões − Envio Oficial (+ ajustes gerenciais)
//   Envio Oficial      = saídas da categoria "Repasses Missionários"
//   Sustento           = saídas do subcentro Sustento Missionário (investimento PRÓPRIO da
//                        igreja, fora do fundo): pastor missionário, parcerias, sustentados
//   Mobilização        = subcentro Mobilização Missionária (conferências, preletores, eventos)
//   Esforço Total      = Envio Oficial + Sustento + Mobilização
//   Campanha           = campo `campanha_missionaria` do lançamento; o ano vem da DATA.
//
// Contas do fluxo e do fundo registrado ficam em `indicadoresMissionarios.ts`.

import { daquiADias } from "@/lib/data";
import {
  diaDoLancamento, ehRealizado, fundoAcumulado, somar,
  type FundoAcumulado, type LancamentoMissionario,
} from "@/lib/indicadoresMissionarios";

export type CampanhaMissionaria = "mundiais" | "nacionais" | "especial";

export const CAMPANHAS_EM_ORDEM: CampanhaMissionaria[] = ["mundiais", "nacionais", "especial"];

/** "especial" é gravado assim, mas aparece como "Campanha avulsa": a Junta chama a oferta de Mundiais de "Dia Especial". */
export const ROTULO_DA_CAMPANHA: Record<CampanhaMissionaria, string> = {
  mundiais: "Missões Mundiais", nacionais: "Missões Nacionais", especial: "Campanha avulsa",
};

const sinAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const arredondar = (n: number) => Math.round(n * 100) / 100;
const valorDe = (l: { valor: number | string }) => Number(l.valor) || 0;

export type ClasseDeCentro = "sustento" | "envios" | "mobilizacao";

/**
 * Qual das três naturezas o centro representa. Reconhece os subcentros NOVOS e os 4 antigos, para
 * o painel funcionar antes e depois da migration de remapeamento (20261006190000):
 * Pastor Missionário e Ofertas Missionárias = sustento; Missões Mundiais/Nacionais = envios.
 * Só faz sentido para SAÍDAS (entrada não é custo).
 */
export function classeDoCentro(nome: string | null | undefined): ClasseDeCentro | null {
  if (!nome) return null;
  const n = sinAcento(nome);
  if (n.includes("sustento missionario") || n.includes("pastor missionario") || n.includes("ofertas missionarias")) return "sustento";
  if (n.includes("mobilizacao missionaria")) return "mobilizacao";
  if (n.includes("envios missionarios") || n.endsWith("missoes mundiais") || n.endsWith("missoes nacionais")) return "envios";
  return null;
}

export interface LancamentoDeMissoes extends LancamentoMissionario {
  tipo?: string;
  campanha_missionaria?: string | null;
  fornecedor_id?: string | null;
  pessoa_id?: string | null;
  fornecedor_nome?: string | null;
  pessoa_nome?: string | null;
  categoria_nome?: string | null;
  centro_nome?: string | null;
  centro_custo_id?: string | null;
}

/**
 * A campanha de um lançamento: o campo, quando preenchido. Sem o campo (migration ainda não
 * aplicada, ou remessa antiga), a JUNTA DE DESTINO decide — nunca o centro nem a descrição, que
 * estavam trocados em 5 das 13 remessas (provado contra o histórico da Junta Mundial).
 */
export function campanhaDoLancamento(l: LancamentoDeMissoes): CampanhaMissionaria | null {
  const c = l.campanha_missionaria;
  if (c === "mundiais" || c === "nacionais" || c === "especial") return c;
  return campanhaSugeridaPorFornecedor(l.fornecedor_nome);
}

/** Sugestão de campanha para uma REMESSA: a Junta de destino. */
export function campanhaSugeridaPorFornecedor(nomeDoFornecedor: string | null | undefined): CampanhaMissionaria | null {
  const f = sinAcento(nomeDoFornecedor ?? "");
  if (f.includes("missoes mundiais")) return "mundiais";
  if (f.includes("missoes nacionais")) return "nacionais";
  return null;
}

// ── Fundo: registrado × ajustado ────────────────────────────────────────────

export interface AjusteDoFundo {
  id: string; valor: number | string; ativo: boolean; descricao: string;
  data_referencia: string; justificativa?: string | null;
}

export interface FundoComAjuste extends FundoAcumulado {
  ajustes: number;
  /** saldo registrado + ajustes ativos. */
  saldoAjustado: number;
}

/** Saldo REGISTRADO (só o que está no banco) e saldo AJUSTADO (com os ajustes gerenciais ativos). */
export function fundoComAjustes(
  entradas: LancamentoMissionario[], envios: LancamentoMissionario[], ajustes: AjusteDoFundo[],
): FundoComAjuste {
  const base = fundoAcumulado(entradas, envios);
  const soma = arredondar(ajustes.filter(a => a.ativo).reduce((s, a) => s + valorDe(a), 0));
  return { ...base, ajustes: soma, saldoAjustado: arredondar(base.saldo + soma) };
}

// ── Envio Oficial × Esforço Total ───────────────────────────────────────────

export interface EnviosDoPeriodo {
  oficial: number;
  sustento: number;
  mobilizacao: number;
  /** oficial + sustento + mobilização */
  esforcoTotal: number;
}

/** Cada lançamento entra UMA vez (se aparecer em dois grupos, o Envio Oficial manda). Sem datas = vida inteira. */
export function enviosDoPeriodo(
  envios: LancamentoMissionario[], sustento: LancamentoMissionario[], mobilizacao: LancamentoMissionario[],
  inicio?: string, fim?: string,
): EnviosDoPeriodo {
  const vistos = new Set<string>();
  const soma = (ls: LancamentoMissionario[]) => somar(ls.filter(l => {
    if (!ehRealizado(l) || vistos.has(l.id)) return false;
    const d = diaDoLancamento(l);
    if ((inicio && d < inicio) || (fim && d > fim)) return false;
    vistos.add(l.id);
    return true;
  }));
  const oficial = soma(envios), sust = soma(sustento), mob = soma(mobilizacao);
  return { oficial, sustento: sust, mobilizacao: mob, esforcoTotal: arredondar(oficial + sust + mob) };
}

// ── Missões permanentes (sustento) ──────────────────────────────────────────

export interface ResumoPermanentes {
  /** Favorecidos distintos que receberam sustento nos 12 meses até o fim do período. */
  sustentados: number;
  pastor: number;
  parcerias: number;
  total: number;
  /** Soma das recorrências ativas do sustento; null = nenhuma cadastrada (o painel diz "não cadastrado"). */
  compromissoMensal: number | null;
}

export function resumoPermanentes(
  sustento: LancamentoDeMissoes[], inicio: string, fim: string, recorrenciasAtivas: { valor: number | string }[] | null,
): ResumoPermanentes {
  const reais = sustento.filter(ehRealizado);
  const doPeriodo = reais.filter(l => { const d = diaDoLancamento(l); return d >= inicio && d <= fim; });
  const ehPastor = (l: LancamentoDeMissoes) => sinAcento(l.categoria_nome ?? "") === "prebenda"
    || sinAcento(l.centro_nome ?? "").includes("pastor missionario");
  const pastor = somar(doPeriodo.filter(ehPastor));
  const parcerias = somar(doPeriodo.filter(l => !ehPastor(l)));
  const desde = daquiADias(fim, -365);
  const quem = new Set<string>();
  reais.filter(l => { const d = diaDoLancamento(l); return d > desde && d <= fim; })
    .forEach(l => quem.add(l.fornecedor_id ?? l.pessoa_id ?? `_${l.id}`));
  return {
    sustentados: quem.size, pastor, parcerias, total: arredondar(pastor + parcerias),
    compromissoMensal: recorrenciasAtivas && recorrenciasAtivas.length > 0
      ? arredondar(recorrenciasAtivas.reduce((s, r) => s + valorDe(r), 0)) : null,
  };
}

// ── Campanhas: meta, arrecadado, percentual ─────────────────────────────────

export interface MetaDeCampanha { campanha: string; ano: number; valor: number | string }

export interface LinhaDeCampanha {
  campanha: CampanhaMissionaria;
  ano: number;
  meta: number | null;
  arrecadado: number;
  /** null quando não há meta. Uma casa decimal (95,3). */
  percentual: number | null;
  enviado: number;
  qtdOfertas: number;
}

/** O ano da campanha é o da DATA do lançamento — não há cadastro por exercício. */
export function resumoDasCampanhas(
  entradas: LancamentoDeMissoes[], envios: LancamentoDeMissoes[], metas: MetaDeCampanha[], ano: number,
): LinhaDeCampanha[] {
  const doAno = (l: LancamentoDeMissoes) => ehRealizado(l) && diaDoLancamento(l).slice(0, 4) === String(ano);
  return CAMPANHAS_EM_ORDEM.map(campanha => {
    const e = entradas.filter(l => doAno(l) && campanhaDoLancamento(l) === campanha);
    const s = envios.filter(l => doAno(l) && campanhaDoLancamento(l) === campanha);
    const m = metas.find(x => x.campanha === campanha && Number(x.ano) === ano);
    const meta = m ? Number(m.valor) : null;
    const arrecadado = somar(e);
    return {
      campanha, ano, meta, arrecadado, enviado: somar(s), qtdOfertas: e.length,
      percentual: meta && meta > 0 ? Math.round((arrecadado / meta) * 1000) / 10 : null,
    };
  });
}

// ── Ofertas sem classificação + sugestão por ciclo ──────────────────────────

export interface OfertasSemClassificacao { quantidade: number; total: number; semCentro: number; totalSemCentro: number }

export function ofertasSemClassificacao(entradas: LancamentoDeMissoes[]): OfertasSemClassificacao {
  const pend = entradas.filter(l => ehRealizado(l) && campanhaDoLancamento(l) === null);
  const sem = pend.filter(l => !l.centro_custo_id);
  return { quantidade: pend.length, total: somar(pend), semCentro: sem.length, totalSemCentro: somar(sem) };
}

/** Remessas a partir deste valor FECHAM o ciclo; as menores são complementos (calibrado com o histórico da Junta Mundial). */
export const VALOR_QUE_FECHA_CICLO = 20000;

export interface GrupoDeCiclo {
  chave: string;
  campanha: CampanhaMissionaria;
  /** Dia da remessa que fecha o ciclo; null = ciclo ainda aberto (campanha em andamento). */
  fechaEm: string | null;
  ids: string[];
  total: number;
  quantidade: number;
  de: string;
  ate: string;
}

const oposta = (c: CampanhaMissionaria): CampanhaMissionaria => (c === "mundiais" ? "nacionais" : "mundiais");

function fechadorasDe(remessas: LancamentoDeMissoes[]) {
  const out: { dia: string; campanha: "mundiais" | "nacionais" }[] = [];
  for (const r of remessas) {
    if (!ehRealizado(r) || valorDe(r) < VALOR_QUE_FECHA_CICLO) continue;
    const campanha = campanhaDoLancamento(r);
    if (campanha === "mundiais" || campanha === "nacionais") out.push({ dia: diaDoLancamento(r), campanha });
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * SUGESTÃO (nunca gravada sozinha): cada oferta ainda sem campanha pertence ao ciclo da próxima
 * remessa "fechadora" (≥ R$ 20.000) em/depois da sua data, e herda a campanha dessa remessa. As
 * ofertas depois da última fechadora pertencem à campanha ABERTA: a oposta da última (Mundiais
 * fecha → abre Nacionais). Reproduz os totais do pedido: Mundiais 2026 = 28.587,10; Nacionais
 * 2026 (aberta) = 4.040,10.
 */
export function sugerirCampanhasPorCiclo(
  entradas: LancamentoDeMissoes[], remessas: LancamentoDeMissoes[],
): GrupoDeCiclo[] {
  const fechadoras = fechadorasDe(remessas);
  if (fechadoras.length === 0) return [];
  const ultima = fechadoras[fechadoras.length - 1];

  const pend = entradas.filter(l => ehRealizado(l) && campanhaDoLancamento(l) === null)
    .sort((a, b) => diaDoLancamento(a).localeCompare(diaDoLancamento(b)));
  const grupos = new Map<string, GrupoDeCiclo>();
  for (const l of pend) {
    const d = diaDoLancamento(l);
    const f = fechadoras.find(x => x.dia >= d);
    const campanha: CampanhaMissionaria = f ? f.campanha : oposta(ultima.campanha);
    const chave = f ? `${f.campanha}@${f.dia}` : `${campanha}@aberta`;
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, campanha, fechaEm: f ? f.dia : null, ids: [], total: 0, quantidade: 0, de: d, ate: d };
      grupos.set(chave, g);
    }
    g.ids.push(l.id); g.quantidade++; g.total = arredondar(g.total + valorDe(l)); g.ate = d;
  }
  return Array.from(grupos.values());
}

/** Campanha "aberta" hoje: a oposta da última remessa que fechou ciclo — a sugestão para uma oferta nova. */
export function campanhaAberta(remessas: LancamentoDeMissoes[]): CampanhaMissionaria | null {
  const f = fechadorasDe(remessas);
  return f.length ? oposta(f[f.length - 1].campanha) : null;
}
