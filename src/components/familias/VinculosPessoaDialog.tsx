import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Crown, Home } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { parentescoOptions, parentescoLabel } from "./VinculosDialog";
import type { Membro } from "@/pages/Membros";

interface Familia { id: string; nome_familia: string; }

interface Vinculo {
  id: string;
  familia_id: string;
  parentesco: string;
  responsavel_familia: boolean;
  familia?: Familia | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoa: Membro | null;
}

export function VinculosPessoaDialog({ open, onOpenChange, pessoa }: Props) {
  const { canEdit } = useAuth();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [loading, setLoading] = useState(false);
  const [novaFamilia, setNovaFamilia] = useState<string>("");
  const [novoParentesco, setNovoParentesco] = useState<string>("filho");

  const load = async () => {
    if (!pessoa) return;
    setLoading(true);
    const [{ data: vs }, { data: fs }] = await Promise.all([
      supabase
        .from("vinculos_familiares" as any)
        .select("id, familia_id, parentesco, responsavel_familia, familia:familias(id, nome_familia)")
        .eq("membro_id", pessoa.id),
      supabase.from("familias").select("id, nome_familia").order("nome_familia"),
    ]);
    setVinculos(((vs as any) ?? []) as Vinculo[]);
    setFamilias(((fs as any) ?? []) as Familia[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && pessoa) {
      setNovaFamilia("");
      setNovoParentesco("filho");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pessoa]);

  const jaVinculadas = useMemo(() => new Set(vinculos.map((v) => v.familia_id)), [vinculos]);
  const familiasDisponiveis = familias.filter((f) => !jaVinculadas.has(f.id));

  const adicionar = async () => {
    if (!pessoa || !novaFamilia) return toast.error("Selecione uma família");
    const { error } = await supabase.from("vinculos_familiares" as any).insert({
      familia_id: novaFamilia,
      membro_id: pessoa.id,
      parentesco: novoParentesco,
      responsavel_familia: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Vinculado à família");
    setNovaFamilia("");
    load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("vinculos_familiares" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vínculo removido");
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Vínculos familiares{pessoa ? ` — ${pessoa.nome_completo}` : ""}
          </DialogTitle>
        </DialogHeader>

        {canEdit && (
          <div className="rounded-md border p-4 space-y-3 bg-muted/30">
            <Label>Vincular a uma família</Label>
            <div className="grid md:grid-cols-[1fr,200px,auto] gap-2 items-end">
              <Select value={novaFamilia} onValueChange={setNovaFamilia}>
                <SelectTrigger><SelectValue placeholder="Selecione a família" /></SelectTrigger>
                <SelectContent>
                  {familiasDisponiveis.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma família disponível</div>
                  ) : familiasDisponiveis.map((f) => (
                    <SelectItem key={f.id} value={f.id}>Família {f.nome_familia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={novoParentesco} onValueChange={setNovoParentesco}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {parentescoOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={adicionar} disabled={!novaFamilia}>
                <Plus className="w-4 h-4 mr-1" /> Vincular
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : vinculos.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center border rounded-md">
              Esta pessoa ainda não está vinculada a nenhuma família.
            </p>
          ) : (
            vinculos.map((v) => (
              <div key={v.id} className="flex items-center gap-2 p-3 border rounded-md">
                <div className="w-9 h-9 rounded-md bg-gold/15 flex items-center justify-center">
                  <Home className="w-4 h-4 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">Família {v.familia?.nome_familia ?? "—"}</span>
                    {v.responsavel_familia && (
                      <Badge variant="outline" className="bg-gold/15 text-gold border-gold/30">
                        <Crown className="w-3 h-3 mr-1" /> Responsável
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge variant="outline">{parentescoLabel[v.parentesco]}</Badge>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remover(v.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}