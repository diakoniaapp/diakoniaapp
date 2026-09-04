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
import { idadeEm } from "@/lib/idade";

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
  /**
   * Quando a pessoa começou a ser assistida — não a data de digitação
   * (`created_at`, automática). Mora aqui, e não numa interface própria, só
   * porque `criarPessoa`/`atualizarPessoa` já recebem `DadosIdentidade` como
   * o payload inteiro; não é dado de identidade de verdade.
   */
  assistida_desde?: string | null;
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
  valor_beneficio: number | null;
  ja_trabalhou_clt: boolean | null;
  tempo_clt: string | null;
  atuacao_clt: string | null;
  situacao_moradia: string | null;
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

/** Os mais comuns entre quem a Diaconia atende — "Outro" abre um campo livre. */
export const BENEFICIOS_FEDERAIS = [
  "Bolsa Família",
  "BPC/LOAS",
  "Auxílio Gás",
  "Aposentadoria/Pensão (INSS)",
  "Seguro-Desemprego",
  "Outro",
] as const;

// ── Pedido dela em 04/09: "não use campos de escrita livre, trabalhe
// sempre com listas, para que possamos aferir corretamente... ao final,
// deixe as informações adicionais para textos livres." Cada lista abaixo
// troca um campo de texto por um de escolha — só `observacoes` continua
// livre. Todas terminam em "Outro" com campo próprio, para o caso real que
// a lista não previu não virar dado perdido.

export const TIPOS_DEFICIENCIA = [
  "Física", "Visual", "Auditiva", "Intelectual", "Múltipla", "Outra",
] as const;

export const FAIXAS_TEMPO_TRABALHO = [
  "Menos de 1 ano", "1 a 3 anos", "3 a 5 anos", "Mais de 5 anos",
] as const;

/** Usada tanto para "profissão" (identidade) quanto "em que atuava" (histórico CLT) — a mesma pergunta em dois momentos. */
export const SETORES_DE_OCUPACAO = [
  "Comércio", "Serviços domésticos", "Construção civil", "Indústria",
  "Transporte", "Alimentação/Cozinha", "Segurança", "Educação", "Saúde",
  "Serviços gerais/Limpeza", "Autônomo/Informal", "Outro",
] as const;

export const FONTES_DE_SUSTENTO = [
  "Emprego formal", "Trabalho informal/autônomo", "Benefício social",
  "Aposentadoria/Pensão", "Ajuda de familiares ou amigos", "Doações", "Outra",
] as const;

export const NECESSIDADES = [
  "Alimentação", "Moradia/Aluguel", "Saúde/Remédio", "Emprego",
  "Roupas/Calçados", "Contas/Dívidas", "Documentação", "Outra",
] as const;

export const ESCOLARIDADES = [
  "Sem escolaridade", "Fundamental incompleto", "Fundamental completo",
  "Médio incompleto", "Médio completo", "Superior incompleto",
  "Superior completo", "Pós-graduação",
] as const;

export const PARENTESCOS = [
  "Cônjuge/Companheiro(a)", "Filho(a)", "Enteado(a)", "Neto(a)", "Pai/Mãe",
  "Sogro(a)", "Irmão/Irmã", "Genro/Nora", "Avô/Avó", "Sobrinho(a)",
  "Cunhado(a)", "Outro",
] as const;

export const NACIONALIDADES = ["Brasileira", "Outra"] as const;

export const MOTIVOS_ENCERRAMENTO = [
  "Superou a situação", "Não retornou contato", "Mudou de cidade ou bairro",
  "Passou a receber ajuda de outra forma", "A pedido da própria pessoa", "Outro",
] as const;

function rotuloDe(lista: readonly { valor: string; rotulo: string }[], valor: string | null | undefined): string | null {
  if (!valor) return null;
  return lista.find(o => o.valor === valor)?.rotulo ?? valor;
}
export const rotuloMoradia     = (v: string | null | undefined) => rotuloDe(SITUACOES_MORADIA, v);
export const rotuloSexo        = (v: string | null | undefined) => rotuloDe(SEXOS, v);
export const rotuloEstadoCivil = (v: string | null | undefined) => rotuloDe(ESTADOS_CIVIS, v);

/**
 * Quantas pessoas moram na casa — a própria pessoa mais quem ela listou em
 * "quem mora na casa" (pergunta 7 da ficha impressa).
 *
 * Até 04/09 isto vinha de quatro caixas de contagem por faixa etária (Q6),
 * preenchidas À PARTE da lista de moradores (Q7) — a mesma informação
 * duas vezes, podendo discordar. A contagem agora É a lista: soma sozinha,
 * sem pedir de novo o que já foi dito.
 */
export function pessoasNaCasa(f: Pick<FichaSocioeconomica, "familiares">): number {
  return 1 + f.familiares.length;
}

/**
 * A renda familiar total — trabalho MAIS benefício, a mesma soma que o
 * CadÚnico faz. Ela perguntou: "como calcular a per capita? soma-se renda
 * + benefício? como saber o valor do benefício?" — `qual_beneficio` dizia
 * QUAL, nunca QUANTO; `valor_beneficio` supre isso.
 *
 * Cada parcela só entra quando o booleano correspondente é `true` — uma
 * pessoa com `possui_renda=false` não contribui com `renda_mensal` nem que
 * o campo tenha ficado com lixo de uma ficha anterior. `null` só quando os
 * DOIS booleanos nunca foram respondidos — nesse caso não se sabe nada,
 * que é diferente de saber que a renda é zero.
 */
export function rendaFamiliarTotal(f: FichaSocioeconomica): number | null {
  if (f.possui_renda == null && f.recebe_beneficio_social == null) return null;
  const trabalho = f.possui_renda ? (f.renda_mensal ?? 0) : 0;
  const beneficio = f.recebe_beneficio_social ? (f.valor_beneficio ?? 0) : 0;
  return trabalho + beneficio;
}

/** Renda per capita — calculada, nunca gravada. `null` quando não se sabe a renda. */
export function rendaPerCapita(f: FichaSocioeconomica): number | null {
  const total = rendaFamiliarTotal(f);
  if (total == null) return null;
  return total / pessoasNaCasa(f);
}

const FAIXAS_ETARIAS = [
  { chave: "criancas", rotulo: "até 11", ate: 11 },
  { chave: "adolescentes", rotulo: "12 a 18", ate: 18 },
  { chave: "adultos", rotulo: "19 a 59", ate: 59 },
  { chave: "idosos", rotulo: "60 ou mais", ate: Infinity },
] as const;

/**
 * A composição por faixa etária, só para leitura — a mesma pergunta que a
 * ficha impressa fazia em separado (Q6), derivada da lista de moradores e
 * da data de nascimento da própria pessoa. Quem não tem idade conhecida
 * (a pessoa sem `data_nascimento`, ou um morador só com "idade" em
 * branco) entra em `semIdade`, não é jogado fora nem chutado numa faixa.
 */
export function distribuicaoEtaria(
  pessoa: Pick<PessoaAssistida, "data_nascimento">, f: Pick<FichaSocioeconomica, "familiares">,
): { criancas: number; adolescentes: number; adultos: number; idosos: number; semIdade: number } {
  const contagem = { criancas: 0, adolescentes: 0, adultos: 0, idosos: 0, semIdade: 0 };
  const idades = [idadeEm(pessoa.data_nascimento), ...f.familiares.map(fam => fam.idade)];
  for (const idade of idades) {
    if (idade == null) { contagem.semIdade++; continue; }
    const faixa = FAIXAS_ETARIAS.find(fx => idade <= fx.ate) ?? FAIXAS_ETARIAS[FAIXAS_ETARIAS.length - 1];
    contagem[faixa.chave]++;
  }
  return contagem;
}

// ─── O piso da per capita — configurável, não fixo no código ────────────

export interface LimitesPerCapita {
  extremaPobreza: number;
  pobreza: number;
}

export type ClassificacaoVulnerabilidade = "extrema_pobreza" | "pobreza" | "acima_da_linha";

export async function carregarLimitesPerCapita(): Promise<LimitesPerCapita> {
  const { data, error } = await supabase.from("diaconia_config").select("chave, valor");
  if (error) throw error;
  const porChave = new Map(((data ?? []) as any[]).map(r => [r.chave, Number(r.valor)]));
  return {
    extremaPobreza: porChave.get("limite_extrema_pobreza") ?? 218,
    pobreza: porChave.get("limite_pobreza") ?? 810.5,
  };
}

export async function atualizarLimitePerCapita(chave: "limite_extrema_pobreza" | "limite_pobreza", valor: number): Promise<ResultadoEscrita> {
  const { error } = await supabase.from("diaconia_config")
    .update({ valor, atualizado_em: new Date().toISOString(), atualizado_por: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("chave", chave);
  if (error) return { ok: false, erro: "Você não pode alterar este limite." };
  return { ok: true };
}

/** Classifica pela linha oficial do CadÚnico — orienta a leitura, não decide a ajuda. */
export function classificarPerCapita(valor: number, limites: LimitesPerCapita): ClassificacaoVulnerabilidade {
  if (valor <= limites.extremaPobreza) return "extrema_pobreza";
  if (valor <= limites.pobreza) return "pobreza";
  return "acima_da_linha";
}

export const ROTULO_CLASSIFICACAO: Record<ClassificacaoVulnerabilidade, string> = {
  extrema_pobreza: "Extrema pobreza",
  pobreza: "Pobreza",
  acima_da_linha: "Acima da linha",
};

// ─── Pessoas e vínculos ──────────────────────────────────────────────────

const CAMPOS_PESSOA =
  "id, nome_completo, telefone, membro_id, cep, endereco, numero, complemento, bairro, cidade, uf, " +
  "data_nascimento, sexo, estado_civil, rg, cpf, nacionalidade, naturalidade, profissao, escolaridade, " +
  "assistida_desde";

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

export interface VinculoEncerrado extends PessoaAssistida {
  vinculo_id: string;
  encerrado_em: string;
  motivo_encerramento: string | null;
}

/**
 * Quem teve o acompanhamento encerrado nesta área — separado de
 * `pessoasDaArea` (que só traz `ativo=true`) porque encerrar não é
 * apagar: a única forma de reabrir por engano é primeiro conseguir achar
 * quem foi encerrado.
 */
export async function pessoasEncerradasDaArea(areaId: string): Promise<VinculoEncerrado[]> {
  const { data, error } = await supabase
    .from("diaconia_vinculos")
    .select(`id, encerrado_em, motivo_encerramento, diaconia_pessoas_assistidas(${CAMPOS_PESSOA})`)
    .eq("area_id", areaId).eq("ativo", false).order("encerrado_em", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter(v => v.diaconia_pessoas_assistidas)
    .map(v => ({
      vinculo_id: v.id, encerrado_em: v.encerrado_em, motivo_encerramento: v.motivo_encerramento,
      ...v.diaconia_pessoas_assistidas,
    }));
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

// ─── E se já for membro? ─────────────────────────────────────────────────
//
// Pergunta dela: "e para os membros que também são assistidos?" —
// `membro_id` existe desde 03/09, mas nenhuma tela oferecia como escolher
// o membro. `membros` só é legível por admin/secretaria/diakonia (mais a
// própria equipe do líder, um recorte estreito demais aqui) — por isso a
// busca não lê `membros` direto (o `BuscaPessoa` do resto do sistema
// voltaria vazio pra quase todo líder de Diaconia); passa por
// `diaconia_buscar_membro`, que devolve só nome/tipo/telefone, não a
// ficha inteira.

export interface MembroEncontrado {
  id: string;
  nome_completo: string;
  tipo_pessoa: string | null;
  telefone_celular: string | null;
}

export async function buscarMembro(termo: string): Promise<MembroEncontrado[]> {
  if (termo.trim().length < 2) return [];
  const { data, error } = await supabase.rpc("diaconia_buscar_membro", { p_termo: termo });
  if (error) throw error;
  return (data ?? []) as MembroEncontrado[];
}

/** Vincula (ou, com `null`, desvincula) quem já está cadastrado a uma ficha de membro/congregado existente. */
export async function vincularMembro(pessoaAssistidaId: string, membroId: string | null): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_vincular_membro", {
    p_pessoa_assistida_id: pessoaAssistidaId, p_membro_id: membroId,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

// ─── A transição para visitante ──────────────────────────────────────────
//
// "Estreitar o contato" era o objetivo dela desde o primeiro pedido — às
// vezes funciona: quem só vinha buscar cesta começa a frequentar o culto.
// A ficha socioeconômica não se move; só a identidade vira uma ficha de
// visitante de verdade, pelo mesmo caminho que qualquer visitante novo
// passa, visível no Painel Pastoral.

/** Cria a ficha de visitante (ou devolve a que já existe, sem duplicar) e liga via `membro_id`. */
export async function iniciarFrequencia(pessoaAssistidaId: string): Promise<ResultadoEscrita & { membroId?: string }> {
  const { data, error } = await supabase.rpc("diaconia_iniciar_frequencia", {
    p_pessoa_assistida_id: pessoaAssistidaId,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true, membroId: data as string };
}

export interface SugestaoPgm {
  id: string;
  nome: string;
  dia_semana: number | null;
  horario: string | null;
  bairro: string | null;
  qtd_membros: number;
  lider_nome: string | null;
}

const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "Terça · 19:30" — nulo quando falta um dos dois. */
export function quandoOPgmSeReune(s: Pick<SugestaoPgm, "dia_semana" | "horario">): string | null {
  const dia = s.dia_semana != null ? DIAS_DA_SEMANA[s.dia_semana] : null;
  const hora = s.horario ? s.horario.slice(0, 5) : null;
  return [dia, hora].filter(Boolean).join(" · ") || null;
}

/**
 * Pergunta dela: "como indicar um pequeno grupo para que o assistido
 * possa frequentar?" — `pgm_sugerir_por_bairro` já existia antes desta
 * sessão, feita exatamente pra isto. Não é exclusiva da Diaconia — é a
 * mesma função que outros convites do sistema já usam.
 */
export async function sugerirPgmPorBairro(bairro: string): Promise<SugestaoPgm[]> {
  if (!bairro?.trim()) return [];
  const { data, error } = await supabase.rpc("pgm_sugerir_por_bairro", { p_bairro: bairro });
  if (error) throw error;
  return (data ?? []) as SugestaoPgm[];
}

// ─── Ficha socioeconômica — só ministra/líder ───────────────────────────

const CAMPOS_FICHA =
  "id, data_preenchimento, possui_deficiencia, qual_deficiencia, possui_renda, renda_mensal, " +
  "recebe_beneficio_social, qual_beneficio, valor_beneficio, ja_trabalhou_clt, tempo_clt, atuacao_clt, " +
  "situacao_moradia, familiares, sustento_familia, maior_necessidade, observacoes";

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

// ─── Indicadores ─────────────────────────────────────────────────────────
//
// A ficha, sozinha, é dado cru — só vira indicador quando alguém soma. Isto
// olha para todo mundo vinculado às áreas do ministério, pega a ficha MAIS
// RECENTE de cada um (quem tem mais de uma, é a última que vale — a
// situação de hoje, não a de dois anos atrás) e classifica pela linha do
// CadÚnico. Cobertura entra primeiro: sem saber quantos NÃO têm ficha, os
// outros números mentem por omissão.

export interface IndicadoresDiaconia {
  comFicha: number;
  semFicha: number;
  distribuicao: Record<ClassificacaoVulnerabilidade, number>;
  /** Tem ficha, mas sem renda ou sem gente na casa suficiente pra calcular per capita. */
  semDadoParaClassificar: number;
  perCapitaMedio: number | null;
  criancasAtendidas: number;
  idososAtendidos: number;
}

export async function carregarIndicadoresDiaconia(
  ministerioId: string, limites: LimitesPerCapita,
): Promise<IndicadoresDiaconia | null> {
  const { data: areas } = await supabase
    .from("areas").select("id").eq("ministerio_id", ministerioId).eq("ativo", true);
  const areaIds = ((areas ?? []) as any[]).map(a => a.id);
  if (areaIds.length === 0) return null;

  const { data: vinculos } = await supabase
    .from("diaconia_vinculos").select("pessoa_assistida_id").in("area_id", areaIds).eq("ativo", true);
  const pessoaIds = [...new Set(((vinculos ?? []) as any[]).map(v => v.pessoa_assistida_id))];
  if (pessoaIds.length === 0) return null;

  const [{ data: pessoas }, { data: fichas }] = await Promise.all([
    supabase.from("diaconia_pessoas_assistidas").select("id, data_nascimento").in("id", pessoaIds),
    supabase.from("diaconia_fichas_socioeconomicas")
      .select("pessoa_assistida_id, data_preenchimento, possui_renda, renda_mensal, recebe_beneficio_social, valor_beneficio, familiares")
      .in("pessoa_assistida_id", pessoaIds)
      .order("data_preenchimento", { ascending: false }),
  ]);

  const pessoaPorId = new Map(((pessoas ?? []) as any[]).map(p => [p.id, p]));
  // A primeira ficha de cada pessoa, na ordem (mais recente primeiro) já vencida acima, é a que vale.
  const ultimaFichaPorPessoa = new Map<string, any>();
  for (const f of (fichas ?? []) as any[]) {
    if (!ultimaFichaPorPessoa.has(f.pessoa_assistida_id)) ultimaFichaPorPessoa.set(f.pessoa_assistida_id, f);
  }

  const distribuicao: Record<ClassificacaoVulnerabilidade, number> = { extrema_pobreza: 0, pobreza: 0, acima_da_linha: 0 };
  let semDadoParaClassificar = 0;
  const percapitas: number[] = [];
  let criancasAtendidas = 0, idososAtendidos = 0;

  for (const [pessoaId, ficha] of ultimaFichaPorPessoa) {
    const f = { ...ficha, familiares: (ficha.familiares ?? []) as Familiar[] };
    const percapita = rendaPerCapita(f);
    if (percapita != null) {
      distribuicao[classificarPerCapita(percapita, limites)]++;
      percapitas.push(percapita);
    } else {
      semDadoParaClassificar++;
    }
    const pessoa = pessoaPorId.get(pessoaId);
    if (pessoa) {
      const faixas = distribuicaoEtaria(pessoa, f);
      criancasAtendidas += faixas.criancas;
      idososAtendidos += faixas.idosos;
    }
  }

  return {
    comFicha: ultimaFichaPorPessoa.size,
    semFicha: pessoaIds.length - ultimaFichaPorPessoa.size,
    distribuicao,
    semDadoParaClassificar,
    perCapitaMedio: percapitas.length > 0 ? percapitas.reduce((a, b) => a + b, 0) / percapitas.length : null,
    criancasAtendidas,
    idososAtendidos,
  };
}

// ─── Quem parou de vir ───────────────────────────────────────────────────
//
// A origem do problema, nas palavras dela: "estas cestas começaram a ser
// doadas na época da pandemia, com a intenção de auxiliar por 3 meses, e
// não houve acompanhamento... até pra saber se pode continuar ou se já
// não precisa de ajuda." O critério é dela — "não veio 2 meses seguidos" —
// e não pede campo novo nenhum: a chamada já grava quem foi confirmado em
// cada ocasião. Isto conta faltas seguidas a partir de hoje pra trás, só
// sobre ocasiões que ALGUÉM realmente abriu — um mês em que ninguém rodou
// a chamada não conta nem a favor nem contra, porque não há como saber se
// a pessoa viria.

export interface PendenciaAcompanhamento {
  vinculo_id: string;
  pessoa_id: string;
  nome: string;
  area_id: string;
  area_nome: string;
  faltasSeguidas: number;
  ultimaConfirmacaoEm: string | null;
}

export async function carregarPendenciasAcompanhamento(
  ministerioId: string, minimoFaltas = 2,
): Promise<PendenciaAcompanhamento[]> {
  const { data: areas } = await supabase
    .from("areas").select("id, nome").eq("ministerio_id", ministerioId).eq("ativo", true);
  const listaAreas = (areas ?? []) as { id: string; nome: string }[];
  if (listaAreas.length === 0) return [];
  const areaIds = listaAreas.map(a => a.id);
  const nomeDaArea = new Map(listaAreas.map(a => [a.id, a.nome]));

  const hoje = new Date().toISOString().slice(0, 10);
  const [{ data: vinculos }, { data: ocasioes }] = await Promise.all([
    supabase.from("diaconia_vinculos")
      .select(`id, area_id, pessoa_assistida_id, diaconia_pessoas_assistidas(nome_completo)`)
      .in("area_id", areaIds).eq("ativo", true),
    supabase.from("diaconia_ocasioes")
      .select("id, area_id, data").in("area_id", areaIds).lte("data", hoje)
      .order("data", { ascending: false }),
  ]);

  const ocasioesPorArea = new Map<string, { id: string; data: string }[]>();
  for (const o of (ocasioes ?? []) as any[]) {
    if (!ocasioesPorArea.has(o.area_id)) ocasioesPorArea.set(o.area_id, []);
    ocasioesPorArea.get(o.area_id)!.push({ id: o.id, data: o.data });
  }

  const ocasiaoIds = ((ocasioes ?? []) as any[]).map(o => o.id);
  const confirmadosPorOcasiao = new Map<string, Set<string>>();
  if (ocasiaoIds.length > 0) {
    const { data: atendimentos } = await supabase
      .from("diaconia_atendimentos").select("ocasiao_id, pessoa_assistida_id")
      .in("ocasiao_id", ocasiaoIds).eq("confirmado", true);
    for (const a of (atendimentos ?? []) as any[]) {
      if (!confirmadosPorOcasiao.has(a.ocasiao_id)) confirmadosPorOcasiao.set(a.ocasiao_id, new Set());
      confirmadosPorOcasiao.get(a.ocasiao_id)!.add(a.pessoa_assistida_id);
    }
  }

  const pendencias: PendenciaAcompanhamento[] = [];
  for (const v of (vinculos ?? []) as any[]) {
    const ocasioesDaArea = ocasioesPorArea.get(v.area_id) ?? [];
    let faltas = 0;
    let ultimaConfirmacaoEm: string | null = null;
    for (const o of ocasioesDaArea) {
      const veio = confirmadosPorOcasiao.get(o.id)?.has(v.pessoa_assistida_id) ?? false;
      if (veio) { ultimaConfirmacaoEm = o.data; break; }
      faltas++;
    }
    if (faltas >= minimoFaltas) {
      pendencias.push({
        vinculo_id: v.id, pessoa_id: v.pessoa_assistida_id,
        nome: v.diaconia_pessoas_assistidas?.nome_completo ?? "—",
        area_id: v.area_id, area_nome: nomeDaArea.get(v.area_id) ?? "—",
        faltasSeguidas: faltas, ultimaConfirmacaoEm,
      });
    }
  }
  return pendencias.sort((a, b) => b.faltasSeguidas - a.faltasSeguidas);
}

/** Decide que a pessoa não precisa mais de acompanhamento nesta área — com motivo, porta estrita. */
export async function encerrarVinculo(vinculoId: string, motivo?: string): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_encerrar_vinculo", {
    p_vinculo_id: vinculoId, p_motivo: motivo ?? null,
  });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

/** Desfaz um encerramento por engano — mesma porta. */
export async function reabrirVinculo(vinculoId: string): Promise<ResultadoEscrita> {
  const { error } = await supabase.rpc("diaconia_reabrir_vinculo", { p_vinculo_id: vinculoId });
  if (error) return { ok: false, erro: traduzir(error.message) };
  return { ok: true };
}

function traduzir(mensagem: string): string {
  if (mensagem.includes("Você não atende nesta área")) return mensagem;
  if (mensagem.includes("Você não atende esta pessoa")) return mensagem;
  if (mensagem.includes("Só a liderança da Diaconia")) return mensagem;
  if (mensagem.includes("row-level security")) return "Você não tem acesso a esta área da Diaconia.";
  return mensagem;
}
