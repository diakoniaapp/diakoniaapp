import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Home, Users, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { VinculosDialog } from "@/components/familias/VinculosDialog";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";

interface Familia { id: string; nome_familia: string; bairro: string|null; cidade: string|null; endereco: string|null; observacoes: string|null; }

export default function Familias() {
  const { canEdit } = useAuth();
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome_familia: "", endereco: "", bairro: "", cidade: "", observacoes: "" });
  const [vinculosOpen, setVinculosOpen] = useState(false);
  const [familiaSelecionada, setFamiliaSelecionada] = useState<Familia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
    if (error) {
      toast.error(error.message);
      setError(error.message);
    }
    const rows = (data ?? []) as any[];
    setFamilias(rows as Familia[]);
    const c: Record<string, number> = {};
    rows.forEach((f: any) => {
      c[f.id] = f.vinculos_familiares?.[0]?.count ?? 0;
    });
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
    Object.keys(payload).forEach(k=>{ if(payload[k]==="") payload[k]=null; });
    const { error } = await supabase.from("familias").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Família cadastrada");
    setForm({ nome_familia: "", endereco: "", bairro: "", cidade: "", observacoes: "" });
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Famílias"
        description={`${familias.length} núcleos familiares`}
        actions={canEdit && <Button onClick={()=>setOpen(true)}><Plus className="w-4 h-4 mr-2"/>Nova família</Button>}
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
        {familias.map((f)=>(
          <Card key={f.id} className="shadow-card-soft">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-gold/15 flex items-center justify-center"><Home className="w-5 h-5 text-gold"/></div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl">Família {f.nome_familia}</h3>
                  <p className="text-sm text-muted-foreground">{[f.endereco, f.bairro, f.cidade].filter(Boolean).join(", ") || "—"}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5"/>
                    {loadingCounts ? "…" : `${counts[f.id] ?? 0} membros vinculados`}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setFamiliaSelecionada(f); setVinculosOpen(true); }}
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" /> Vínculos familiares
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif text-2xl">Nova família</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Sobrenome da família *</Label>
              <Input
                required
                placeholder="Ex.: Barreto"
                value={form.nome_familia}
                onChange={(e)=>setForm({...form, nome_familia: e.target.value.replace(/^\s*fam[ií]lia\s+/i, "")})}
              />
              <p className="text-xs text-muted-foreground mt-1">Não inclua o prefixo "Família" — ele é exibido automaticamente.</p>
            </div>
            <div><Label>Endereço</Label><Input value={form.endereco} onChange={(e)=>setForm({...form, endereco: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e)=>setForm({...form, bairro: e.target.value})}/></div>
              <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e)=>setForm({...form, cidade: e.target.value})}/></div>
            </div>
            <div><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e)=>setForm({...form, observacoes: e.target.value})}/></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <VinculosDialog
        open={vinculosOpen}
        onOpenChange={(v) => { setVinculosOpen(v); if (!v) load(); }}
        familiaId={familiaSelecionada?.id ?? null}
        familiaNome={familiaSelecionada?.nome_familia}
      />
    </div>
  );
}