// ─── FinancasAuditoriaAnexos.tsx — o que falta de documento, ANTES do pacote ──
//
// Pedido dela (03/10/2026): uma tela que mostre, de uma vez, quantas saídas do
// período têm documento e quantas não, separado por tipo, com filtro de conta,
// período, centro de custo e fornecedor — pra achar o que falta antes de gerar
// o Pacote Contábil.
//
// Nada novo no banco: lê as mesmas saídas e os mesmos anexos do pacote
// (`pacoteContabilService.auditarPeriodo`), com a MESMA classificação
// (`lib/pacoteContabil.auditarAnexos`) — o número daqui é o número do ZIP.
// Toda saída cai em uma de três situações e `total = com + sem + dispensa`
// sempre fecha: tarifa bancária DISPENSA documento (ver
// `dispensaDocumento`), não é falta.
//
// Só o período vai ao banco; conta, centro e fornecedor filtram em memória,
// então trocar de filtro é instantâneo e as opções só mostram o que existe no
// período (um fornecedor sem saída ali nem aparece).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Files, Loader2, PackageOpen, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import {
  SeletorPeriodo, resolverPeriodo, type PeriodoPreset,
} from "@/components/financas/SeletorPeriodo";
import { PaginaSkeleton } from "@/components/ListState";
import { hojeLocal, toYmd } from "@/lib/data";
import {
  dataBr, diaDoPagamento, resumirAuditoria,
  type LinhaAuditoria, type SituacaoDocumento,
} from "@/lib/pacoteContabil";
import {
  brl, nomeExtrato, FIN_ANEXO_TIPO_LABEL, type FinAnexoTipo,
} from "@/services/finService";
import { auditarPeriodo } from "@/services/pacoteContabilService";

const TODOS = "__todos__";
const POR_PAGINA = 100;

// Ordem dos tipos na tela. `documento` (o tipo ANTIGO) só aparece se alguém
// ainda o tiver — hoje são os 2 anexos de 02/10/2026.
const TIPOS_NA_TELA: FinAnexoTipo[] = [
  "nota_fiscal", "boleto", "comprovante", "fatura", "contrato", "xml", "outro", "documento",
];

const VISTA_LABEL: Record<SituacaoDocumento | "todas", string> = {
  sem: "Sem documento",
  com: "Com documento",
  dispensa: "Dispensam documento",
  todas: "Todas",
};

export default function FinancasAuditoriaAnexos() {
  // O caso de uso é o FECHAMENTO — olhar o mês que acabou. Por isso o padrão é
  // "Mês anterior", não o atual.
  const [preset, setPreset] = useState<PeriodoPreset>("mes_anterior");
  const [dIni, setDIni] = useState(hojeLocal());
  const [dFim, setDFim] = useState(hojeLocal());
  const periodo = useMemo(() => resolverPeriodo(preset, dIni, dFim), [preset, dIni, dFim]);
  // "Atrasados" não tem data inicial (filtra status previsto, sem piso) e
  // aqui só se audita o que JÁ foi pago.
  const periodoValido = !!periodo.dataInicio && !periodo.status && periodo.dataInicio <= periodo.dataFim;

  const [linhas, setLinhas] = useState<LinhaAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [conta, setConta] = useState(TODOS);
  const [centro, setCentro] = useState(TODOS);
  const [fornecedor, setFornecedor] = useState(TODOS);
  const [vista, setVista] = useState<SituacaoDocumento | "todas">("sem");
  const [visiveis, setVisiveis] = useState(POR_PAGINA);
  const [anexosPara, setAnexosPara] = useState<LinhaAuditoria | null>(null);

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
  useEffect(() => { setConta(TODOS); setCentro(TODOS); setFornecedor(TODOS); }, [periodo.dataInicio, periodo.dataFim]);
  useEffect(() => { setVisiveis(POR_PAGINA); }, [conta, centro, fornecedor, vista, periodo.dataInicio, periodo.dataFim]);

  const nomeDoFornecedor = (l: LinhaAuditoria["lancamento"]) => l.fornecedor_nome || l.pessoa_nome || "";
  const passa = (l: LinhaAuditoria["lancamento"], c: string, ce: string, f: string) =>
    (c === TODOS || l.conta_id === c)
    && (ce === TODOS || l.centro_custo_id === ce)
    && (f === TODOS || nomeDoFornecedor(l) === f);

  // Opções dos filtros = só o que existe no período E combina com os OUTROS
  // dois filtros (escolheu a conta Caixinha? a lista de fornecedores mostra só
  // quem tem saída nela — com 67 fornecedores no mês, a lista inteira seria ruído).
  const opcoes = useMemo(() => {
    const contas = new Map<string, string>();
    const centros = new Map<string, string>();
    const fornecedores = new Set<string>();
    for (const { lancamento: l } of linhas) {
      if (l.conta_id && passa(l, TODOS, centro, fornecedor)) contas.set(l.conta_id, l.conta_nome ?? "—");
      if (l.centro_custo_id && passa(l, conta, TODOS, fornecedor)) centros.set(l.centro_custo_id, l.centro_nome ?? "—");
      const f = nomeDoFornecedor(l);
      if (f && passa(l, conta, centro, TODOS)) fornecedores.add(f);
    }
    const porNome = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], "pt-BR");
    return {
      contas: [...contas.entries()].sort(porNome),
      centros: [...centros.entries()].sort(porNome),
      fornecedores: [...fornecedores].sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, conta, centro, fornecedor]);

  // Um filtro escolhido que deixou de existir nas opções (trocou a conta e o
  // fornecedor não tem saída nela) volta a "Todos" — senão ficaria preso num
  // valor que o Select nem mostra mais e a lista sumiria sem explicação.
  useEffect(() => {
    if (conta !== TODOS && !opcoes.contas.some(([id]) => id === conta)) setConta(TODOS);
    if (centro !== TODOS && !opcoes.centros.some(([id]) => id === centro)) setCentro(TODOS);
    if (fornecedor !== TODOS && !opcoes.fornecedores.includes(fornecedor)) setFornecedor(TODOS);
  }, [opcoes, conta, centro, fornecedor]);

  const filtradas = useMemo(
    () => linhas.filter(({ lancamento: l }) => passa(l, conta, centro, fornecedor)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, conta, centro, fornecedor]);

  const resumo = useMemo(() => resumirAuditoria(filtradas), [filtradas]);
  const exigem = resumo.com + resumo.sem; // quem DEVERIA ter documento
  const filtrando = conta !== TODOS || centro !== TODOS || fornecedor !== TODOS;

  const lista = useMemo(() => {
    const doTipo = vista === "todas" ? filtradas : filtradas.filter(x => x.situacao === vista);
    return [...doTipo].sort((a, b) =>
      diaDoPagamento(a.lancamento).localeCompare(diaDoPagamento(b.lancamento))
      || nomeExtrato(a.lancamento).principal.localeCompare(nomeExtrato(b.lancamento).principal, "pt-BR"));
  }, [filtradas, vista]);

  // O pacote é MENSAL (`/financas/relatorio/:ano/:mes`): só dá pra gerá-lo daqui
  // quando o período é exatamente um mês cheio.
  const mesInteiro = useMemo(() => {
    if (!periodoValido) return null;
    const [a, m] = periodo.dataInicio.split("-").map(Number);
    return periodo.dataInicio === `${a}-${String(m).padStart(2, "0")}-01` && periodo.dataFim === toYmd(new Date(a, m, 0))
      ? { ano: a, mes: m } : null;
  }, [periodo.dataInicio, periodo.dataFim, periodoValido]);

  const pctNum = (n: number) => (exigem > 0 ? (n / exigem) * 100 : 0);
  // Uma casa decimal: a cobertura documental hoje é 0,3% (2 de 770) — arredondar
  // pra inteiro mostrava "0%" / "100%" e escondia justamente o número que a
  // Central de Documentos precisa fazer subir.
  const pct = (n: number) => `${pctNum(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <header className="flex items-start gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/painel-tesouraria"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Link>
        </Button>
        {/* No celular o título ganha a linha inteira, abaixo dos botões — numa
            coluna entre eles ficava com ~110px e quebrava palavra por palavra. */}
        <div className="min-w-0 basis-full order-last md:order-none md:basis-0 md:flex-1">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-gold shrink-0" /> Auditoria de documentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Quais saídas pagas ainda estão sem documento — confira antes de gerar o Pacote Contábil.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 ml-auto md:ml-0" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {mesInteiro ? (
          <Button asChild variant="gold" size="sm" className="gap-1.5">
            <Link to={`/financas/relatorio/${mesInteiro.ano}/${mesInteiro.mes}`}>
              <PackageOpen className="w-3.5 h-3.5" /> Gerar pacote
            </Link>
          </Button>
        ) : (
          <Button variant="gold" size="sm" className="gap-1.5" disabled
            title="O pacote é mensal — escolha um mês inteiro (ex.: Mês anterior)">
            <PackageOpen className="w-3.5 h-3.5" /> Gerar pacote
          </Button>
        )}
      </header>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <SeletorPeriodo
            preset={preset} onPresetChange={setPreset}
            dataInicio={dIni} dataFim={dFim}
            onDataInicioChange={setDIni} onDataFimChange={setDFim}
          />
          <FiltroSelect rotulo="Conta financeira" valor={conta} onChange={setConta}
            opcoes={opcoes.contas.map(([id, nome]) => ({ id, nome }))} />
          <FiltroSelect rotulo="Centro de custo" valor={centro} onChange={setCentro}
            opcoes={opcoes.centros.map(([id, nome]) => ({ id, nome }))} />
          <FiltroSelect rotulo="Fornecedor" valor={fornecedor} onChange={setFornecedor}
            opcoes={opcoes.fornecedores.map(nome => ({ id: nome, nome }))} />
          {filtrando && (
            <Button variant="ghost" size="sm" onClick={() => { setConta(TODOS); setCentro(TODOS); setFornecedor(TODOS); }}>
              Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {!periodoValido && (
        <p className="text-sm text-muted-foreground">
          Escolha um período com data de início e fim. A auditoria olha só o que já foi pago.
        </p>
      )}

      {carregando && periodoValido && linhas.length === 0 && <PaginaSkeleton />}
      {erro && <p className="text-sm text-destructive-text">{erro}</p>}

      {periodoValido && (!carregando || linhas.length > 0) && !erro && (
        <>
          {/* Totais */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Totais do período">
            <Total rotulo={filtrando ? "Saídas (filtradas)" : "Saídas no período"} valor={resumo.total}
              nota="pagas, sem transferências" />
            <Total rotulo="Com documentos" valor={resumo.com} tom="ok"
              nota={exigem > 0 ? `${pct(resumo.com)} das que exigem` : undefined} />
            <Total rotulo="Sem documentos" valor={resumo.sem} tom={resumo.sem > 0 ? "alerta" : "ok"}
              nota={exigem > 0 ? `${pct(resumo.sem)} das que exigem` : undefined} />
            <Total rotulo="Dispensam documento" valor={resumo.dispensa} tom="neutro"
              nota="tarifas bancárias" />
          </section>

          {/* Por tipo */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div>
                <h2 className="text-sm font-medium">Por tipo de documento</h2>
                <p className="text-xs text-muted-foreground">
                  Saídas que têm pelo menos um documento de cada tipo. Uma saída com nota e boleto conta nos dois.
                </p>
              </div>
              <ul className="space-y-1.5">
                {TIPOS_NA_TELA.filter(t => t !== "documento" || resumo.porTipo.documento > 0).map(t => (
                  <li key={t} className="flex items-center gap-3 text-sm">
                    <span className="w-48 shrink-0 truncate">{t === "documento" ? "Documento (tipo antigo)" : FIN_ANEXO_TIPO_LABEL[t]}</span>
                    <span className="flex-1 h-2 rounded bg-muted overflow-hidden" aria-hidden>
                      <span className="block h-full bg-gold/70" style={{ width: `${pctNum(resumo.porTipo[t])}%` }} />
                    </span>
                    <span className="w-28 text-right tabular-nums text-xs text-muted-foreground">
                      <strong className="text-foreground">{resumo.porTipo[t]}</strong> · {pct(resumo.porTipo[t])}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Lista */}
          <Card>
            <CardContent className="p-0">
              <div className="p-3 border-b flex flex-wrap items-center gap-1.5">
                {(["sem", "com", "dispensa", "todas"] as const).map(v => {
                  const n = v === "todas" ? resumo.total : resumo[v];
                  return (
                    <Button key={v} size="sm" variant={vista === v ? "default" : "outline"}
                      className="h-7 text-xs" onClick={() => setVista(v)}>
                      {VISTA_LABEL[v]} <span className="ml-1.5 tabular-nums opacity-80">{n}</span>
                    </Button>
                  );
                })}
              </div>

              {lista.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  {vista === "sem" && resumo.total > 0
                    ? <><CheckCircle2 className="w-4 h-4 text-success-text" /> Nenhuma saída sem documento neste recorte.</>
                    : "Nada para mostrar neste recorte."}
                </p>
              ) : (
                <ul className="divide-y">
                  {lista.slice(0, visiveis).map(x => {
                    const l = x.lancamento;
                    const nome = nomeExtrato(l);
                    return (
                      <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-11 sm:w-24 shrink-0 tabular-nums text-xs text-muted-foreground">
                          <span className="sm:hidden">{dataBr(diaDoPagamento(l)).slice(0, 5)}</span>
                          <span className="hidden sm:inline">{dataBr(diaDoPagamento(l))}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{nome.principal}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[l.categoria_nome, l.conta_nome, l.centro_nome].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[14rem]">
                          {x.tipos.length === 0
                            ? <Situacao s={x.situacao} />
                            : x.tipos.map(t => (
                              <span key={t} className="px-1.5 py-0.5 rounded bg-muted text-xs">{FIN_ANEXO_TIPO_LABEL[t]}</span>
                            ))}
                        </span>
                        <span className="w-20 sm:w-24 shrink-0 text-right tabular-nums text-xs sm:text-sm">{brl(l.valor)}</span>
                        <button type="button" onClick={() => setAnexosPara(x)} title="Ver ou anexar documentos"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-gold shrink-0">
                          <Files className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  })}
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
          {carregando && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Atualizando…
            </p>
          )}
        </>
      )}

      {anexosPara && (
        <AnexosLancamentoDialog
          open={!!anexosPara}
          onOpenChange={(v) => !v && setAnexosPara(null)}
          lancamentoId={anexosPara.lancamento.id}
          descricaoLancamento={nomeExtrato(anexosPara.lancamento).principal}
          onChange={carregar}
        />
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

function Total({ rotulo, valor, nota, tom = "neutro" }: {
  rotulo: string; valor: number; nota?: string; tom?: "ok" | "alerta" | "neutro";
}) {
  const cor = tom === "ok" ? "text-success-text" : tom === "alerta" ? "text-warning-text" : "text-foreground";
  return (
    <Card className={tom === "alerta" ? "border-warning-line bg-warning-soft" : undefined}>
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {tom === "alerta" && <AlertTriangle className="w-3 h-3 text-warning-text" />}
          {rotulo}
        </p>
        <p className={`text-3xl font-semibold tabular-nums ${cor}`}>{valor}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

function Situacao({ s }: { s: SituacaoDocumento }) {
  if (s === "dispensa") return <span className="text-xs text-muted-foreground">dispensa</span>;
  if (s === "sem") return <span className="text-xs text-warning-text">sem documento</span>;
  return null;
}
