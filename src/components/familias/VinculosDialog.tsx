import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Crown, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const parentescoOptions = [
  { value: "pai_mae", label: "Pai/Mãe" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "filho", label: "Filho(a)" },
  { value: "avo", label: "Avô/Avó" },
  { value: "enteado", label: "Enteado(a)" },
  { value: "tutelado", label: "Tutelado(a)" },
] as const;

export const parentescoLabel: Record<string, string> = Object.fromEntries(
  parentescoOptions.map((p) => [p.value, p.label]),
);

interface Vinculo {
  id: string;
  familia_id: string;
  membro_id: string;
  parentesco: string;
  responsavel_familia: boolean;
  membro?: { id: string; nome_completo: string } | null;
}

interface PessoaLite { id: string; nome_completo: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  familiaId: string | null;
  familiaNome?: string;
}

export function VinculosDialog({ open, onOpenChange, familiaId, familiaNome }: Props) {
  const { canEdit } = useAuth();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [pessoas, setPessoas] = useState<PessoaLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [novoMembroId, setNovoMembroId] = useState<string>("");
  const [novoParentesco, setNovoParentesco] = useState<string>("filho");

  const load = async () => {
    if (!familiaId) return;
    setLoading(true);
    const { data: vs } = await supabase
      .from("vinculos_familiares" as any)
      .select("id, familia_id, membro_id, parentesco, responsavel_familia, membro:membros(id, nome_completo)")
      .eq("familia_id", familiaId);
    setVinculos(((vs as any) ?? []) as Vinculo[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && familiaId) {
      setNovoMembroId("");
      setNovoParentesco("filho");
      setSearch("");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, familiaId]);

  const jaVinculados = useMemo(() => new Set(vinculos.map((v) => v.membro_id)), [vinculos]);
  const disponiveis = useMemo(
    () =>
      pessoas
        .filter((p) => !jaVinculados.has(p.id))
        .filter((p) => p.nome_completo.toLowerCase().includes(search.toLowerCase())),
    [pessoas, jaVinculados, search],
  );

  const adicionar = async () => {
    if (!familiaId || !novoMembroId) return toast.error("Selecione uma pessoa");
    const { error } = await supabase.from("vinculos_familiares" as any).insert({
      familia_id: familiaId,
      membro_id: novoMembroId,
      parentesco: novoParentesco,
      responsavel_familia: vinculos.length === 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Vínculo adicionado");
    setNovoMembroId("");
    load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("vinculos_familiares" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vínculo removido");
    load();
  };

  const atualizarParentesco = async (id: string, parentesco: string) => {
    const { error } = await supabase.from("vinculos_familiares" as any).update({ parentesco }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const definirResponsavel = async (id: string) => {
    if (!familiaId) return;
    const { error: e1 } = await supabase
      .from("vinculos_familiares" as any)
      .update({ responsavel_familia: false })
      .eq("familia_id", familiaId);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase
      .from("vinculos_familiares" as any)
      .update({ responsavel_familia: true })
      .eq("id", id);
    if (e2) return toast.error(e2.message);
    toast.success("Responsável definido");
    load();
  };

  const nomeSelecionado = pessoas.find((p) => p.id === novoMembroId)?.nome_completo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Vínculos familiares{familiaNome ? ` — ${familiaNome}` : ""}
          </DialogTitle>
        </DialogHeader>

        {canEdit && (
          <div className="rounded-md border p-4 space-y-3 bg-muted/30">
            <Label>Adicionar pessoa à família</Label>
            <div className="grid md:grid-cols-[1fr,200px,auto] gap-2 items-end">
              <div>
                <BuscaPessoa
                  value={novoMembroId}
                  onChange={(id) => setNovoMembroId(id)}
                  ignorarIds={[...jaVinculados]}
                  placeholder="Buscar pessoa por nome..."
                />
              </div>
              <Select value={novoParentesco} onValueChange={setNovoParentesco}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {parentescoOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={adicionar} disabled={!novoMembroId}>
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
              Nenhum membro vinculado a esta família ainda.
            </p>
          ) : (
            vinculos.map((v) => (
              <div key={v.id} className="flex items-center gap-2 p-3 border rounded-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{v.membro?.nome_completo ?? "—"}</span>
                    {v.responsavel_familia && (
                      <Badge variant="outline" className="bg-gold/15 text-gold border-gold/30">
                        <Crown className="w-3 h-3 mr-1" /> Responsável
                      </Badge>
                    )}
                  </div>
                </div>
                {canEdit ? (
                  <Select value={v.parentesco} onValueChange={(val) => atualizarParentesco(v.id, val)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {parentescoOptions.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{parentescoLabel[v.parentesco]}</Badge>
                )}
                {canEdit && !v.responsavel_familia && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Tornar responsável"
                    onClick={() => definirResponsavel(v.id)}
                  >
                    <Crown className="w-4 h-4" />
                  </Button>
                )}
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