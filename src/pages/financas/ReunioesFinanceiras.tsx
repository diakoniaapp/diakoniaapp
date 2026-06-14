import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays, Plus, Loader2, FileText, Sparkles, ChevronRight,
  ArrowLeft, Printer, Trash2, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarReunioes, carregarReuniao, criarReuniao, atualizarReuniao, excluirReuniao,
  gerarESalvarPauta, listarDecisoes, adicionarDecisao,
  type ReuniaoFinanceira, type DecisaoReuniao, type PautaFinanceira,
} from "@/services/reunioesFinanceirasService";

const STATUS_COR: Record<string, string> = {
  agendada: "bg-blue-50 text-blue-700 border-blue-200",
  em_andamento: "bg-amber-50 text-amber-700 border-amber-200",
  realizada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelada: "bg-muted text-muted-foreground border-border line-through",
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada", em_andamento: "Em andamento",
  realizada: "Realizada", cancelada: "Cancelada",
};

export default function ReunioesFinanceiras() {
  const [lista, setLista] = useState<ReuniaoFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [verId, setVerId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try { setLista(await listarReunioes()); }
    finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, []);

  if (verId) {
    return <DetalheReuniao id={verId} voltar={() => { setVerId(null); carregar(); }} />;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl md:text-2xl">Reuniões financeiras</h1>
        <Button size="sm" className="ml-auto gap-2" onClick={() => setNovoOpen(true)}>
          <Plus className="w-4 h-4" /> Nova reunião
        </Button>
      </header>
      <p className="text-xs text-muted-foreground">
        Pauta automática, decisões viram assuntos, PDF imprimível pra distribuir aos membros.
      </p>

      {loading && (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
        </div>
      )}

      {!loading && lista.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma reunião financeira ainda. Clique em "Nova reunião" pra começar.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {lista.map(r => (
          <Card key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={() => setVerId(r.id)}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm">{r.titulo}</span>
                  <Badge variant="outline" className={`text-[9px] ${STATUS_COR[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">{r.periodicidade}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.data_reuniao).toLocaleString("pt-BR")}
                  {" · "}competência: {new Date(r.competencia_inicio + "T00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                  {" → "}{new Date(r.competencia_fim + "T00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      <NovaReuniaoDialog open={novoOpen} onOpenChange={setNovoOpen}
        onSaved={(id) => { setNovoOpen(false); carregar(); setVerId(id); }} />
    </div>
  );
}

// ─── Dialog: Nova reunião ──────────────────────────────────────────────
function NovaReuniaoDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: (id: string) => void;
}) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);

  const [form, setForm] = useState({
    titulo: `Reunião financeira — ${hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
    periodicidade: "mensal" as const,
    competencia_inicio: inicio,
    competencia_fim: fim,
    data_reuniao: new Date(hoje.getTime() + 7 * 86_400_000).toISOString().slice(0,16),
    local: "",
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await criarReuniao({
        ...form,
        data_reuniao: new Date(form.data_reuniao).toISOString(),
      } as any);
      toast.success("Reunião criada — agora gere a pauta automática");
      onSaved(r.id);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova reunião financeira</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Título">
            <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Periodicidade">
              <Select value={form.periodicidade} onValueChange={(v) => setForm({ ...form, periodicidade: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="extraordinaria">Extraordinária</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data e hora">
              <Input type="datetime-local" value={form.data_reuniao}
                onChange={e => setForm({ ...form, data_reuniao: e.target.value })} />
            </Field>
            <Field label="Competência - início">
              <Input type="date" value={form.competencia_inicio}
                onChange={e => setForm({ ...form, competencia_inicio: e.target.value })} />
            </Field>
            <Field label="Competência - fim">
              <Input type="date" value={form.competencia_fim}
                onChange={e => setForm({ ...form, competencia_fim: e.target.value })} />
            </Field>
          </div>
          <Field label="Local">
            <Input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })}
              placeholder="Sala 1, Templo, Online..." />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="gap-2">
              {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Criar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tela: Detalhe da reunião ──────────────────────────────────────────
function DetalheReuniao({ id, voltar }: { id: string; voltar: () => void }) {
  const [reuniao, setReuniao] = useState<ReuniaoFinanceira | null>(null);
  const [decisoes, setDecisoes] = useState<DecisaoReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [novaDecisao, setNovaDecisao] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        carregarReuniao(id),
        listarDecisoes(id),
      ]);
      setReuniao(r); setDecisoes(d);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); }, [id]);

  async function gerarPauta() {
    if (!reuniao) return;
    setGerando(true);
    try {
      await gerarESalvarPauta(reuniao.id, reuniao.competencia_inicio, reuniao.competencia_fim);
      toast.success("Pauta gerada automaticamente");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    } finally {
      setGerando(false);
    }
  }

  async function addDecisao() {
    if (!novaDecisao.trim()) return;
    try {
      await adicionarDecisao({
        reuniao_id: id,
        descricao: novaDecisao,
        prazo: novoPrazo || null,
      });
      setNovaDecisao(""); setNovoPrazo("");
      toast.success("Decisão registrada (vira assunto automaticamente)");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  async function marcarRealizada() {
    if (!reuniao) return;
    if (!confirm("Marcar como realizada e arquivar a pauta?")) return;
    await atualizarReuniao(id, { status: "realizada" });
    toast.success("Reunião arquivada");
    await carregar();
  }

  async function excluir() {
    if (!confirm("Excluir reunião? As decisões viraram assuntos e ficam preservadas.")) return;
    await excluirReuniao(id);
    voltar();
  }

  if (loading || !reuniao) {
    return <div className="py-8 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>;
  }

  const pauta = reuniao.pauta_jsonb;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4 print:max-w-full">
      <header className="flex items-center gap-2 print:hidden">
        <Button size="sm" variant="ghost" onClick={voltar} className="gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </Button>
        <h1 className="font-serif text-lg md:text-xl flex-1 truncate">{reuniao.titulo}</h1>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </Button>
        {reuniao.status !== "realizada" && (
          <Button size="sm" variant="outline" onClick={marcarRealizada} className="gap-1.5 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Marcar realizada
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={excluir} className="gap-1.5 text-rose-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </header>

      {/* Cabeçalho imprimível */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
        <p className="text-sm text-muted-foreground">Relatório Financeiro Pré-Reunião</p>
        <h2 className="text-xl mt-3 font-serif">{reuniao.titulo}</h2>
        <p className="text-xs">{new Date(reuniao.data_reuniao).toLocaleString("pt-BR")} · {reuniao.local}</p>
      </div>

      {/* Pauta automática */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between print:hidden">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-gold" /> Pauta automática
          </CardTitle>
          <Button size="sm" onClick={gerarPauta} disabled={gerando} className="gap-2">
            {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {pauta ? "Regerar pauta" : "Gerar pauta automática"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!pauta && (
            <p className="text-xs text-muted-foreground text-center py-3">
              Pauta ainda não gerada. Clique em "Gerar pauta automática" pra coletar dados do período.
            </p>
          )}
          {pauta && <PautaView pauta={pauta} />}
        </CardContent>
      </Card>

      {/* Decisões */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decisões da reunião</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {decisoes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhuma decisão registrada ainda.
            </p>
          )}
          {decisoes.map((d, idx) => (
            <div key={d.id} className="flex items-start gap-2 border rounded-md p-2">
              <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
              <div className="flex-1">
                <p className="text-sm">{d.descricao}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {d.responsavel_nome && `Resp.: ${d.responsavel_nome}`}
                  {d.prazo && ` · Prazo: ${new Date(d.prazo + "T00:00").toLocaleDateString("pt-BR")}`}
                  {d.assunto_id && <Badge variant="outline" className="text-[9px] ml-1.5">↗ virou assunto</Badge>}
                </p>
              </div>
              <Badge variant="outline" className="text-[9px]">{d.status}</Badge>
            </div>
          ))}

          <div className="border-t pt-3 print:hidden">
            <Label className="text-xs">Registrar nova decisão</Label>
            <Textarea
              placeholder="Ex: Aprovar campanha de Natal com meta R$ 50.000"
              value={novaDecisao}
              onChange={e => setNovaDecisao(e.target.value)}
              className="mt-1"
            />
            <div className="flex gap-2 mt-2">
              <Input type="date" value={novoPrazo} onChange={e => setNovoPrazo(e.target.value)}
                placeholder="Prazo" className="text-xs" />
              <Button size="sm" onClick={addDecisao} disabled={!novaDecisao.trim()} className="gap-2 shrink-0">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Visualização da pauta ────────────────────────────────────────────
function PautaView({ pauta }: { pauta: PautaFinanceira }) {
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR");

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2">
        <Bloco titulo="Entradas">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="font-medium font-serif">{fmtBR(pauta.resumo.entradas)}</span>
          </div>
        </Bloco>
        <Bloco titulo="Saídas">
          <div className="flex items-center gap-1.5 text-rose-700">
            <TrendingDown className="w-3.5 h-3.5" />
            <span className="font-medium font-serif">{fmtBR(pauta.resumo.saidas)}</span>
          </div>
        </Bloco>
        <Bloco titulo="Saldo do período">
          <span className={"font-medium font-serif " + (pauta.resumo.saldo_periodo >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {fmtBR(pauta.resumo.saldo_periodo)}
          </span>
        </Bloco>
      </div>

      {/* Contas a pagar */}
      {pauta.contas_a_pagar.qtd > 0 && (
        <Secao titulo={`Contas a pagar (próximos 60 dias) — ${pauta.contas_a_pagar.qtd} · ${fmtBR(pauta.contas_a_pagar.total)}`}>
          <ul className="text-xs divide-y">
            {pauta.contas_a_pagar.lista.slice(0, 8).map(c => (
              <li key={c.id} className="py-1 flex items-center gap-2">
                <span className="flex-1 truncate">{c.descricao}</span>
                <span className="text-muted-foreground tabular-nums">{fmtData(c.vencimento)}</span>
                <span className="font-medium tabular-nums">{fmtBR(c.valor)}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Top centros de custo */}
      {pauta.top_centros_custo.length > 0 && (
        <Secao titulo="Top 5 centros de custo">
          <ul className="text-xs divide-y">
            {pauta.top_centros_custo.map((c, i) => (
              <li key={i} className="py-1 flex items-center gap-2">
                <span className="flex-1 truncate">{c.nome}</span>
                <span className="font-medium tabular-nums">{fmtBR(c.total)}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Alertas fiscais */}
      {pauta.alertas_fiscais.length > 0 && (
        <Secao titulo={`Alertas fiscais — ${pauta.alertas_fiscais.length}`} icone={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}>
          <ul className="text-xs divide-y">
            {pauta.alertas_fiscais.map((a, i) => (
              <li key={i} className="py-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">{a.codigo}</Badge>
                <span className="flex-1">vencimento {fmtData(a.vencimento)}</span>
                <Badge variant="outline" className="text-[9px]">{a.status}</Badge>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Orçamento estourado */}
      {pauta.orcamento_estourado.length > 0 && (
        <Secao titulo="Orçamento próximo do limite (≥90%)" icone={<AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}>
          <ul className="text-xs divide-y">
            {pauta.orcamento_estourado.map((o, i) => (
              <li key={i} className="py-1 flex items-center gap-2">
                <span className="flex-1 truncate">{o.centro}</span>
                <span className="text-muted-foreground tabular-nums">{fmtBR(o.realizado)} / {fmtBR(o.orcado)}</span>
                <Badge variant="outline" className={"text-[9px] " + (o.percentual >= 100 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}>
                  {o.percentual?.toFixed(1)}%
                </Badge>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <p className="text-[10px] text-muted-foreground text-right">
        Pauta gerada em {new Date(pauta.gerada_em).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {children}
    </div>
  );
}
function Secao({ titulo, children, icone }: { titulo: string; children: React.ReactNode; icone?: React.ReactNode }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs font-medium mb-2 flex items-center gap-1.5">{icone}{titulo}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
