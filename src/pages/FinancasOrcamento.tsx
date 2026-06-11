import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Target, Plus, Loader2, TrendingUp, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarOrcamentoVsReal, listarCentrosComResumo, criarOrcamento, excluirOrcamento,
  brl, type FinOrcamentoVsReal, type FinCentroResumo,
} from "@/services/finService";

export default function FinancasOrcamento() {
  const [orc, setOrc] = useState<FinOrcamentoVsReal[]>([]);
  const [centros, setCentros] = useState<FinCentroResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [centroId, setCentroId] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [mensal, setMensal] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [o, cs] = await Promise.all([
        listarOrcamentoVsReal(),
        listarCentrosComResumo(),
      ]);
      setOrc(o);
      setCentros(cs);
    } finally { setLoading(false); }
  }

  async function adicionar() {
    if (!centroId) { toast.error("Selecione o centro"); return; }
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    setBusy(true);
    try {
      const hoje = new Date();
      await criarOrcamento({
        ano: hoje.getFullYear(),
        mes: mensal ? hoje.getMonth() + 1 : null,
        centro_custo_id: centroId,
        valor_planejado: valor,
      });
      toast.success("Orçamento salvo");
      setDlgOpen(false); setCentroId(""); setValor(0);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function deletar(id: string) {
    if (!confirm("Excluir esta linha de orçamento?")) return;
    try {
      await excluirOrcamento(id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando orçamento...
  </div>;

  const acimaLimite = orc.filter(o => Number(o.percentual_consumido) >= 100).length;
  const proximoLimite = orc.filter(o => Number(o.percentual_consumido) >= 80 && Number(o.percentual_consumido) < 100).length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Target className="w-5 h-5 text-gold" /> Orçamento
          </h1>
          <p className="text-xs text-muted-foreground">
            Planeje gastos por centro de custo — acompanhe real vs planejado.
          </p>
        </div>
        <Button onClick={() => setDlgOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Nova linha
        </Button>
      </div>

      {/* Stats */}
      {orc.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="py-2 px-3">
              <p className="text-[10px] uppercase text-muted-foreground">Linhas</p>
              <p className="text-base font-semibold">{orc.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-rose-50/30 border-rose-200">
            <CardContent className="py-2 px-3">
              <p className="text-[10px] uppercase text-rose-700">Acima do limite</p>
              <p className="text-base font-semibold text-rose-700">{acimaLimite}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50/30 border-amber-200">
            <CardContent className="py-2 px-3">
              <p className="text-[10px] uppercase text-amber-700">≥ 80%</p>
              <p className="text-base font-semibold text-amber-700">{proximoLimite}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {orc.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <Target className="w-10 h-10 mx-auto opacity-30" />
            <p>Ainda sem orçamento.</p>
            <p className="text-[11px]">Defina quanto cada centro pode gastar por mês.</p>
            <Button onClick={() => setDlgOpen(true)} variant="outline" className="gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Definir primeiro orçamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orc.map(o => {
            const pct = Number(o.percentual_consumido);
            const corBarra = pct >= 100 ? "bg-rose-600" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <Card key={o.id}>
                <CardContent className="py-2.5 px-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate flex items-center gap-1.5">
                        {o.centro_nome}
                        {pct >= 100 && <Badge variant="outline" className="text-[9px] bg-rose-100 text-rose-700 border-rose-300">Estourou</Badge>}
                        {pct >= 80 && pct < 100 && <Badge variant="outline" className="text-[9px] bg-amber-100 text-amber-700 border-amber-300">Alerta</Badge>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {o.mes ? `Mês ${String(o.mes).padStart(2, "0")}/${o.ano}` : `Ano ${o.ano}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {brl(Number(o.valor_real))} / <span className="text-muted-foreground">{brl(Number(o.valor_planejado))}</span>
                      </p>
                      <p className={`text-[10px] font-medium ${pct >= 100 ? "text-rose-700" : pct >= 80 ? "text-amber-700" : "text-emerald-700"}`}>
                        {pct.toFixed(1)}% consumido
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => deletar(o.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className={corBarra + " h-full transition-all"} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Nova linha */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Target className="w-5 h-5 text-gold" /> Definir orçamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Centro de custo *</Label>
              <Select value={centroId} onValueChange={setCentroId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor planejado (R$) *</Label>
              <Input type="number" step="0.01" min={0.01}
                value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button type="button" size="sm" variant={mensal ? "default" : "outline"} onClick={() => setMensal(true)}>
                Mensal
              </Button>
              <Button type="button" size="sm" variant={!mensal ? "default" : "outline"} onClick={() => setMensal(false)}>
                Anual
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              {mensal ? "Aplica para este mês" : "Aplica para todo o ano"}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDlgOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={adicionar} disabled={busy}>{busy ? "..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
