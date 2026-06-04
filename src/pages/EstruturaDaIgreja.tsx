// ============================================================
// EstruturaDaIgreja.tsx
// Tela unificada da estrutura organizacional da Igreja
// 3 abas: Institucional (diretoria eleita) | Ministerios | Estrutura Doc.
// Le: pessoa_cargo_estatutario + ministerios + documento_estrutura
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PessoaCard from "@/components/membros/PessoaCard";
import {
  Crown, Church, MapPin, Users, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, Network, Settings, RefreshCw, FileText, Star,
} from "lucide-react";

// -- Tipos ---------------------------------------------------

interface CargoEstatutario {
  id: string;
  cargo: string;
  nivel: number;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  mandato: string | null;
}

interface AreaMin {
  id: string;
  nome: string;
  lider_id: string | null;
  lider_nome: string | null;
  setores: { id: string; nome: string }[];
}

interface MembroMin {
  id: string;
  nome_completo: string;
  funcao: string | null;
}

interface Ministerio {
  id: string;
  nome: string;
  sigla: string | null;
  cor: string | null;
  tipo: string;
  lider_id: string | null;
  lider_nome: string | null;
  lider_foto: string | null;
  vice_lider_id: string | null;
  vice_lider_nome: string | null;
  areas: AreaMin[];
  membros: MembroMin[];
  membros_count: number;
}

interface EstruturaItem {
  id: string;
  tipo: string;
  nivel: string;
  nome: string;
  descricao: string | null;
  responsabilidades: string | null;
  base_institucional: string | null;
  ordem: number;
}

// -- Helpers -------------------------------------------------

const NIVEL_EMOJI: Record<number, string> = { 1: "👑", 2: "⭐", 3: "📋", 4: "💰" };
const NIVEL_LABELS: Record<number, string> = {
  1: "Presidencia",
  2: "Vice-presidencia",
  3: "Secretaria",
  4: "Tesouraria",
};

function AvatarPessoa({ nome, foto, size = "sm" }: {
  nome: string; foto?: string | null; size?: "sm" | "md" | "lg";
}) {
  const sz =
    size === "lg" ? "w-12 h-12 text-sm" :
    size === "md" ? "w-9 h-9 text-xs" : "w-7 h-7 text-[10px]";
  const iniciais = nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  if (foto)
    return <img src={foto} alt={nome} className={`${sz} rounded-full object-cover border border-border shrink-0`} />;
  return (
    <div className={`${sz} rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 border border-primary/20`}>
      {iniciais}
    </div>
  );
}

function PessoaPill({ id, nome, foto, funcao, onClick }: {
  id: string; nome: string; foto?: string | null;
  funcao?: string | null; onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      title={nome}
      className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs bg-background hover:bg-muted transition-colors"
    >
      <AvatarPessoa nome={nome} foto={foto} size="sm" />
      <span className="font-medium truncate max-w-[90px]">{nome.split(" ")[0]}</span>
      {funcao && (
        <Badge variant="outline" className="text-[9px] h-3.5 px-1 hidden sm:flex">
          {funcao}
        </Badge>
      )}
    </button>
  );
}

// -- Cartao de Ministerio expansivel -------------------------

function MinisterioCard({ min, onPessoa, isAdmin, onEdit }: {
  min: Ministerio; onPessoa: (id: string) => void;
  isAdmin: boolean; onEdit: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const cor = min.cor ?? "#6B7280";

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        style={{ borderLeft: `4px solid ${cor}` }}
        onClick={() => setExpandido(!expandido)}
      >
        <Church className="w-4 h-4 shrink-0" style={{ color: cor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{min.nome}</span>
            {min.sigla && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">{min.sigla}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {min.lider_nome && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                {min.lider_nome.split(" ")[0]}
              </span>
            )}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {min.membros_count} {min.membros_count === 1 ? "pessoa" : "pessoas"}
            </Badge>
            {min.areas.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {min.areas.length} {min.areas.length === 1 ? "area" : "areas"}
              </Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Gerenciar ministerio"
            className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
        {expandido
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expandido && (
        <div className="px-4 pb-4 pt-2 space-y-4 bg-muted/10 border-t">
          {(min.lider_id || min.vice_lider_id) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lideranca</p>
              <div className="flex flex-wrap gap-2">
                {min.lider_id && min.lider_nome && (
                  <PessoaPill id={min.lider_id} nome={min.lider_nome} foto={min.lider_foto} funcao="Lider" onClick={onPessoa} />
                )}
                {min.vice_lider_id && min.vice_lider_nome && (
                  <PessoaPill id={min.vice_lider_id} nome={min.vice_lider_nome} funcao="Co-lider" onClick={onPessoa} />
                )}
              </div>
            </div>
          )}

          {min.areas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Areas</p>
              <div className="space-y-1.5">
                {min.areas.map((area) => (
                  <div key={area.id} className="rounded-lg border bg-background px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-green-600" />
                      <span className="text-xs font-medium">{area.nome}</span>
                      {area.lider_id && area.lider_nome && (
                        <PessoaPill id={area.lider_id} nome={area.lider_nome} funcao="Lider de Area" onClick={onPessoa} />
                      )}
                    </div>
                    {area.setores.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-1">
                        {area.setores.map((s) => (
                          <Badge key={s.id} variant="outline" className="text-[10px]">{s.nome}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {min.membros.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pessoas ({min.membros.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {min.membros.slice(0, 16).map((m) => (
                  <PessoaPill key={m.id} id={m.id} nome={m.nome_completo}
                    funcao={m.funcao ?? undefined} onClick={onPessoa} />
                ))}
                {min.membros.length > 16 && (
                  <span className="text-[11px] text-muted-foreground self-center">
                    +{min.membros.length - 16} mais
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -- Componente Principal ------------------------------------

export default function EstruturaDaIgreja() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole(["admin", "secretaria"]);

  const [loading, setLoading] = useState(true);
  const [ministerios, setMinerios] = useState<Ministerio[]>([]);
  const [diretoria, setDiretoria] = useState<CargoEstatutario[]>([]);
  const [estDoc, setEstDoc] = useState<{
    institucional: EstruturaItem[];
    ministerial: EstruturaItem[];
    area: EstruturaItem[];
  }>({ institucional: [], ministerial: [], area: [] });
  const [stats, setStats] = useState({ membros: 0, ministerios: 0, semLider: 0, estTotal: 0 });
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);

    // Membros ativos
    const { data: membrosData } = await supabase
      .from("membros").select("id,tipo_pessoa").eq("status", "ativo");

    // Diretoria eleita (cargos estatutarios)
    const { data: ce } = await supabase
      .from("pessoa_cargo_estatutario")
      .select("id,mandato,pessoa_id,cargos_estatutarios(nome,nivel),membros(nome_completo,foto_url)")
      .eq("ativo", true)
      .order("created_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDiretoria((ce ?? []).map((r: any) => ({
      id: r.id,
      cargo: r.cargos_estatutarios?.nome ?? "–",
      nivel: r.cargos_estatutarios?.nivel ?? 9,
      pessoa_id: r.pessoa_id,
      pessoa_nome: r.membros?.nome_completo ?? "–",
      pessoa_foto: r.membros?.foto_url ?? null,
      mandato: r.mandato,
    })));

    // Ministerios com lideres
    const { data: mins } = await supabase
      .from("ministerios")
      .select(`id,nome,sigla,cor,tipo,lider_id,vice_lider_id,
        lider:membros!ministerios_lider_id_fkey(id,nome_completo,foto_url),
        vice_lider:membros!ministerios_vice_lider_id_fkey(id,nome_completo,foto_url)`)
      .eq("ativo", true)
      .order("nome");

    const { data: allAreas } = await supabase
      .from("areas").select("id,ministerio_id,nome,lider:membros(id,nome_completo)").eq("ativo", true);
    const { data: allSetores } = await supabase
      .from("setores").select("id,area_id,nome").eq("ativo", true);
    const { data: membMin } = await supabase
      .from("ministerio_membros").select("ministerio_id,funcao,membros(id,nome_completo)").eq("ativo", true);

    // Montar areas
    const areasMap: Record<string, AreaMin[]> = {};
    for (const a of (allAreas ?? [])) {
      const setores = (allSetores ?? []).filter((s) => s.area_id === a.id).map((s) => ({ id: s.id, nome: s.nome }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mid = (a as any).ministerio_id;
      if (!areasMap[mid]) areasMap[mid] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lider = (a as any).lider;
      areasMap[mid].push({ id: a.id, nome: a.nome, lider_id: lider?.id ?? null, lider_nome: lider?.nome_completo ?? null, setores });
    }

    // Montar membros
    const membMap: Record<string, MembroMin[]> = {};
    for (const mm of (membMin ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mid = (mm as any).ministerio_id;
      if (!membMap[mid]) membMap[mid] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      membMap[mid].push({ id: (mm as any).membros?.id, nome_completo: (mm as any).membros?.nome_completo ?? "–", funcao: (mm as any).funcao });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lista: Ministerio[] = (mins ?? []).map((m: any) => ({
      id: m.id, nome: m.nome, sigla: m.sigla, cor: m.cor,
      tipo: m.tipo ?? "operacional",
      lider_id: m.lider?.id ?? null,
      lider_nome: m.lider?.nome_completo ?? null,
      lider_foto: m.lider?.foto_url ?? null,
      vice_lider_id: m.vice_lider?.id ?? null,
      vice_lider_nome: m.vice_lider?.nome_completo ?? null,
      areas: areasMap[m.id] ?? [],
      membros: membMap[m.id] ?? [],
      membros_count: (membMap[m.id] ?? []).length,
    }));
    setMinerios(lista);

    // Estrutura derivada dos documentos
    const { data: estData } = await supabase
      .from("documento_estrutura").select("*").eq("ativo", true)
      .order("nivel").order("ordem").order("nome");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = (estData ?? []).filter((e: any) => e.nivel === "institucional");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const min2 = (estData ?? []).filter((e: any) => e.nivel === "ministerial");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const areaE = (estData ?? []).filter((e: any) => e.nivel === "area");
    setEstDoc({ institucional: inst as EstruturaItem[], ministerial: min2 as EstruturaItem[], area: areaE as EstruturaItem[] });

    // Ultima sincronizacao registrada
    const { data: hist } = await supabase
      .from("documentos_historico").select("created_at")
      .eq("acao", "sincronizacao_estrutura")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (hist?.created_at) {
      setUltimaSync(new Date(hist.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short", year: "numeric",
      }));
    }

    const operacionais = lista.filter((m) => m.tipo !== "governanca");
    const estTotal = inst.length + min2.length + areaE.length;
    setStats({
      membros: (membrosData ?? []).filter((p) => p.tipo_pessoa === "membro").length,
      ministerios: operacionais.length,
      semLider: operacionais.filter((m) => !m.lider_id).length,
      estTotal,
    });
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const operacionais = ministerios.filter((m) => m.tipo !== "governanca");

  return (
    <div>
      <PageHeader
        title="Estrutura da Igreja"
        description="Diretoria eleita, ministerios e estrutura derivada dos documentos"
        actions={
          isAdmin ? (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/documentos")}>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Documentos
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 md:p-8 space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Membros ativos", value: stats.membros, icon: <Star className="w-4 h-4" />, cor: "text-blue-600" },
            { label: "Ministerios", value: stats.ministerios, icon: <Church className="w-4 h-4" />, cor: "text-purple-600" },
            { label: "Estrutura doc.", value: stats.estTotal, icon: <Network className="w-4 h-4" />, cor: "text-amber-600" },
            { label: "Diretoria", value: diretoria.length, icon: <Crown className="w-4 h-4" />, cor: "text-primary" },
          ].map((s) => (
            <Card key={s.label} className="shadow-card-soft">
              <CardContent className="p-4">
                <div className={`${s.cor} mb-1`}>{s.icon}</div>
                <div className="text-2xl font-bold">{loading ? "–" : s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!loading && stats.semLider > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-sm text-warning">
              <span className="font-bold">{stats.semLider}</span>{" "}
              {stats.semLider === 1 ? "ministerio sem lider definido" : "ministerios sem lider definido"}
            </p>
          </div>
        )}

        {ultimaSync && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Estrutura derivada sincronizada em {ultimaSync}
          </p>
        )}

        <Tabs defaultValue="diretoria">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="diretoria">
              <Crown className="w-4 h-4 mr-1.5" /> Institucional
            </TabsTrigger>
            <TabsTrigger value="ministerios">
              <Church className="w-4 h-4 mr-1.5" /> Ministerios
            </TabsTrigger>
            <TabsTrigger value="documentos">
              <Network className="w-4 h-4 mr-1.5" /> Estrutura Doc.
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diretoria" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /><span>Carregando...</span>
              </div>
            ) : diretoria.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Crown className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Nenhum cargo estatutario cadastrado.</p>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground/70">
                    Atribua cargos em Pessoas, editar, Cargo Estatutario.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {[1, 2, 3, 4].map((nivel) => {
                  const deste = diretoria.filter((d) => d.nivel === nivel);
                  if (!deste.length) return null;
                  return (
                    <div key={nivel}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{NIVEL_EMOJI[nivel]}</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {NIVEL_LABELS[nivel]}
                        </h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {deste.map((d) => (
                          <button
                            key={d.id}
                            onClick={() => setPessoaId(d.pessoa_id)}
                            className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-left hover:bg-purple-100/50 transition-colors w-full"
                          >
                            <AvatarPessoa nome={d.pessoa_nome} foto={d.pessoa_foto} size="md" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{d.pessoa_nome}</p>
                              <p className="text-xs text-purple-700">{d.cargo}</p>
                              {d.mandato && (
                                <p className="text-[10px] text-muted-foreground">Mandato {d.mandato}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ministerios" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /><span>Carregando...</span>
              </div>
            ) : operacionais.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Church className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Nenhum ministerio cadastrado.</p>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/ministerios")}>
                    <Settings className="w-3.5 h-3.5 mr-1.5" /> Gerenciar ministerios
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {operacionais.map((m) => (
                  <MinisterioCard
                    key={m.id} min={m} onPessoa={setPessoaId}
                    isAdmin={isAdmin} onEdit={() => navigate("/ministerios")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documentos" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /><span>Carregando...</span>
              </div>
            ) : stats.estTotal === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Network className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Nenhuma estrutura derivada dos documentos ainda.</p>
                <p className="text-xs text-muted-foreground/70">
                  Acesse Documentos, Estrutura Derivada, Sincronizar para popular automaticamente.
                </p>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/documentos")}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> Ir para Documentos
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {(["institucional", "ministerial", "area"] as const).map((nivel) => {
                  const itens = estDoc[nivel];
                  if (!itens.length) return null;
                  const config = {
                    institucional: { label: "Diretoria e Conselhos", icon: <Crown className="w-4 h-4 text-purple-600" />, border: "border-purple-200", bg: "bg-purple-50/50" },
                    ministerial: { label: "Ministerios", icon: <Church className="w-4 h-4 text-blue-600" />, border: "border-blue-200", bg: "bg-blue-50/50" },
                    area: { label: "Areas e Setores", icon: <MapPin className="w-4 h-4 text-green-600" />, border: "border-green-200", bg: "bg-green-50/50" },
                  } as const;
                  const c = config[nivel];
                  return (
                    <div key={nivel}>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                        {c.icon} {c.label} ({itens.length})
                      </h3>
                      <div className="space-y-2">
                        {itens.map((item) => (
                          <div key={item.id} className={`rounded-xl border px-4 py-3 ${c.border} ${c.bg}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">{item.nome}</span>
                                {item.base_institucional && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                    📄 {item.base_institucional}
                                  </Badge>
                                )}
                              </div>
                              {item.descricao && (
                                <p className="text-xs text-muted-foreground">{item.descricao}</p>
                              )}
                              {item.responsabilidades && (
                                <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">
                                  {item.responsabilidades}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <PessoaCard pessoaId={pessoaId} open={!!pessoaId} onClose={() => setPessoaId(null)} />
    </div>
  );
}
