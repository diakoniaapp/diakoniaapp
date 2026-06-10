import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Link2, Briefcase, Sparkles, BarChart3, ShieldCheck, ShieldOff, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { MembroForm } from "@/components/membros/MembroForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VinculosPessoaDialog } from "@/components/familias/VinculosPessoaDialog";
import AtuacoesDialog from "@/components/membros/AtuacoesDialog";
import VisitanteDialog from "@/components/membros/VisitanteDialog";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import { buscarAcessoPorPessoa, type StatusAcesso } from "@/services/acessoService";

export interface Membro {
    id: string;
    nome_completo: string;
    cpf: string | null;
    data_nascimento: string | null;
    telefone_celular: string | null;
    email: string | null;
    bairro: string | null;
    status: "ativo" | "inativo" | "transferido" | "falecido" | "desligado";
    estado_civil: string | null;
    // Campos calculados na query (não persistem na tabela)
    areas?: string[];
    classe_ebd?: string | null;
    data_casamento: string | null;
    data_entrada: string | null;
    observacoes_pastorais: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    cidade: string | null;
    cep: string | null;
    sexo: string | null;
    tipo_pessoa: "membro" | "congregado" | "visitante";
    perfil_acesso:
      | "admin"
      | "pastor"
      | "secretaria"
      | "tesoureiro"
      | "lideranca"
      | "professor_ebd"
      | "voluntario"
      | "membro";
    status_acolhimento?: string | null;
    responsavel_id?: string | null;
    como_conheceu?: string | null;
    quem_convidou_id?: string | null;
    como_conheceu_descricao?: string | null;
}

const statusColor: Record<string, string> = {
    ativo: "bg-success/15 text-success border-success/30",
    inativo: "bg-muted text-muted-foreground border-border",
    transferido: "bg-warning/15 text-warning border-warning/30",
    desligado: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700",
    falecido: "bg-destructive/10 text-destructive border-destructive/30",
};

const tipoPessoaLabel: Record<string, string> = {
    membro: "Membro",
    congregado: "Congregado",
    visitante: "Visitante",
};

const tipoPessoaColor: Record<string, string> = {
    membro: "bg-primary/10 text-primary border-primary/30",
    congregado: "bg-accent/15 text-accent-foreground border-accent/30",
    visitante: "bg-warning/15 text-warning border-warning/30",
};

// ── Indicador visual de status de acesso ─────────────────────────────────────
function BadgeAcesso({ pessoaId }: { pessoaId: string }) {
    const [status, setStatus] = useState<StatusAcesso | null>(null);

  useEffect(() => {
        buscarAcessoPorPessoa(pessoaId).then((a) => {
                setStatus(a?.status ?? "sem_acesso");
        });
  }, [pessoaId]);

  if (status === null) return null;

  const cfg: Record<StatusAcesso, { icon: typeof ShieldCheck; label: string; className: string }> = {
        sem_acesso: { icon: ShieldOff, label: "Sem acesso", className: "text-slate-400" },
        aguardando: { icon: Clock, label: "Aguardando 1° acesso", className: "text-amber-500" },
        ativo: { icon: ShieldCheck, label: "Acesso ativo", className: "text-emerald-500" },
  };

  const { icon: Icon, label, className } = cfg[status];
    return (
          <span title={label} className={`shrink-0 ${className}`}>
                  <Icon className="w-4 h-4" />
          </span>
        );
}

export default function Membros() {
    const { canEdit, hasRole } = useAuth();
    const [membros, setMembros] = useState<Membro[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Membro | null>(null);
    const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
    const [perfilFiltro, setPerfilFiltro] = useState<string>("todos");
    const [vinculosPessoa, setVinculosPessoa] = useState<Membro | null>(null);
    const [atuacoesPessoa, setAtuacoesPessoa] = useState<Membro | null>(null);
    const [visitantePessoa, setVisitantePessoa] = useState<Membro | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

  // ── Tratar parâmetros de query ao carregar ──────────────────────────────────
  useEffect(() => {
        if (searchParams.get("novo") === "1" && canEdit) {
                setEditing(null);
                setOpen(true);
                searchParams.delete("novo");
                searchParams.delete("t");
                setSearchParams(searchParams, { replace: true });
        }
  }, [searchParams, canEdit, setSearchParams]);

  const load = async () => {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
                .from("membros")
                .select(`
                  *,
                  area_voluntarios!area_voluntarios_membro_id_fkey(area_id, status, areas(nome)),
                  ebd_matriculas(classe_id, ativo, ebd_classes(nome))
                `)
                .order("nome_completo");
        if (error) {
                toast.error(error.message);
                setError(error.message);
        }
        const lista = ((data ?? []) as any[]).map((m: any) => ({
                ...m,
                areas: (m.area_voluntarios ?? [])
                  .filter((av: any) => av.status === "ativa" && av.areas?.nome)
                  .map((av: any) => av.areas.nome),
                classe_ebd: (m.ebd_matriculas ?? [])
                  .find((em: any) => em.ativo && em.ebd_classes?.nome)?.ebd_classes?.nome ?? null,
        })) as Membro[];
        setMembros(lista);
        setLoading(false);

        // ── Tratar param "abrir": abre automaticamente a ficha da pessoa ──────────
        const abrirId = searchParams.get("abrir");
        if (abrirId && canEdit) {
                const pessoa = lista.find((m) => m.id === abrirId);
                if (pessoa) {
                          setEditing(pessoa);
                          setOpen(true);
                          toast.success(`Ficha de ${pessoa.nome_completo.split(" ")[0]} aberta — crie o acesso abaixo!`, { duration: 5000 });
                }
                searchParams.delete("abrir");
                setSearchParams(searchParams, { replace: true });
        }
  };

  useEffect(() => {
        load();
  }, []);

  const filtered = membros.filter((m) => {
        const q = search.toLowerCase();
        const matchSearch =
                !q ||
                m.nome_completo.toLowerCase().includes(q) ||
                (m.cpf ?? "").includes(q) ||
                (m.bairro ?? "").toLowerCase().includes(q);
        const matchTipo = tipoFiltro === "todos" || m.tipo_pessoa === tipoFiltro;
        const matchPerfil = perfilFiltro === "todos" || m.perfil_acesso === perfilFiltro;
        return matchSearch && matchTipo && matchPerfil;
  });

  return (
        <div>
              <PageHeader
                        title="Pessoas"
                        description={`${membros.length} cadastrados • ${membros.filter((m) => m.status === "ativo").length} ativos`}
                        actions={
                                    canEdit && (
                                                  <div className="flex gap-2">
                                                                <Button
                                                                                  onClick={() => {
                                                                                                      setEditing(null);
                                                                                                      setOpen(true);
                                                                                    }}
                                                                                  className="gap-2"
                                                                                >
                                                                                <Plus className="w-4 h-4" /> Nova pessoa
                                                                </Button>
                                                                <Button asChild variant="outline" className="gap-2">
                                                                                <Link to="/visitantes"><BarChart3 className="w-4 h-4" /> <span translate="no">Painel</span></Link>
                                                                </Button>
                                                  </div>
                        )
                }
                    />
                    <div className="p-4 md:p-8 space-y-4">
                            <div className="flex flex-col md:flex-row gap-3 md:items-center">
                                      <div className="relative max-w-md flex-1">
                                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                  <Input
                                                                  className="pl-9"
                                                                  placeholder="Buscar por nome, CPF ou bairro..."
                                                                  value={search}
                                                                  onChange={(e) => setSearch(e.target.value)}
                                                                />
                                      </div>
                                      <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                                                  <SelectTrigger className="md:w-56">
                                                                <SelectValue placeholder="Tipo de pessoa" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                                <SelectItem value="todos">Todos os tipos</SelectItem>
                                                                <SelectItem value="membro">Membro</SelectItem>
                                                                <SelectItem value="congregado">Congregado</SelectItem>
                                                                <SelectItem value="visitante">Visitante</SelectItem>
                                                  </SelectContent>
                                      </Select>
                                      <Select value={perfilFiltro} onValueChange={setPerfilFiltro}>
                                                  <SelectTrigger className="md:w-56">
                                                                <SelectValue placeholder="Perfil de Acesso" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                                <SelectItem value="todos">Todos os perfis</SelectItem>
                                                                <SelectItem value="admin">Admin</SelectItem>
                                                                <SelectItem value="pastor">Pastor</SelectItem>
                                                                <SelectItem value="secretaria">Secretaria</SelectItem>
                                                                <SelectItem value="tesoureiro">Tesoureiro</SelectItem>
                                                                <SelectItem value="lideranca">Liderança</SelectItem>
                                                                <SelectItem value="professor_ebd">Professor EBD</SelectItem>
                                                                <SelectItem value="voluntario">Voluntário</SelectItem>
                                                                <SelectItem value="membro">Membro</SelectItem>
                                                  </SelectContent>
                                      </Select>
                            </div>
                    
                      {loading ? (
                                    <ListSkeleton className="grid gap-3" count={5} />
                                  ) : error ? (
                                    <ErrorState onRetry={load} />
                                  ) : filtered.length === 0 ? (
                                    <EmptyState message="Nenhuma pessoa encontrada" />
                                  ) : (
                                    <div className="grid gap-3">
                                      {filtered.map((m) => (
                                                    <Card key={m.id} className="shadow-card-soft hover:shadow-elevated transition-shadow">
                                                                    <CardContent className="p-4 flex items-center gap-4">
                                                                                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-serif text-lg flex items-center justify-center shrink-0">
                                                                                        {m.nome_completo
                                                                                                                .split(" ")
                                                                                                                .slice(0, 2)
                                                                                                                .map((n) => n[0])
                                                                                                                .join("")}
                                                                                        </div>
                                                                                      <div className="flex-1 min-w-0">
                                                                                                          <div className="flex items-center gap-2 flex-wrap">
                                                                                                                                <span className="font-medium truncate">{m.nome_completo}</span>
                                                                                                                                <Badge variant="outline" className={tipoPessoaColor[m.tipo_pessoa]}>
                                                                                                                                  {tipoPessoaLabel[m.tipo_pessoa]}
                                                                                                                                  </Badge>
                                                                                                            {m.tipo_pessoa === "membro" && (
                                                                              <Badge variant="outline" className={statusColor[m.status]}>
                                                                                {m.status}
                                                                                </Badge>
                                                                                                                                )}
                                                                                                            </div>
                                                                                                          <div className="text-sm text-muted-foreground truncate">
                                                                                                            {[m.telefone_celular, m.email, m.bairro].filter(Boolean).join(" • ") || "—"}
                                                                                                            </div>
                                                                                                          {(m.classe_ebd || (m.areas && m.areas.length > 0)) && (
                                                                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                                                              {m.classe_ebd && (
                                                                                                                <Badge variant="outline" className="text-[10px] bg-gold/10 border-gold/30 text-foreground/80">
                                                                                                                  EBD: {m.classe_ebd}
                                                                                                                </Badge>
                                                                                                              )}
                                                                                                              {(m.areas ?? []).map((a) => (
                                                                                                                <Badge key={a} variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300">
                                                                                                                  {a}
                                                                                                                </Badge>
                                                                                                              ))}
                                                                                                            </div>
                                                                                                          )}
                                                                                        </div>
                                                                      {/* Indicador de acesso para congregados e membros */}
                                                                      {(m.tipo_pessoa === "congregado" || m.tipo_pessoa === "membro") && (
                                                                          <BadgeAcesso pessoaId={m.id} />
                                                                        )}
                                                                      {canEdit && (
                                                                          <div className="flex gap-0.5 shrink-0">
                                                                            {m.tipo_pessoa === "visitante" && (
                                                                                                    <Button
                                                                                                                                variant="ghost"
                                                                                                                                size="icon"
                                                                                                                                className="h-9 w-9"
                                                                                                                                title="Acompanhar visitante"
                                                                                                                                onClick={() => setVisitantePessoa(m)}
                                                                                                                              >
                                                                                                                              <Sparkles className="w-4 h-4 text-warning" />
                                                                                                      </Button>
                                                                                                )}
                                                                                                <Button
                                                                                                                          variant="ghost"
                                                                                                                          size="icon"
                                                                                                                          className="h-9 w-9"
                                                                                                                          title="Vínculos familiares"
                                                                                                                          onClick={() => setVinculosPessoa(m)}
                                                                                                                        >
                                                                                                                        <Link2 className="w-4 h-4" />
                                                                                                  </Button>
                                                                                                <Button
                                                                                                                          variant="ghost"
                                                                                                                          size="icon"
                                                                                                                          className="h-9 w-9"
                                                                                                                          title="Atuações voluntárias"
                                                                                                                          onClick={() => setAtuacoesPessoa(m)}
                                                                                                                        >
                                                                                                                        <Briefcase className="w-4 h-4" />
                                                                                                  </Button>
                                                                                                <Button
                                                                                                                          variant="ghost"
                                                                                                                          size="icon"
                                                                                                                          className="h-9 w-9"
                                                                                                                          onClick={() => {
                                                                                                                                                      setEditing(m);
                                                                                                                                                      setOpen(true);
                                                                                                                            }}
                                                                                                                        >
                                                                                                                        <Pencil className="w-4 h-4" />
                                                                                                  </Button>
                                                                          </div>
                                                                                      )}
                                                                    </CardContent>
                                                    </Card>
                                                  ))}
                                    </div>
                            )}
                    </div>
              
                    <MembroForm open={open} onOpenChange={setOpen} membro={editing} onSaved={load} />
                    <VinculosPessoaDialog
                              open={!!vinculosPessoa}
                              onOpenChange={(v) => {
                                          if (!v) setVinculosPessoa(null);
                              }}
                              pessoa={vinculosPessoa}
                            />
                    <AtuacoesDialog
                              open={!!atuacoesPessoa}
                              onOpenChange={(v) => {
                                          if (!v) setAtuacoesPessoa(null);
                              }}
                              pessoa={atuacoesPessoa}
                            />
                    <VisitanteDialog
                              open={!!visitantePessoa}
                              onOpenChange={(v) => { if (!v) setVisitantePessoa(null); }}
                              pessoa={visitantePessoa}
                              onSaved={load}
                            />
              </div>
          );
          }
