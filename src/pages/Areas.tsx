// ─── Areas.tsx — Listagem global de áreas de todos os ministérios ──────────
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Layers, Search, Pencil, Users, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import AreasDialog from "@/components/ministerios/AreasDialog";

interface Area {
  id: string;
  nome: string;
  sigla: string | null;
  ativo: boolean;
  ministerio_id: string;
  ministerio_nome: string;
  ministerio_ativo: boolean;
  lider_nome: string | null;
  co_lider_nome: string | null;
  qtd_voluntarios: number;
}

interface Ministerio {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function Areas() {
  const { canEdit } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [ministerios, setMinisterios] = useState<Ministerio[]>([]);
  const [membros, setMembros] = useState<{ id: string; nome_completo: string }[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"todas" | "ativas" | "inativas">("ativas");
  const [filtroMinisterio, setFiltroMinisterio] = useState<string>("todos");
  const [loading, setLoading] = useState(true);

  const [dialogMinisterio, setDialogMinisterio] = useState<Ministerio | null>(null);
  const [novaMinisterioPicker, setNovaMinisterioPicker] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: a }, { data: m }, { data: vols }, { data: mb }] = await Promise.all([
        supabase.from("areas").select("id, nome, sigla, ativo, ministerio_id, lider_id, co_lider_id, ministerios(id, nome, ativo)").order("nome"),
        supabase.from("ministerios").select("id, nome, ativo").order("nome"),
        supabase.from("area_voluntarios").select("area_id, status, membro_id"),
        supabase.from("membros").select("id, nome_completo"),
      ]);

      const membrosMap = new Map((mb ?? []).map((x: any) => [x.id, x.nome_completo]));

      const volMap = new Map<string, Set<string>>();
      (vols ?? []).forEach((v: any) => {
        const st = String(v.status ?? "").toLowerCase();
        if (st !== "ativa" && st !== "ativo") return;
        if (!volMap.has(v.area_id)) volMap.set(v.area_id, new Set());
        volMap.get(v.area_id)!.add(v.membro_id);
      });

      const lista: Area[] = (a ?? []).map((x: any) => ({
        id: x.id,
        nome: x.nome,
        sigla: x.sigla,
        ativo: x.ativo,
        ministerio_id: x.ministerio_id,
        ministerio_nome: x.ministerios?.nome ?? "—",
        ministerio_ativo: x.ministerios?.ativo ?? true,
        lider_nome: x.lider_id ? membrosMap.get(x.lider_id) ?? null : null,
        co_lider_nome: x.co_lider_id ? membrosMap.get(x.co_lider_id) ?? null : null,
        qtd_voluntarios: volMap.get(x.id)?.size ?? 0,
      }));

      setAreas(lista);
      setMinisterios((m ?? []) as Ministerio[]);
      setMembros((mb ?? []) as { id: string; nome_completo: string }[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar áreas");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return areas.filter(a => {
      if (filtroAtivo === "ativas" && !a.ativo) return false;
      if (filtroAtivo === "inativas" && a.ativo) return false;
      if (filtroMinisterio !== "todos" && a.ministerio_id !== filtroMinisterio) return false;
      if (!q) return true;
      return a.nome.toLowerCase().includes(q)
        || (a.sigla ?? "").toLowerCase().includes(q)
        || a.ministerio_nome.toLowerCase().includes(q)
        || (a.lider_nome ?? "").toLowerCase().includes(q);
    });
  }, [areas, busca, filtroAtivo, filtroMinisterio]);

  function abrirEdicaoMinisterio(area: Area) {
    const min = ministerios.find(m => m.id === area.ministerio_id);
    if (min) setDialogMinisterio(min);
  }

  function abrirNovaArea(ministerioId: string) {
    const min = ministerios.find(m => m.id === ministerioId);
    if (min) {
      setDialogMinisterio(min);
      setNovaMinisterioPicker(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Áreas"
        description={`${areas.length} áreas em ${ministerios.length} ministérios`}
        actions={canEdit && (
          <Button onClick={() => setNovaMinisterioPicker(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova área
          </Button>
        )}
      />

      <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
        {/* Filtros */}
        <div className="grid md:grid-cols-3 gap-2">
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar área, ministério, líder..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtroAtivo} onValueChange={(v) => setFiltroAtivo(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativas">Apenas ativas</SelectItem>
              <SelectItem value="inativas">Apenas inativas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroMinisterio} onValueChange={setFiltroMinisterio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os ministérios</SelectItem>
              {ministerios.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Nenhuma área encontrada com os filtros atuais.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(a => (
              <Card key={a.id} className={a.ativo ? "" : "opacity-60 border-dashed"}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-gold" />
                        {a.nome}
                        {a.sigla && (
                          <Badge variant="outline" className="text-[9px] ml-1">{a.sigla}</Badge>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">{a.ministerio_nome}</p>
                    </div>
                    {canEdit && (
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => abrirEdicaoMinisterio(a)}
                        title={`Editar áreas de ${a.ministerio_nome}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={a.ativo 
                      ? "text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "text-[10px] bg-muted text-muted-foreground"}>
                      {a.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                    {!a.ministerio_ativo && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                        Ministério inativo
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> {a.qtd_voluntarios} voluntário{a.qtd_voluntarios !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {a.lider_nome && (
                    <p className="text-xs text-rose-700 dark:text-rose-300 truncate">
                      👑 {a.lider_nome}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Picker de ministério para "Nova área" */}
      <Dialog open={novaMinisterioPicker} onOpenChange={setNovaMinisterioPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Em qual ministério?</DialogTitle></DialogHeader>
          <Select onValueChange={abrirNovaArea}>
            <SelectTrigger><SelectValue placeholder="Selecione o ministério..." /></SelectTrigger>
            <SelectContent>
              {ministerios.filter(m => m.ativo).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaMinisterioPicker(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AreasDialog do ministério selecionado */}
      {dialogMinisterio && (
        <AreasDialog
          ministerio={dialogMinisterio as any}
          membros={membros}
          open={!!dialogMinisterio}
          onOpenChange={(o) => { if (!o) { setDialogMinisterio(null); load(); } }}
        />
      )}
    </div>
  );
}
