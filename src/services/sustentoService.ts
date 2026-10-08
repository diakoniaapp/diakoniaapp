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
import type { LinhaDaCompetencia, TipoBeneficiario } from "@/lib/sustento";

export interface Beneficiario {
  id: string;
  tipo: TipoBeneficiario;
  nomeExibicao: string;
  /** "Controle por competência": ligado, a pessoa tem competência, adiantamento e saldo a pagar; desligado, segue só pelas recorrências. */
  controleCompetencia: boolean;
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

export interface BeneficiarioComCompetencias extends Beneficiario {
  competencias: CompetenciaDoSustento[];   // da mais nova para a mais antiga
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
    .select("id, tipo, nome_exibicao, controle_por_competencia, dia_do_liquido, observacoes")
    .eq("ativo" as never, true as never)
    .order("nome_exibicao" as never);
  if (bens.error) {
    return tabelaAusente(bens.error)
      ? { pronto: false, beneficiarios: [], motivo: "migration_pendente", mensagem: "A conta corrente de sustento ainda não foi criada no banco." }
      : { pronto: false, beneficiarios: [], motivo: "erro", mensagem: bens.error.message };
  }

  const [comps, itens, pags] = await Promise.all([
    supabase.from("vw_sustento_conta_corrente" as never).select("*").order("competencia" as never, { ascending: false }),
    supabase.from("sustento_itens" as never).select("id, competencia_id, rubrica, codigo, descricao, natureza, valor, ordem").order("ordem" as never),
    supabase.from("sustento_pagamentos" as never).select("id, competencia_id, lancamento_id, tipo"),
  ]);
  const falha = comps.error ?? itens.error ?? pags.error;
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
    id: b.id, tipo: b.tipo as TipoBeneficiario, nomeExibicao: b.nome_exibicao,
    controleCompetencia: !!b.controle_por_competencia,
    diaDoLiquido: b.dia_do_liquido ?? null, observacoes: b.observacoes ?? null,
    competencias: [],
  }));
  const porId = new Map(beneficiarios.map((b) => [b.id, b]));

  for (const r of (comps.data ?? []) as unknown as Linha[]) {
    const b = porId.get(r.beneficiario_id);
    if (!b) continue;   // beneficiário inativo: a competência some junto
    const pagamentos = (pagamentosPor.get(r.competencia_id) ?? []).sort((x, y) => (x.data ?? "").localeCompare(y.data ?? ""));
    b.competencias.push({
      id: r.competencia_id, beneficiarioId: r.beneficiario_id, competencia: r.competencia, status: r.status,
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
