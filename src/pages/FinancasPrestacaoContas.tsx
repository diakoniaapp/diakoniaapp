// ─── FinancasPrestacaoContas.tsx ─────────────────────────────────────────
//
// Projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §8.3) —
// a grade que a tesouraria hoje monta à mão no Excel, gerada ao vivo de
// `fin_lancamentos` por `prestacaoContasService.gerarPrestacaoContas()`.
// Somente leitura por enquanto: sem fechamento formal ainda (Fase 6) e sem
// exportação em PDF (Fase 7) — o objetivo desta fase é rodar em paralelo
// com a planilha real e conferir que os números batem.
//
// Revisado em 12/09/2026 (pedido explícito): o período é MENSAL por
// padrão, e "trimestral" é só um preset de largura entre outros (1, 3, 6,
// 12 meses, ou um número escolhido à mão) — não mais o formato fixo da
// tela. `?ano=&mes=&qtd=` na URL, não parâmetro de rota — mesmo padrão que
// `Financas.tsx` já usa pra `?lancar=true`.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, MessageSquarePlus,
  AlertTriangle, ScrollText, Minus, Plus, Lock, LockOpen, ShieldCheck, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/services/finService";
import {
  gerarPrestacaoContas, type PrestacaoContasResultado, type PrestacaoContasGrupo,
} from "@/services/prestacaoContasService";
import {
  buscarFechamento, fecharPeriodo, aprovarPeriodo, reabrirPeriodo,
  type FinFechamentoPeriodo,
} from "@/services/fechamentoPeriodoService";
import { NotaRelatorioModal } from "@/components/financas/NotaRelatorioModal";
import { PaginaSkeleton } from "@/components/ListState";
import { hojeLocal, daquiAMeses } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";

const STATUS_FECHAMENTO_LABEL: Record<string, string> = {
  aberto: "Aberto", em_revisao: "Em revisão", fechado: "Fechado", aprovado: "Aprovado",
};

const NOME_MES_ABREV = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const PRESETS_LARGURA = [
  { qtd: 1, label: "Mensal" },
  { qtd: 3, label: "Trimestral" },
  { qtd: 6, label: "Semestral" },
  { qtd: 12, label: "Anual" },
];

function periodoAtual(): { ano: number; mes: number } {
  const [ano, mes] = hojeLocal().split("-").map(Number);
  return { ano, mes };
}

export default function FinancasPrestacaoContas() {
  const { hasRole } = useAuth();
  const souAdmin = hasRole("admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const padrao = periodoAtual();
  const ano = Number(searchParams.get("ano")) || padrao.ano;
  const mes = Number(searchParams.get("mes")) || padrao.mes;
  const qtdMeses = Math.min(24, Math.max(1, Number(searchParams.get("qtd")) || 1));

  const [dados, setDados] = useState<PrestacaoContasResultado | null>(null);
  const [fechamento, setFechamento] = useState<FinFechamentoPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [nota, setNota] = useState<{
    aberto: boolean; titulo: string; categoriaId: string; centroCustoId: string | null;
  }>({ aberto: false, titulo: "", categoriaId: "", centroCustoId: null });

  async function carregar() {
    setLoading(true);
    try {
      const [resultado, fech] = await Promise.all([
        gerarPrestacaoContas(ano, mes, qtdMeses),
        buscarFechamento(ano, mes, qtdMeses),
      ]);
      setDados(resultado);
      setFechamento(fech);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar a prestação de contas.");
    } finally {
      setLoading(false);
    }
  }

  async function onFechar() {
    setProcessando(true);
    try {
      await fecharPeriodo(ano, mes, qtdMeses);
      toast.success("Período fechado — lançamentos travados para edição.");
      setConfirmandoFechar(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível fechar o período.");
    } finally {
      setProcessando(false);
    }
  }

  async function onAprovar() {
    if (!fechamento) return;
    setProcessando(true);
    try {
      await aprovarPeriodo(fechamento.id);
      toast.success("Período aprovado.");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aprovar o período.");
    } finally {
      setProcessando(false);
    }
  }

  async function onReabrir() {
    if (!fechamento || !motivoReabertura.trim()) return;
    setProcessando(true);
    try {
      await reabrirPeriodo(fechamento.id, motivoReabertura.trim());
      toast.success("Período reaberto.");
      setReabrindo(false);
      setMotivoReabertura("");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reabrir o período.");
    } finally {
      setProcessando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ano, mes, qtdMeses]);

  function atualizarParams(novoAno: number, novoMes: number, novaQtd: number) {
    setSearchParams({ ano: String(novoAno), mes: String(novoMes), qtd: String(novaQtd) });
  }

  function deslocarPeriodo(passosDeMes: number) {
    const [a, m] = daquiAMeses(`${ano}-${String(mes).padStart(2, "0")}-01`, passosDeMes).split("-").map(Number);
    atualizarParams(a, m, qtdMeses);
  }

  function mudarLargura(novaQtd: number) {
    atualizarParams(ano, mes, Math.min(24, Math.max(1, novaQtd)));
  }

  function abrirNota(titulo: string, categoriaId: string, centroCustoId: string | null) {
    setNota({ aberto: true, titulo, categoriaId, centroCustoId });
  }

  if (loading) return <PaginaSkeleton />;
  if (!dados) return <div className="p-8 text-center text-muted-foreground">Não foi possível carregar.</div>;

  const primeiro = dados.meses[0];
  const ultimo = dados.meses[dados.meses.length - 1];
  const rotuloPeriodo = qtdMeses === 1
    ? `${primeiro.nome} · ${primeiro.ano}`
    : primeiro.ano === ultimo.ano
      ? `${NOME_MES_ABREV[primeiro.numero]}–${NOME_MES_ABREV[ultimo.numero]} · ${primeiro.ano}`
      : `${NOME_MES_ABREV[primeiro.numero]}/${primeiro.ano}–${NOME_MES_ABREV[ultimo.numero]}/${ultimo.ano}`;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-gold" /> Prestação de Contas
          </h1>
          <p className="text-xs text-muted-foreground">
            Gerado ao vivo dos lançamentos — mesma estrutura da planilha apresentada à diretoria.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/financas"><ArrowLeft className="w-3.5 h-3.5" /> Contas correntes</Link>
        </Button>
      </div>

      {/* Período: desloca de 1 em 1 mês; largura escolhe quantos meses aparecem */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => deslocarPeriodo(-1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-40 text-center">{rotuloPeriodo}</span>
          <Button size="sm" variant="outline" onClick={() => deslocarPeriodo(1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-center">
          {PRESETS_LARGURA.map(p => (
            <Button
              key={p.qtd}
              size="sm"
              variant={qtdMeses === p.qtd ? "default" : "outline"}
              className={qtdMeses === p.qtd ? "bg-gold hover:bg-gold/90 text-white" : ""}
              onClick={() => mudarLargura(p.qtd)}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex items-center gap-0.5 ml-1 border rounded-md">
            <Button size="sm" variant="ghost" className="px-2" onClick={() => mudarLargura(qtdMeses - 1)} disabled={qtdMeses <= 1}>
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-xs w-14 text-center tabular-nums">{qtdMeses} {qtdMeses === 1 ? "mês" : "meses"}</span>
            <Button size="sm" variant="ghost" className="px-2" onClick={() => mudarLargura(qtdMeses + 1)} disabled={qtdMeses >= 24}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Fechamento do período — Fase 6. "Trimestral" não é o formato do
          fechamento, é só a largura escolhida acima; o fechamento é sempre
          do período exato que está na tela (ano, mês inicial, qtd meses). */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <StatusIcone status={fechamento?.status ?? "aberto"} />
            <div>
              <Badge variant="outline" className={CLASSE_BADGE[fechamento?.status ?? "aberto"]}>
                {STATUS_FECHAMENTO_LABEL[fechamento?.status ?? "aberto"]}
              </Badge>
              {fechamento?.status === "fechado" || fechamento?.status === "aprovado" ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lançamentos deste período estão travados para edição.
                  {fechamento.fechado_em && ` Fechado em ${new Date(fechamento.fechado_em).toLocaleDateString("pt-BR")}.`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lançamentos ainda podem ser editados. Fechar trava tudo que estiver realizado/conciliado neste período.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(!fechamento || fechamento.status === "aberto" || fechamento.status === "em_revisao") && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmandoFechar(true)}>
                <Lock className="w-3.5 h-3.5" /> Fechar período
              </Button>
            )}
            {fechamento?.status === "fechado" && souAdmin && (
              <Button size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white" onClick={onAprovar} disabled={processando}>
                <ShieldCheck className="w-3.5 h-3.5" /> Aprovar
              </Button>
            )}
            {(fechamento?.status === "fechado" || fechamento?.status === "aprovado") && souAdmin && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReabrindo(true)}>
                <LockOpen className="w-3.5 h-3.5" /> Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {dados.qtdForaDoPlanoOficial > 0 && (
        <Card className="border-warning-line bg-warning-soft">
          <CardContent className="py-2.5 px-4 flex items-center gap-2 text-xs text-warning-text">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {dados.qtdForaDoPlanoOficial} lançamento{dados.qtdForaDoPlanoOficial !== 1 ? "s" : ""} do
            período não {dados.qtdForaDoPlanoOficial !== 1 ? "entraram" : "entrou"} neste relatório —
            sem categoria do Plano de Contas Oficial, ou é transferência entre contas próprias.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 md:p-6 overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: Math.max(560, 220 + dados.meses.length * 100) }}>
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left font-medium py-1.5 text-muted-foreground">
                  {dados.qtdLancamentos} lançamento{dados.qtdLancamentos !== 1 ? "s" : ""} realizado{dados.qtdLancamentos !== 1 ? "s" : ""}/conciliado{dados.qtdLancamentos !== 1 ? "s" : ""}
                </th>
                {dados.meses.map((m, i) => (
                  <th key={i} className="text-right font-medium py-1.5 uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {m.nome}{m.ano !== dados.meses[0].ano ? `/${m.ano}` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LinhaTotal titulo="Saldo Anterior" valores={dados.saldoAnterior} />

              <LinhaSecao titulo="Receitas" />
              {dados.gruposReceita.length === 0 ? (
                <LinhaVazia texto="Sem receitas oficiais no período." colSpan={dados.meses.length + 1} />
              ) : dados.gruposReceita.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={null} onNota={abrirNota} corTotal="text-success-text" />
              ))}
              <LinhaTotal titulo="Total Receitas" valores={dados.totalReceitas} destaque cor="text-success-text" />

              <LinhaSecao titulo="Despesas" />
              {dados.gruposDespesaPorCentro.length === 0 ? (
                <LinhaVazia texto="Sem despesas oficiais no período." colSpan={dados.meses.length + 1} />
              ) : dados.gruposDespesaPorCentro.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={g.chave === "__sem_centro__" ? null : g.chave} onNota={abrirNota} corTotal="text-destructive-text" />
              ))}
              <LinhaTotal titulo="Total Despesas" valores={dados.totalDespesas} destaque cor="text-destructive-text" />

              {dados.grupoDespesasFinanceiras && (
                <>
                  <LinhaSecao titulo="Despesas Financeiras" />
                  <Bloco grupo={dados.grupoDespesasFinanceiras} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}
              {dados.grupoOutrasDespesas && (
                <>
                  <LinhaSecao titulo="Outras Despesas" />
                  <Bloco grupo={dados.grupoOutrasDespesas} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}

              <LinhaTotal titulo="Resultado do Período" valores={dados.resultado} destaque forte
                cor={dados.resultado.every(v => v >= 0) ? "text-success-text" : undefined} />
              <LinhaTotal titulo="Saldo Final" valores={dados.saldoFinal} destaque />
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NotaRelatorioModal
        open={nota.aberto}
        onOpenChange={(v) => setNota(n => ({ ...n, aberto: v }))}
        titulo={nota.titulo}
        ano={dados.mesAncoraNota.ano}
        mes={dados.mesAncoraNota.mes}
        categoriaId={nota.categoriaId}
        centroCustoId={nota.centroCustoId}
        onSalvo={carregar}
      />

      <AlertDialog open={confirmandoFechar} onOpenChange={(v) => !processando && setConfirmandoFechar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar {rotuloPeriodo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo lançamento realizado ou conciliado deste período trava para edição e exclusão.
              Isso pode ser desfeito depois (um administrador pode reabrir, com motivo registrado),
              mas não é o passo de todo dia — feche quando o período estiver revisado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onFechar} disabled={processando} className="gap-1.5">
              {processando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Fechar período
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reabrir pede motivo, por isso é Dialog e não AlertDialog — mesmo padrão de FinancasAgenda.tsx */}
      <Dialog open={reabrindo} onOpenChange={(v) => { if (!processando) { setReabrindo(v); if (!v) setMotivoReabertura(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {rotuloPeriodo}</DialogTitle>
            <DialogDescription>
              Destrava os lançamentos deste período para edição. O motivo fica registrado no
              histórico do fechamento, com data e hora.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoReabertura}
            onChange={(e) => setMotivoReabertura(e.target.value)}
            placeholder="Por que este período está sendo reaberto?"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" disabled={processando} onClick={() => { setReabrindo(false); setMotivoReabertura(""); }}>
              Cancelar
            </Button>
            <Button disabled={processando || !motivoReabertura.trim()} onClick={onReabrir} className="gap-1.5">
              {processando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusIcone({ status }: { status: string }) {
  if (status === "fechado" || status === "aprovado") return <Lock className="w-4 h-4 text-warning-text shrink-0" />;
  return <LockOpen className="w-4 h-4 text-muted-foreground shrink-0" />;
}

const CLASSE_BADGE: Record<string, string> = {
  aberto: "bg-muted text-muted-foreground border-border",
  em_revisao: "bg-info-soft text-info-text border-info-line",
  fechado: "bg-warning-soft text-warning-text border-warning-line",
  aprovado: "bg-success-soft text-success-text border-success-line",
};

function LinhaSecao({ titulo }: { titulo: string }) {
  return (
    <tr>
      <td colSpan={99} className="pt-4 pb-1">
        <h3 className="font-serif text-sm text-gold uppercase tracking-wide">{titulo}</h3>
      </td>
    </tr>
  );
}

function LinhaVazia({ texto, colSpan }: { texto: string; colSpan: number }) {
  return <tr><td colSpan={colSpan} className="py-1.5 text-muted-foreground italic">{texto}</td></tr>;
}

function LinhaTotal({ titulo, valores, destaque, forte, cor }: {
  titulo: string; valores: number[]; destaque?: boolean; forte?: boolean; cor?: string;
}) {
  return (
    <tr className={destaque ? `border-t-2 border-gold/40 font-semibold ${forte ? "text-sm" : ""}` : "text-muted-foreground"}>
      <td className={`py-1.5 ${destaque ? "uppercase tracking-wide" : ""}`}>{titulo}</td>
      {valores.map((v, i) => (
        <td key={i} className={`py-1.5 text-right tabular-nums whitespace-nowrap ${cor ?? ""}`}>{brl(v)}</td>
      ))}
    </tr>
  );
}

function Bloco({ grupo, centroCustoId, onNota, corTotal, semSubtotalProprio }: {
  grupo: PrestacaoContasGrupo;
  centroCustoId: string | null;
  onNota: (titulo: string, categoriaId: string, centroCustoId: string | null) => void;
  corTotal: string;
  semSubtotalProprio?: boolean;
}) {
  return (
    <>
      {!semSubtotalProprio && (
        <tr className="border-b border-border/40">
          <td className="py-1 font-medium">{grupo.titulo}</td>
          {grupo.valores.map((v, i) => (
            <td key={i} className={`py-1 text-right tabular-nums whitespace-nowrap font-medium ${corTotal}`}>{brl(v)}</td>
          ))}
        </tr>
      )}
      {grupo.linhas.map(l => (
        <tr key={l.categoriaId} className="border-b border-border/20 text-muted-foreground group">
          <td className="py-0.5 pl-4">
            <button
              type="button"
              onClick={() => onNota(`${l.nome} · ${grupo.titulo}`, l.categoriaId, centroCustoId)}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              title={l.temNota ? "Ver/editar nota" : "Adicionar nota"}
            >
              {l.nome}
              {l.temNota
                ? <MessageSquare className="w-3 h-3 text-gold shrink-0" />
                : <MessageSquarePlus className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />}
            </button>
          </td>
          {l.valores.map((v, i) => (
            <td key={i} className="py-0.5 text-right tabular-nums whitespace-nowrap">{v === 0 ? "—" : brl(v)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
