import { supabase } from "@/integrations/supabase/client";

export type FinVinculoTipo = "clt" | "mei" | "rpa" | "prebenda" | "estagio" | "voluntario_remunerado";

export const VINCULO_LABEL: Record<FinVinculoTipo, string> = {
  clt: "CLT (Funcionário)",
  mei: "MEI (Prestador PJ)",
  rpa: "RPA (Autônomo)",
  prebenda: "Prebenda (Pastor)",
  estagio: "Estágio",
  voluntario_remunerado: "Voluntário remunerado",
};

export const VINCULO_COR: Record<FinVinculoTipo, string> = {
  clt: "bg-blue-100 text-blue-700 border-blue-300",
  mei: "bg-emerald-100 text-emerald-700 border-emerald-300",
  rpa: "bg-amber-100 text-amber-700 border-amber-300",
  prebenda: "bg-purple-100 text-purple-700 border-purple-300",
  estagio: "bg-cyan-100 text-cyan-700 border-cyan-300",
  voluntario_remunerado: "bg-rose-100 text-rose-700 border-rose-300",
};

export interface FinContratado {
  id: string;
  pessoa_id: string | null;
  nome: string;
  cpf: string | null;
  vinculo: FinVinculoTipo;
  cargo: string | null;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  salario_base: number | null;
  jornada_horas_semana: number | null;
  num_dependentes: number;
  vale_alimentacao_dia: number | null;
  vale_transporte_dias: number;
  vt_passagem_valor: number | null;
  cnpj: string | null;
  mei_atividade: string | null;
  mei_valor_mensal: number | null;
  rpa_valor_padrao: number | null;
  prebenda_valor: number | null;
  prebenda_aux_aluguel: number;
  prebenda_aux_outros: number;
  igreja_tem_cebas: boolean;
  pastor_contribui_inss: boolean;
  observacao: string | null;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────
export async function listarContratados(incluirInativos = false): Promise<FinContratado[]> {
  let q = supabase.from("fin_contratados").select("*").order("nome");
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinContratado[];
}

export async function criarContratado(input: Partial<FinContratado>): Promise<FinContratado> {
  const { data, error } = await supabase.from("fin_contratados").insert(input as any).select("*").single();
  if (error) throw error;
  return data as FinContratado;
}

export async function atualizarContratado(id: string, patch: Partial<FinContratado>): Promise<void> {
  const { error } = await supabase.from("fin_contratados").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function desativarContratado(id: string): Promise<void> {
  const { error } = await supabase.from("fin_contratados").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

// ─── Tabelas vigentes ─────────────────────────────────────────────────────
export interface FaixaINSS { faixa_min: number; faixa_max: number | null; aliquota: number; }
export interface FaixaIRRF { faixa_min: number; faixa_max: number | null; aliquota: number; parcela_deduzir: number; deducao_dependente: number; }

let _cacheINSS: FaixaINSS[] | null = null;
let _cacheIRRF: FaixaIRRF[] | null = null;

export async function tabelaINSS(): Promise<FaixaINSS[]> {
  if (_cacheINSS) return _cacheINSS;
  const { data, error } = await supabase
    .from("fin_tabela_inss_empregado")
    .select("faixa_min, faixa_max, aliquota")
    .order("ordem");
  if (error) throw error;
  _cacheINSS = (data ?? []).map((r: any) => ({
    faixa_min: Number(r.faixa_min),
    faixa_max: r.faixa_max ? Number(r.faixa_max) : null,
    aliquota: Number(r.aliquota),
  }));
  return _cacheINSS;
}

export async function tabelaIRRF(): Promise<FaixaIRRF[]> {
  if (_cacheIRRF) return _cacheIRRF;
  const { data, error } = await supabase
    .from("fin_tabela_irrf")
    .select("faixa_min, faixa_max, aliquota, parcela_deduzir, deducao_dependente")
    .order("ordem");
  if (error) throw error;
  _cacheIRRF = (data ?? []).map((r: any) => ({
    faixa_min: Number(r.faixa_min),
    faixa_max: r.faixa_max ? Number(r.faixa_max) : null,
    aliquota: Number(r.aliquota),
    parcela_deduzir: Number(r.parcela_deduzir),
    deducao_dependente: Number(r.deducao_dependente),
  }));
  return _cacheIRRF;
}

// ─── Cálculos didáticos ───────────────────────────────────────────────────
export function calcularINSSEmpregado(salario: number, faixas: FaixaINSS[]): number {
  // Cálculo progressivo (não cumulativo - alíquota efetiva)
  // INSS empregado é por faixa progressiva
  let inss = 0;
  for (const f of faixas) {
    const max = f.faixa_max ?? Infinity;
    if (salario <= f.faixa_min) break;
    const baseFaixa = Math.min(salario, max) - f.faixa_min;
    inss += baseFaixa * (f.aliquota / 100);
  }
  return Math.round(inss * 100) / 100;
}

export function calcularIRRF(baseCalculo: number, dependentes: number, faixas: FaixaIRRF[]): { irrf: number; faixa: FaixaIRRF | null; baseEfetiva: number } {
  if (faixas.length === 0) return { irrf: 0, faixa: null, baseEfetiva: baseCalculo };
  const baseEfetiva = baseCalculo - (dependentes * faixas[0].deducao_dependente);
  let faixaAplicada: FaixaIRRF | null = null;
  for (const f of faixas) {
    if (baseEfetiva >= f.faixa_min && (f.faixa_max === null || baseEfetiva <= f.faixa_max)) {
      faixaAplicada = f;
      break;
    }
  }
  if (!faixaAplicada || faixaAplicada.aliquota === 0) return { irrf: 0, faixa: faixaAplicada, baseEfetiva };
  const irrf = baseEfetiva * (faixaAplicada.aliquota / 100) - faixaAplicada.parcela_deduzir;
  return { irrf: Math.max(0, Math.round(irrf * 100) / 100), faixa: faixaAplicada, baseEfetiva };
}

// ─── Calculadora CLT ──────────────────────────────────────────────────────
export interface ResultadoCLT {
  salario_base: number;
  va_total: number;
  vt_total: number;
  vt_desconto: number;
  inss: number;
  irrf: number;
  irrf_faixa: FaixaIRRF | null;
  proventos: number;
  descontos: number;
  liquido: number;
  fgts: number;
  inss_patronal: number;
  rat: number;
  terceiros: number;
  decimo_provisao: number;
  ferias_provisao: number;
  custo_total: number;
  passos: { titulo: string; valor: number; descricao?: string }[];
}

export async function calcularCLT(input: {
  salario: number;
  vaPorDia?: number; diasUteis?: number;
  vtPorDia?: number;
  dependentes?: number;
  temCebas?: boolean;
}): Promise<ResultadoCLT> {
  const [inssTbl, irrfTbl] = await Promise.all([tabelaINSS(), tabelaIRRF()]);
  const dias = input.diasUteis ?? 22;
  const va = (input.vaPorDia ?? 0) * dias;
  const vt = (input.vtPorDia ?? 0) * 2 * dias;       // ida + volta
  const vtDesconto = Math.min(input.salario * 0.06, vt);

  const inss = calcularINSSEmpregado(input.salario, inssTbl);
  const { irrf, faixa: irrfFaixa } = calcularIRRF(input.salario - inss, input.dependentes ?? 0, irrfTbl);

  const proventos = input.salario + va + vt;
  const descontos = inss + irrf + vtDesconto;
  const liquido = proventos - descontos;

  const isento = input.temCebas;
  const fgts = input.salario * 0.08;
  const inssPatronal = isento ? 0 : input.salario * 0.20;
  const rat = isento ? 0 : input.salario * 0.03;
  const terceiros = isento ? 0 : input.salario * 0.058;

  const decimo = input.salario / 12;
  const ferias = (input.salario / 12) * (4 / 3);

  const custoTotal = input.salario + va + vt + fgts + inssPatronal + rat + terceiros + decimo + ferias;

  return {
    salario_base: input.salario,
    va_total: va, vt_total: vt, vt_desconto: vtDesconto,
    inss, irrf, irrf_faixa: irrfFaixa,
    proventos, descontos, liquido,
    fgts, inss_patronal: inssPatronal, rat, terceiros,
    decimo_provisao: decimo, ferias_provisao: ferias,
    custo_total: custoTotal,
    passos: [
      { titulo: "Salário base", valor: input.salario },
      { titulo: "Vale Alimentação", valor: va, descricao: `${dias} dias × R$ ${(input.vaPorDia ?? 0).toFixed(2)}/dia` },
      { titulo: "Vale Transporte", valor: vt, descricao: `${dias} dias × ida+volta × R$ ${(input.vtPorDia ?? 0).toFixed(2)}` },
      { titulo: "− INSS empregado", valor: -inss, descricao: "Progressivo por faixas" },
      { titulo: "− IRRF", valor: -irrf, descricao: irrfFaixa ? `Faixa ${irrfFaixa.aliquota}%` : "Isento" },
      { titulo: "− VT desconto", valor: -vtDesconto, descricao: "Até 6% do salário base" },
      { titulo: "= LÍQUIDO PRO FUNCIONÁRIO", valor: liquido },
    ],
  };
}

// ─── Calculadora RPA ──────────────────────────────────────────────────────
export interface ResultadoRPA {
  bruto: number;
  inss_descontado: number;
  irrf_descontado: number;
  iss_descontado: number;
  liquido_recebido: number;
  inss_patronal: number;
  custo_total: number;
  passos: { titulo: string; valor: number; descricao?: string }[];
}

export async function calcularRPA(input: {
  valorBruto: number;
  dependentes?: number;
  alqIss?: number;       // % ex 5
  reterIss?: boolean;
  temCebas?: boolean;
}): Promise<ResultadoRPA> {
  const irrfTbl = await tabelaIRRF();
  const inss = Math.min(input.valorBruto * 0.11, 8157.41 * 0.11); // 11% até teto
  const { irrf } = calcularIRRF(input.valorBruto - inss, input.dependentes ?? 0, irrfTbl);
  const iss = (input.reterIss && input.alqIss) ? input.valorBruto * (input.alqIss / 100) : 0;
  const liquido = input.valorBruto - inss - irrf - iss;
  const inssPatronal = input.temCebas ? 0 : input.valorBruto * 0.20;
  return {
    bruto: input.valorBruto,
    inss_descontado: inss,
    irrf_descontado: irrf,
    iss_descontado: iss,
    liquido_recebido: liquido,
    inss_patronal: inssPatronal,
    custo_total: input.valorBruto + inssPatronal,
    passos: [
      { titulo: "Valor bruto", valor: input.valorBruto },
      { titulo: "− INSS 11% (até teto)", valor: -inss },
      { titulo: "− IRRF", valor: -irrf, descricao: "Conforme faixa" },
      { titulo: "− ISS na fonte", valor: -iss, descricao: input.reterIss ? `${input.alqIss}%` : "Não reter" },
      { titulo: "= LÍQUIDO AO AUTÔNOMO", valor: liquido },
    ],
  };
}

// ─── Calculadora MEI ──────────────────────────────────────────────────────
export interface ResultadoMEI {
  valor_nf: number;
  custo_total: number;
  alertas: string[];
}

export function calcularMEI(input: {
  valorNF: number;
  haSubordinacao?: boolean;
  haExclusividade?: boolean;
  haHabitualidade?: boolean;
  pagaPorHora?: boolean;
}): ResultadoMEI {
  const alertas: string[] = [];
  const riscos = [
    input.haSubordinacao,
    input.haExclusividade,
    input.haHabitualidade,
    input.pagaPorHora,
  ].filter(Boolean).length;

  if (riscos >= 2) alertas.push("⚠ Risco trabalhista médio/alto — considere migrar pra CLT ou rever contrato");
  if (input.haSubordinacao) alertas.push("Sem subordinação direta (horário/regras)");
  if (input.pagaPorHora) alertas.push("Pagar por NF mensal, não por hora");
  if (input.haExclusividade) alertas.push("Permita o MEI prestar pra outras empresas");

  return {
    valor_nf: input.valorNF,
    custo_total: input.valorNF, // sem encargos da contratante
    alertas,
  };
}

// ─── Calculadora Prebenda ─────────────────────────────────────────────────
export interface ResultadoPrebenda {
  prebenda: number;
  aux_aluguel: number;
  aux_outros: number;
  bruto_total: number;
  inss_descontado: number;
  irrf_descontado: number;
  liquido: number;
  passos: { titulo: string; valor: number; descricao?: string }[];
}

export async function calcularPrebenda(input: {
  prebenda: number;
  auxAluguel?: number;
  auxOutros?: number;
  dependentes?: number;
  contribuiInss?: boolean;
}): Promise<ResultadoPrebenda> {
  const irrfTbl = await tabelaIRRF();
  const bruto = input.prebenda + (input.auxAluguel ?? 0) + (input.auxOutros ?? 0);

  // INSS contribuinte individual = 20% até teto (opcional)
  const inss = input.contribuiInss ? Math.min(bruto, 8157.41) * 0.20 : 0;

  const { irrf, faixa } = calcularIRRF(bruto - inss, input.dependentes ?? 0, irrfTbl);
  const liquido = bruto - inss - irrf;

  return {
    prebenda: input.prebenda,
    aux_aluguel: input.auxAluguel ?? 0,
    aux_outros: input.auxOutros ?? 0,
    bruto_total: bruto,
    inss_descontado: inss,
    irrf_descontado: irrf,
    liquido,
    passos: [
      { titulo: "Prebenda", valor: input.prebenda },
      { titulo: "+ Auxílio aluguel", valor: input.auxAluguel ?? 0 },
      { titulo: "+ Auxílios outros", valor: input.auxOutros ?? 0 },
      { titulo: "− INSS individual 20%", valor: -inss, descricao: input.contribuiInss ? "Pastor opta por contribuir" : "Não contribui" },
      { titulo: "− IRRF", valor: -irrf, descricao: faixa ? `${faixa.aliquota}%` : "Isento" },
      { titulo: "= LÍQUIDO AO PASTOR", valor: liquido },
    ],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
export function brl(v: number): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
