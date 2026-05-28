import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, HeartHandshake, Users, Layers, Pencil, Sparkles, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AreasDialog from "@/components/ministerios/AreasDialog";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";

export interface Ministerio { id: string; nome: string; sigla: string|null; descricao: string|null; lider_id: string|null; co_lider_id: string|null; vice_lider_id: string|null; ativo: boolean; }
interface MembroOpt { id: string; nome_completo: string; }

export default function Ministerios() {
  const { canEdit } = useAuth();
  const [list, setList] = useState<Ministerio[]>([]);
  const [membros, setMembros] = useState<MembroOpt[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [areaCounts, setAreaCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areasOpenFor, setAreasOpenFor] = useState<Ministerio | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { nome: "", sigla: "", descricao: "", lider_id: "", co_lider_id: "", ativo: true };
  const [form, setForm] = useState<any>(emptyForm);
  const [sugestao, setSugestao] = useState<{
    nome: string; descricao: string; responsabilidades: string;
    origem: "documento" | "modelo"; base_institucional?: string;
  } | null>(null);
  const [buscandoModelo, setBuscandoModelo] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadingCounts(true);
    setError(null);
    const { data, error } = await supabase
      .from("ministerios")
      .select("*, ministerio_membros(count), areas(count)")
      .order("nome");
    if (error) {
      toast.error(error.message);
      setError(error.message);
    }
    const rows = (data ?? []) as any[];
    setList(rows as Ministerio[]);
    const c: Record<string, number> = {};
    const ac: Record<string, number> = {};
    rows.forEach((m: any) => {
      c[m.id] = m.ministerio_membros?.[0]?.count ?? 0;
      ac[m.id] = m.areas?.[0]?.count ?? 0;
    });
    setCounts(c);
    setAreaCounts(ac);
    const { data: ms } = await supabase.from("membros").select("id, nome_completo").order("nome_completo");
    setMembros((ms ?? []) as MembroOpt[]);
    setLoadingCounts(false);
    setLoading(false);
  };
  useEffect(()=>{ load(); }, []);

  // Auto-preenchimento — busca em documento_estrutura (prioridade) e modelos_ministerio (fallback)
  useEffect(() => {
    if (editingId || !open) { setSugestao(null); return; }
    const nome = form.nome?.trim();
    if (!nome || nome.length < 3) { setSugestao(null); return; }
    setBuscandoModelo(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("buscar_modelo_ministerio", { p_nome: nome });
      setBuscandoModelo(false);
      const d = data as any;
      if (d?.encontrado) {
        setSugestao({
          nome:              d.nome ?? "",
          descricao:         d.descricao ?? "",
          responsabilidades: d.responsabilidades ?? "",
          origem:            d.origem === "documento" ? "documento" : "modelo",
          base_institucional: d.base_institucional ?? undefined,
        });
      } else {
        setSugestao(null);
      }
    }, 500);
    return () => { clearTimeout(timer); setBuscandoModelo(false); };
  }, [form.nome, editingId, open]);

  const memberName = (id: string|null) => membros.find(m=>m.id===id)?.nome_completo;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    Object.keys(payload).forEach(k=>{ if(payload[k]==="") payload[k]=null; });
    let error;
    if (editingId) {
      ({ error } = await supabase.from("ministerios").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("ministerios").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Ministério atualizado" : "Ministério cadastrado");
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
    load();
  };

  const startEdit = (m: Ministerio) => {
    setEditingId(m.id);
    setForm({
      nome: m.nome,
      sigla: m.sigla ?? "",
      descricao: m.descricao ?? "",
      lider_id: m.lider_id ?? "",
      co_lider_id: m.co_lider_id ?? "",
      ativo: m.ativo,
    });
    setOpen(true);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) { setEditingId(null); setForm(emptyForm); setSugestao(null); }
  };

  const aplicarModelo = () => {
    if (!sugestao) return;
    const partes: string[] = [];
    if (sugestao.descricao) partes.push(sugestao.descricao);
    if (sugestao.responsabilidades) partes.push(`Responsabilidades:\n${sugestao.responsabilidades}`);
    if (sugestao.base_institucional) partes.push(`Base: ${sugestao.base_institucional}`);
    setForm((f: any) => ({ ...f, descricao: partes.join("\n\n") }));
    setSugestao(null);
    toast.success(
      sugestao.origem === "documento"
        ? "Preenchido com base nos documentos da igreja — ajuste conforme necessário"
        : "Modelo padrão aplicado — ajuste conforme necessário"
    );
  };

  return (
    <div>
      <PageHeader
        title="Ministérios"
        description={`${list.length} ministérios cadastrados`}
        actions={canEdit && <Button className="whitespace-nowrap" onClick={()=>{ setEditingId(null); setForm(emptyForm); setOpen(true); }}><Plus className="w-4 h-4 mr-2"/>Novo ministério</Button>}
      />
      <div className="p-4 md:p-8">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : list.length === 0 ? (
          <EmptyState message="Nenhum ministério cadastrado" />
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((m)=>(
          <Card key={m.id} className={`shadow-card-soft ${m.ativo ? "" : "opacity-60"}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center"><HeartHandshake className="w-5 h-5 text-primary"/></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif text-xl">{m.nome}</h3>
                      {m.sigla && <Badge variant="outline" className="bg-gold/10 text-gold border-gold/30">{m.sigla}</Badge>}
                      {m.ativo
                        ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Ativo</Badge>
                        : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativo</Badge>}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={()=>startEdit(m)} aria-label="Editar ministério">
                        <Pencil className="w-4 h-4"/>
                      </Button>
                    )}
                  </div>
                  {m.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{m.descricao}</p>}
                  <div className="text-xs text-muted-foreground mt-3 space-y-0.5">
                    {m.lider_id && <div>Líder: <span className="text-foreground">{memberName(m.lider_id)}</span></div>}
                    {m.co_lider_id && <div>Co-líder: <span className="text-foreground">{memberName(m.co_lider_id)}</span></div>}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5"/>{loadingCounts ? "…" : `${counts[m.id] ?? 0} integrantes`}</span>
                    <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5"/>{loadingCounts ? "…" : `${areaCounts[m.id] ?? 0} áreas`}</span>
                  </div>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={()=>setAreasOpenFor(m)}>
                      <Layers className="w-3.5 h-3.5 mr-1.5"/>Áreas
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif text-2xl">{editingId ? "Editar ministério" : "Novo ministério"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <div className="relative">
                  <Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/>
                  {buscandoModelo && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">buscando…</span>
                  )}
                </div>
              </div>
              <div><Label>Sigla</Label><Input value={form.sigla} onChange={(e)=>setForm({...form, sigla: e.target.value})}/></div>
            </div>
            {sugestao && (
              <div className={`rounded-md border px-3 py-2.5 flex items-start gap-2 ${
                sugestao.origem === "documento"
                  ? "border-gold/50 bg-gold/8"
                  : "border-muted bg-muted/30"
              }`}>
                <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${sugestao.origem === "documento" ? "text-gold" : "text-muted-foreground"}`}/>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${sugestao.origem === "documento" ? "text-gold" : "text-foreground"}`}>
                    {sugestao.origem === "documento"
                      ? `📄 Sugerido pelo regimento da igreja: ${sugestao.nome}`
                      : `Modelo padrão: ${sugestao.nome}`}
                  </p>
                  {sugestao.base_institucional && (
                    <p className="text-[10px] text-gold/70 mt-0.5">{sugestao.base_institucional}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{sugestao.descricao}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" size="sm" variant="outline"
                    className={`h-7 text-xs ${sugestao.origem === "documento" ? "border-gold/40 text-gold hover:bg-gold/10" : ""}`}
                    onClick={aplicarModelo}>
                    Aplicar
                  </Button>
                  <button type="button" onClick={()=>setSugestao(null)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted">
                    <X className="w-3.5 h-3.5 text-muted-foreground"/>
                  </button>
                </div>
              </div>
            )}
            <div><Label>Descrição</Label><Textarea rows={3} value={form.descricao} onChange={(e)=>setForm({...form, descricao: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Líder</Label>
                <Select value={form.lider_id || undefined} onValueChange={(v)=>setForm({...form, lider_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                  <SelectContent>{membros.map(m=><SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Co-líder</Label>
                <Select value={form.co_lider_id || undefined} onValueChange={(v)=>setForm({...form, co_lider_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                  <SelectContent>{membros.map(m=><SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <div>
                <Label className="text-sm">Status do Ministério</Label>
                <p className="text-xs text-muted-foreground">{form.ativo ? "Ativo — disponível para criação de Áreas e uso operacional" : "Inativo — preserva histórico, sem novas Áreas"}</p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v)=>setForm({...form, ativo: v})}/>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={()=>handleOpenChange(false)}>Cancelar</Button>
              <Button type="submit">{editingId ? "Atualizar" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {areasOpenFor && (
        <AreasDialog
          ministerio={areasOpenFor}
          membros={membros}
          open={!!areasOpenFor}
          onOpenChange={(o)=>{ if(!o) { setAreasOpenFor(null); load(); } }}
        />
      )}
    </div>
  );
}