// ─── FinancasAuditoriaAnexos.tsx — o mês está pronto para a contabilidade? ───
//
// Pedido dela (20/10/2026): a tela deixa de responder "existe algum documento?" e passa a responder "esta despesa está pronta para a contabilidade?". Três perguntas, de cima para baixo:
//   1. QUANTO FALTA? — a prontidão do malote (completas + dispensadas ÷ total), as contagens e o veredito: o escritório já consegue trabalhar com este período?
//   2. O QUE FALTA, EM GERAL? — o checklist do mês (extrato, OFX, cartão, adquirente) e "existentes × necessários" por documento exigido;
//   3. O QUE FALTA, DESPESA A DESPESA? — a fila de Pendências do Malote, da mais grave à mais leve (crítica, parcial, administrativa), com Anexar / Editar / Visualizar sem sair da tela.
//
// A régua é UMA só, a mesma da Pronta para Malote, do Fechamento e do Ciclo da despesa: `lib/documentacaoExigida.ts` (o documento exigido pela contabilidade para o TIPO da despesa, não só a
// categoria). Entram no malote — e portanto na medição — as saídas pagas, as compras ofertadas por terceiros e os avisos de reembolso. A tela só INFORMA: o envio nunca é bloqueado
// (decisão de 02/10, mantida em 20/10).
//
// Só o período vai ao banco; conta, centro, favorecido e documento faltante filtram em memória, então trocar de filtro é instantâneo e as opções só mostram o que existe no período.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, ClipboardCheck, Eye, Loader2, MoreHorizontal, PackageOpen, Paperclip, Pencil, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { DocumentacaoChip, GravidadeChip } from "@/components/financas/DocumentacaoChip";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { SeletorPeriodo, resolverPeriodo, type PeriodoPreset } from "@/components/financas/SeletorPeriodo";
import { PaginaSkeleton } from "@/components/ListState";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";
import { useAuth } from "@/hooks/useAuth";
import { hojeLocal, toYmd } from "@/lib/data";
import { checklistDeDocumentos, resumoDoChecklist, type ItemDoChecklistDeDocumentos } from "@/lib/fechamentoDocumentos";
import { ORDEM_DA_GRAVIDADE, resumirProntidao, textoDoQueFalta, type Gravidade } from "@/lib/documentacaoExigida";
import { dataBr, diaDoPagamento, type LinhaAuditoria } from "@/lib/pacoteContabil";
import { brl, nomeExtrato } from "@/services/finService";
import { documentosEDispensasDoMes } from "@/services/fechamentoDocumentosService";
import { auditarPeriodo } from "@/services/pacoteContabilService";

const TODOS = "__todos__";
const POR_PAGINA = 100;

type Vista = "pendencias" | Gravidade | "completas" | "dispensam" | "todas";

const ROTULO_DA_VISTA: Record<Vista, string> = {
  pendencias: "Pendências", critica: "Críticas", parcial: "Parciais", administrativa: "Administrativas",
  completas: "Completas", dispensam: "Dispensam", todas: "Todas",
};

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
  const [vista, setVista] = useState<Vista>("pendencias");
  const [visiveis, setVisiveis] = useState(POR_PAGINA);

  const [anexando, setAnexando] = useState<LinhaAuditoria | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaAuditoria["lancamento"] | null>(null);
  const [editando, setEditando] = useState<LinhaAuditoria["lancamento"] | null>(null);

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
  useEffect(() => { setVisiveis(POR_PAGINA); }, [conta, centro, fornecedor, faltante, vista, periodo.dataInicio, periodo.dataFim]);

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
  const porGravidade = useMemo(() => ({
    critica: filtradas.filter(x => x.documentacao.gravidade === "critica").length,
    parcial: filtradas.filter(x => x.documentacao.gravidade === "parcial").length,
    administrativa: filtradas.filter(x => x.documentacao.gravidade === "administrativa").length,
  }), [filtradas]);

  const lista = useMemo(() => {
    const doTipo = filtradas.filter(x => {
      if (vista === "todas") return true;
      if (vista === "pendencias") return !!x.documentacao.gravidade;
      if (vista === "completas") return x.situacao === "completa";
      if (vista === "dispensam") return x.situacao === "dispensa";
      return x.documentacao.gravidade === vista;
    });
    // fila: 🔴 antes de 🟠 antes de 🔵, e o maior valor primeiro; o resto, por dia
    return [...doTipo].sort((a, b) => {
      if (vista === "pendencias" || vista === "critica" || vista === "parcial" || vista === "administrativa") {
        return ORDEM_DA_GRAVIDADE[a.documentacao.gravidade ?? "administrativa"] - ORDEM_DA_GRAVIDADE[b.documentacao.gravidade ?? "administrativa"]
          || Number(b.lancamento.valor) - Number(a.lancamento.valor);
      }
      return diaDoPagamento(a.lancamento).localeCompare(diaDoPagamento(b.lancamento)) || nomeExtrato(a.lancamento).principal.localeCompare(nomeExtrato(b.lancamento).principal, "pt-BR");
    });
  }, [filtradas, vista]);

  // O pacote e o checklist são MENSAIS: só aparecem quando o período é exatamente um mês cheio.
  const mesInteiro = useMemo(() => {
    if (!periodoValido) return null;
    const [a, m] = periodo.dataInicio.split("-").map(Number);
    return periodo.dataInicio === `${a}-${String(m).padStart(2, "0")}-01` && periodo.dataFim === toYmd(new Date(a, m, 0)) ? { ano: a, mes: m } : null;
  }, [periodo.dataInicio, periodo.dataFim, periodoValido]);

  const [checklist, setChecklist] = useState<{ itens: ItemDoChecklistDeDocumentos[] } | "indisponivel" | null>(null);
  useEffect(() => {
    let vivo = true;
    setChecklist(null);
    if (!mesInteiro) return;
    documentosEDispensasDoMes(mesInteiro.ano, mesInteiro.mes)
      .then(r => { if (vivo) setChecklist(r ? { itens: checklistDeDocumentos(r.documentos, r.dispensas) } : "indisponivel"); })
      .catch(() => { if (vivo) setChecklist("indisponivel"); });
    return () => { vivo = false; };
  }, [mesInteiro?.ano, mesInteiro?.mes]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const parte = (n: number) => (resumo.total > 0 ? (n / resumo.total) * 100 : 0);
  const faltamDocumentais = resumo.parciais + resumo.sem;
  const tudoPronto = resumo.total > 0 && resumo.pendentes === 0;
  const documentalOk = resumo.total > 0 && faltamDocumentais === 0;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <header className="flex items-start gap-3 flex-wrap">
        {/* No celular o título ganha a linha inteira, abaixo dos botões — numa coluna entre eles ficava com ~110px e quebrava palavra por palavra. */}
        <div className="min-w-0 basis-full order-last md:order-none md:basis-0 md:flex-1">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-gold shrink-0" /> Auditoria de documentos
          </h1>
          <p className="text-sm text-muted-foreground">Esta despesa está pronta para a contabilidade? A régua é a do documento que o escritório exige para cada tipo de despesa.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto md:ml-0" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {mesInteiro ? (
          <Button asChild variant="gold" size="sm" className="gap-1.5">
            <Link to={`/financas/relatorio/${mesInteiro.ano}/${mesInteiro.mes}`}><PackageOpen className="w-3.5 h-3.5" /> Gerar pacote</Link>
          </Button>
        ) : (
          <Button variant="gold" size="sm" className="gap-1.5" disabled title="O pacote é mensal — escolha um mês inteiro (ex.: Mês anterior)">
            <PackageOpen className="w-3.5 h-3.5" /> Gerar pacote
          </Button>
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
          {/* 1. Prontidão do malote */}
          <Card aria-label="Prontidão do malote" data-bloco="prontidao">
            <CardContent className="p-4 md:p-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Prontidão do malote{filtrando ? " (filtrada)" : ""}</p>
                <p className={`text-sm font-medium flex items-center gap-1.5 ${tudoPronto ? "text-success-text" : documentalOk ? "text-info-text" : "text-warning-text"}`} data-veredito={tudoPronto ? "pronto" : documentalOk ? "documentos_ok" : "faltam"}>
                  {tudoPronto ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {resumo.total === 0 ? "Nenhuma obrigação neste recorte."
                    : tudoPronto ? "O escritório já consegue trabalhar com este período."
                      : documentalOk ? `Documentação completa. Restam ${resumo.administrativas} ajuste${resumo.administrativas === 1 ? "" : "s"} administrativo${resumo.administrativas === 1 ? "" : "s"}.`
                        : `Faltam ${faltamDocumentais} obrigaç${faltamDocumentais === 1 ? "ão" : "ões"} com documentação incompleta${resumo.administrativas > 0 ? ` e ${resumo.administrativas} ajuste${resumo.administrativas === 1 ? "" : "s"} administrativo${resumo.administrativas === 1 ? "" : "s"}` : ""}.`}
                </p>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-serif text-4xl leading-none tabular-nums" data-percentual>{pct(resumo.percentual)}</p>
                <p className="text-sm text-muted-foreground tabular-nums"><strong className="text-foreground">{resumo.prontas}</strong> de <strong className="text-foreground">{resumo.total}</strong> obrigações prontas (completas ou dispensadas)</p>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`${resumo.completas} completas, ${resumo.dispensam} dispensam, ${resumo.parciais} parciais, ${resumo.sem} sem documentação`}>
                <span className="bg-success-text/80" style={{ width: `${parte(resumo.completas)}%` }} />
                <span className="bg-success-text/40" style={{ width: `${parte(resumo.dispensam)}%` }} />
                <span className="bg-warning-text/70" style={{ width: `${parte(resumo.parciais)}%` }} />
                <span className="bg-destructive-text/80" style={{ width: `${parte(resumo.sem)}%` }} />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Totais do período">
                <Total rotulo="Documentação completa" valor={resumo.completas} tom="ok" />
                <Total rotulo="Documentação parcial" valor={resumo.parciais} tom={resumo.parciais > 0 ? "alerta" : "ok"} nota={resumo.parciais > 0 ? "falta algum documento" : undefined} />
                <Total rotulo="Sem documentação" valor={resumo.sem} tom={resumo.sem > 0 ? "critico" : "ok"} nota={resumo.sem > 0 ? "nenhum anexo" : undefined} />
                <Total rotulo="Dispensam" valor={resumo.dispensam} tom="neutro" nota="tarifas bancárias" />
              </div>
            </CardContent>
          </Card>

          {/* 2. Checklist do mês + existentes × necessários */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <Card data-bloco="checklist">
              <CardContent className="p-4 space-y-2">
                <div>
                  <h2 className="text-sm font-medium">Checklist do malote{mesInteiro ? ` · ${String(mesInteiro.mes).padStart(2, "0")}/${mesInteiro.ano}` : ""}</h2>
                  <p className="text-xs text-muted-foreground">O que o escritório recebe além das despesas: os documentos do mês.</p>
                </div>
                <ul className="space-y-1.5 text-sm">
                  <ItemDoChecklist ok={documentalOk} rotulo="Obrigações com documentação completa"
                    detalhe={resumo.total === 0 ? "—" : documentalOk ? "todas" : `${faltamDocumentais} incompleta${faltamDocumentais === 1 ? "" : "s"}`} />
                  <ItemDoChecklist ok={resumo.sem === 0} rotulo="Obrigações sem nenhum documento" detalhe={resumo.sem === 0 ? "nenhuma" : String(resumo.sem)} />
                  {!mesInteiro && <li className="text-xs text-muted-foreground">Escolha um mês inteiro (ex.: Mês anterior) para ver os documentos do mês.</li>}
                  {mesInteiro && checklist === null && <li className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Conferindo os documentos do mês…</li>}
                  {mesInteiro && checklist === "indisponivel" && <li className="text-xs text-muted-foreground">Documentos do mês indisponíveis (falta aplicar a migration dos Documentos do fechamento).</li>}
                  {mesInteiro && checklist && checklist !== "indisponivel" && checklist.itens.map(i => (
                    <ItemDoChecklist key={i.grupo} ok={i.estado !== "faltando"} rotulo={i.rotulo.replace(/ anexado$/, "")}
                      detalhe={i.estado === "anexado" ? `${i.arquivos} arquivo${i.arquivos === 1 ? "" : "s"}` : i.estado === "dispensado" ? "dispensado" : "faltando"} />
                  ))}
                </ul>
                {mesInteiro && checklist && checklist !== "indisponivel" && resumoDoChecklist(checklist.itens).faltando > 0 && (
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                    <Link to="/painel-tesouraria#fechamento">Anexar os documentos do mês <ArrowRight className="w-3.5 h-3.5" /></Link>
                  </Button>
                )}
              </CardContent>
            </Card>

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

          {/* 3. A fila: Pendências do malote */}
          <Card data-bloco="fila">
            <CardContent className="p-0">
              <div className="p-3 border-b space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 className="text-sm font-medium">Pendências do malote</h2>
                  <p className="text-xs text-muted-foreground">da mais grave à mais leve, e do maior valor ao menor</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["pendencias", "critica", "parcial", "administrativa", "completas", "dispensam", "todas"] as const).map(v => {
                    const n = v === "todas" ? resumo.total : v === "pendencias" ? resumo.pendentes : v === "completas" ? resumo.completas : v === "dispensam" ? resumo.dispensam : porGravidade[v];
                    return (
                      <Button key={v} size="sm" variant={vista === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setVista(v)} data-vista={v}>
                        {ROTULO_DA_VISTA[v]} <span className="ml-1.5 tabular-nums opacity-80">{n}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {lista.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  {vista === "pendencias" && resumo.total > 0
                    ? <><CheckCircle2 className="w-4 h-4 text-success-text" /> Nenhuma pendência neste recorte.</>
                    : "Nada para mostrar neste recorte."}
                </p>
              ) : (
                <ul className="divide-y">
                  {lista.slice(0, visiveis).map(x => (
                    <LinhaDaFila key={x.lancamento.id} x={x} podeOperar={podeOperar}
                      onAnexar={() => setAnexando(x)} onEditar={() => setEditando(x.lancamento)} onVisualizar={() => setDetalhe(x.lancamento)} />
                  ))}
                </ul>
              )}

              {lista.length > visiveis && (
                <div className="p-3 border-t text-center">
                  <Button variant="outline" size="sm" onClick={() => setVisiveis(v => v + POR_PAGINA)}>
                    Mostrar mais {Math.min(POR_PAGINA, lista.length - visiveis)} de {lista.length - visiveis} restantes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          {carregando && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Atualizando…</p>}
        </>
      )}

      {/* Os fluxos de sempre, montados uma vez: resolver a pendência sem sair da tela */}
      {anexando && (
        <AnexosLancamentoDialog open onOpenChange={v => { if (!v) { setAnexando(null); void carregar(); } }}
          lancamentoId={anexando.lancamento.id} descricaoLancamento={nomeExtrato(anexando.lancamento).principal} onChange={carregar} />
      )}
      <DetalhesDoLancamento lancamento={detalhe} onFechar={() => setDetalhe(null)} />
      <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); void carregar(); }} />
    </div>
  );
}

function LinhaDaFila({ x, podeOperar, onAnexar, onEditar, onVisualizar }: {
  x: LinhaAuditoria; podeOperar: boolean; onAnexar: () => void; onEditar: () => void; onVisualizar: () => void;
}) {
  const l = x.lancamento, d = x.documentacao;
  const nome = nomeExtrato(l).principal;
  const administrativa = d.gravidade === "administrativa";
  // a ação que resolve: documento faltando → Anexar; só falta algo operacional → Editar. As outras ficam no "⋯".
  const principal: "anexar" | "editar" | null = !podeOperar ? null : administrativa ? "editar" : d.gravidade ? "anexar" : null;
  return (
    <li data-pendencia={l.id} data-gravidade-da-linha={d.gravidade ?? "nenhuma"} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {d.gravidade ? <GravidadeChip gravidade={d.gravidade} /> : <DocumentacaoChip situacao={x.situacao} />}
          <button type="button" onClick={onVisualizar} className="min-w-0 truncate text-left font-medium hover:underline" title={nome}>{nome}</button>
          {x.aviso && <span className="rounded border border-gold bg-gold/10 px-1.5 text-[10px] font-semibold text-gold-text">Reembolso a pagar</span>}
        </div>
        <p className="text-xs text-muted-foreground">{textoDoQueFalta(d)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[dataBr(diaDoPagamento(l)), l.projeto_nome ? `Projeto: ${l.projeto_nome}` : null, l.centro_nome, l.conta_nome].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="text-right tabular-nums font-medium whitespace-nowrap">{brl(l.valor)}</span>
      <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1 md:self-center">
        {principal === "anexar" && (
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-xs whitespace-nowrap" onClick={onAnexar} aria-label={`Anexar documento — ${nome}`} title="Anexar documento">
            <Paperclip className="w-3.5 h-3.5" /><span className="hidden lg:inline">Anexar</span>
          </Button>
        )}
        {principal === "editar" && (
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-xs whitespace-nowrap" onClick={onEditar} aria-label={`Editar obrigação — ${nome}`} title="Editar obrigação">
            <Pencil className="w-3.5 h-3.5" /><span className="hidden lg:inline">Editar</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" aria-label={`Mais ações de ${nome}`} title="Mais ações"><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuItem onSelect={onVisualizar}><Eye className="w-3.5 h-3.5" /> Visualizar</DropdownMenuItem>
            {podeOperar && principal !== "editar" && <DropdownMenuItem onSelect={onEditar}><Pencil className="w-3.5 h-3.5" /> Editar obrigação</DropdownMenuItem>}
            {podeOperar && principal !== "anexar" && <DropdownMenuItem onSelect={onAnexar}><Paperclip className="w-3.5 h-3.5" /> Anexar documento</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function ItemDoChecklist({ ok, rotulo, detalhe }: { ok: boolean; rotulo: string; detalhe: string }) {
  return (
    <li className="flex items-center justify-between gap-3" data-item-do-checklist={ok ? "ok" : "atencao"}>
      <span className="flex items-center gap-1.5 min-w-0">
        {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-success-text" aria-label="ok" /> : <CircleDashed className="w-4 h-4 shrink-0 text-warning-text" aria-label="atenção" />}
        <span className="truncate">{rotulo}</span>
      </span>
      <span className={`shrink-0 text-xs tabular-nums ${ok ? "text-muted-foreground" : "text-warning-text font-medium"}`}>{detalhe}</span>
    </li>
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

function Total({ rotulo, valor, nota, tom = "neutro" }: { rotulo: string; valor: number; nota?: string; tom?: "ok" | "alerta" | "critico" | "neutro" }) {
  const cor = tom === "ok" ? "text-success-text" : tom === "alerta" ? "text-warning-text" : tom === "critico" ? "text-destructive-text" : "text-foreground";
  const caixa = tom === "alerta" ? "border-warning-line bg-warning-soft" : tom === "critico" ? "border-destructive-line bg-destructive-soft" : undefined;
  return (
    <Card className={caixa}>
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">{rotulo}</p>
        <p className={`text-3xl font-semibold tabular-nums ${cor}`}>{valor}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}
