import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Users, Loader2, Camera, FileImage, X, Check, FileText, Trash2,
  UserPlus, Trash2, Save, BookOpen, MessageCircle, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarReuniao, atualizarReuniao, excluirReuniao, listarPresencas, marcarPresenca,
  listarVisitas, registrarVisita, excluirVisita,
  uploadFotoReuniao, removerFotoReuniao, fotoReuniaoSignedUrl,
  carregarGrupo, PAPEL_LABEL,
  type PgmReuniao, type PgmPresencaComPessoa, type PgmVisita, type PgmGrupoResumo,
} from "@/services/pgmService";

export default function PgmReuniaoPage() {
  const { grupoId = "", reuniaoId = "" } = useParams();
  const navigate = useNavigate();
  const [grupo, setGrupo] = useState<PgmGrupoResumo | null>(null);
  const [reuniao, setReuniao] = useState<PgmReuniao | null>(null);
  const [presencas, setPresencas] = useState<PgmPresencaComPessoa[]>([]);
  const [visitas, setVisitas] = useState<PgmVisita[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Form: tema/observações
  const [tema, setTema] = useState("");
  const [textoBase, setTextoBase] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvandoCabecalho, setSalvandoCabecalho] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataEditavel, setDataEditavel] = useState("");

  // Form: novo visitante
  const [vNome, setVNome] = useState("");
  const [vTelefone, setVTelefone] = useState("");
  const [vBairro, setVBairro] = useState("");

  useEffect(() => { carregar(); }, [reuniaoId]);

  async function carregar() {
    if (!reuniaoId) return;
    setLoading(true);
    try {
      const [r, g, ps, vs] = await Promise.all([
        carregarReuniao(reuniaoId),
        carregarGrupo(grupoId),
        listarPresencas(reuniaoId),
        listarVisitas(reuniaoId),
      ]);
      setReuniao(r);
      setGrupo(g);
      setPresencas(ps);
      setVisitas(vs);
      setTema(r?.tema ?? "");
      setTextoBase(r?.texto_base ?? "");
      setObservacoes(r?.observacoes ?? "");
      setDataEditavel(r?.data ?? "");

      if (r?.foto_url) {
        const url = await fotoReuniaoSignedUrl(r.foto_url);
        setFotoUrl(url);
      } else {
        setFotoUrl(null);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setLoading(false); }
  }

  async function salvarCabecalho() {
    if (!reuniao) return;
    setSalvandoCabecalho(true);
    try {
      const patch: any = {
        tema: tema.trim() || null,
        texto_base: textoBase.trim() || null,
        observacoes: observacoes.trim() || null,
      };
      if (dataEditavel && dataEditavel !== reuniao.data) {
        patch.data = dataEditavel;
      }
      await atualizarReuniao(reuniao.id, patch);
      toast.success("Dados do encontro salvos");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setSalvandoCabecalho(false); }
  }

  async function togglePresenca(p: PgmPresencaComPessoa) {
    try {
      await marcarPresenca(p.id, !p.presente);
      setPresencas(s => s.map(x => x.id === p.id ? { ...x, presente: !x.presente } : x));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !reuniao) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Foto maior que 5MB"); return; }
    setBusy(true);
    try {
      if (reuniao.foto_url) await removerFotoReuniao(reuniao.foto_url);
      const path = await uploadFotoReuniao(file, reuniao.id);
      await atualizarReuniao(reuniao.id, { foto_url: path });
      toast.success("Foto enviada");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); e.target.value = ""; }
  }

  async function removerFoto() {
    if (!reuniao?.foto_url) return;
    if (!confirm("Remover foto do encontro?")) return;
    setBusy(true);
    try {
      await removerFotoReuniao(reuniao.foto_url);
      await atualizarReuniao(reuniao.id, { foto_url: null });
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function handleExcluirEncontro() {
    if (!reuniao) return;
    setBusy(true);
    try {
      await excluirReuniao(reuniao.id);
      toast.success("Encontro excluído");
      navigate(`/pgm/${grupoId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function adicionarVisita(e: React.FormEvent) {
    e.preventDefault();
    if (!vNome.trim()) { toast.error("Nome do visitante é obrigatório"); return; }
    try {
      await registrarVisita(reuniaoId, {
        nome: vNome.trim(),
        telefone: vTelefone.trim() || null,
        bairro: vBairro.trim() || null,
      });
      toast.success("Visitante registrado");
      setVNome(""); setVTelefone(""); setVBairro("");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function removerVisita(id: string) {
    if (!confirm("Remover este visitante?")) return;
    try {
      await excluirVisita(id);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando encontro...
    </div>;
  }
  if (!reuniao) {
    return <div className="p-8 text-center text-muted-foreground">
      Encontro não encontrado. <Link to={`/pgm/${grupoId}`} className="text-primary underline">Voltar</Link>
    </div>;
  }

  const presentes = presencas.filter(p => p.presente).length;
  const totalGeral = presentes + visitas.length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4 pb-32">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Link to={`/pgm/${grupoId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <Calendar className="w-5 h-5 text-gold" />
            Encontro de {new Date(reuniao.data + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h1>
          {grupo && <p className="text-xs text-muted-foreground">{grupo.nome}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Link to={`/pgm/${grupoId}/reuniao/${reuniaoId}/relatorio`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Relatório
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}
            className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
          <Badge variant="outline" className="text-xs whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-300">
            <Check className="w-3 h-3 mr-0.5" /> {totalGeral} presença{totalGeral === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      {/* Tema + Texto base + Observações */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div>
            <Label className="text-xs">Data do encontro</Label>
            <Input type="date" value={dataEditavel} onChange={(e) => setDataEditavel(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Pode ajustar caso o registro tenha sido feito em outra data.
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-1.5 text-xs">
              <BookOpen className="w-3 h-3 text-gold" /> Tema da semana
            </Label>
            <Input value={tema} onChange={(e) => setTema(e.target.value)}
              placeholder="Ex: O fruto do Espírito" />
          </div>
          <div>
            <Label className="text-xs">Texto base / versículo</Label>
            <Input value={textoBase} onChange={(e) => setTextoBase(e.target.value)}
              placeholder="Ex: Gálatas 5:22-23" />
          </div>
          <div>
            <Label className="text-xs">Observações do encontro</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              rows={2} placeholder="O que aconteceu, decisões, pedidos relevantes..." />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={salvarCabecalho} disabled={salvandoCabecalho} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> {salvandoCabecalho ? "..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Foto */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <Label className="flex items-center gap-1.5 text-xs">
            <Camera className="w-3 h-3 text-gold" /> Foto do encontro
          </Label>
          {fotoUrl ? (
            <div className="relative inline-block">
              <img src={fotoUrl} alt="Encontro" className="rounded-md max-h-48 object-cover" />
              <Button type="button" variant="ghost" size="icon"
                className="absolute top-1 right-1 h-7 w-7 bg-background/80 hover:bg-background"
                onClick={removerFoto} disabled={busy}>
                <X className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" capture="environment"
                  className="hidden" onChange={onFotoChange} disabled={busy} />
                <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30 transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[11px] font-medium">Tirar foto</span>
                </div>
              </label>
              <label className="cursor-pointer">
                <input type="file" accept="image/*"
                  className="hidden" onChange={onFotoChange} disabled={busy} />
                <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30 transition-colors">
                  <FileImage className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[11px] font-medium">Galeria</span>
                </div>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chamada */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" /> Presença
            </h3>
            <span className="text-xs text-muted-foreground">
              {presentes}/{presencas.length} presentes
            </span>
          </div>
          {presencas.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-3">
              Sem participantes vinculados ao grupo.
            </p>
          ) : (
            <div className="space-y-1">
              {presencas.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePresenca(p)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
                    p.presente ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                              : "bg-card hover:bg-muted/40"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      p.presente ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground"
                    }`}>
                      {p.presente && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="font-medium">{p.nome_completo ?? "—"}</span>
                    {p.papel && p.papel !== "participante" && (
                      <Badge variant="outline" className="text-[9px]">{PAPEL_LABEL[p.papel]}</Badge>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visitantes */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="font-serif text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-gold" /> Visitantes ({visitas.length})
          </h3>
          <form onSubmit={adicionarVisita} className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input placeholder="Nome *" value={vNome} onChange={(e) => setVNome(e.target.value)} className="md:col-span-2" />
            <Input placeholder="Telefone" value={vTelefone} onChange={(e) => setVTelefone(e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Bairro" value={vBairro} onChange={(e) => setVBairro(e.target.value)} />
              <Button type="submit" size="sm">+</Button>
            </div>
          </form>

          {visitas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2 italic">Sem visitantes ainda.</p>
          ) : (
            <div className="space-y-1 pt-1">
              {visitas.map(v => (
                <div key={v.id} className="flex items-center justify-between border rounded-md px-3 py-1.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{v.nome}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[v.telefone, v.bairro].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {v.telefone && (
                      <a href={`https://wa.me/${v.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-700">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button type="button" variant="ghost" size="icon"
                      onClick={() => removerVisita(v.id)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voltar */}
      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={() => navigate(`/pgm/${grupoId}`)}>
          ← Voltar ao grupo
        </Button>
      </div>

      {/* Confirmação de exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir encontro?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir este encontro permanentemente — incluindo:
              <br /><br />
              • Todas as presenças marcadas
              <br />• Os visitantes registrados
              <br />• A foto da reunião (se houver)
              <br /><br />
              Esta ação <strong>não pode ser desfeita</strong>. Confirma?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluirEncontro}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
