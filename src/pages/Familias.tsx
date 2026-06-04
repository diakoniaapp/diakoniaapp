import { useEffect, useState } from "react";
import { CamposEndereco } from "@/components/ui/CamposEndereco";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Home, Users, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { VinculosDialog } from "@/components/familias/VinculosDialog";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";

interface Familia {
  id: string;
  nome_familia: string;
  bairro: string | null;
  cidade: string | null;
  endereco: string | null;
  observacoes: string | null;
}

export default function Familias() {
  const { canEdit } = useAuth();
  const [familias, setFamilias]           = useState<Familia[]>([]);
  const [counts, setCounts]               = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [open, setOpen]                   = useState(false);
  const [form, setForm]                   = useState({ nome_familia: "", endereco: "", bairro: "", cidade: "", observacoes: "" });
  const [vinculosOpen, setVinculosOpen]   = useState(false);
  const [familiaSelecionada, setFamiliaSelecionada] = useState<Familia | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [searchParams, setSearchParams]   = useSearchParams();

  // ── Exclusão ─────────────────────────────────────────────────────────────
  const [familiaParaExcluir, setFamiliaParaExcluir] = useState<Familia | null>(null);
  const [excluindo, setExcluindo]                   = useState(false);

  useEffect(() => {
    if (searchParams.get("novo") === "1" && canEdit) {
      setOpen(true);
      searchParams.delete("novo");
      searchParams.delete("t");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, canEdit, setSearchParams]);

  const load = async () => {
    setLoading(true);
    setLoadingCounts(true);
    setError(null);
    const { data, error } = await supabase
      .from("familias")
      .select("*, vinculos_familiares(count)")
      .order("nome_familia");
    if (error) { toast.error(error.message); setError(error.message); }
    const rows = (data ?? []) as any[];
    setFamilias(rows as Familia[]);
    const c: Record<string, number> = {};
    rows.forEach((f: any) => { c[f.id] = f.vinculos_familiares?.[0]?.count ?? 0; });
    setCounts(c);
    setLoadingCounts(false);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    payload.nome_familia = (payload.nome_familia ?? "").replace(/^\s*fam[ií]lia\s+/i, "").trim();
    if (!payload.nome_familia) return toast.error("Informe o sobrenome da família (sem o prefixo 'Família').");
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
    const { error } = await supabase.from("familias").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Família cadastrada");
    setForm({ nome_familia: "", endereco: "", bairro: "", cidade: "", observacoes: "" });
    setOpen(false);
    load();
  };

  // Desvincula membros e exclui o núcleo familiar
  const confirmarExclusao = async () => {
    if (!familiaParaExcluir) return;
    setExcluindo(true);
    try {
      // 1. Desvincular membros (nullifica familia_id)
      await supabase.from("membros").update({ familia_id: null }).eq("familia_id", familiaParaExcluir.id);
      // 2. Remover vínculos familiares
      await supabase.from("vinculos_familiares").delete().eq("familia_id", familiaParaExcluir.id);
      // 3. Excluir a família
      const { error } = await supabase.from("familias").delete().eq("id", familiaParaExcluir.id);
      if (error) { toast.error("Erro ao excluir: " + error.message); return; }
      toast.success(`Família ${familiaParaExcluir.nome_familia} excluída`);
      setFamiliaParaExcluir(null);
      load();
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Famílias"
        description={`${familias.length} núcleos familiares`}
        actions={canEdit && <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />Nova família</Button>}
      />
      <div className="p-4 md:p-8">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : familias.length === 0 ? (
          <EmptyState message="Nenhuma família cadastrada" />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {familias.map((f) => (
              <Card key={f.id} className="shadow-card-soft">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md bg-gold/15 flex items-center justify-center">
                      <Home className="w-5 h-5 text-gold" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-serif text-xl">Família {f.nome_familia}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[f.endereco, f.bairro, f.cidade].filter(Boolean).join(", ") || "—"}
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {loadingCounts ? "…" : `${counts[f.id] ?? 0} membros vinculados`}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setFamiliaSelecionada(f); setVinculosOpen(true); }}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1.5" /> Vínculos familiares
                        </Button>
                        {canEdit && (
                          <Button
                            variant="outline" size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                            onClick={() => setFamiliaParaExcluir(f)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir família
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialog: Nova família ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Nova família</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Sobrenome da família *</Label>
              <Input
                required placeholder="Ex.: Barreto"
                value={form.nome_familia}
                onChange={(e) => setForm({ ...form, nome_familia: e.target.value.replace(/^\s*fam[ií]lia\s+/i, "") })}
              />
              <p className="text-xs text-muted-foreground mt-1">Não inclua o prefixo "Família" — ele é exibido automaticamente.</p>
            </div>
            <CamposEndereco
              cep={(form as any).cep ?? ""}
              endereco={form.endereco ?? ""}
              bairro={form.bairro ?? ""}
              cidade={form.cidade ?? ""}
              onChange={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
              mostrarNumero={false}
              mostrarComplemento={false}
            />
            <div><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar exclusão ── */}
      <Dialog open={!!familiaParaExcluir} onOpenChange={(v) => { if (!v) setFamiliaParaExcluir(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-destructive">Excluir núcleo familiar</DialogTitle>
            <DialogDescription className="pt-2">
              Tem certeza que deseja excluir a{" "}
              <strong>Família {familiaParaExcluir?.nome_familia}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 mt-1">
            ⚠️ Os membros vinculados <strong>não serão excluídos</strong> — apenas o vínculo familiar será removido.
            Você poderá reconstruir o núcleo a qualquer momento.
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setFamiliaParaExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Sim, excluir família"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Vínculos ── */}
      <VinculosDialog
        open={vinculosOpen}
        onOpenChange={(v) => { setVinculosOpen(v); if (!v) load(); }}
        familiaId={familiaSelecionada?.id ?? null}
        familiaNome={familiaSelecionada?.nome_familia}
      />
    </div>
  );
}
