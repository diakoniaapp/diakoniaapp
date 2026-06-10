import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, UserMinus, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarProfessores, adicionarProfessor, removerProfessor,
  type EbdProfessor,
} from "@/services/ebdService";

interface Props { classeId: string; }
interface PessoaLookup { id: string; nome_completo: string; }

export function ProfessoresBloco({ classeId }: Props) {
  const [professores, setProfessores] = useState<EbdProfessor[]>([]);
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<PessoaLookup[]>([]);
  const [busca, setBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<string>("");
  const [tipo, setTipo] = useState<EbdProfessor["tipo"]>("principal");
  const [busy, setBusy] = useState(false);

  useEffect(() => { carregar(); }, [classeId]);

  async function carregar() {
    try { setProfessores(await listarProfessores(classeId)); }
    catch (e: any) { toast.error(e?.message ?? "Erro ao carregar professores"); }
  }

  async function abrirDialog() {
    setOpen(true);
    setPessoaSelecionada(""); setBusca(""); setTipo("principal");
    const { data } = await supabase
      .from("membros")
      .select("id, nome_completo")
      .in("tipo_pessoa", ["membro", "congregado"])
      .eq("status", "ativo").order("nome_completo").limit(200);
    setLookup((data ?? []) as PessoaLookup[]);
  }

  async function adicionar() {
    if (!pessoaSelecionada) { toast.error("Selecione uma pessoa"); return; }
    setBusy(true);
    try {
      await adicionarProfessor(classeId, pessoaSelecionada, tipo);
      toast.success("Professor adicionado");
      setOpen(false);
      await carregar();
    } catch (e: any) {
      if (e?.code === "23505") toast.error("Essa pessoa já é professor desta classe.");
      else toast.error(e?.message ?? "Erro ao adicionar");
    } finally { setBusy(false); }
  }

  async function remover(id: string) {
    setBusy(true);
    try {
      await removerProfessor(id);
      toast.success("Professor removido");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  const filtrados = lookup.filter(p => p.nome_completo.toLowerCase().includes(busca.toLowerCase()));
  const tipoLabel: Record<EbdProfessor["tipo"], string> = {
    principal: "Principal", auxiliar: "Auxiliar", substituto: "Substituto",
  };
  const tipoCor: Record<EbdProfessor["tipo"], string> = {
    principal: "border-emerald-300 text-emerald-700",
    auxiliar: "border-blue-300 text-blue-700",
    substituto: "border-amber-300 text-amber-700",
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4" /> Professores
          </h3>
          <Button size="sm" onClick={abrirDialog} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Adicionar
          </Button>
        </div>

        {professores.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nenhum professor cadastrado nesta classe.
          </p>
        )}

        <div className="space-y-1.5">
          {professores.map(p => (
            <div key={p.id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">
                  {p.membros?.nome_completo ?? "Pessoa removida"}
                </span>
                <Badge variant="outline" className={`text-[10px] ${tipoCor[p.tipo]}`}>
                  {tipoLabel[p.tipo]}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => remover(p.id)}
                className="text-destructive hover:text-destructive" title="Remover professor">
                <UserMinus className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar professor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buscar pessoa</Label>
              <Input placeholder="Digite o nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              {busca.length >= 2 && (
                <div className="border rounded-md max-h-40 overflow-y-auto mt-2 bg-background">
                  {filtrados.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 text-center">Nenhuma pessoa encontrada</p>
                  ) : filtrados.slice(0, 10).map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setPessoaSelecionada(p.id); setBusca(p.nome_completo); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0 ${
                        pessoaSelecionada === p.id ? "bg-accent" : ""
                      }`}>
                      {p.nome_completo}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as EbdProfessor["tipo"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="auxiliar">Auxiliar</SelectItem>
                  <SelectItem value="substituto">Substituto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={adicionar} disabled={busy || !pessoaSelecionada}>
              {busy ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
