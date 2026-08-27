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
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarProfessores, adicionarProfessor, removerProfessor,
  type EbdProfessor,
} from "@/services/ebdService";

interface Props { classeId: string; }

export function ProfessoresBloco({ classeId }: Props) {
  const [professores, setProfessores] = useState<EbdProfessor[]>([]);
  const [open, setOpen] = useState(false);
  const [pessoaSelecionada, setPessoaSelecionada] = useState<string>("");
  const [tipo, setTipo] = useState<EbdProfessor["tipo"]>("principal");
  const [busy, setBusy] = useState(false);
  // IDs de todas as pessoas que já são professor ativo em qualquer classe
  const [idsProfessoresGlobais, setIdsProfessoresGlobais] = useState<string[]>([]);

  useEffect(() => { carregar(); }, [classeId]);

  async function carregar() {
    try { setProfessores(await listarProfessores(classeId)); }
    catch (e: any) { toast.error(e?.message ?? "Erro ao carregar professores"); }
  }

  async function abrirDialog() {
    setOpen(true);
    setPessoaSelecionada("");
    setTipo("principal");
    // Carrega todos pessoa_ids que já sao professor ativo em qualquer classe
    const { data } = await supabase
      .from("ebd_professores")
      .select("pessoa_id")
      .eq("ativo", true);
    setIdsProfessoresGlobais((data ?? []).map((r: any) => r.pessoa_id));
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

  const tipoLabel: Record<EbdProfessor["tipo"], string> = {
    principal: "Principal", auxiliar: "Auxiliar", substituto: "Substituto",
  };
  const tipoCor: Record<EbdProfessor["tipo"], string> = {
    principal: "border-success-line text-success-text",
    auxiliar: "border-info-line text-info-text",
    substituto: "border-warning-line text-warning-text",
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

        {/* ── Cartões lado a lado, o principal primeiro ────────────────────
            Eram linhas empilhadas, e a ordem vinha de `.order("tipo")` — que
            é texto, então "auxiliar" vinha antes de "principal". A tela punha
            a auxiliar em cima da responsável pela classe, o contrário do que
            a palavra significa. A ordem agora é por hierarquia, no serviço.

            Lado a lado porque uma equipe de duas ou três pessoas se lê de uma
            vez; empilhada, ela ocupava a altura de uma lista sem ser uma.

            `items-start` e não `items-center`: nome comprido quebra em duas
            linhas, e com centro os cartões da fileira ficariam desalinhados
            pelo meio. */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {professores.map(p => (
            <div
              key={p.id}
              className="flex items-start justify-between gap-2 border rounded-md px-3 py-2"
            >
              {/* min-w-0 no item de flex com texto truncável — a mesma
                  armadilha que já apareceu seis vezes neste projeto. */}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium leading-snug break-words">
                  {p.membros?.nome_completo ?? "Pessoa removida"}
                </p>
                <Badge variant="outline" className={`text-xs ${tipoCor[p.tipo]}`}>
                  {tipoLabel[p.tipo]}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => remover(p.id)}
                className="text-destructive hover:text-destructive shrink-0 -mr-1"
                title="Remover professor">
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
              <BuscaPessoa
                value={pessoaSelecionada}
                onChange={(id) => setPessoaSelecionada(id)}
                tipos={["membro", "congregado"]}
                ignorarIds={Array.from(new Set([...idsProfessoresGlobais, ...professores.map(p => p.pessoa_id)]))}
                autoFocus
                placeholder="Buscar pessoa (só quem ainda não for professor)…"
              />
              <p className="text-xs text-muted-foreground -mt-1">
                Pessoas que ja sao professor em outra classe nao aparecem na lista.
              </p>
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
