import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, RotateCw, Plus, Pencil, Trash2, PowerOff, RotateCcw,
  TrendingUp, TrendingDown, Loader2, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarRecorrencias, atualizarRecorrencia, excluirRecorrencia,
  gerarRecorrencias, FREQUENCIA_LABEL, brl,
  type FinRecorrencia,
} from "@/services/finService";
import { RecorrenciaForm } from "@/components/financas/RecorrenciaForm";
import { PaginaSkeleton } from "@/components/ListState";

export default function FinancasRecorrencias() {
  const [recs, setRecs] = useState<FinRecorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<FinRecorrencia | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const r = await listarRecorrencias(true);
      setRecs(r);
    } finally { setLoading(false); }
  }

  async function gerarTodos() {
    setGerando(true);
    try {
      const qtd = await gerarRecorrencias();
      toast.success(`${qtd} lançamento(s) previsto(s) gerado(s)`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setGerando(false); }
  }

  async function toggle(r: FinRecorrencia) {
    await atualizarRecorrencia(r.id, { ativo: !r.ativo });
    await carregar();
  }

  async function excluir(r: FinRecorrencia) {
    if (!confirm(`Excluir "${r.descricao}"? Os lançamentos previstos ja gerados ficam.`)) return;
    try {
      await excluirRecorrencia(r.id);
      toast.success("Excluído");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <RotateCw className="w-5 h-5 text-gold" /> Recorrências
          </h1>
          <p className="text-xs text-muted-foreground">
            Despesas e receitas que se repetem. O sistema gera lançamentos previstos automaticamente.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={gerarTodos} disabled={gerando}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {gerando ? "..." : "Gerar próximos"}
        </Button>
        <Button onClick={() => { setEditando(null); setOpen(true); }}
          className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Nova
        </Button>
      </div>

      {recs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <RotateCw className="w-10 h-10 mx-auto opacity-30" />
            <p>Ainda sem recorrências. Cadastre aluguel, salários, energia, etc.</p>
            <Button onClick={() => setOpen(true)} variant="outline" className="gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Criar a primeira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {recs.map(r => (
            <div key={r.id} className={`flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30 ${!r.ativo ? "opacity-60 border-dashed" : ""}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {r.tipo === "entrada"
                  ? <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  : <TrendingDown className="w-4 h-4 text-rose-700 dark:text-rose-400" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate flex items-center gap-1.5">
                    {r.descricao}
                    {!r.ativo && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:text-amber-400 border-amber-300">Inativa</Badge>}
                    {r.valor_variavel && <Badge variant="outline" className="text-xs">variável</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {FREQUENCIA_LABEL[r.frequencia]} · todo dia {r.dia_vencimento}
                  </p>
                </div>
              </div>
              <p className={`text-sm font-semibold tabular-nums mr-2 ${r.tipo === "entrada" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                {r.tipo === "entrada" ? "+" : "−"} {brl(Number(r.valor))}
              </p>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { setEditando(r); setOpen(true); }} title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => toggle(r)} title={r.ativo ? "Desativar" : "Reativar"}>
                  {r.ativo ? <PowerOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" /> : <RotateCcw className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />}
                </Button>
                <Button type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive" onClick={() => excluir(r)} title="Excluir">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecorrenciaForm open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditando(null); }}
        recorrencia={editando} onSaved={carregar} />
    </div>
  );
}
