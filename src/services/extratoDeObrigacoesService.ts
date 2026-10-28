// ─── extratoDeObrigacoesService — lê as obrigações de um período para o "Extrato de Obrigações" ──────────────────────────────────────────────────────
// Só leitura. A obrigação é a despesa (saída que não é transferência); as linhas do mesmo grupo (pagamento parcial) viram uma só. Os previstos, os pagos, os quitados por terceiros
// e os cancelados entram TODOS: o relatório não depende de ter havido movimentação financeira. As regras estão em `lib/extratoDeObrigacoes.ts`.
import { supabase } from "@/integrations/supabase/client";
import { confirmacoesBancarias, type ConfirmacaoBancaria } from "@/services/confirmacaoBancariaService";
import { hojeLocal } from "@/lib/data";
import {
  montarExtratoDeObrigacoes, type LinhaDeObrigacao, type LinhaDoExtrato, type NomesDoExtrato, type QuitacaoDoExtrato,
} from "@/lib/extratoDeObrigacoes";
import { ROTULO_GRAU, type Grau, type Intencao, type ResponsavelTipo } from "@/lib/quitacao";
import { listarCategoriasTodas, listarCentrosCustoTodas, listarContas, listarProjetosTodos } from "@/services/finService";

export interface FiltrosDoExtrato {
  /** AAAA-MM-DD */
  de: string;
  ate: string;
  fornecedorId?: string;
  categoriaId?: string;
  centroId?: string;
  projetoId?: string;
}

const COLUNAS = "id, obrigacao_id, data, status, valor, valor_original, descricao, documento_numero, fornecedor_id, pessoa_id, categoria_id, centro_custo_id, projeto_id, conta_id, observacoes, forma_pagamento";
const PAGINA = 1000;
const LOTE = 50;

const lotes = <T,>(xs: T[], n: number): T[][] => { const r: T[][] = []; for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n)); return r; };
const normalizar = (r: Record<string, unknown>): LinhaDeObrigacao => ({
  id: String(r.id), obrigacao_id: (r.obrigacao_id as string | null) ?? null, data: String(r.data).slice(0, 10), status: String(r.status),
  valor: Number(r.valor ?? 0), valor_original: r.valor_original === null || r.valor_original === undefined ? null : Number(r.valor_original),
  descricao: (r.descricao as string | null) ?? null, documento_numero: (r.documento_numero as string | null) ?? null,
  fornecedor_id: (r.fornecedor_id as string | null) ?? null, pessoa_id: (r.pessoa_id as string | null) ?? null, categoria_id: (r.categoria_id as string | null) ?? null,
  centro_custo_id: (r.centro_custo_id as string | null) ?? null, projeto_id: (r.projeto_id as string | null) ?? null,
  conta_id: (r.conta_id as string | null) ?? null, observacoes: (r.observacoes as string | null) ?? null,
});

async function linhasDoPeriodo(f: FiltrosDoExtrato): Promise<LinhaDeObrigacao[]> {
  const todas = new Map<string, LinhaDeObrigacao>();
  for (let p = 0; ; p++) {
    let q = supabase.from("fin_lancamentos").select(COLUNAS).eq("tipo", "saida").neq("origem", "transferencia").gte("data", f.de).lte("data", f.ate);
    if (f.fornecedorId) q = q.eq("fornecedor_id", f.fornecedorId);
    if (f.categoriaId) q = q.eq("categoria_id", f.categoriaId);
    if (f.centroId) q = q.eq("centro_custo_id", f.centroId);
    if (f.projetoId) q = q.eq("projeto_id", f.projetoId);
    const { data, error } = await q.order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as unknown as Record<string, unknown>[];
    linhas.forEach(r => { const l = normalizar(r); todas.set(l.id, l); });
    if (linhas.length < PAGINA) break;
  }
  // as irmãs de cada obrigação (o saldo de um pagamento parcial pode ter outra data, ou estar fora do período): sem elas a obrigação sairia incompleta
  const chaves = [...new Set([...todas.values()].map(l => l.obrigacao_id ?? l.id))];
  for (const grupo of lotes(lotes(chaves, LOTE), 6)) {
    const respostas = await Promise.all(grupo.map(ks => {
      const lista = ks.join(",");
      return supabase.from("fin_lancamentos").select(COLUNAS).eq("tipo", "saida").or(`id.in.(${lista}),obrigacao_id.in.(${lista})`);
    }));
    for (const r of respostas) {
      if (r.error) throw new Error(r.error.message);
      ((r.data ?? []) as unknown as Record<string, unknown>[]).forEach(x => { const l = normalizar(x); todas.set(l.id, l); });
    }
  }
  return [...todas.values()];
}

interface QuitacaoBruta {
  obrigacao_id: string; responsavel_tipo: ResponsavelTipo; responsavel_pessoa_id: string | null; responsavel_fornecedor_id: string | null; intencao: Intencao;
  resultado?: string | null; fila?: string | null; saldo_a_reembolsar?: number | null; grau_conjunto?: Grau | null;
}

async function quitacoesDe(chaves: string[]): Promise<QuitacaoBruta[]> {
  const brutas: QuitacaoBruta[] = [];
  for (const grupo of lotes(lotes(chaves, 100), 6)) {
    const respostas = await Promise.all(grupo.map(ks => supabase.from("vw_fin_quitacao" as never)
      .select("obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, resultado, fila, saldo_a_reembolsar, grau_conjunto").in("obrigacao_id" as never, ks as never)));
    // a Política de Quitação pode ainda não estar aplicada no banco: sem a visão, ninguém tem quitação registrada
    for (const r of respostas) if (!r.error) brutas.push(...((r.data ?? []) as unknown as typeof brutas));
  }
  return brutas;
}

/** Quantos documentos cada obrigação tem anexados (todas as parcelas somadas; a chave é o id da raiz). Falha de leitura = 0: o contador é só informação. */
/** Por obrigação (chave = id da raiz): quantos anexos e de quais TIPOS (todas as parcelas) — a situação documental precisa dos tipos. */
async function anexosPorObrigacao(linhas: LinhaDeObrigacao[]): Promise<{ contagem: Map<string, number>; tipos: Map<string, string[]> }> {
  const chaveDaLinha = new Map(linhas.map(l => [l.id, l.obrigacao_id ?? l.id]));
  const contagem = new Map<string, number>();
  const tipos = new Map<string, string[]>();
  for (const grupo of lotes(lotes([...chaveDaLinha.keys()], 100), 6)) {
    const respostas = await Promise.all(grupo.map(ids => supabase.from("fin_lancamento_anexos").select("lancamento_id, tipo").in("lancamento_id", ids)));
    for (const r of respostas) {
      if (r.error) continue;
      for (const x of (r.data ?? []) as { lancamento_id: string; tipo: string }[]) {
        const k = chaveDaLinha.get(x.lancamento_id);
        if (!k) continue;
        contagem.set(k, (contagem.get(k) ?? 0) + 1);
        const t = tipos.get(k) ?? []; if (!t.includes(x.tipo)) t.push(x.tipo); tipos.set(k, t);
      }
    }
  }
  return { contagem, tipos };
}

async function nomesPor(tabela: "fin_fornecedores" | "membros", coluna: "nome" | "nome_completo", ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const grupo of lotes(lotes([...new Set(ids)], 100), 6)) {
    const respostas = await Promise.all(grupo.map(ks => supabase.from(tabela).select(`id, ${coluna}`).in("id", ks)));
    for (const r of respostas) ((r.data ?? []) as unknown as Record<string, string>[]).forEach(x => mapa.set(x.id, x[coluna]));
  }
  return mapa;
}

/** A forma de liquidação das linhas (leitura à parte e opcional: sem a coluna, ninguém é débito automático e o extrato segue igual). Também das JÁ PAGAS: a regra documental muda para pagamento automático. */
async function formasDeLiquidacao(linhas: LinhaDeObrigacao[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const abertas = linhas.map(l => l.id);
  for (const grupo of lotes(lotes(abertas, 100), 6)) {
    const respostas = await Promise.all(grupo.map(ids => supabase.from("fin_lancamentos").select("id, forma_liquidacao" as never).in("id", ids).neq("forma_liquidacao" as never, "manual" as never)));
    for (const r of respostas) {
      if (r.error) return mapa;
      for (const x of (r.data ?? []) as unknown as { id: string; forma_liquidacao: string }[]) mapa.set(x.id, x.forma_liquidacao);
    }
  }
  return mapa;
}

export async function carregarExtratoDeObrigacoes(f: FiltrosDoExtrato): Promise<LinhaDoExtrato[]> {
  const linhas = await linhasDoPeriodo(f);
  const formas = await formasDeLiquidacao(linhas);
  linhas.forEach(l => { const fl = formas.get(l.id); if (fl) l.forma_liquidacao = fl; });
  const chaves = [...new Set(linhas.map(l => l.obrigacao_id ?? l.id))];
  const [brutas, categorias, centros, projetos, contas, anexos] = await Promise.all([
    quitacoesDe(chaves), listarCategoriasTodas(), listarCentrosCustoTodas(), listarProjetosTodos(), listarContas(true).catch(() => []), anexosPorObrigacao(linhas),
  ]);
  const [fornecedores, pessoas] = await Promise.all([
    nomesPor("fin_fornecedores", "nome", [...linhas.map(l => l.fornecedor_id).filter((x): x is string => !!x), ...brutas.map(b => b.responsavel_fornecedor_id).filter((x): x is string => !!x)]),
    nomesPor("membros", "nome_completo", [...linhas.map(l => l.pessoa_id).filter((x): x is string => !!x), ...brutas.map(b => b.responsavel_pessoa_id).filter((x): x is string => !!x)]),
  ]);
  // o nome de quem quitou (pessoa, empresa ou entidade) vem do cadastro: a visão só guarda o id
  const quitacoes = new Map<string, QuitacaoDoExtrato>();
  brutas.forEach(b => quitacoes.set(b.obrigacao_id, {
    responsavel: b.responsavel_tipo, intencao: b.intencao ?? "nao_se_aplica", resultado: b.resultado ?? null, fila: b.fila ?? null,
    saldoAReembolsar: b.saldo_a_reembolsar === null || b.saldo_a_reembolsar === undefined ? null : Number(b.saldo_a_reembolsar),
    grau: b.grau_conjunto ? ROTULO_GRAU[b.grau_conjunto] ?? null : null,
    responsavelNome: (b.responsavel_pessoa_id && pessoas.get(b.responsavel_pessoa_id)) || (b.responsavel_fornecedor_id && fornecedores.get(b.responsavel_fornecedor_id)) || null,
  }));
  const nomes: NomesDoExtrato = {
    fornecedores, pessoas,
    categorias: new Map(categorias.map(c => [c.id, c.nome])), centros: new Map(centros.map(c => [c.id, c.nome])), projetos: new Map(projetos.map(p => [p.id, p.nome])),
    contas: new Map(contas.map(c => [c.id, c.nome] as [string, string])),
    contaTipos: new Map(contas.map(c => [c.id, String(c.tipo)] as [string, string])),
  };
  // pagamento automático: a linha do banco ligada a alguma linha da obrigação substitui o comprovante
  const confirmadas = await confirmacoesBancarias(linhas.map(l => l.id));
  const confirmacoes = new Map<string, ConfirmacaoBancaria>();
  for (const l of linhas) { const c = confirmadas.get(l.id); if (c && confirmacoes.get(l.obrigacao_id ?? l.id) !== "ofx") confirmacoes.set(l.obrigacao_id ?? l.id, c); }
  return montarExtratoDeObrigacoes({ linhas, quitacoes, nomes, hoje: hojeLocal(), anexos: anexos.contagem, tiposDeAnexo: anexos.tipos, confirmacoes });
}
