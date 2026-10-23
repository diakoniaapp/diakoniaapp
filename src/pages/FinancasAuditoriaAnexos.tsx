// ─── FinancasAuditoriaAnexos.tsx — a Prontidão do malote, em tela cheia e com filtros ─────────────────────────────────────────────────────────────────
//
// Pedido dela (20/10/2026): a tela deixou de responder "existe algum documento?" e passou a responder "esta despesa está pronta para a contabilidade?". Fase B (Fechamento como casa do mês): a
// MESMA Prontidão é a etapa 3 do Fechamento do mês (`prontidao/PainelDeProntidao` + `prontidao/FilaDePendencias`); esta página é o atalho para olhá-la em tela cheia, de qualquer período, com os
// filtros (conta, centro, favorecido, o que falta). Uma cópia só de cada coisa: o checklist dos documentos do mês e o ZIP moram no Fechamento (etapas 4 e 5) — daqui há só o link.
//
// A régua é UMA só, a mesma da Pronta para Malote, do Fechamento e do Ciclo da despesa: `lib/documentacaoExigida.ts`. Entram as saídas pagas, as compras ofertadas por terceiros e os avisos de
// reembolso. A tela só INFORMA: o envio nunca é bloqueado (decisão de 02/10, mantida em 20/10).
//
// Só o período vai ao banco; os filtros agem em memória, então trocar de filtro é instantâneo e as opções só mostram o que existe no período.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ClipboardCheck, FileStack, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorPeriodo, resolverPeriodo, type PeriodoPreset } from "@/components/financas/SeletorPeriodo";
import { PaginaSkeleton } from "@/components/ListState";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";
import { useAuth } from "@/hooks/useAuth";
import { hojeLocal, toYmd } from "@/lib/data";
import { resumirProntidao } from "@/lib/documentacaoExigida";
import { type LinhaAuditoria } from "@/lib/pacoteContabil";
import { PainelDeProntidao } from "@/components/financas/prontidao/PainelDeProntidao";
import { FilaDePendencias } from "@/components/financas/prontidao/FilaDePendencias";
import { auditarPeriodo } from "@/services/pacoteContabilService";

const TODOS = "__todos__";
const mesDoParametro = (v: string | null): { ini: string; fim: string } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const ano = Number(m[1]), mes = Number(m[2]);
  return { ini: `${ano}-${String(mes).padStart(2, "0")}-01`, fim: toYmd(new Date(ano, mes, 0)) };
};

export default function FinancasAuditoriaAnexos() {
  const { hasRole } = useAuth();
  const podeOperar = hasRole(ROLES_FINANCEIRO);
  const [params] = useSearchParams();
  const doLink = useMemo(() => mesDoParametro(params.get("mes")), [params]);

  // O caso de uso é o FECHAMENTO — olhar o mês que acabou. Por isso o padrão é "Mês anterior", não o atual; o link do Fechamento Mensal (`?mes=AAAA-MM`) abre o mês em fechamento.
  const [preset, setPreset] = useState<PeriodoPreset>(doLink ? "personalizado" : "mes_anterior");
  const [dIni, setDIni] = useState(doLink?.ini ?? hojeLocal());
  const [dFim, setDFim] = useState(doLink?.fim ?? hojeLocal());
  const periodo = useMemo(() => resolverPeriodo(preset, dIni, dFim), [preset, dIni, dFim]);
  // "Atrasados" não tem data inicial (filtra status previsto, sem piso) e aqui só se audita o que JÁ faz parte do malote.
  const periodoValido = !!periodo.dataInicio && !periodo.status && periodo.dataInicio <= periodo.dataFim;

  const [linhas, setLinhas] = useState<LinhaAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [conta, setConta] = useState(TODOS);
  const [centro, setCentro] = useState(TODOS);
  const [fornecedor, setFornecedor] = useState(TODOS);
  const [faltante, setFaltante] = useState(TODOS);

  const carregar = useCallback(async () => {
    if (!periodoValido) { setLinhas([]); setCarregando(false); return; }
    setCarregando(true);
    setErro(null);
    try { setLinhas(await auditarPeriodo(periodo.dataInicio, periodo.dataFim)); }
    catch (e: any) { setErro(e?.message ?? "Erro ao conferir os documentos"); toast.error(e?.message ?? "Erro ao conferir os documentos"); }
    finally { setCarregando(false); }
  }, [periodo.dataInicio, periodo.dataFim, periodoValido]);

  useEffect(() => { carregar(); }, [carregar]);
  // Mudou o período: os filtros antigos podem apontar pra algo que não existe mais.
  useEffect(() => { setConta(TODOS); setCentro(TODOS); setFornecedor(TODOS); setFaltante(TODOS); }, [periodo.dataInicio, periodo.dataFim]);

  const nomeDoFornecedor = (l: LinhaAuditoria["lancamento"]) => l.fornecedor_nome || l.pessoa_nome || "";
  const passa = (x: LinhaAuditoria, c: string, ce: string, f: string, fa: string) =>
    (c === TODOS || x.lancamento.conta_id === c)
    && (ce === TODOS || x.lancamento.centro_custo_id === ce)
    && (f === TODOS || nomeDoFornecedor(x.lancamento) === f)
    && (fa === TODOS || x.documentacao.faltam.includes(fa) || x.documentacao.administrativas.includes(fa));

  // Opções dos filtros = só o que existe no período E combina com os OUTROS filtros (com 67 fornecedores no mês, a lista inteira seria ruído).
  const opcoes = useMemo(() => {
    const contas = new Map<string, string>();
    const centros = new Map<string, string>();
    const fornecedores = new Set<string>();
    const faltantes = new Set<string>();
    for (const x of linhas) {
      const l = x.lancamento;
      if (l.conta_id && passa(x, TODOS, centro, fornecedor, faltante)) contas.set(l.conta_id, l.conta_nome ?? "—");
      if (l.centro_custo_id && passa(x, conta, TODOS, fornecedor, faltante)) centros.set(l.centro_custo_id, l.centro_nome ?? "—");
      const f = nomeDoFornecedor(l);
      if (f && passa(x, conta, centro, TODOS, faltante)) fornecedores.add(f);
      if (passa(x, conta, centro, fornecedor, TODOS)) [...x.documentacao.faltam, ...x.documentacao.administrativas].forEach(t => faltantes.add(t));
    }
    const porNome = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], "pt-BR");
    return {
      contas: [...contas.entries()].sort(porNome),
      centros: [...centros.entries()].sort(porNome),
      fornecedores: [...fornecedores].sort((a, b) => a.localeCompare(b, "pt-BR")),
      faltantes: [...faltantes].sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, conta, centro, fornecedor, faltante]);

  // Um filtro escolhido que deixou de existir nas opções volta a "Todos" — senão a lista sumiria sem explicação.
  useEffect(() => {
    if (conta !== TODOS && !opcoes.contas.some(([id]) => id === conta)) setConta(TODOS);
    if (centro !== TODOS && !opcoes.centros.some(([id]) => id === centro)) setCentro(TODOS);
    if (fornecedor !== TODOS && !opcoes.fornecedores.includes(fornecedor)) setFornecedor(TODOS);
    if (faltante !== TODOS && !opcoes.faltantes.includes(faltante)) setFaltante(TODOS);
  }, [opcoes, conta, centro, fornecedor, faltante]);

  const filtradas = useMemo(() => linhas.filter(x => passa(x, conta, centro, fornecedor, faltante)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, conta, centro, fornecedor, faltante]);
  const filtrando = conta !== TODOS || centro !== TODOS || fornecedor !== TODOS || faltante !== TODOS;
  const resumo = useMemo(() => resumirProntidao(filtradas.map(x => x.documentacao)), [filtradas]);
  // O Fechamento é MENSAL: o link só aparece quando o período é exatamente um mês cheio.
  const mesInteiro = useMemo(() => {
    if (!periodoValido) return null;
    const [a, m] = periodo.dataInicio.split("-").map(Number);
    return periodo.dataInicio === `${a}-${String(m).padStart(2, "0")}-01` && periodo.dataFim === toYmd(new Date(a, m, 0)) ? { ano: a, mes: m } : null;
  }, [periodo.dataInicio, periodo.dataFim, periodoValido]);

  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <header className="flex items-start gap-3 flex-wrap">
        {/* No celular o título ganha a linha inteira, abaixo dos botões — numa coluna entre eles ficava com ~110px e quebrava palavra por palavra. */}
        <div className="min-w-0 basis-full order-last md:order-none md:basis-0 md:flex-1">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-gold shrink-0" /> Auditoria de documentos
          </h1>
          <p className="text-sm text-muted-foreground">Esta despesa está pronta para a contabilidade? É a etapa "Prontidão" do Fechamento do mês, em tela cheia e com filtros.</p>
        </div>
        {podeOperar && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 ml-auto md:ml-0 text-xs">
            <Link to="/financas/documentos" data-importar-em-lote><FileStack className="w-3.5 h-3.5" /> Importar documentos em lote</Link>
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto md:ml-0" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {mesInteiro ? (
          <Button asChild variant="gold" size="sm" className="gap-1.5">
            <Link to={`/painel-tesouraria?mes=${mesInteiro.ano}-${String(mesInteiro.mes).padStart(2, "0")}#fechamento`}>Abrir o Fechamento do mês <ArrowRight className="w-3.5 h-3.5" /></Link>
          </Button>
        ) : (
          <Button variant="gold" size="sm" className="gap-1.5" disabled title="O Fechamento é mensal — escolha um mês inteiro (ex.: Mês anterior)">Abrir o Fechamento do mês <ArrowRight className="w-3.5 h-3.5" /></Button>
        )}
      </header>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <SeletorPeriodo preset={preset} onPresetChange={setPreset} dataInicio={dIni} dataFim={dFim} onDataInicioChange={setDIni} onDataFimChange={setDFim} />
          <FiltroSelect rotulo="Conta financeira" valor={conta} onChange={setConta} opcoes={opcoes.contas.map(([id, nome]) => ({ id, nome }))} />
          <FiltroSelect rotulo="Centro de custo" valor={centro} onChange={setCentro} opcoes={opcoes.centros.map(([id, nome]) => ({ id, nome }))} />
          <FiltroSelect rotulo="Favorecido" valor={fornecedor} onChange={setFornecedor} opcoes={opcoes.fornecedores.map(nome => ({ id: nome, nome }))} />
          <FiltroSelect rotulo="O que falta" valor={faltante} onChange={setFaltante} opcoes={opcoes.faltantes.map(nome => ({ id: nome, nome }))} />
          {filtrando && (
            <Button variant="ghost" size="sm" onClick={() => { setConta(TODOS); setCentro(TODOS); setFornecedor(TODOS); setFaltante(TODOS); }}>Limpar filtros</Button>
          )}
        </CardContent>
      </Card>

      {!periodoValido && <p className="text-sm text-muted-foreground">Escolha um período com data de início e fim. A auditoria olha o que faz parte do malote: pagamentos, compras ofertadas e reembolsos.</p>}
      {carregando && periodoValido && linhas.length === 0 && <PaginaSkeleton />}
      {erro && <p className="text-sm text-destructive-text">{erro}</p>}

      {periodoValido && (!carregando || linhas.length > 0) && !erro && (
        <>
          {/* 1. Prontidão do malote — a mesma peça da etapa "Prontidão" do Fechamento */}
          <PainelDeProntidao resumo={resumo} filtrando={filtrando} />

          {/* 2. Existentes × necessários (o checklist dos documentos do mês mora no Fechamento, etapa 4: uma cópia só) */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <Card data-bloco="existentes">
              <CardContent className="p-4 space-y-2">
                <div>
                  <h2 className="text-sm font-medium">Existentes × necessários</h2>
                  <p className="text-xs text-muted-foreground">Por documento que a regra exige. Uma obrigação que precisa de NF e comprovante entra nas duas linhas.</p>
                </div>
                {resumo.porDocumento.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento exigido neste recorte.</p> : (
                  <ul className="space-y-1.5">
                    {resumo.porDocumento.map(d => {
                      const p = d.necessarios > 0 ? (d.existentes / d.necessarios) * 100 : 0;
                      return (
                        <li key={d.rotulo} className="flex items-center gap-3 text-sm" data-documento={d.rotulo}>
                          <span className="min-w-0 flex-1 truncate sm:w-44 sm:flex-none" title={d.rotulo}>{d.rotulo}</span>
                          <span className="hidden h-2 flex-1 overflow-hidden rounded bg-muted sm:block" aria-hidden>
                            <span className={`block h-full ${p >= 100 ? "bg-success-text/70" : p >= 80 ? "bg-gold/70" : "bg-warning-text/70"}`} style={{ width: `${p}%` }} />
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-xs text-muted-foreground sm:w-32">
                            <strong className="text-foreground">{d.existentes}</strong> de {d.necessarios} · {pct(p)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 3. A fila: Pendências do malote — a mesma peça da etapa "Prontidão" do Fechamento */}
          <FilaDePendencias linhas={filtradas} resumo={resumo} podeOperar={podeOperar} onMudou={() => void carregar()} />
          {carregando && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Atualizando…</p>}
        </>
      )}

    </div>
  );
}

function FiltroSelect({ rotulo, valor, onChange, opcoes }: {
  rotulo: string; valor: string; onChange: (v: string) => void; opcoes: { id: string; nome: string }[];
}) {
  return (
    <div className="w-52 min-w-0">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opcoes.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
