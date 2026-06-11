import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Users, Pencil, Trash2, PowerOff, RotateCcw, Loader2,
  Calendar, Clock, MapPin, MessageCircle, UserPlus, Sparkles, Star,
  Crown, Home as HomeIcon, UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  carregarGrupo, listarMembrosDoGrupo, listarReunioes, iniciarReuniao, resumoPresenca,
  vincularPessoa, desvincularPessoa, marcarPrincipal,
  alterarPapel, desativarGrupo, reativarGrupo, excluirGrupo,
  diaSemanaTexto, horarioTexto, PAPEL_LABEL,
  type PgmGrupoResumo, type PgmMembroComPessoa, type PgmPapel,
  type PgmReuniao, type ResumoPresenca,
} from "@/services/pgmService";
import { GrupoForm } from "@/components/pgm/GrupoForm";
import { OracaoBlock } from "@/components/pgm/OracaoBlock";
import { MultiplicarDialog } from "@/components/pgm/MultiplicarDialog";
import { Play, BookOpen, ChevronRight as ChevR, Calendar as Cal } from "lucide-react";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";

const PAPEL_ICONE: Record<PgmPapel, JSX.Element> = {
  lider: <Crown className="w-3 h-3 text-gold" />,
  colider: <Star className="w-3 h-3 text-amber-600" />,
  anfitriao: <HomeIcon className="w-3 h-3 text-blue-600" />,
  participante: <UsersRound className="w-3 h-3 text-muted-foreground" />,
};

export default function PgmGrupo() {
  const { grupoId = "" } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const podeEditar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [grupo, setGrupo] = useState<PgmGrupoResumo | null>(null);
  const [membros, setMembros] = useState<PgmMembroComPessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [novoMembroId, setNovoMembroId] = useState("");
  const [reunioes, setReunioes] = useState<PgmReuniao[]>([]);
  const [resumo, setResumo] = useState<ResumoPresenca[]>([]);
  const [iniciandoReuniao, setIniciandoReuniao] = useState(false);
  const [multiplicarOpen, setMultiplicarOpen] = useState(false);

  useEffect(() => { carregar(); }, [grupoId]);

  async function carregar() {
    if (!grupoId) return;
    setLoading(true);
    try {
      const [g, ms, rs, rp] = await Promise.all([
        carregarGrupo(grupoId),
        listarMembrosDoGrupo(grupoId),
        listarReunioes(grupoId),
        resumoPresenca(grupoId, 4),
      ]);
      setGrupo(g);
      setMembros(ms);
      setReunioes(rs);
      setResumo(rp);
    } finally { setLoading(false); }
  }

  async function startNovaReuniao() {
    setIniciandoReuniao(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const rid = await iniciarReuniao(grupoId, hoje);
      navigate(`/pgm/${grupoId}/reuniao/${rid}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar reuniao");
    } finally { setIniciandoReuniao(false); }
  }

  async function adicionar() {
    if (!novoMembroId) { toast.error("Selecione uma pessoa"); return; }
    setBusy(true);
    try {
      await vincularPessoa(grupoId, novoMembroId);
      toast.success("Pessoa adicionada ao grupo");
      setNovoMembroId("");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function removerPessoa(pessoaId: string) {
    if (!confirm("Remover esta pessoa do grupo?")) return;
    try {
      await desvincularPessoa(grupoId, pessoaId);
      toast.success("Pessoa removida");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function trocarPapel(membroId: string, papel: PgmPapel) {
    try {
      await alterarPapel(membroId, papel);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function marcarComoPrincipal(membroId: string) {
    try {
      await marcarPrincipal(membroId);
      toast.success("Marcado como grupo principal");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function onDesativar() {
    setBusy(true);
    try {
      await desativarGrupo(grupoId);
      toast.success("Grupo desativado");
      navigate("/pgm");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function onReativar() {
    setBusy(true);
    try {
      await reativarGrupo(grupoId);
      toast.success("Grupo reativado");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function onExcluir() {
    setBusy(true);
    try {
      await excluirGrupo(grupoId);
      toast.success("Grupo excluído");
      navigate("/pgm");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }
  if (!grupo) {
    return <div className="p-8 text-center text-muted-foreground">
      Grupo não encontrado. <Link to="/pgm" className="text-primary underline">Voltar</Link>
    </div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start gap-2 flex-wrap">
        <Link to="/pgm">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" />
            <span className="truncate">{grupo.nome}</span>
            {grupo.qtd_filhos > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Multiplicador ({grupo.qtd_filhos})
              </Badge>
            )}
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            {(grupo.dia_semana != null || grupo.horario) && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {diaSemanaTexto(grupo.dia_semana)}
                {grupo.horario && <> <Clock className="w-3 h-3 ml-0.5" /> {horarioTexto(grupo.horario)}</>}
              </span>
            )}
            {grupo.bairro && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {grupo.bairro}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {grupo.whatsapp_link && (
            <a href={grupo.whatsapp_link} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-emerald-700 hover:text-emerald-700">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </a>
          )}
          {podeEditar && grupo.ativo && (
            <Button variant="outline" size="sm" onClick={() => setMultiplicarOpen(true)} className="gap-1.5 text-emerald-700 hover:text-emerald-700 hover:bg-emerald-50">
              <Sparkles className="w-3.5 h-3.5" /> Multiplicar
            </Button>
          )}
          {podeEditar && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
              {grupo.ativo ? (
                <Button variant="outline" size="sm" onClick={() => setConfirmDeactivate(true)} className="gap-1.5 text-amber-700">
                  <PowerOff className="w-3.5 h-3.5" /> Desativar
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onReativar} disabled={busy} className="gap-1.5 text-emerald-700">
                  <RotateCcw className="w-3.5 h-3.5" /> Reativar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1.5 text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {grupo.descricao && (
        <p className="text-sm italic text-muted-foreground">"{grupo.descricao}"</p>
      )}

      {/* Liderança em destaque */}
      <Card>
        <CardContent className="py-3 grid grid-cols-3 gap-3 text-xs">
          <Lideranca icon={<Crown className="w-3.5 h-3.5 text-gold" />} label="Líder" nome={grupo.lider_nome} />
          <Lideranca icon={<Star className="w-3.5 h-3.5 text-amber-600" />} label="Co-líder" nome={grupo.co_lider_nome} />
          <Lideranca icon={<HomeIcon className="w-3.5 h-3.5 text-blue-600" />} label="Anfitrião" nome={grupo.anfitriao_nome} />
        </CardContent>
      </Card>

      {/* Encontros */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Cal className="w-4 h-4 text-gold" /> Encontros
            </h3>
            {podeEditar && (
              <Button size="sm" onClick={startNovaReuniao} disabled={iniciandoReuniao} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
                <Play className="w-3.5 h-3.5" /> {iniciandoReuniao ? "..." : "Iniciar encontro de hoje"}
              </Button>
            )}
          </div>
          {reunioes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-3">
              Nenhum encontro registrado ainda.
            </p>
          ) : (
            <div className="space-y-1">
              {reunioes.slice(0, 5).map(r => {
                const res = resumo.find(rr => rr.reuniao_id === r.id);
                return (
                  <Link key={r.id} to={`/pgm/${grupoId}/reuniao/${r.id}`}
                    className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {new Date(r.data + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        {r.tema && (
                          <span className="text-xs text-muted-foreground italic truncate">
                            <BookOpen className="w-3 h-3 inline mr-0.5" /> {r.tema}
                          </span>
                        )}
                      </p>
                      {res && (
                        <p className="text-[11px] text-muted-foreground">
                          {res.presentes}/{res.total} presentes · {res.percentual}%
                        </p>
                      )}
                    </div>
                    <ChevR className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adicionar participante */}
      {podeEditar && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-gold" /> Adicionar participante
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <BuscaPessoa
                  value={novoMembroId}
                  onChange={(id) => setNovoMembroId(id)}
                  ignorarIds={membros.map(m => m.pessoa_id)}
                  placeholder="Buscar pessoa para adicionar..."
                />
              </div>
              <Button onClick={adicionar} disabled={busy || !novoMembroId}>
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de participantes */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Participantes ({membros.length})
        </h3>
        {membros.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Ainda sem participantes. Comece adicionando o líder e o co-líder.
            </CardContent>
          </Card>
        ) : (
          membros.map(m => (
            <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/40 transition-colors gap-2">
              <Link to={`/membros?abrir=${m.pessoa_id}`} className="flex items-center gap-2 min-w-0 flex-1 hover:underline">
                {PAPEL_ICONE[m.papel]}
                <span className="font-medium text-sm truncate">{m.nome_completo ?? "—"}</span>
                {m.principal && (
                  <Badge variant="outline" className="text-[9px] bg-gold/10 text-gold border-gold/40 shrink-0" title="Grupo principal desta pessoa">
                    ★ principal
                  </Badge>
                )}
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                {podeEditar && (
                  <>
                    <select
                      value={m.papel}
                      onChange={(e) => trocarPapel(m.id, e.target.value as PgmPapel)}
                      className="text-[10px] border rounded px-1 py-0.5 bg-background"
                    >
                      {(Object.entries(PAPEL_LABEL) as [PgmPapel, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    {!m.principal && (
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => marcarComoPrincipal(m.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-gold"
                        title="Marcar como grupo principal">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon"
                      onClick={() => removerPessoa(m.pessoa_id)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Remover do grupo">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pedidos de Oração */}
      <OracaoBlock grupoId={grupoId} podeEditar={podeEditar} />

      {/* Dialogs */}
      <MultiplicarDialog
        open={multiplicarOpen}
        onOpenChange={setMultiplicarOpen}
        grupoPaiId={grupoId}
        grupoPaiNome={grupo.nome}
      />
      <GrupoForm
        open={editOpen}
        onOpenChange={setEditOpen}
        grupo={grupo}
        onSaved={carregar}
      />

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{grupo.nome}</strong> será ocultado da lista padrão. Você pode reativar a qualquer momento.
              O histórico (encontros, participantes) é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDesativar} disabled={busy} className="bg-amber-700 text-white hover:bg-amber-700/90">
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga <strong>permanentemente</strong> o grupo, vínculos e histórico de encontros.
              <br />Para preservar o histórico, prefira <strong>Desativar</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onExcluir} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Lideranca({ icon, label, nome }: { icon: JSX.Element; label: string; nome: string | null | undefined }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wide">
        {icon} {label}
      </div>
      <p className="font-medium mt-0.5 truncate text-xs">{nome ?? "—"}</p>
    </div>
  );
}
