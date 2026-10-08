// ─── sustentoService.ts — Conta Corrente de Sustento (Fase 1: leitura + a chave do controle) ────────────────────────────────────────
//
// Lê as tabelas criadas por 20261008170000_sustento_conta_corrente.sql e entrega a tela já agrupada por beneficiário.
// Só escreve a chave "Controle por competência" do beneficiário (`definirControlePorCompetencia`) e não toca em `fin_lancamentos` (Fase 1 aprovada em 08/10/2026: "sem alterar lançamentos existentes, sem
// migração destrutiva, sem recálculo de histórico").
//
// A migration pode ainda não ter sido aplicada quando a tela abrir (o deploy do app e o SQL Editor andam separados): neste caso
// o PostgREST devolve 42P01 / PGRST205 e o serviço responde `pronto: false` — a tela explica, em vez de mostrar um erro cru.
// As tabelas novas não estão em `integrations/supabase/types.ts` (gerado); por isso o `as never` das consultas, como em
// `importacaoOfxService.ts` com `fin_extrato_ignorados`.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { hojeLocal, daquiADias } from "@/lib/data";
import { statusPeloSaldo } from "@/lib/sustento";
import type { LinhaDaCompetencia, ModoSustento, NaturezaDaRubrica, RubricaDoRsp, TipoBeneficiario, TipoControle, TipoDoPagamento } from "@/lib/sustento";

export interface Beneficiario {
  id: string;
  tipo: TipoBeneficiario;
  nomeExibicao: string;
  /** Quem é, no cadastro: serve para achar os pagamentos dele em fin_lancamentos. */
  pessoaId: string | null;
  fornecedorId: string | null;
  /** "Controle por competência": ligado, a pessoa tem competência, adiantamento e saldo a pagar; desligado, segue só pelas recorrências. */
  controleCompetencia: boolean;
  /** Como administrar: automático (sugere pelo histórico), simples ou avançado. Vale só para as PRÓXIMAS competências. */
  tipoControle: TipoControle;
  diaDoLiquido: number | null;
  observacoes: string | null;
}

export interface Rubrica {
  id: string;
  rubrica: string;
  codigo: string | null;
  descricao: string;
  natureza: "provento" | "desconto";
  valor: number;
  ordem: number;
}

export interface PagamentoDaCompetencia {
  id: string;
  lancamentoId: string;
  tipo: "adiantamento" | "pagamento_final" | "complemento" | "pagamento";
  data: string | null;
  valor: number;
  descricao: string | null;
  status: string | null;
}

export interface CompetenciaDoSustento extends LinhaDaCompetencia {
  id: string;
  beneficiarioId: string;
  valorPrevisto: number | null;
  confirmadaEm: string | null;
  fechadaEm: string | null;
  rspUrl: string | null;
  obrigacaoId: string | null;
  // as rubricas do RSP (avançado)
  sustento: number;
  outrosProventos: number;
  proventos: number;
  irrf: number;
  outrosDescontos: number;
  descontos: number;
  rubricas: Rubrica[];
  pagamentos: PagamentoDaCompetencia[];
}

/** Uma mudança do controle ou do tipo de controle — quem e quando (gravada pelo gatilho do banco, não pelo app). */
export interface AlteracaoDeControle {
  id: string;
  controleAnterior: boolean | null;
  controleNovo: boolean;
  tipoControleAnterior: TipoControle | null;
  tipoControleNovo: TipoControle;
  alteradoPorNome: string | null;
  alteradoEm: string;
}

export interface BeneficiarioComCompetencias extends Beneficiario {
  competencias: CompetenciaDoSustento[];   // da mais nova para a mais antiga
  alteracoes: AlteracaoDeControle[];       // da mais nova para a mais antiga
}

// Interface plana, e não união discriminada por `pronto`: o projeto roda sem strictNullChecks, e nesse modo o TypeScript não
// estreita a união por um discriminante booleano — a tela não conseguiria ler `motivo`/`mensagem` depois de testar `pronto`.
export interface ResultadoDoSustento {
  pronto: boolean;
  beneficiarios: BeneficiarioComCompetencias[];
  /** só quando `pronto` é falso */
  motivo?: "migration_pendente" | "erro";
  mensagem?: string;
}

/** Tabela ainda não criada (migration não aplicada): PostgREST devolve 42P01 / PGRST205. */
function tabelaAusente(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the (table|relation)|does not exist/i.test(e.message ?? ""));
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function carregarSustento(): Promise<ResultadoDoSustento> {
  const bens = await supabase
    .from("sustento_beneficiarios" as never)
    .select("id, tipo, nome_exibicao, pessoa_id, fornecedor_id, controle_por_competencia, tipo_controle, dia_do_liquido, observacoes")
    .eq("ativo" as never, true as never)
    .order("nome_exibicao" as never);
  if (bens.error) {
    return tabelaAusente(bens.error)
      ? { pronto: false, beneficiarios: [], motivo: "migration_pendente", mensagem: "A conta corrente de sustento ainda não foi criada no banco." }
      : { pronto: false, beneficiarios: [], motivo: "erro", mensagem: bens.error.message };
  }

  const [comps, itens, pags, hist] = await Promise.all([
    supabase.from("vw_sustento_conta_corrente" as never).select("*").order("competencia" as never, { ascending: false }),
    supabase.from("sustento_itens" as never).select("id, competencia_id, rubrica, codigo, descricao, natureza, valor, ordem").order("ordem" as never),
    supabase.from("sustento_pagamentos" as never).select("id, competencia_id, lancamento_id, tipo"),
    supabase.from("sustento_controle_historico" as never)
      .select("id, beneficiario_id, controle_anterior, controle_novo, tipo_controle_anterior, tipo_controle_novo, alterado_por_nome, alterado_em")
      .order("alterado_em" as never, { ascending: false }),
  ]);
  const falha = comps.error ?? itens.error ?? pags.error ?? hist.error;
  if (falha) return { pronto: false, beneficiarios: [], motivo: "erro", mensagem: falha.message };

  // os lançamentos dos pagamentos, em uma consulta só (sem embed: as tabelas novas não estão nos tipos gerados)
  const pagRows = (pags.data ?? []) as unknown as Array<{ id: string; competencia_id: string; lancamento_id: string; tipo: PagamentoDaCompetencia["tipo"] }>;
  const lancs = new Map<string, { data: string; valor: number; descricao: string | null; status: string }>();
  const ids = [...new Set(pagRows.map((p) => p.lancamento_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await supabase.from("fin_lancamentos").select("id, data, valor, descricao, status").in("id", ids.slice(i, i + 200));
    if (r.error) return { pronto: false, beneficiarios: [], motivo: "erro", mensagem: r.error.message };
    for (const l of r.data ?? []) lancs.set(l.id, { data: l.data, valor: Number(l.valor), descricao: l.descricao, status: l.status });
  }

  const rubricasPor = new Map<string, Rubrica[]>();
  for (const r of (itens.data ?? []) as unknown as Array<Rubrica & { competencia_id: string }>) {
    const lista = rubricasPor.get(r.competencia_id) ?? [];
    lista.push({ id: r.id, rubrica: r.rubrica, codigo: r.codigo, descricao: r.descricao, natureza: r.natureza, valor: num(r.valor), ordem: r.ordem });
    rubricasPor.set(r.competencia_id, lista);
  }
  const pagamentosPor = new Map<string, PagamentoDaCompetencia[]>();
  for (const p of pagRows) {
    const l = lancs.get(p.lancamento_id);
    const lista = pagamentosPor.get(p.competencia_id) ?? [];
    lista.push({ id: p.id, lancamentoId: p.lancamento_id, tipo: p.tipo, data: l?.data ?? null, valor: l?.valor ?? 0, descricao: l?.descricao ?? null, status: l?.status ?? null });
    pagamentosPor.set(p.competencia_id, lista);
  }

  type Linha = Record<string, any>;
  const beneficiarios: BeneficiarioComCompetencias[] = ((bens.data ?? []) as unknown as Linha[]).map((b) => ({
    id: b.id, tipo: b.tipo as TipoBeneficiario, nomeExibicao: b.nome_exibicao, pessoaId: b.pessoa_id ?? null, fornecedorId: b.fornecedor_id ?? null,
    controleCompetencia: !!b.controle_por_competencia,
    tipoControle: (b.tipo_controle ?? "automatico") as TipoControle,
    diaDoLiquido: b.dia_do_liquido ?? null, observacoes: b.observacoes ?? null,
    competencias: [], alteracoes: [],
  }));
  const porId = new Map(beneficiarios.map((b) => [b.id, b]));

  for (const h of (hist.data ?? []) as unknown as Linha[]) {
    porId.get(h.beneficiario_id)?.alteracoes.push({
      id: h.id, controleAnterior: h.controle_anterior ?? null, controleNovo: !!h.controle_novo,
      tipoControleAnterior: (h.tipo_controle_anterior ?? null) as TipoControle | null, tipoControleNovo: h.tipo_controle_novo as TipoControle,
      alteradoPorNome: h.alterado_por_nome ?? null, alteradoEm: h.alterado_em,
    });
  }

  for (const r of (comps.data ?? []) as unknown as Linha[]) {
    const b = porId.get(r.beneficiario_id);
    if (!b) continue;   // beneficiário inativo: a competência some junto
    const pagamentos = (pagamentosPor.get(r.competencia_id) ?? []).sort((x, y) => (x.data ?? "").localeCompare(y.data ?? ""));
    b.competencias.push({
      id: r.competencia_id, beneficiarioId: r.beneficiario_id, competencia: r.competencia, status: r.status,
      // o modo com que a competência NASCEU: trocar o tipo de controle do beneficiário não a reinterpreta
      modo: r.modo as ModoSustento,
      liquidoPrevisto: num(r.liquido_previsto), saldoAPagar: num(r.saldo_a_pagar),
      adiantamentos: num(r.adiantamentos), pagamentosFinais: num(r.pagamentos_finais), complementos: num(r.complementos),
      pagamentosSimples: num(r.pagamentos_simples), nItens: num(r.n_itens),
      valorPrevisto: r.valor_previsto == null ? null : num(r.valor_previsto), confirmadaEm: r.confirmada_em ?? null,
      fechadaEm: r.fechada_em ?? null, rspUrl: r.rsp_url ?? null, obrigacaoId: r.obrigacao_id ?? null,
      sustento: num(r.sustento), outrosProventos: num(r.outros_proventos), proventos: num(r.proventos),
      irrf: num(r.irrf), outrosDescontos: num(r.outros_descontos), descontos: num(r.descontos),
      rubricas: rubricasPor.get(r.competencia_id) ?? [], pagamentos,
    });
  }
  return { pronto: true, beneficiarios };
}

/**
 * Liga ou desliga o "Controle por competência" de um beneficiário. É a ÚNICA escrita da Fase 1 e só mexe numa coluna do cadastro
 * do beneficiário: não cria lançamento, não move saldo, não apaga competência (desligar guarda o histórico).
 * Escrita conferida: a RLS barra em silêncio quem não é administração/tesouraria.
 */
export async function definirControlePorCompetencia(beneficiarioId: string, ligado: boolean): Promise<{ ok: boolean; erro?: string }> {
  const r = conferir(
    await supabase.from("sustento_beneficiarios" as never).update({ controle_por_competencia: ligado } as never).eq("id" as never, beneficiarioId as never).select("id"),
    "O controle por competência",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/**
 * Escolhe o tipo de controle (automático, simples ou avançado). Vale só para as PRÓXIMAS competências: nenhuma competência
 * existente é tocada (cada uma guarda o modo com que nasceu) e o gatilho do banco registra quem mudou e quando.
 */
export async function definirTipoDeControle(beneficiarioId: string, tipoControle: TipoControle): Promise<{ ok: boolean; erro?: string }> {
  const r = conferir(
    await supabase.from("sustento_beneficiarios" as never).update({ tipo_controle: tipoControle } as never).eq("id" as never, beneficiarioId as never).select("id"),
    "O tipo de controle",
  );
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

// ── Fase 2: classificar pagamentos ─────────────────────────────────────────────────────────────────────────────
// Tudo aqui só mexe nas tabelas sustento_*. `fin_lancamentos` é lido, nunca escrito: o dinheiro continua sendo a verdade do lançamento,
// e ligar/desligar um pagamento de uma competência não altera saldo, status nem conciliação de nada.

/** Um pagamento real que ainda não pertence a nenhuma competência. */
export interface PagamentoSolto {
  id: string;
  data: string;
  valor: number;
  descricao: string | null;
  status: string;
  origem: string | null;
  /** Veio do cadastro do beneficiário (pessoa/favorecido) — ou de uma busca manual. */
  doBeneficiario: boolean;
}

const SEIS_MESES = 183;

/** Ids dos lançamentos que já estão ligados a alguma competência (de qualquer beneficiário): um lançamento pertence a UMA só. */
async function lancamentosJaLigados(): Promise<Set<string>> {
  const r = await supabase.from("sustento_pagamentos" as never).select("lancamento_id");
  return new Set(((r.data ?? []) as unknown as Array<{ lancamento_id: string }>).map((x) => x.lancamento_id));
}

type LinhaLancamento = { id: string; data: string; valor: number | string; descricao: string | null; status: string; origem: string | null };

function paraSolto(l: LinhaLancamento, doBeneficiario: boolean): PagamentoSolto {
  return { id: l.id, data: l.data, valor: Number(l.valor), descricao: l.descricao, status: l.status, origem: l.origem, doBeneficiario };
}

/**
 * Os pagamentos do beneficiário (pelo cadastro: pessoa ou favorecido) dos últimos 6 meses que ainda não estão em competência nenhuma.
 * Só saída REAL (realizado ou conciliado): previsto é obrigação, não dinheiro que saiu.
 */
export async function pagamentosSoltosDoBeneficiario(b: { pessoaId: string | null; fornecedorId: string | null }): Promise<PagamentoSolto[]> {
  const filtros = [b.pessoaId ? `pessoa_id.eq.${b.pessoaId}` : null, b.fornecedorId ? `fornecedor_id.eq.${b.fornecedorId}` : null].filter(Boolean);
  if (filtros.length === 0) return [];
  const [r, ligados] = await Promise.all([
    supabase.from("fin_lancamentos").select("id, data, valor, descricao, status, origem").eq("tipo", "saida")
      .in("status", ["realizado", "conciliado"]).gte("data", daquiADias(hojeLocal(), -SEIS_MESES)).or(filtros.join(","))
      .order("data", { ascending: false }).limit(200),
    lancamentosJaLigados(),
  ]);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).filter((l) => !ligados.has(l.id)).map((l) => paraSolto(l as LinhaLancamento, true));
}

/**
 * Busca manual — para o PIX que a Mesa não soube atribuir à pessoa (os de agosto e setembro do Pastor Titular chegaram sem favorecido):
 * por trecho da descrição/observação ou por valor exato. Mesmo filtro: saída real, últimos 12 meses, ainda sem competência.
 */
export async function buscarPagamentosSoltos(termo: string): Promise<PagamentoSolto[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const ehValor = /^[0-9.,]+$/.test(t);
  const numero = Number(t.replace(/\./g, "").replace(",", "."));
  const limpo = t.replace(/[,()%*]/g, " ").trim();   // vírgula e parênteses quebrariam o filtro .or() do PostgREST
  let q = supabase.from("fin_lancamentos").select("id, data, valor, descricao, status, origem").eq("tipo", "saida")
    .in("status", ["realizado", "conciliado"]).gte("data", daquiADias(hojeLocal(), -365));
  q = ehValor && Number.isFinite(numero) && numero > 0
    ? q.eq("valor", numero)
    : q.or(`descricao.ilike.%${limpo}%,observacoes.ilike.%${limpo}%`);
  const [r, ligados] = await Promise.all([q.order("data", { ascending: false }).limit(40), lancamentosJaLigados()]);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).filter((l) => !ligados.has(l.id)).map((l) => paraSolto(l as LinhaLancamento, false));
}

/** Liga um pagamento a uma competência. A chave única do banco impede ligar o mesmo lançamento duas vezes. */
export async function ligarPagamento(p: { competenciaId: string; lancamentoId: string; tipo: TipoDoPagamento }): Promise<{ ok: boolean; erro?: string }> {
  const r = await supabase.from("sustento_pagamentos" as never)
    .insert({ competencia_id: p.competenciaId, lancamento_id: p.lancamentoId, tipo: p.tipo } as never).select("id");
  if (r.error) {
    return { ok: false, erro: /duplicate key|unique/i.test(r.error.message) ? "Este pagamento já está ligado a uma competência." : r.error.message };
  }
  const c = conferir(r as { data: unknown[] | null; error: { message: string } | null }, "A ligação do pagamento");
  if (!c.ok) return { ok: false, erro: c.erro };
  await ajustarStatusPeloSaldo(p.competenciaId);
  return { ok: true };
}

/** Desliga: o pagamento volta a ficar solto (o lançamento real não é tocado). */
export async function desligarPagamento(pagamentoId: string): Promise<{ ok: boolean; erro?: string }> {
  const antes = await supabase.from("sustento_pagamentos" as never).select("competencia_id").eq("id" as never, pagamentoId as never);
  const competenciaId = (antes.data as unknown as Array<{ competencia_id: string }> | null)?.[0]?.competencia_id;
  const c = conferir(
    await supabase.from("sustento_pagamentos" as never).delete().eq("id" as never, pagamentoId as never).select("id"),
    "A desligação do pagamento",
  );
  if (!c.ok) return { ok: false, erro: c.erro };
  if (competenciaId) await ajustarStatusPeloSaldo(competenciaId);
  return { ok: true };
}

/**
 * Abre a competência de um mês para o beneficiário — "aberta", sem valor: ela passa a existir para receber adiantamentos (ou o
 * valor previsto, que é a etapa seguinte). O modo é o que valia AGORA (resolvido pelo tipo de controle) e fica gravado nela.
 */
export async function abrirCompetencia(p: { beneficiarioId: string; competencia: string; modo: ModoSustento }): Promise<{ ok: boolean; erro?: string; id?: string }> {
  const r = await supabase.from("sustento_competencias" as never)
    .insert({ beneficiario_id: p.beneficiarioId, competencia: p.competencia, modo: p.modo, status: "aberta" } as never).select("id");
  if (r.error) {
    return { ok: false, erro: /duplicate key|unique/i.test(r.error.message) ? "Esta competência já existe." : r.error.message };
  }
  const c = conferir(r as { data: unknown[] | null; error: { message: string } | null }, "A abertura da competência");
  return c.ok ? { ok: true, id: (r.data as Array<{ id: string }>)[0].id } : { ok: false, erro: c.erro };
}

// ── Fase 2, parte 2: criar e fechar a competência ──────────────────────────────────────────────────────────────
// Só tabelas sustento_*. Nenhuma destas funções toca em fin_lancamentos, e nenhuma cria obrigação (isso é a parte 3).
type Res = { ok: boolean; erro?: string };

/**
 * Depois de qualquer mudança, alinha o status ao saldo da visão: fechada com o líquido todo pago vira "paga"; "paga" que voltou a ter
 * saldo volta a "fechada" (ver statusPeloSaldo). Lê a linha da visão e só escreve se o status mudar.
 */
export async function ajustarStatusPeloSaldo(competenciaId: string): Promise<void> {
  const r = await supabase.from("vw_sustento_conta_corrente" as never).select("status, liquido_previsto, saldo_a_pagar").eq("competencia_id" as never, competenciaId as never);
  const v = (r.data ?? [])[0] as unknown as { status: "aberta" | "fechada" | "paga"; liquido_previsto: number; saldo_a_pagar: number } | undefined;
  if (!v) return;
  const novo = statusPeloSaldo({ status: v.status, liquidoPrevisto: Number(v.liquido_previsto), saldoAPagar: Number(v.saldo_a_pagar) });
  if (novo === v.status) return;
  await supabase.from("sustento_competencias" as never).update({ status: novo } as never).eq("id" as never, competenciaId as never).select("id");
}

/** Modo simples: grava o valor previsto do mês. Na primeira vez também registra a confirmação. */
export async function salvarValorPrevisto(competenciaId: string, valor: number): Promise<Res> {
  const agora = new Date().toISOString();
  const lido = await supabase.from("sustento_competencias" as never).select("confirmada_em").eq("id" as never, competenciaId as never);
  const jaConfirmada = !!(lido.data as unknown as Array<{ confirmada_em: string | null }> | null)?.[0]?.confirmada_em;
  const c = conferir(
    await supabase.from("sustento_competencias" as never).update({ valor_previsto: valor, ...(jaConfirmada ? {} : { confirmada_em: agora }) } as never).eq("id" as never, competenciaId as never).select("id"),
    "O valor previsto",
  );
  if (!c.ok) return { ok: false, erro: c.erro };
  await ajustarStatusPeloSaldo(competenciaId);
  return { ok: true };
}

/** Modo avançado: acrescenta uma linha do RSP (o valor é sempre positivo; quem diz se soma ou desconta é a natureza). */
export async function adicionarRubrica(p: { competenciaId: string; rubrica: RubricaDoRsp; natureza: NaturezaDaRubrica; descricao: string; valor: number; codigo?: string }): Promise<Res> {
  const ordem = await supabase.from("sustento_itens" as never).select("ordem").eq("competencia_id" as never, p.competenciaId as never).order("ordem" as never, { ascending: false }).limit(1);
  const proxima = (((ordem.data ?? []) as unknown as Array<{ ordem: number }>)[0]?.ordem ?? 0) + 1;
  const c = conferir(
    await supabase.from("sustento_itens" as never)
      .insert({ competencia_id: p.competenciaId, rubrica: p.rubrica, natureza: p.natureza, descricao: p.descricao, valor: p.valor, codigo: p.codigo ?? null, ordem: proxima } as never).select("id"),
    "A rubrica",
  );
  if (!c.ok) return { ok: false, erro: c.erro };
  await ajustarStatusPeloSaldo(p.competenciaId);
  return { ok: true };
}

export async function removerRubrica(competenciaId: string, itemId: string): Promise<Res> {
  const c = conferir(await supabase.from("sustento_itens" as never).delete().eq("id" as never, itemId as never).select("id"), "A remoção da rubrica");
  if (!c.ok) return { ok: false, erro: c.erro };
  await ajustarStatusPeloSaldo(competenciaId);
  return { ok: true };
}

/** Fecha a competência (RSP ou valor conferido): daqui em diante o saldo a pagar disputa o pagamento. A obrigação prevista é a parte 3. */
export async function fecharCompetencia(competenciaId: string): Promise<Res> {
  const c = conferir(
    await supabase.from("sustento_competencias" as never).update({ status: "fechada", fechada_em: new Date().toISOString() } as never)
      .eq("id" as never, competenciaId as never).eq("status" as never, "aberta" as never).select("id"),
    "O fechamento da competência",
  );
  if (!c.ok) return { ok: false, erro: c.erro };
  await ajustarStatusPeloSaldo(competenciaId);
  return { ok: true };
}

/** Reabre uma competência fechada para corrigir a apuração. Não apaga nada: os pagamentos ligados continuam ligados. */
export async function reabrirCompetencia(competenciaId: string): Promise<Res> {
  const c = conferir(
    await supabase.from("sustento_competencias" as never).update({ status: "aberta", fechada_em: null } as never)
      .eq("id" as never, competenciaId as never).in("status" as never, ["fechada", "paga"] as never).select("id"),
    "A reabertura da competência",
  );
  return c.ok ? { ok: true } : { ok: false, erro: c.erro };
}
