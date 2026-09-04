// ─── diaconiaService.ts — a porta de entrada de quem a Diaconia assiste ──────
//
// Pedido de 03/09/2026 (ver [[diaconia-porta-de-entrada]] na memória): cestas
// básicas, culto de rua de terça, jantar pós-culto — gente que às vezes só
// está na igreja para buscar a cesta. Cadastro completo, ficha
// socioeconômica, e uma chamada de confirmação igual à da EBD.
//
// ── A FICHA (04/09) ESPELHA A FICHA IMPRESSA DA IGREJA, MELHORADA ───────────
//
// Ela mostrou a ficha de papel que a Diaconia usa hoje e pediu para melhorar,
// não só copiar — pesquisado como bancos de alimentos e o CRAS fazem isto
// (ver a migration 20260904110000 para as fontes e o raciocínio completo).
// A melhoria principal: `renda_mensal`, que a ficha de papel não tinha —
// junto com a composição por faixa etária (que o papel já tinha), dá pra
// calcular renda per capita, como ela pediu ("com isto, daria pra fazer a
// per capita").
//
// ── DUAS PORTAS, DOIS RECORTES ───────────────────────────────────────────────
//
// A chamada (`obterOuCriarOcasiao`, `chamadaView`, `marcarConfirmado`) é larga
// — quem lidera E quem só serve na área (diácono sem ser `lideranca`) passa.
// A ficha socioeconômica (`salvarFicha`, `fichasDaPessoa`) é estrita — só
// ministra/líder. As duas portas são funções SECURITY DEFINER no banco
// (`diaconia_posso_atender`/`diaconia_lidera_area`); este arquivo não decide
// nada, só chama.
//
// ── TODA ESCRITA PASSA POR RPC, E OS DADOS VÃO NUM jsonb ─────────────────────
//
// As tabelas não têm política de INSERT/UPDATE para quem não é admin/
// secretaria — só a RPC, que checa a porta certa antes de gravar. E as RPCs
// de escrita levam a maior parte dos campos num `p_dados jsonb`, não um
// parâmetro por campo: a lista de campos já cresceu duas vezes desde 03/09,
// e cada vez exigiu `DROP FUNCTION` explícito para não colidir (ver
// 20260904100000). Com jsonb, o próximo campo não muda a assinatura.

import { supabase } from "@/integrations/supabase/client";
import { type ResultadoEscrita } from "@/lib/escritaConferida";

export interface Endereco {
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

/** O que muda pouco — identidade, não situação. Espelha a ficha impressa. */
export interface DadosIdentidade extends Endereco {
  data_nascimento?: string | null;
  sexo?: string | null;
  estado_civil?: string | null;
  rg?: string | null;
  cpf?: string | null;
  nacionalidade?: string | null;
  naturalidade?: string | null;
  profissao?: string | null;
  escolaridade?: string | null;
  telefone?: string | null;
}

export interface PessoaAssistida extends DadosIdentidade {
  id: string;
  nome_completo: string;
  telefone: string | null;
  membro_id: string | null;
}

/** Um morador da casa — pergunta 7 da ficha impressa. */
export interface Familiar {
  nome: string;
  idade: number | null;
  parentesco: string;
  trabalha: boolean;
  estuda: boolean;
  pcd: boolean;
  qual_pcd?: string | null;
}

export interface FichaSocioeconomica {
  id: string;
  data_preenchimento: string;
  possui_deficiencia: boolean | null;
  qual_deficiencia: string | null;
  possui_renda: boolean | null;
  renda_mensal: number | null;
  recebe_beneficio_social: boolean | null;
  qual_beneficio: string | null;
  ja_trabalhou_clt: boolean | null;
  tempo_clt: string | null;
  atuacao_clt: string | null;
  situacao_moradia: string | null;
  criancas_ate_11: number | null;
  adolescentes_12_18: number | null;
  adultos_19_59: number | null;
  idosos_60_mais: number | null;
  familiares: Familiar[];
  sustento_familia: string | null;
  maior_necessidade: string | null;
  observacoes: string | null;
}

export interface LinhaDaChamada {
  pessoa_assistida_id: string;
  nome_completo: string;
  telefone: string | null;
  confirmado: boolean;
}

export const SITUACOES_MORADIA = [
  { valor: "alugada", rotulo: "Alugado" },
  { valor: "propria", rotulo: "Próprio" },
  { valor: "cedida", rotulo: "Emprestado" },
  // Fora da ficha impressa, de propósito: o culto de rua de terça atende
  // quem não tem teto, e o papel não previa esse público.
  { valor: "situacao_de_rua", rotulo: "Situação de rua" },
  { valor: "outra", rotulo: "Outros" },
] as const;

export const SEXOS = [
  { valor: "masculino", rotulo: "Masculino" },
  { valor: "feminino", rotulo: "Feminino" },
] as const;

export const ESTADOS_CIVIS = [
  { valor: "solteiro", rotulo: "Solteiro(a)" },
  { valor: "casado", rotulo: "Casado(a)" },
  { valor: "divorciado", rotulo: "Divorciado(a)" },
  { valor: "viuvo", rotulo: "Viúvo(a)" },
  { valor: "uniao_estavel", rotulo: "União estável" },
  { valor: "separado", rotulo: "Separado(a)" },
] as const;

function rotuloDe(lista: readonly { valor: string; rotulo: string }[], valor: string | null | undefined): string | null {
  if (!valor) return null;
  return lista.find(o => o.valor === valor)?.rotulo ?? valor;
}
export const rotuloMoradia     = (v: string | null | undefined) => rotuloDe(SITUACOES_MORADIA, v);
export const rotuloSexo        = (v: string | null | undefined) => rotuloDe(SEXOS, v);
export const rotuloEstadoCivil = (v: string | null | undefined) => rotuloDe(ESTADOS_CIVIS, v);

/** Quantas pessoas moram na casa, somando as quatro faixas — o denominador da per capita. */
export function pessoasNaCasa(f: Pick<FichaSocioeconomica, "criancas_ate_11" | "adolescentes_12_18" | "adultos_19_59" | "idosos_60_mais">): number {
  return (f.criancas_ate_11 ?? 0) + (f.adolescentes_12_18 ?? 0) + (f.adultos_19_59 ?? 0) + (f.idosos_60_mais ?? 0);
}

/**
 * Renda per capita — calculada, nunca gravada.
 *
 * Ela pediu isto ao ver a ficha impressa: as faixas etárias já dão o
 * denominador, `renda_mensal` dá o numerador. `null` quando falta um dos
 * dois — não confundir "não calculado" com "zero".
 */
export function rendaPerCapita(f: FichaSocioeconomica): number | null {
  const pessoas = pessoasNaCasa(f);
  if (f.renda_mensal == null || pessoas === 0) return null;
  return f.renda_mensal / pessoas;
}

// ─── Pessoas e vínculos ──────────────────────────────────────────────────

const CAMPOS_PESSOA =
  "id, nome_completo, telefone, membro_id, cep, endereco, numero, complemento, bairro, cidade, uf, " +
  "data_nascimento, sexo, estado_civil, rg, cpf, nacionalidade, naturalidade, profissao, escolaridade";

/** Quem é atendido em cada área do ministério — via as `diaconia_vinculos` que a RLS deixa ver. */
export async function pessoasDaArea(areaId: string): Promise<(PessoaAssistida & { vinculo_id: string })[]> {
  const { data, error } = await supabase
    .from("diaconia_vinculos")
    .select(`id, ativo, diaconia_pessoas_assistidas(${CAMPOS_PESSOA})`)
    .eq("area_id", areaId).eq("ativo", true);
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter(v => v.diaconia_pessoas_assistidas)
    .map(v => ({ vinculo_id: v.id, ...v.diaconia_pessoas_assistidas }))
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));
}

/** Cadastra (ou reaproveita) a pessoa e a vincula à área. A única porta de entrada de gente nova. */
export async function criarPessoa(
  areaId: string, nome: string, dados?: DadosIdentidade, membroId?: string,
): Promise<ResultadoEscrita & { id?: string }> {
  const { data, error } = await supabase.rpc("diaconia_criar_pessoa", {
    p_area_id: areaId, p_nome: nome, p_membro_id: membroId ?? null, p_dados: (dados ?? {}) as any,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true, id: data as string };
}

/** Corrige os dados de quem já está cadastrado. Mesma porta larga da chamada. */
export async function atualizarPessoa(
  pessoaAssistidaId: string, nome: string, dados?: DadosIdentidade,
): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_atualizar_pessoa", {
    p_pessoa_assistida_id: pessoaAssistidaId, p_nome: nome, p_dados: (dados ?? {}) as any,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

export async function vincularArea(pessoaAssistidaId: string, areaId: string): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_vincular_area", {
    p_pessoa_assistida_id: pessoaAssistidaId, p_area_id: areaId,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

// ─── Ficha socioeconômica — só ministra/líder ───────────────────────────

const CAMPOS_FICHA =
  "id, data_preenchimento, possui_deficiencia, qual_deficiencia, possui_renda, renda_mensal, " +
  "recebe_beneficio_social, qual_beneficio, ja_trabalhou_clt, tempo_clt, atuacao_clt, situacao_moradia, " +
  "criancas_ate_11, adolescentes_12_18, adultos_19_59, idosos_60_mais, familiares, " +
  "sustento_familia, maior_necessidade, observacoes";

export async function fichasDaPessoa(pessoaAssistidaId: string): Promise<FichaSocioeconomica[]> {
  const { data, error } = await supabase
    .from("diaconia_fichas_socioeconomicas")
    .select(CAMPOS_FICHA)
    .eq("pessoa_assistida_id", pessoaAssistidaId)
    .order("data_preenchimento", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map(f => ({ ...f, familiares: (f.familiares ?? []) as Familiar[] }));
}

export type DadosFicha = Omit<FichaSocioeconomica, "id" | "data_preenchimento">;

export async function salvarFicha(
  pessoaAssistidaId: string, dados: Partial<DadosFicha>,
): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_salvar_ficha", {
    p_pessoa_assistida_id: pessoaAssistidaId, p_dados: dados as any,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

// ─── A chamada — mesmo desenho da EBD ───────────────────────────────────

export async function obterOuCriarOcasiao(areaId: string, data: string): Promise<string> {
  const { data: id, error } = await supabase.rpc("diaconia_obter_ou_criar_ocasiao", {
    p_area_id: areaId, p_data: data,
  });
  if (error) throw new Error(traduzir(error.message));
  return id as string;
}

export async function chamadaView(ocasiaoId: string): Promise<LinhaDaChamada[]> {
  const { data, error } = await supabase.rpc("diaconia_chamada_view", { p_ocasiao_id: ocasiaoId });
  if (error) throw new Error(traduzir(error.message));
  return (data ?? []) as LinhaDaChamada[];
}

export async function marcarConfirmado(ocasiaoId: string, pessoaAssistidaId: string, confirmado: boolean): Promise<void> {
  const { error } = await supabase.rpc("diaconia_marcar_confirmado", {
    p_ocasiao_id: ocasiaoId, p_pessoa_assistida_id: pessoaAssistidaId, p_confirmado: confirmado,
  });
  if (error) throw new Error(traduzir(error.message));
}

/** Cadastra alguém novo e já confirma na ocasião aberta — o "+ novo" da chamada, rápido de propósito. */
export async function adicionarPessoaNaChamada(
  ocasiaoId: string, areaId: string, nome: string, telefone?: string,
): Promise<ResultadoEscrita & { id?: string }> {
  const r = await criarPessoa(areaId, nome, telefone ? { telefone } : undefined);
  if (!r.ok || !r.id) return r;
  await marcarConfirmado(ocasiaoId, r.id, true);
  return r;
}

// ─── A bancada do painel ─────────────────────────────────────────────────

export interface AreaDaDiaconia {
  area_id: string;
  area_nome: string;
  pessoas: number;
}

export interface BancadaDiaconia {
  areas: AreaDaDiaconia[];
  totalPessoas: number;
  /** Confirmações deste mês, em qualquer área do ministério. */
  atendimentosMes: number;
}

export async function carregarBancadaDiaconia(ministerioId: string): Promise<BancadaDiaconia | null> {
  const { data: areas } = await supabase
    .from("areas").select("id, nome").eq("ministerio_id", ministerioId).eq("ativo", true);
  const lista = (areas ?? []) as { id: string; nome: string }[];
  if (lista.length === 0) return null;
  const areaIds = lista.map(a => a.id);

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  const desde = inicioDoMes.toISOString().slice(0, 10);

  const [vinculos, ocasioes] = await Promise.all([
    supabase.from("diaconia_vinculos").select("area_id, pessoa_assistida_id").in("area_id", areaIds).eq("ativo", true),
    supabase.from("diaconia_ocasioes").select("id, area_id").in("area_id", areaIds).gte("data", desde),
  ]);

  const porArea = new Map<string, Set<string>>();
  for (const v of (vinculos.data ?? []) as any[]) {
    if (!porArea.has(v.area_id)) porArea.set(v.area_id, new Set());
    porArea.get(v.area_id)!.add(v.pessoa_assistida_id);
  }

  const ocasiaoIds = ((ocasioes.data ?? []) as any[]).map(o => o.id);
  let atendimentosMes = 0;
  if (ocasiaoIds.length > 0) {
    const { count } = await supabase.from("diaconia_atendimentos")
      .select("id", { count: "exact", head: true })
      .in("ocasiao_id", ocasiaoIds).eq("confirmado", true);
    atendimentosMes = count ?? 0;
  }

  const todasPessoas = new Set<string>();
  for (const s of porArea.values()) for (const id of s) todasPessoas.add(id);

  return {
    areas: lista.map(a => ({ area_id: a.id, area_nome: a.nome, pessoas: porArea.get(a.id)?.size ?? 0 })),
    totalPessoas: todasPessoas.size,
    atendimentosMes,
  };
}

function traduzir(mensagem: string): string {
  if (mensagem.includes("Você não atende nesta área")) return mensagem;
  if (mensagem.includes("Você não atende esta pessoa")) return mensagem;
  if (mensagem.includes("Só a liderança da Diaconia")) return mensagem;
  if (mensagem.includes("row-level security")) return "Você não tem acesso a esta área da Diaconia.";
  return mensagem;
}
