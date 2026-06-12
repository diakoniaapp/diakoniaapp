import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Users, Calendar, Loader2, Check, AlertTriangle,
  ThumbsUp, ThumbsDown, Clock, Sparkles, Search, RefreshCw,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarAssembleia, atualizarAssembleia,
  listarPautasAssembleia, listarPresentes,
  marcarPresencaAssembleia, sincronizarMembrosAptos,
  recalcQuorum, calcularQuorum, decidirPauta,
  executarAssembleia, listarConvocacao, montarConvocacaoAssembleia, marcarConvocacaoEnviada,
  REUNIAO_STATUS_LABEL, REUNIAO_STATUS_COR, PAUTA_STATUS_LABEL,
  type GovAssembleia, type GovPauta, type GovPresente, type ResultadoVoto,
  type ConvocacaoPessoa,
} from "@/services/governancaService";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Zap, MessageCircle, Send } from "lucide-react";

export default function GovernancaAssembleia() {
  const { id = "" } = useParams();
  const [ass, setAss] = useState<GovAssembleia | null>(null);
  const [pautas, setPautas] = useState<GovPauta[]>([]);
  const [presentes, setPresentes] = useState<GovPresente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  const [convOpen, setConvOpen] = useState(false);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [a, p, pr] = await Promise.all([
        carregarAssembleia(id),
        listarPautasAssembleia(id),
        listarPresentes(id),
      ]);
      setAss(a); setPautas(p); setPresentes(pr);
    } finally { setLoading(false); }
  }

  async function sincronizar() {
    setBusy(true);
    try {
      const qtd = await sincronizarMembrosAptos(id);
      toast.success(`${qtd} membros aptos sincronizados`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function executarPendentes() {
    if (!confirm("Executar todas as decisões aprovadas pendentes?\nIsto atualizará automaticamente as solicitações vinculadas.")) return;
    setBusy(true);
    try {
      const r = await executarAssembleia(id);
      if (r.length === 0) {
        toast.info("Nenhuma pauta pendente para executar");
      } else {
        toast.success(`${r.length} pauta(s) executada(s)`);
      }
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function togglePresenca(p: GovPresente) {
    try {
      await marcarPresencaAssembleia(p.id, !p.presente);
      // Recalcula quórum no banco
      await recalcQuorum(id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function trocarStatus(novo: GovAssembleia["status"]) {
    try {
      await atualizarAssembleia(id, { status: novo });
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando assembleia...
  </div>;
  if (!ass) return <div className="p-8 text-center text-muted-foreground">
    Assembleia não encontrada. <Link to="/governanca" className="text-primary underline">Voltar</Link>
  </div>;

  // Quórum em tempo real (presença dinâmica)
  const presNum = presentes.filter(p => p.presente).length;
  const aptos = ass.total_membros_aptos ?? 0;
  const quorum = calcularQuorum(presNum, aptos, Number(ass.quorum_minimo_pct));

  // Filtro busca
  const presentesFiltrados = busca.length >= 2
    ? presentes.filter(p => p.pessoa_nome.toLowerCase().includes(busca.toLowerCase()))
    : presentes;

  const pautasPendentes = pautas.filter(p => p.status === "para_assembleia").length;
  const pautasDecididas = pautas.filter(p =>
    p.status === "aprovada_assembleia" || p.status === "rejeitada" || p.status === "adiada"
  ).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/governanca">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-gold" />
            <span className="truncate">{ass.titulo}</span>
            <Badge variant="outline" className={`text-[10px] ${REUNIAO_STATUS_COR[ass.status]}`}>
              {REUNIAO_STATUS_LABEL[ass.status]}
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <Calendar className="w-3 h-3" />
            {new Date(ass.data_assembleia + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {ass.horario && ` · ${ass.horario.slice(0, 5)}`}
            {ass.local && ` · ${ass.local}`}
          </p>
        </div>
      </div>

      {/* QUÓRUM EM DESTAQUE */}
      <Card className={quorum.atingido ? "border-emerald-300 bg-emerald-50/30" : "border-rose-300 bg-rose-50/30"}>
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quórum</p>
              <p className={`text-2xl font-semibold tabular-nums ${quorum.atingido ? "text-emerald-700" : "text-rose-700"}`}>
                {presNum} / {aptos}
                <span className="text-base ml-1">({quorum.pct.toFixed(1)}%)</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Mínimo: {Number(ass.quorum_minimo_pct)}%</p>
            </div>
            <div className="text-right">
              {quorum.atingido ? (
                <Badge variant="outline" className="text-sm bg-emerald-100 text-emerald-700 border-emerald-400 px-3 py-1">
                  ✅ Quórum atingido
                </Badge>
              ) : (
                <Badge variant="outline" className="text-sm bg-rose-100 text-rose-700 border-rose-400 px-3 py-1">
                  🚨 Quórum não atingido
                </Badge>
              )}
            </div>
          </div>
          {/* Barra visual */}
          <div className="h-2 mt-2 bg-muted rounded overflow-hidden relative">
            <div className={`h-full transition-all ${quorum.atingido ? "bg-emerald-500" : "bg-rose-500"}`}
              style={{ width: `${Math.min(100, quorum.pct)}%` }} />
            {/* Marca do mínimo */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
              style={{ left: `${Number(ass.quorum_minimo_pct)}%` }}
              title={`Mínimo: ${Number(ass.quorum_minimo_pct)}%`} />
          </div>
        </CardContent>
      </Card>

      {/* Status quick actions */}
      <div className="flex gap-2 flex-wrap">
        {ass.status === "agendada" && (
          <Button size="sm" onClick={() => trocarStatus("em_andamento")}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
            ▶ Iniciar assembleia
          </Button>
        )}
        {ass.status === "em_andamento" && (
          <Button size="sm" onClick={() => trocarStatus("concluida")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            ✓ Concluir
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setConvOpen(true)} className="gap-1.5 text-emerald-700">
          <MessageCircle className="w-3.5 h-3.5" /> Convocação WhatsApp
        </Button>
        {ass.status === "concluida" && (
          <Button size="sm" onClick={executarPendentes} disabled={busy}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Executar decisões
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={sincronizar} disabled={busy} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Sincronizar membros aptos
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Imprimir ata
        </Button>
      </div>

      <Tabs defaultValue="pautas">
        <TabsList>
          <TabsTrigger value="pautas" className="gap-1.5">
            ⚖ Pautas ({pautasPendentes} pendente{pautasPendentes === 1 ? "" : "s"} · {pautasDecididas} decidida{pautasDecididas === 1 ? "" : "s"})
          </TabsTrigger>
          <TabsTrigger value="presentes" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Presentes ({presNum}/{aptos})
          </TabsTrigger>
        </TabsList>

        {/* PAUTAS — Votação ao vivo */}
        <TabsContent value="pautas" className="space-y-2">
          {pautas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground italic">
                Sem pautas vinculadas a esta assembleia.
              </CardContent>
            </Card>
          ) : (
            pautas.map(p => (
              <PautaVotacao key={p.id} pauta={p}
                aptos={aptos}
                presentes={presNum}
                quorumAtingido={quorum.atingido}
                emAndamento={ass.status === "em_andamento"}
                onChange={carregar} />
            ))
          )}
        </TabsContent>

        {/* PRESENTES */}
        <TabsContent value="presentes" className="space-y-2">
          <Card>
            <CardContent className="py-2.5 px-3 relative">
              <Search className="w-3 h-3 absolute left-5 top-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Buscar membro..." />
            </CardContent>
          </Card>
          {presentes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <Users className="w-10 h-10 mx-auto opacity-30" />
                <p>Lista de membros aptos vazia.</p>
                <Button onClick={sincronizar} disabled={busy} variant="outline" className="gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Sincronizar agora
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-0.5">
              {presentesFiltrados.map(p => (
                <button key={p.id} onClick={() => togglePresenca(p)}
                  className={`w-full flex items-center gap-2 border rounded-md px-3 py-2 transition-colors text-left ${
                    p.presente ? "bg-emerald-50 border-emerald-300" : "hover:bg-muted/30"
                  }`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                    p.presente ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground"
                  }`}>
                    {p.presente && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium flex-1">{p.pessoa_nome}</span>
                  {p.hora_chegada && p.presente && (
                    <span className="text-[10px] text-muted-foreground">{p.hora_chegada.slice(0, 5)}</span>
                  )}
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground text-center pt-2">
                {presentesFiltrados.length} de {presentes.length} mostrados
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Convocação em massa */}
      <ConvocacaoDialog assembleia={ass} pautas={pautas} open={convOpen} onOpenChange={setConvOpen} onMarked={carregar} />
    </div>
  );
}

function ConvocacaoDialog({ assembleia, pautas, open, onOpenChange, onMarked }: {
  assembleia: GovAssembleia; pautas: GovPauta[]; open: boolean; onOpenChange: (v: boolean) => void; onMarked: () => void;
}) {
  const [lista, setLista] = useState<ConvocacaoPessoa[]>([]);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [loading, setLoadingC] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingC(true);
    listarConvocacao(assembleia.id).then(setLista).finally(() => setLoadingC(false));
    setEnviados(new Set());
  }, [open, assembleia.id]);

  function enviar(p: ConvocacaoPessoa) {
    const { url } = montarConvocacaoAssembleia(assembleia, { nome: p.pessoa_nome, telefone: p.telefone_celular }, pautas);
    window.open(url, "_blank", "noopener,noreferrer");
    setEnviados(prev => new Set([...prev, p.pessoa_id]));
  }

  async function marcarTodosEnviados() {
    try {
      await marcarConvocacaoEnviada(assembleia.id);
      toast.success("Marcada como convocação enviada");
      onMarked();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  const comTelefone = lista.filter(p => p.telefone_celular);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
            Convocação WhatsApp
          </DialogTitle>
          <DialogDescription>
            Envie a convocação para cada membro com 1 click. Os que não tem telefone aparecem no fim.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando...
          </div>
        ) : (
          <>
            {pautas.length > 0 ? (
              <div className="border rounded-md p-2 bg-purple-50/30 border-purple-200 text-[11px] mb-2">
                <p className="font-medium text-purple-900 mb-1">📋 Pauta incluída no convite ({pautas.length}):</p>
                {pautas.slice(0, 5).map((p, i) => (
                  <p key={p.id} className="truncate">{i + 1}. {p.titulo}</p>
                ))}
                {pautas.length > 5 && <p className="text-muted-foreground">+{pautas.length - 5} item(ns)...</p>}
              </div>
            ) : (
              <div className="border rounded-md p-2 bg-amber-50/30 border-amber-200 text-[11px] mb-2 text-amber-900">
                ⚠ Sem pautas vinculadas. O convite irá apenas com data e local.
              </div>
            )}
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">
                {comTelefone.length} de {lista.length} têm telefone · {enviados.size} enviado(s)
              </span>
              <Button size="sm" variant="outline" onClick={marcarTodosEnviados}>
                Marcar como enviada
              </Button>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {lista.map(p => {
                const enviado = enviados.has(p.pessoa_id);
                const semTel = !p.telefone_celular;
                return (
                  <div key={p.pessoa_id} className={`flex items-center gap-2 border rounded-md px-3 py-1.5 ${semTel ? "opacity-50" : enviado ? "bg-emerald-50 border-emerald-200" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.pessoa_nome}</p>
                      <p className="text-[10px] text-muted-foreground">{p.telefone_celular ?? "sem telefone"}</p>
                    </div>
                    {!semTel && (
                      <Button size="sm" variant={enviado ? "outline" : "default"}
                        onClick={() => enviar(p)}
                        className={`h-7 text-[11px] gap-1 ${enviado ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}>
                        {enviado ? <><Check className="w-3 h-3" /> Reenviar</> : <><Send className="w-3 h-3" /> Enviar</>}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente Pauta com botões de votação ──────────────────────────────
function PautaVotacao({ pauta, aptos, presentes, quorumAtingido, emAndamento, onChange }: {
  pauta: GovPauta;
  aptos: number; presentes: number; quorumAtingido: boolean; emAndamento: boolean;
  onChange: () => void;
}) {
  const [votosSim, setVotosSim] = useState(0);
  const [votosNao, setVotosNao] = useState(0);
  const [votosAbst, setVotosAbst] = useState(0);
  const [votosImp, setVotosImp] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState(false);

  const decidida = pauta.status === "aprovada_assembleia" || pauta.status === "rejeitada" || pauta.status === "adiada";

  async function decidir(resultado: ResultadoVoto) {
    if (!emAndamento) { toast.error("Inicie a assembleia para votar"); return; }
    if (!quorumAtingido) {
      if (!confirm("Quórum não atingido! Deseja registrar a votação mesmo assim?")) return;
    }
    setBusy(true);
    try {
      await decidirPauta(pauta.id, resultado, {
        sim: votosSim, nao: votosNao, abstencao: votosAbst, impedimento: votosImp,
      }, observacao);
      toast.success(`Pauta ${resultado}!`);
      setAberto(false);
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  // Auto-aprovação simples: todos os presentes votam sim
  function autoVotos(resultado: ResultadoVoto) {
    if (resultado === "aprovada") {
      setVotosSim(presentes); setVotosNao(0); setVotosAbst(0); setVotosImp(0);
    } else if (resultado === "rejeitada") {
      setVotosSim(0); setVotosNao(presentes); setVotosAbst(0); setVotosImp(0);
    } else {
      setVotosSim(0); setVotosNao(0); setVotosAbst(presentes); setVotosImp(0);
    }
  }

  const cardCor = pauta.status === "aprovada_assembleia" ? "border-emerald-300 bg-emerald-50/20"
    : pauta.status === "rejeitada" ? "border-rose-300 bg-rose-50/20"
    : pauta.status === "adiada" ? "border-amber-300 bg-amber-50/20"
    : "";

  return (
    <Card className={cardCor}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{pauta.titulo}</p>
            {pauta.descricao && (
              <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{pauta.descricao}</p>
            )}
            {pauta.vinculo_tipo === "solicitacao_membresia" && pauta.vinculo_id && (
              <Link to={`/membresia/${pauta.vinculo_id}`} className="text-[10px] text-primary underline">
                → ver solicitação
              </Link>
            )}
          </div>
          <Badge variant="outline" className={`text-[9px] shrink-0 ${
            pauta.status === "aprovada_assembleia" ? "bg-emerald-100 text-emerald-700 border-emerald-300" :
            pauta.status === "rejeitada" ? "bg-rose-100 text-rose-700 border-rose-300" :
            pauta.status === "adiada" ? "bg-amber-100 text-amber-700 border-amber-300" :
            "bg-blue-100 text-blue-700 border-blue-300"
          }`}>
            {PAUTA_STATUS_LABEL[pauta.status]}
          </Badge>
        </div>

        {/* Já decidida — mostra resultado */}
        {decidida && (
          <div className="border-t pt-2 mt-2 text-[11px] space-y-0.5">
            <p className="font-medium">Resultado: <strong>{pauta.decisao}</strong></p>
            <p className="text-muted-foreground">
              ✓ {pauta.votos_sim} sim · ✗ {pauta.votos_nao} não · ⚬ {pauta.votos_abstencao} abst. · ⊘ {pauta.votos_impedimento} imp.
            </p>
            {pauta.observacao_decisao && (
              <p className="italic text-muted-foreground">"{pauta.observacao_decisao}"</p>
            )}
          </div>
        )}

        {/* Não decidida — botões grandes */}
        {!decidida && !aberto && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Button size="sm" onClick={() => { setAberto(true); autoVotos("aprovada"); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
            </Button>
            <Button size="sm" onClick={() => { setAberto(true); autoVotos("rejeitada"); }}
              variant="outline" className="text-rose-700 border-rose-300 gap-1.5">
              <ThumbsDown className="w-3.5 h-3.5" /> Rejeitar
            </Button>
            <Button size="sm" onClick={() => { setAberto(true); autoVotos("adiada"); }}
              variant="outline" className="text-amber-700 border-amber-300 gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Adiar
            </Button>
          </div>
        )}

        {/* Modo edição — votos detalhados */}
        {!decidida && aberto && (
          <div className="border-t pt-2 mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Ajuste os votos (auto-preenchido com {presentes} presentes):
            </p>
            <div className="grid grid-cols-4 gap-1">
              <div>
                <Label className="text-[10px]">✓ Sim</Label>
                <Input type="number" min={0} value={votosSim} onChange={(e) => setVotosSim(Number(e.target.value) || 0)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">✗ Não</Label>
                <Input type="number" min={0} value={votosNao} onChange={(e) => setVotosNao(Number(e.target.value) || 0)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">⚬ Abstenção</Label>
                <Input type="number" min={0} value={votosAbst} onChange={(e) => setVotosAbst(Number(e.target.value) || 0)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">⊘ Impedimento</Label>
                <Input type="number" min={0} value={votosImp} onChange={(e) => setVotosImp(Number(e.target.value) || 0)} className="h-7 text-xs" />
              </div>
            </div>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação (opcional)" className="text-xs" />
            <div className="grid grid-cols-4 gap-1">
              <Button size="sm" onClick={() => decidir("aprovada")} disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Aprovar</Button>
              <Button size="sm" onClick={() => decidir("rejeitada")} disabled={busy}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs">Rejeitar</Button>
              <Button size="sm" onClick={() => decidir("adiada")} disabled={busy}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs">Adiar</Button>
              <Button size="sm" variant="outline" onClick={() => setAberto(false)} disabled={busy} className="text-xs">Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
