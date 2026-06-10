// ─── EbdChamada.tsx — Chamada de uma aula ─────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Camera, Image as ImageIcon, Loader2, UserPlus,
  Calendar, GraduationCap, Save, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  obterOuCriarAula, carregarAula, atualizarAula,
  chamadaView, marcarPresenca, adicionarVisitanteAula, uploadFotoAula,
  carregarClasse,
  type EbdAula, type EbdClasse, type EbdChamadaRow,
} from "@/services/ebdService";
import { TelefoneInput } from "@/components/ui/TelefoneInput";

// Calcula o domingo mais próximo (passado ou hoje)
function domingoMaisRecente(): string {
  const d = new Date();
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function EbdChamada() {
  const { classeId = "" } = useParams();
  const navigate = useNavigate();

  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [data, setData] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("data") || domingoMaisRecente();
  });
  const [aula, setAula] = useState<EbdAula | null>(null);
  const [linhas, setLinhas] = useState<EbdChamadaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Dialog visitante
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitNome, setVisitNome] = useState("");
  const [visitTel, setVisitTel] = useState("");
  const [visitBusy, setVisitBusy] = useState(false);

  // Upload foto
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => { carregar(); }, [classeId, data]);

  async function carregar() {
    if (!classeId) return;
    setLoading(true);
    try {
      const c = await carregarClasse(classeId);
      setClasse(c);
      const aulaId = await obterOuCriarAula(classeId, data);
      const [a, view] = await Promise.all([
        carregarAula(aulaId),
        chamadaView(aulaId),
      ]);
      setAula(a);
      setLinhas(view);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar chamada");
    } finally {
      setLoading(false);
    }
  }

  async function togglePresenca(row: EbdChamadaRow, novoValor: boolean) {
    if (!aula) return;
    setSalvando(row.pessoa_id);
    try {
      await marcarPresenca(aula.id, row.pessoa_id, novoValor, row.eh_visitante);
      setLinhas(prev => prev.map(r =>
        r.pessoa_id === row.pessoa_id ? { ...r, presente: novoValor } : r
      ));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao marcar");
    } finally {
      setSalvando(null);
    }
  }

  async function salvarTema(tema: string) {
    if (!aula) return;
    try {
      await atualizarAula(aula.id, { tema });
      setAula({ ...aula, tema });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar tema");
    }
  }

  async function salvarObs(obs: string) {
    if (!aula) return;
    try {
      await atualizarAula(aula.id, { observacoes: obs });
      setAula({ ...aula, observacoes: obs });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  }

  async function handleAdicionarVisitante(e: React.FormEvent) {
    e.preventDefault();
    if (!visitNome.trim()) { toast.error("Nome obrigatório"); return; }
    if (!aula) return;
    setVisitBusy(true);
    try {
      await adicionarVisitanteAula(aula.id, visitNome, visitTel);
      toast.success("Visitante adicionado");
      setVisitNome("");
      setVisitTel("");
      setVisitOpen(false);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao adicionar visitante");
    } finally {
      setVisitBusy(false);
    }
  }

  async function handleUploadFoto(file: File) {
    if (!aula || !classeId) return;
    setUploadingFoto(true);
    try {
      const url = await uploadFotoAula(aula.id, classeId, file);
      setAula({ ...aula, foto_url: url });
      toast.success("Foto da aula salva");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro no upload");
    } finally {
      setUploadingFoto(false);
    }
  }

  const stats = useMemo(() => {
    const matriculados = linhas.filter(l => l.tipo === "matriculado");
    const visitantes  = linhas.filter(l => l.tipo === "visitante");
    const presentesMat = matriculados.filter(l => l.presente).length;
    const presentesVis = visitantes.filter(l => l.presente).length;
    return {
      totalMat: matriculados.length,
      presMat: presentesMat,
      totalVis: visitantes.length,
      presVis: presentesVis,
      totalPresentes: presentesMat + presentesVis,
    };
  }, [linhas]);

  if (loading || !classe) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }

  const matriculados = linhas.filter(l => l.tipo === "matriculado");
  const visitantes  = linhas.filter(l => l.tipo === "visitante");

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Link to={`/ebd/${classeId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <GraduationCap className="w-5 h-5 text-gold" />
            {classe.nome}
          </h1>
          <p className="text-xs text-muted-foreground">Chamada da aula</p>
        </div>
      </div>

      {/* Data e foto */}
      <Card>
        <CardContent className="py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Tema */}
          <div>
            <Label className="text-xs">Tema da aula</Label>
            <Input
              placeholder="Ex: A graça em Romanos 5"
              defaultValue={aula?.tema ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (aula?.tema ?? "")) salvarTema(v);
              }}
            />
          </div>

          {/* Foto */}
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> Foto da aula
            </Label>
            {aula?.foto_url ? (
              <div className="relative mt-1.5 rounded-lg overflow-hidden border">
                <img src={aula.foto_url} alt="Foto da aula" className="w-full max-h-72 object-cover" />
                <label className="absolute bottom-2 right-2 bg-background/90 rounded-md p-2 cursor-pointer hover:bg-background border shadow-sm">
                  <Camera className="w-4 h-4" />
                  <input
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUploadFoto(e.target.files[0])}
                  />
                </label>
              </div>
            ) : (
              <label className="mt-1.5 flex items-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                <Camera className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploadingFoto ? "Enviando..." : "Adicionar foto da aula"}
                </span>
                <input
                  type="file" accept="image/*" capture="environment" className="hidden"
                  disabled={uploadingFoto}
                  onChange={(e) => e.target.files?.[0] && handleUploadFoto(e.target.files[0])}
                />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Presentes</p>
          <p className="text-xl font-semibold text-emerald-600">{stats.totalPresentes}</p>
        </CardContent></Card>
        <Card><CardContent className="py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Matriculados</p>
          <p className="text-xl font-semibold">{stats.presMat}/{stats.totalMat}</p>
        </CardContent></Card>
        <Card><CardContent className="py-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Visitantes</p>
          <p className="text-xl font-semibold text-amber-600">{stats.presVis}/{stats.totalVis}</p>
        </CardContent></Card>
      </div>

      {/* Botão visitante */}
      <Button onClick={() => setVisitOpen(true)} className="w-full gap-1.5">
        <UserPlus className="w-4 h-4" /> + Novo visitante
      </Button>

      {/* Lista matriculados */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Matriculados
        </h3>
        {matriculados.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sem matriculados nesta classe.
          </p>
        )}
        {matriculados.map((r) => (
          <button
            key={r.pessoa_id}
            type="button"
            onClick={() => togglePresenca(r, !r.presente)}
            disabled={salvando === r.pessoa_id}
            className={`w-full flex items-center justify-between border rounded-lg px-3 py-3 transition-all active:scale-[0.99] ${
              r.presente
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30"
                : "bg-background hover:bg-muted/40"
            }`}
          >
            <div className="text-left min-w-0">
              <div className="font-medium truncate">{r.nome_completo}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.idade != null ? `${r.idade} anos` : "Sem idade"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {salvando === r.pessoa_id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : r.presente
                ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                : <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
              }
            </div>
          </button>
        ))}
      </div>

      {/* Lista visitantes */}
      {visitantes.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
            Visitantes desta aula
          </h3>
          {visitantes.map((r) => (
            <button
              key={r.pessoa_id}
              type="button"
              onClick={() => togglePresenca(r, !r.presente)}
              disabled={salvando === r.pessoa_id}
              className={`w-full flex items-center justify-between border rounded-lg px-3 py-3 transition-all active:scale-[0.99] ${
                r.presente
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30"
                  : "bg-background hover:bg-muted/40"
              }`}
            >
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{r.nome_completo}</span>
                  <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                    Visitante
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.idade != null ? `${r.idade} anos` : "Sem idade"}
                </div>
              </div>
              {salvando === r.pessoa_id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : r.presente
                ? <CheckCircle2 className="w-6 h-6 text-amber-600" />
                : <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
              }
            </button>
          ))}
        </div>
      )}

      {/* Observações */}
      <Card>
        <CardContent className="py-3">
          <Label className="text-xs">Observações da aula</Label>
          <Textarea
            rows={2}
            placeholder="Anotações para o líder ou pastor..."
            defaultValue={aula?.observacoes ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (aula?.observacoes ?? "")) salvarObs(v);
            }}
          />
        </CardContent>
      </Card>

      {/* Dialog novo visitante */}
      <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo visitante</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdicionarVisitante} className="space-y-3">
            <div>
              <Label>Nome completo *</Label>
              <Input
                required autoFocus
                value={visitNome}
                onChange={(e) => setVisitNome(e.target.value)}
                placeholder="Como ela(e) se chama?"
              />
            </div>
            <div>
              <Label>Telefone (opcional)</Label>
              <TelefoneInput
                value={visitTel}
                onChange={setVisitTel}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Será cadastrada(o) como visitante em Pessoas e marcado como presente nesta aula.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVisitOpen(false)} disabled={visitBusy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={visitBusy}>
                {visitBusy ? "Salvando..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
