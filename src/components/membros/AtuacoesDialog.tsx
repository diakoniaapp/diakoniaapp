import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase } from "lucide-react";

interface Pessoa { id: string; nome_completo: string; }
interface Row {
  id: string; funcao: string; data_inicio: string; data_fim: string|null;
  status: "ativa"|"encerrada"; area_id: string; ministerio_id: string;
  area_nome?: string; ministerio_nome?: string;
}

interface Props { pessoa: Pessoa | null; open: boolean; onOpenChange: (o:boolean)=>void; }

export default function AtuacoesDialog({ pessoa, open, onOpenChange }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    if (!open || !pessoa) return;
    (async()=>{
      setLoading(true);
      const { data } = await supabase.from("area_voluntarios").select("*")
        .eq("membro_id", pessoa.id)
        .order("status").order("data_inicio", { ascending: false });
      const list = (data ?? []) as Row[];
      const areaIds = [...new Set(list.map(r=>r.area_id))];
      const minIds = [...new Set(list.map(r=>r.ministerio_id))];
      const [{ data: areas }, { data: mins }] = await Promise.all([
        areaIds.length ? supabase.from("areas").select("id, nome").in("id", areaIds) : Promise.resolve({ data: [] as any }),
        minIds.length ? supabase.from("ministerios").select("id, nome").in("id", minIds) : Promise.resolve({ data: [] as any }),
      ]);
      const aMap = new Map<string,string>((areas ?? []).map((a:any)=>[a.id, a.nome]));
      const mMap = new Map<string,string>((mins ?? []).map((m:any)=>[m.id, m.nome]));
      setRows(list.map(r => ({ ...r, area_nome: aMap.get(r.area_id), ministerio_nome: mMap.get(r.ministerio_id) })));
      setLoading(false);
    })();
  }, [open, pessoa?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Briefcase className="w-5 h-5"/> Atuações — {pessoa?.nome_completo}
          </DialogTitle>
        </DialogHeader>

        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
          rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atuação registrada.</p> : (
          <div className="space-y-2">
            {rows.map(r => (
              <Card key={r.id} className={r.status === "encerrada" ? "opacity-60 border-dashed" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.ministerio_nome ?? "—"}</span>
                    <span className="text-muted-foreground">›</span>
                    <span>{r.area_nome ?? "—"}</span>
                    <Badge variant="outline" className="bg-muted/50">{r.funcao}</Badge>
                    {r.status === "ativa"
                      ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Ativa</Badge>
                      : <Badge variant="outline" className="bg-muted text-muted-foreground">Encerrada</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Início: {r.data_inicio}{r.data_fim ? ` • Encerramento: ${r.data_fim}` : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}