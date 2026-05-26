import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Layers, Pencil, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import VoluntariosDialog from "@/components/ministerios/VoluntariosDialog";

interface MembroOpt { id: string; nome_completo: string; }
interface Ministerio { id: string; nome: string; ativo?: boolean; }
interface Area { id: string; nome: string; sigla: string|null; descricao: string|null; lider_id: string|null; co_lider_id: string|null; ativo: boolean; }

interface Props {
  ministerio: Ministerio;
  membros: MembroOpt[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function AreasDialog({ ministerio, membros, open, onOpenChange }: Props) {
  const { canEdit } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { nome: "", sigla: "", descricao: "", lider_id: "", co_lider_id: "", ativo: true };
  const [form, setForm] = useState<any>(emptyForm);
  const [voluntariosFor, setVoluntariosFor] = useState<Area | null>(null);

  const load = async () => {
    const { data } = await supabase.from("areas").select("*").eq("ministerio_id", ministerio.id).order("nome");
    setAreas((data ?? []) as Area[]);
  };
  useEffect(()=>{ if(open) load(); }, [open, ministerio.id]);

  const memberName = (id: string|null) => membros.find(m=>m.id===id)?.nome_completo;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    Object.keys(payload).forEach(k=>{ if(payload[k]==="") payload[k]=null; });
    let error;
    if (editingId) {
      ({ error } = await supabase.from("areas").update(payload).eq("id", editingId));
    } else {
      payload.ministerio_id = ministerio.id;
      ({ error } = await supabase.from("areas").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Área atualizada" : "Área cadastrada");
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    load();
  };

  const startEdit = (a: Area) => {
    setEditingId(a.id);
    setForm({
      nome: a.nome,
      sigla: a.sigla ?? "",
      descricao: a.descricao ?? "",
      lider_id: a.lider_id ?? "",
      co_lider_id: a.co_lider_id ?? "",
      ativo: a.ativo,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Layers className="w-5 h-5"/> Áreas — {ministerio.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {areas.length === 0 && !showForm && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma área cadastrada para este ministério.</p>
          )}
          {areas.map((a)=>(
            <Card key={a.id} className={a.ativo ? "" : "opacity-60"}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{a.nome}</h4>
                    {a.sigla && <span className="text-xs px-2 py-0.5 rounded bg-muted">{a.sigla}</span>}
                    {a.ativo
                      ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Ativa</Badge>
                      : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativa</Badge>}
                  </div>
                  {a.descricao && <p className="text-xs text-muted-foreground mt-1">{a.descricao}</p>}
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    {a.lider_id && <div>Líder de Área: <span className="text-foreground">{memberName(a.lider_id)}</span></div>}
                    {a.co_lider_id && <div>Co-líder de Área: <span className="text-foreground">{memberName(a.co_lider_id)}</span></div>}
                  </div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={()=>startEdit(a)} aria-label="Editar área">
                    <Pencil className="w-4 h-4"/>
                  </Button>
                )}
              </CardContent>
              <CardContent className="px-4 pb-3 pt-0">
                <Button variant="outline" size="sm" onClick={()=>setVoluntariosFor(a)}>
                  <Users className="w-3.5 h-3.5 mr-1.5"/>Voluntários
                </Button>
              </CardContent>
            </Card>
          ))}

          {canEdit && !showForm && ministerio.ativo !== false && (
            <Button variant="outline" className="w-full" onClick={()=>setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2"/>Nova área
            </Button>
          )}
          {ministerio.ativo === false && (
            <p className="text-xs text-center text-muted-foreground">Ministério inativo — novas Áreas não podem ser criadas.</p>
          )}

          {showForm && (
            <form onSubmit={onSubmit} className="space-y-3 border rounded-md p-4 bg-muted/30">
              <div className="text-sm font-medium">{editingId ? "Editar área" : "Nova área"}</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Label>Nome *</Label><Input required value={form.nome} onChange={(e)=>setForm({...form, nome: e.target.value})}/></div>
                <div><Label>Sigla</Label><Input value={form.sigla} onChange={(e)=>setForm({...form, sigla: e.target.value})}/></div>
              </div>
              <div><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={(e)=>setForm({...form, descricao: e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Líder de Área</Label>
                  <Select value={form.lider_id || undefined} onValueChange={(v)=>setForm({...form, lider_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                    <SelectContent>{membros.map(m=><SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Co-líder de Área</Label>
                  <Select value={form.co_lider_id || undefined} onValueChange={(v)=>setForm({...form, co_lider_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione"/></SelectTrigger>
                    <SelectContent>{membros.map(m=><SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                <div>
                  <Label className="text-sm">Status da Área</Label>
                  <p className="text-xs text-muted-foreground">{form.ativo ? "Ativa — disponível para uso operacional" : "Inativa — preserva histórico, sem novos vínculos"}</p>
                </div>
                <Switch checked={form.ativo} onCheckedChange={(v)=>setForm({...form, ativo: v})}/>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={cancelForm}>Cancelar</Button>
                <Button type="submit">{editingId ? "Atualizar área" : "Salvar área"}</Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
      {voluntariosFor && (
        <VoluntariosDialog
          area={{
            id: voluntariosFor.id,
            nome: voluntariosFor.nome,
            ativo: voluntariosFor.ativo,
            ministerio_id: ministerio.id,
            ministerio_ativo: ministerio.ativo !== false,
          }}
          open={!!voluntariosFor}
          onOpenChange={(o)=>{ if(!o) setVoluntariosFor(null); }}
        />
      )}
    </Dialog>
  );
}