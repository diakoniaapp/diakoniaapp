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
import { Plus, Home, Users, Link2, Trash2, Pencil, Crown, Heart, CalendarHeart, Search, AlertCircle } from "lucide-react";
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
  numero: string | null;
  complemento: string | null;
  cep: string | null;
  data_casamento: string | null;
  observacoes: string | null;
}

export default function Familias() {
  const { canEdit } = useAuth();
  const [familias, setFamilias]           = useState<Familia[]>([]);
  const [counts, setCounts]               = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [open, setOpen]                   = useState(false);
  const [form, setForm]                   = useState({ nome_familia: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "", data_casamento: "", observacoes: "" });
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [responsaveis, setResponsaveis]   = useState<Record<string, string>>({});
  // F1: busca por nome
  const [busca, setBusca] = useState("");
  // F2: lista de membros por familia
  const [membrosPorFamilia, setMembrosPorFamilia] = useState<Record<string, { id: string; nome: string }[]>>({});
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

    // Carregar TODOS os vinculos para popular responsaveis + lista de membros
    if (rows.length > 0) {
      const { data: vincs } = await supabase
        .from("vinculos_familiares")
        .select("familia_id, membro_id, responsavel_familia, membros(id, nome_completo)")
        .in("familia_id", rows.map((r: any) => r.id));
      const respMap: Record<string, string> = {};
      const memMap: Record<string, { id: string; nome: string }[]> = {};
      (vincs ?? []).forEach((v: any) => {
        if (!v.membros) return;
        const nome = v.membros.nome_completo;
        if (v.responsavel_familia && v.familia_id) respMap[v.familia_id] = nome;
        if (!memMap[v.familia_id]) memMap[v.familia_id] = [];
        memMap[v.familia_id].push({ id: v.membros.id, nome });
      });
      setResponsaveis(respMap);
      setMembrosPorFamilia(memMap);
    }
  };

  const iniciaisDe = (nome: string) =>
    nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    payload.nome_familia = (payload.nome_familia ?? "").replace(/^\s*fam[ií]lia\s+/i, "").trim();
    if (!payload.nome_familia) return toast.error("Informe o sobrenome da família (sem o prefixo 'Família').");
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
    let error;
    if (editingId) {
      ({ error } = await supabase.from("familias").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("familias").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Família atualizada" : "Família cadastrada");
    setForm({ nome_familia: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "", data_casamento: "", observacoes: "" });
    setEditingId(null);
    setOpen(false);
    load();
  };

  function abrirEdicao(f: Familia) {
    setEditingId(f.id);
    setForm({
      nome_familia: f.nome_familia,
      endereco: f.endereco ?? "",
      numero: f.numero ?? "",
      complemento: f.complemento ?? "",
      bairro: f.bairro ?? "",
      cidade: f.cidade ?? "",
      cep: f.cep ?? "",
      data_casamento: f.data_casamento ?? "",
      observacoes: f.observacoes ?? "",
    });
    setOpen(true);
  }

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
          <>
            <div className="mb-4 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, bairro, cidade, responsável ou membro..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {familias
              .filter(f => {
                const q = busca.trim().toLowerCase();
                if (!q) return true;
                return f.nome_familia.toLowerCase().includes(q)
                  || (f.bairro ?? "").toLowerCase().includes(q)
                  || (f.cidade ?? "").toLowerCase().includes(q)
                  || (responsaveis[f.id] ?? "").toLowerCase().includes(q)
                  || (membrosPorFamilia[f.id] ?? []).some(m => m.nome.toLowerCase().includes(q));
              })
              .map((f) => (
              <Card key={f.id} className="shadow-card-soft">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md bg-gold/15 flex items-center justify-center">
                      <Home className="w-5 h-5 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-xl truncate">Família {f.nome_familia}</h3>
                        {canEdit && (
                          <Button
                            type="button" variant="ghost" size="icon"
                            onClick={() => abrirEdicao(f)}
                            className="h-7 w-7 shrink-0"
                            title="Editar família"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      {!responsaveis[f.id] && (counts[f.id] ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-full px-2 py-0.5 mt-1">
                          <AlertCircle className="w-3 h-3" /> Sem responsável
                        </span>
                      )}
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {[f.endereco, f.numero, f.bairro, f.cidade].filter(Boolean).join(", ") || "—"}
                      </p>
                      {responsaveis[f.id] && (
                        <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 flex items-center gap-1">
                          <Crown className="w-3 h-3" /> {responsaveis[f.id]}
                        </p>
                      )}
                      {f.data_casamento && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Heart className="w-3 h-3 text-rose-400" /> Casados em {new Date(f.data_casamento).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {loadingCounts ? "…" : `${counts[f.id] ?? 0} membros vinculados`}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setFamiliaSelecionada(f); setVinculosOpen(true); }}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1.5" /> Visualizar família
                        </Button>

                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
          </>
        )}
      </div>

      {/* ── Dialog: Nova/Editar família ── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm({ nome_familia: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "", data_casamento: "", observacoes: "" }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editingId ? "Editar família" : "Nova família"}
            </DialogTitle>
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

            <div>
              <Label className="flex items-center gap-1.5">
                <CalendarHeart className="w-3.5 h-3.5 text-rose-500" /> Data de casamento (opcional)
              </Label>
              <Input
                type="date"
                value={form.data_casamento ?? ""}
                onChange={(e) => setForm({ ...form, data_casamento: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Usado pra calcular bodas e mostrar evento na agenda.</p>
            </div>

            <h4 className="text-sm font-semibold text-muted-foreground pt-1">Endereço da família</h4>
            <CamposEndereco
              cep={form.cep ?? ""}
              endereco={form.endereco ?? ""}
              numero={form.numero ?? ""}
              complemento={form.complemento ?? ""}
              bairro={form.bairro ?? ""}
              cidade={form.cidade ?? ""}
              onChange={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
              mostrarNumero
              mostrarComplemento
            />

            <div><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
              {editingId && canEdit && (
                <Button
                  type="button" variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto gap-2"
                  onClick={() => {
                    const fam = familias.find(x => x.id === editingId);
                    if (fam) {
                      setOpen(false);
                      setEditingId(null);
                      setFamiliaParaExcluir(fam);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" /> Excluir família
                </Button>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditingId(null); }}>Cancelar</Button>
                <Button type="submit">{editingId ? "Salvar alterações" : "Criar família"}</Button>
              </div>
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
