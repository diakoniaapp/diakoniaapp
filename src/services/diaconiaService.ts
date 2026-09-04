// ─── diaconiaService.ts — a porta de entrada de quem a Diaconia assiste ──────
//
// Pedido de 03/09/2026 (ver [[diaconia-porta-de-entrada]] na memória): cestas
// básicas, culto de rua de terça, jantar pós-culto — gente que às vezes só
// está na igreja para buscar a cesta. Cadastro leve, ficha socioeconômica
// enxuta e qualitativa, e uma chamada de confirmação igual à da EBD.
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
// ── TODA ESCRITA PASSA POR RPC ───────────────────────────────────────────────
//
// Sem exceção. As tabelas não têm política de INSERT/UPDATE para quem não é
// admin/secretaria — só a RPC, que checa a porta certa antes de gravar.

import { supabase } from "@/integrations/supabase/client";
import { type ResultadoEscrita } from "@/lib/escritaConferida";

export interface PessoaAssistida {
  id: string;
  nome_completo: string;
  telefone: string | null;
  membro_id: string | null;
}

export interface FichaSocioeconomica {
  id: string;
  data_preenchimento: string;
  composicao_familiar: number | null;
  situacao_moradia: string | null;
  situacao_trabalho: string | null;
  recebe_beneficio_social: boolean | null;
  qual_beneficio: string | null;
  observacoes: string | null;
}

export interface LinhaDaChamada {
  pessoa_assistida_id: string;
  nome_completo: string;
  telefone: string | null;
  confirmado: boolean;
}

export const SITUACOES_MORADIA = [
  { valor: "propria", rotulo: "Própria" },
  { valor: "alugada", rotulo: "Alugada" },
  { valor: "cedida", rotulo: "Cedida" },
  { valor: "situacao_de_rua", rotulo: "Situação de rua" },
  { valor: "outra", rotulo: "Outra" },
] as const;

export const SITUACOES_TRABALHO = [
  { valor: "empregado", rotulo: "Empregado" },
  { valor: "desempregado", rotulo: "Desempregado" },
  { valor: "informal", rotulo: "Trabalho informal" },
  { valor: "aposentado", rotulo: "Aposentado" },
  { valor: "outro", rotulo: "Outro" },
] as const;

function rotuloDe(lista: readonly { valor: string; rotulo: string }[], valor: string | null): string | null {
  if (!valor) return null;
  return lista.find(o => o.valor === valor)?.rotulo ?? valor;
}
export const rotuloMoradia   = (v: string | null) => rotuloDe(SITUACOES_MORADIA, v);
export const rotuloTrabalho  = (v: string | null) => rotuloDe(SITUACOES_TRABALHO, v);

// ─── Pessoas e vínculos ──────────────────────────────────────────────────

/** Quem é atendido em cada área do ministério — via as `diaconia_vinculos` que a RLS deixa ver. */
export async function pessoasDaArea(areaId: string): Promise<(PessoaAssistida & { vinculo_id: string })[]> {
  const { data, error } = await supabase
    .from("diaconia_vinculos")
    .select("id, ativo, diaconia_pessoas_assistidas(id, nome_completo, telefone, membro_id)")
    .eq("area_id", areaId).eq("ativo", true);
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter(v => v.diaconia_pessoas_assistidas)
    .map(v => ({ vinculo_id: v.id, ...v.diaconia_pessoas_assistidas }))
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));
}

/** Cadastra (ou reaproveita) a pessoa e a vincula à área. A única porta de entrada de gente nova. */
export async function criarPessoa(
  areaId: string, nome: string, telefone?: string, membroId?: string,
): Promise<ResultadoEscrita & { id?: string }> {
  const { data, error } = await supabase.rpc("diaconia_criar_pessoa", {
    p_area_id: areaId, p_nome: nome, p_telefone: telefone ?? null, p_membro_id: membroId ?? null,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true, id: data as string };
}

export async function vincularArea(pessoaAssistidaId: string, areaId: string): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_vincular_area", {
    p_pessoa_assistida_id: pessoaAssistidaId, p_area_id: areaId,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

// ─── Ficha socioeconômica — só ministra/líder ───────────────────────────

export async function fichasDaPessoa(pessoaAssistidaId: string): Promise<FichaSocioeconomica[]> {
  const { data, error } = await supabase
    .from("diaconia_fichas_socioeconomicas")
    .select("id, data_preenchimento, composicao_familiar, situacao_moradia, situacao_trabalho, recebe_beneficio_social, qual_beneficio, observacoes")
    .eq("pessoa_assistida_id", pessoaAssistidaId)
    .order("data_preenchimento", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FichaSocioeconomica[];
}

export async function salvarFicha(
  pessoaAssistidaId: string,
  ficha: {
    composicaoFamiliar?: number | null; situacaoMoradia?: string | null; situacaoTrabalho?: string | null;
    recebeBeneficioSocial?: boolean | null; qualBeneficio?: string | null; observacoes?: string | null;
  },
): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_salvar_ficha", {
    p_pessoa_assistida_id: pessoaAssistidaId,
    p_composicao_familiar: ficha.composicaoFamiliar ?? null,
    p_situacao_moradia: ficha.situacaoMoradia ?? null,
    p_situacao_trabalho: ficha.situacaoTrabalho ?? null,
    p_recebe_beneficio_social: ficha.recebeBeneficioSocial ?? null,
    p_qual_beneficio: ficha.qualBeneficio ?? null,
    p_observacoes: ficha.observacoes ?? null,
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

/** Cadastra alguém novo e já confirma na ocasião aberta — o "+ novo" da chamada. */
export async function adicionarPessoaNaChamada(
  ocasiaoId: string, areaId: string, nome: string, telefone?: string,
): Promise<ResultadoEscrita & { id?: string }> {
  const r = await criarPessoa(areaId, nome, telefone);
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
  if (mensagem.includes("Só a liderança da Diaconia")) return mensagem;
  if (mensagem.includes("row-level security")) return "Você não tem acesso a esta área da Diaconia.";
  return mensagem;
}
