// ─── quitacaoService.ts — a Quitação (quem pagou a obrigação e por quê): leitura e as chamadas às funções do banco ───────────────────────────────────
//
// Fase 1A da Política de Compras por Terceiros, Reembolsos e Doações (migrations 20261014100000, 20261014110000 e 20261014120000). O aplicativo funciona ANTES delas:
// `quitacaoDisponivel()` sonda a tabela e, sem ela, as telas escondem tudo o que é da Quitação (padrão `liquidacaoDisponivel`). Quem escreve é o banco: as funções
// fin_registrar_quitacao / fin_alterar_quitacao / fin_remover_quitacao / fin_decidir_quitacao validam, auditam e recusam o que a Política não permite; a tela só avisa antes.
// A regra de negócio pura (Matriz, resultado, fila) está em lib/quitacao.ts; AQUI nada é recalculado — o que o banco derivou (vw_fin_quitacao) é o que se mostra.
import { supabase } from "@/integrations/supabase/client";
import {
  PARAMETROS_PADRAO, type Fila, type Grau, type Intencao, type Nivel, type NaturezaDoItem, type ParametrosDaQuitacao, type Resultado, type ResponsavelTipo,
} from "@/lib/quitacao";

let sondagem: { em: number; ok: boolean } | null = null;

/** `true` quando as migrations da Quitação foram aplicadas. Resultado guardado por 30 s. */
export async function quitacaoDisponivel(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.from("vw_fin_quitacao" as never).select("quitacao_id").limit(1);
  sondagem = { em: Date.now(), ok: !error };
  return !error;
}
export function esquecerSondagemDeQuitacao() { sondagem = null; sondagemOferta = null; }

let sondagemOferta: { em: number; ok: boolean } | null = null;
/**
 * `true` quando o status `quitado_terceiro` (Fase 1B) existe no banco: só então a OFERTA pode ser registrada. Sonda pedindo uma linha com esse status — se o valor ainda não existe no enum,
 * o banco responde com erro de valor inválido. Resultado guardado por 30 s.
 */
export async function ofertaDisponivel(): Promise<boolean> {
  if (sondagemOferta && Date.now() - sondagemOferta.em < 30_000) return sondagemOferta.ok;
  if (!(await quitacaoDisponivel())) { sondagemOferta = { em: Date.now(), ok: false }; return false; }
  const { error } = await supabase.from("fin_lancamentos").select("id").eq("status", "quitado_terceiro" as never).limit(1);
  sondagemOferta = { em: Date.now(), ok: !error };
  return !error;
}

/**
 * A formalização vencida é um fato do TEMPO: uma oferta aceita como Relatado pode deixar de bastar quando o prazo passa. Ao abrir a Mesa, o banco realinha o status das ofertas com o que a Matriz
 * manda (idempotente; só quem é do financeiro). Devolve quantas obrigações mudaram. Sem a migration, não faz nada.
 */
export async function sincronizarQuitacoes(): Promise<number> {
  if (!(await ofertaDisponivel())) return 0;
  const { data, error } = await supabase.rpc("fin_quitacao_sincronizar_todas" as never);
  if (error) return 0;
  return Number(data ?? 0);
}

export interface QuitacaoDaObrigacao {
  quitacaoId: string;
  obrigacaoId: string;
  responsavel: Exclude<ResponsavelTipo, "igreja" | "ninguem_ainda">;
  pessoaId: string | null;
  fornecedorId: string | null;
  /** o nome do cadastro (pessoa, empresa ou entidade); null para "Não localizado" */
  responsavelNome: string | null;
  intencao: Intencao;
  pagoEm: string | null;
  declaradoEm: string | null;
  condicao: string | null;
  pedeRecibo: boolean;
  registradoEm: string;
  registradoPor: string | null;
  grauResponsavel: Grau;
  grauIntencao: Grau;
  grauConjunto: Grau;
  nivelRisco: Nivel;
  suficiente: boolean;
  exigeAprovacaoDoAdministrador: boolean;
  motivoInsuficiencia: string | null;
  moduladores: string[];
  aprovacaoDoReembolso: "aprovada" | "recusada" | null;
  aprovacaoDoRelatado: "aprovada" | "recusada" | null;
  resultado: Resultado;
  credorAtual: "emitente" | "terceiro" | "nenhum" | "em_analise";
  fila: Fila | null;
  bloqueiaFechamento: boolean;
  dataDaDespesa: string;
  valorDaObrigacao: number;
  /** só no reembolso: quanto já saiu do banco para quem pagou, e quanto falta (null nas outras intenções ou antes da Fase 1C-a) */
  reembolsado: number | null;
  saldoAReembolsar: number | null;
}

type Linha = Record<string, unknown>;
const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function daLinha(r: Linha, nome: string | null): QuitacaoDaObrigacao {
  return {
    quitacaoId: String(r.quitacao_id), obrigacaoId: String(r.obrigacao_id), responsavel: String(r.responsavel_tipo) as QuitacaoDaObrigacao["responsavel"],
    pessoaId: txt(r.responsavel_pessoa_id), fornecedorId: txt(r.responsavel_fornecedor_id), responsavelNome: nome,
    intencao: String(r.intencao) as Intencao, pagoEm: txt(r.pago_em)?.slice(0, 10) ?? null, declaradoEm: txt(r.declarado_em)?.slice(0, 10) ?? null,
    condicao: txt(r.condicao), pedeRecibo: !!r.pede_recibo, registradoEm: String(r.registrado_em), registradoPor: txt(r.registrado_por),
    grauResponsavel: String(r.grau_responsavel) as Grau, grauIntencao: String(r.grau_intencao) as Grau, grauConjunto: String(r.grau_conjunto) as Grau,
    nivelRisco: String(r.nivel_risco) as Nivel, suficiente: !!r.suficiente, exigeAprovacaoDoAdministrador: !!r.exige_aprovacao_administrador,
    motivoInsuficiencia: txt(r.motivo_insuficiencia), moduladores: Array.isArray(r.moduladores) ? (r.moduladores as unknown[]).map(String) : [],
    aprovacaoDoReembolso: (txt(r.aprovacao_reembolso) as "aprovada" | "recusada" | null), aprovacaoDoRelatado: (txt(r.aprovacao_relatado) as "aprovada" | "recusada" | null),
    resultado: String(r.resultado) as Resultado, credorAtual: String(r.credor_atual) as QuitacaoDaObrigacao["credorAtual"], fila: (txt(r.fila) as Fila | null),
    bloqueiaFechamento: !!r.bloqueia_fechamento, dataDaDespesa: String(r.data_despesa).slice(0, 10), valorDaObrigacao: Number(r.valor_obrigacao),
    reembolsado: r.reembolsado === null || r.reembolsado === undefined ? null : Number(r.reembolsado),
    saldoAReembolsar: r.saldo_a_reembolsar === null || r.saldo_a_reembolsar === undefined ? null : Number(r.saldo_a_reembolsar),
  };
}

/** Os nomes dos cadastros (pessoa em `membros`, empresa/entidade em `fin_fornecedores`) das quitações lidas. */
async function nomesDosResponsaveis(linhas: Linha[]): Promise<{ pessoas: Map<string, string>; fornecedores: Map<string, string> }> {
  const pessoas = new Map<string, string>(), fornecedores = new Map<string, string>();
  const ps = [...new Set(linhas.map(l => txt(l.responsavel_pessoa_id)).filter((x): x is string => !!x))];
  const fs = [...new Set(linhas.map(l => txt(l.responsavel_fornecedor_id)).filter((x): x is string => !!x))];
  if (ps.length) { const { data } = await supabase.from("membros").select("id, nome_completo").in("id", ps); for (const m of data ?? []) pessoas.set(String(m.id), String(m.nome_completo)); }
  if (fs.length) { const { data } = await supabase.from("fin_fornecedores").select("id, nome").in("id", fs); for (const f of data ?? []) fornecedores.set(String(f.id), String(f.nome)); }
  return { pessoas, fornecedores };
}

/** A quitação de uma obrigação (ou de uma parcela dela). `null` = não há quitação registrada (ou a Política ainda não foi aplicada no banco). */
export async function quitacaoDaObrigacao(lancamentoId: string): Promise<QuitacaoDaObrigacao | null> {
  if (!(await quitacaoDisponivel())) return null;
  const l = await supabase.from("fin_lancamentos").select("id, obrigacao_id" as never).eq("id", lancamentoId).maybeSingle();
  const raiz = String((l.data as unknown as { obrigacao_id?: string | null } | null)?.obrigacao_id ?? lancamentoId);
  const { data, error } = await supabase.from("vw_fin_quitacao" as never).select("*").eq("obrigacao_id" as never, raiz as never).maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as Linha;
  const nomes = await nomesDosResponsaveis([r]);
  const nome = txt(r.responsavel_pessoa_id) ? nomes.pessoas.get(String(r.responsavel_pessoa_id)) ?? null : txt(r.responsavel_fornecedor_id) ? nomes.fornecedores.get(String(r.responsavel_fornecedor_id)) ?? null : null;
  return daLinha(r, nome);
}

/** As quitações de várias obrigações de uma vez (para marcar a lista da Mesa). A chave é o id da obrigação-raiz. */
export async function quitacoesDasObrigacoes(obrigacaoIds: string[]): Promise<Map<string, QuitacaoDaObrigacao>> {
  const out = new Map<string, QuitacaoDaObrigacao>();
  if (obrigacaoIds.length === 0 || !(await quitacaoDisponivel())) return out;
  for (let i = 0; i < obrigacaoIds.length; i += 150) {
    const { data, error } = await supabase.from("vw_fin_quitacao" as never).select("*").in("obrigacao_id" as never, obrigacaoIds.slice(i, i + 150) as never);
    if (error) return out;
    const linhas = (data ?? []) as unknown as Linha[];
    const nomes = await nomesDosResponsaveis(linhas);
    for (const r of linhas) {
      const nome = txt(r.responsavel_pessoa_id) ? nomes.pessoas.get(String(r.responsavel_pessoa_id)) ?? null : txt(r.responsavel_fornecedor_id) ? nomes.fornecedores.get(String(r.responsavel_fornecedor_id)) ?? null : null;
      out.set(String(r.obrigacao_id), daLinha(r, nome));
    }
  }
  return out;
}

export interface ItemDeFila extends QuitacaoDaObrigacao {
  descricao: string | null;
  emitente: string | null;
  /** dias desde a data da despesa */
  idadeEmDias: number;
}

/** Tudo o que está numa fila de quitação (Investigar, A esclarecer, Formalizar, Aprovar reembolso, Reembolso a pagar), do mais antigo ao mais novo. */
export async function listarFilasDeQuitacao(hoje: string): Promise<ItemDeFila[]> {
  if (!(await quitacaoDisponivel())) return [];
  const { data, error } = await supabase.from("vw_fin_quitacao" as never).select("*").not("fila" as never, "is" as never, null as never).order("data_despesa" as never);
  if (error) return [];
  const linhas = (data ?? []) as unknown as Linha[];
  if (linhas.length === 0) return [];
  const nomes = await nomesDosResponsaveis(linhas);
  const ids = linhas.map(l => String(l.obrigacao_id));
  const lancs = await supabase.from("fin_lancamentos").select("id, descricao, fornecedor_id").in("id", ids);
  const fornIds = [...new Set((lancs.data ?? []).map(l => txt(l.fornecedor_id)).filter((x): x is string => !!x))];
  const emit = new Map<string, string>();
  if (fornIds.length) { const f = await supabase.from("fin_fornecedores").select("id, nome").in("id", fornIds); for (const x of f.data ?? []) emit.set(String(x.id), String(x.nome)); }
  const porId = new Map((lancs.data ?? []).map(l => [String(l.id), l]));
  const dias = (de: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
  return linhas.map(r => {
    const nome = txt(r.responsavel_pessoa_id) ? nomes.pessoas.get(String(r.responsavel_pessoa_id)) ?? null : txt(r.responsavel_fornecedor_id) ? nomes.fornecedores.get(String(r.responsavel_fornecedor_id)) ?? null : null;
    const lanc = porId.get(String(r.obrigacao_id));
    return { ...daLinha(r, nome), descricao: lanc ? txt(lanc.descricao) : null, emitente: lanc && txt(lanc.fornecedor_id) ? emit.get(String(lanc.fornecedor_id)) ?? null : null, idadeEmDias: dias(String(r.data_despesa).slice(0, 10)) };
  });
}

export interface EventoDaQuitacao { id: string; evento: string; decisao: string | null; motivo: string | null; em: string; por: string | null; porNome: string | null; de: Linha | null; para: Linha | null }

export async function eventosDaQuitacao(quitacaoId: string): Promise<EventoDaQuitacao[]> {
  if (!(await quitacaoDisponivel())) return [];
  const { data, error } = await supabase.from("fin_quitacao_eventos" as never).select("*").eq("quitacao_id" as never, quitacaoId as never).order("em" as never);
  if (error) return [];
  const linhas = (data ?? []) as unknown as Linha[];
  const por = [...new Set(linhas.map(l => txt(l.por)).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (por.length) { const p = await supabase.from("profiles").select("id, nome").in("id", por); for (const x of p.data ?? []) nomes.set(String(x.id), String(x.nome)); }
  return linhas.map(l => ({ id: String(l.id), evento: String(l.evento), decisao: txt(l.decisao), motivo: txt(l.motivo), em: String(l.em), por: txt(l.por), porNome: txt(l.por) ? nomes.get(String(l.por)) ?? null : null, de: (l.de as Linha) ?? null, para: (l.para as Linha) ?? null }));
}

export async function carregarParametros(): Promise<ParametrosDaQuitacao> {
  if (!(await quitacaoDisponivel())) return PARAMETROS_PADRAO;
  const { data, error } = await supabase.from("fin_quitacao_parametros" as never).select("*").limit(1).maybeSingle();
  if (error || !data) return PARAMETROS_PADRAO;
  const r = data as unknown as Linha;
  return {
    vigencia: txt(r.vigencia)?.slice(0, 10) ?? null, teto1: Number(r.teto_1), prazoDeclaracaoDias: Number(r.prazo_declaracao_dias), tetoAnualTerceiro: Number(r.teto_anual_terceiro),
    qtdRelatadasTrimestre: Number(r.qtd_relatadas_trimestre), prazoFormalizacaoDias: Number(r.prazo_formalizacao_dias), prazoEsclarecimentoDias: Number(r.prazo_esclarecimento_dias),
    prazoReembolsoDias: Number(r.prazo_reembolso_dias), limiteCapitalizacao: r.limite_capitalizacao === null || r.limite_capitalizacao === undefined ? null : Number(r.limite_capitalizacao),
  };
}

/** A natureza e o comprador que já estão gravados na despesa (para a tela não perguntar de novo). */
export async function dadosDaDespesaParaQuitar(lancamentoId: string): Promise<{ naturezaItem: NaturezaDoItem | null; comprador: "cnpj_igreja" | "contratacao_previa" | null; fornecedorId: string | null; valor: number; data: string; status: string } | null> {
  const { data, error } = await supabase.from("fin_lancamentos").select("*").eq("id", lancamentoId).maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as Linha;
  return {
    naturezaItem: (txt(r.natureza_item) as NaturezaDoItem | null), comprador: (txt(r.comprador) as "cnpj_igreja" | "contratacao_previa" | null), fornecedorId: txt(r.fornecedor_id),
    valor: Number(r.valor_original ?? r.valor), data: String(r.data).slice(0, 10), status: String(r.status),
  };
}

// ── escritas (sempre pelas funções do banco; a mensagem do banco já vem em português) ──────────────────────────────────────────────────────────────

export interface PedidoDeRegistro {
  lancamentoId: string;
  responsavel: Exclude<ResponsavelTipo, "igreja" | "ninguem_ainda">;
  pessoaId: string | null;
  fornecedorId: string | null;
  intencao: Intencao;
  pagoEm: string | null;
  declaradoEm: string | null;
  naturezaItem: NaturezaDoItem | null;
  comprador: "cnpj_igreja" | "contratacao_previa" | null;
  condicao: string | null;
  pedeRecibo: boolean;
  motivo?: string | null;
}

async function chamar<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw new Error(error.message);
  esquecerSondagemDeQuitacao();
  return data as T;
}

export const registrarQuitacao = (p: PedidoDeRegistro): Promise<string> => chamar<string>("fin_registrar_quitacao", {
  p_lancamento: p.lancamentoId, p_responsavel: p.responsavel, p_pessoa: p.pessoaId, p_fornecedor: p.fornecedorId, p_intencao: p.intencao,
  p_pago_em: p.pagoEm, p_declarado_em: p.declaradoEm, p_natureza_item: p.naturezaItem, p_comprador: p.comprador, p_condicao: p.condicao, p_pede_recibo: p.pedeRecibo, p_motivo: p.motivo ?? null,
});

export const alterarQuitacao = (quitacaoId: string, mudancas: Record<string, unknown>, motivo: string): Promise<void> =>
  chamar<void>("fin_alterar_quitacao", { p_quitacao: quitacaoId, p_patch: mudancas, p_motivo: motivo });

export const removerQuitacao = (quitacaoId: string, motivo: string): Promise<void> => chamar<void>("fin_remover_quitacao", { p_quitacao: quitacaoId, p_motivo: motivo });

export const decidirQuitacao = (quitacaoId: string, tipo: "reembolso" | "relatado", decisao: "aprovada" | "recusada", motivo?: string): Promise<void> =>
  chamar<void>("fin_decidir_quitacao", { p_quitacao: quitacaoId, p_tipo: tipo, p_decisao: decisao, p_motivo: motivo ?? null });

export const alterarParametros = (mudancas: Record<string, unknown>, motivo: string): Promise<void> => chamar<void>("fin_quitacao_parametros_alterar", { p_patch: mudancas, p_motivo: motivo });

/** Registrar uma NOTA que o aplicativo ainda não tinha, já quitada por um terceiro: a obrigação e a quitação nascem na MESMA operação (ou nada nasce). */
export interface PedidoDeNotaQuitada {
  contaId: string;
  emitenteId: string;
  dataDaNota: string;
  valor: number;
  descricao: string | null;
  numeroDaNota: string | null;
  chaveDeAcesso: string | null;
  categoriaId: string | null;
  centroCustoId: string | null;
  naturezaItem: NaturezaDoItem;
  comprador: "cnpj_igreja" | "contratacao_previa";
  responsavel: Exclude<ResponsavelTipo, "igreja" | "ninguem_ainda">;
  pessoaId: string | null;
  fornecedorDoResponsavelId: string | null;
  intencao: Intencao;
  pagoEm: string | null;
  declaradoEm: string | null;
  condicao: string | null;
  pedeRecibo: boolean;
  motivo?: string | null;
}

/** Devolve o id da obrigação criada. */
export const registrarNotaQuitadaPorTerceiro = (p: PedidoDeNotaQuitada): Promise<string> => chamar<string>("fin_registrar_nf_quitada_por_terceiro", {
  p_conta: p.contaId, p_fornecedor: p.emitenteId, p_data: p.dataDaNota, p_valor: p.valor, p_descricao: p.descricao, p_documento_numero: p.numeroDaNota, p_chave: p.chaveDeAcesso,
  p_categoria: p.categoriaId, p_centro: p.centroCustoId, p_natureza_item: p.naturezaItem, p_comprador: p.comprador,
  p_responsavel: p.responsavel, p_pessoa: p.pessoaId, p_responsavel_fornecedor: p.fornecedorDoResponsavelId, p_intencao: p.intencao, p_pago_em: p.pagoEm, p_declarado_em: p.declaradoEm,
  p_condicao: p.condicao, p_pede_recibo: p.pedeRecibo, p_motivo: p.motivo ?? null,
});

/** Os dados para pagar um reembolso: o que o banco calculou (saldo) e a conta/forma/valor que a Tesouraria escolheu. */
export interface PedidoDeReembolso {
  quitacaoId: string;
  contaId: string;
  /** AAAA-MM-DD */
  data: string;
  forma: string | null;
  valor: number;
  ofxFitid?: string | null;
  observacoes?: string | null;
}

/**
 * Paga (total ou parcialmente) o reembolso APROVADO. É a casca do banco sobre a liquidação: não cria entrada, transferência nem saída fictícia — o dinheiro sai uma vez, da conta escolhida.
 * Devolve o id da liquidação. As recusas do banco (não aprovado, valor acima do saldo, já pago) chegam em português.
 */
export async function pagarReembolso(p: PedidoDeReembolso): Promise<string> {
  const { data, error } = await supabase.rpc("fin_liquidar_reembolso" as never, {
    p_quitacao: p.quitacaoId, p_conta_id: p.contaId, p_data: p.data, p_forma: p.forma, p_valor: p.valor, p_comprovante_url: null, p_ofx_fitid: p.ofxFitid ?? null, p_observacoes: p.observacoes ?? null,
  } as never);
  if (error) throw new Error(error.message);
  esquecerSondagemDeQuitacao();
  return data as unknown as string;
}

/** Os lançamentos (parcelas pagas) de uma liquidação — para anexar o comprovante do reembolso, que só existe depois de pago. */
export async function lancamentosDaLiquidacao(liquidacaoId: string): Promise<string[]> {
  const { data, error } = await supabase.from("fin_lancamentos").select("id").eq("liquidacao_id" as never, liquidacaoId as never);
  if (error) return [];
  return (data ?? []).map(l => String((l as { id: string }).id));
}

// ── os prazos derivados (Fase 1C-d) ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TipoDePrazo = "formalizacao" | "esclarecimento" | "reembolso";
export interface PrazoAberto {
  quitacaoId: string;
  obrigacaoId: string;
  prazo: TipoDePrazo;
  /** AAAA-MM-DD */
  limite: string;
  diasRestantes: number;
  situacao: "vencido" | "vence_em_7_dias" | "no_prazo";
  valor: number;
  /** quem pagou e o emitente da nota, para a lista dizer do que se trata */
  responsavelNome: string | null;
  emitente: string | null;
}

/**
 * Os prazos da Política que VENCERAM ou VENCEM EM ATÉ 7 DIAS, do mais urgente ao menos. Tudo derivado pelo banco (vw_fin_quitacao_prazos): aqui só se lê. Sem a Fase 1C-d aplicada,
 * devolve vazio e a tela some.
 */
export async function prazosAbertos(): Promise<PrazoAberto[]> {
  if (!(await quitacaoDisponivel())) return [];
  const { data, error } = await supabase.from("vw_fin_quitacao_prazos" as never).select("*").in("situacao" as never, ["vencido", "vence_em_7_dias"] as never).order("limite" as never);
  if (error) return [];
  const linhas = (data ?? []) as unknown as Linha[];
  if (linhas.length === 0) return [];
  const qs = await supabase.from("fin_quitacoes" as never).select("id, responsavel_pessoa_id, responsavel_fornecedor_id, obrigacao_id").in("id" as never, linhas.map(l => String(l.quitacao_id)) as never);
  const nomes = await nomesDosResponsaveis((qs.data ?? []) as unknown as Linha[]);
  const lancs = await supabase.from("fin_lancamentos").select("id, fornecedor_id").in("id", linhas.map(l => String(l.obrigacao_id)));
  const fornIds = [...new Set((lancs.data ?? []).map(l => txt(l.fornecedor_id)).filter((x): x is string => !!x))];
  const emit = new Map<string, string>();
  if (fornIds.length) { const f = await supabase.from("fin_fornecedores").select("id, nome").in("id", fornIds); for (const x of f.data ?? []) emit.set(String(x.id), String(x.nome)); }
  const qPorId = new Map(((qs.data ?? []) as unknown as Linha[]).map(r => [String(r.id), r]));
  const lPorId = new Map((lancs.data ?? []).map(l => [String(l.id), l]));
  return linhas.map(r => {
    const q = qPorId.get(String(r.quitacao_id));
    const nome = q && txt(q.responsavel_pessoa_id) ? nomes.pessoas.get(String(q.responsavel_pessoa_id)) ?? null : q && txt(q.responsavel_fornecedor_id) ? nomes.fornecedores.get(String(q.responsavel_fornecedor_id)) ?? null : null;
    const l = lPorId.get(String(r.obrigacao_id));
    return {
      quitacaoId: String(r.quitacao_id), obrigacaoId: String(r.obrigacao_id), prazo: String(r.prazo) as TipoDePrazo, limite: String(r.limite).slice(0, 10), diasRestantes: Number(r.dias_restantes),
      situacao: String(r.situacao) as PrazoAberto["situacao"], valor: Number(r.valor), responsavelNome: nome, emitente: l && txt(l.fornecedor_id) ? emit.get(String(l.fornecedor_id)) ?? null : null,
    };
  });
}
