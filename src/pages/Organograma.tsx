// ============================================================
// Organograma.tsx
// Estrutura organizacional completa da Igreja
// Igreja → Diretoria / Ministérios → Áreas → Setores → Pessoas
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PessoaCard from "@/components/membros/PessoaCard";
import {
  ChevronDown, ChevronRight, Users, Crown, Church, MapPin,
  Building2, Star, Shield, Loader2, AlertTriangle, BookOpen, Network,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────

interface Lider {
  id: string;
  nome_completo: string;
  foto_url: string | null;
}

interface MembroMinisterio {
  id: string;
  nome_completo: string;
  funcao: string | null;
}

interface Area {
  id: string;
  nome: string;
  lider: Lider | null;
  setores: Setor[];
  membros_count: number;
}

interface Setor {
  id: string;
  nome: string;
  lider: Lider | null;
}

interface Ministerio {
  id: string;
  nome: string;
  sigla: string | null;
  cor: string | null;
  tipo: string;
  lider: Lider | null;
  vice_lider: Lider | null;
  areas: Area[];
  membros: MembroMinisterio[];
  membros_count: number;
}

interface CargoEstatutario {
  id: string;
  cargo: string;
  nivel: number;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  mandato: string | null;
}

interface ConselhoMembro {
  pessoa_id: string;
  nome_completo: string;
  foto_url: string | null;
  cargo: string;
  nivel_cargo: number;
  tipo_participacao: string;
  ministerio_nome: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

const NIVEL_EMOJI: Record<number, string> = {
  1: "👑", 2: "⭐", 3: "📋", 4: "💰",
};

const NIVEL_COR: Record<string, string> = {
  diretoria:  "border-purple-300 bg-purple-50",
  ministerio: "border-blue-300 bg-blue-50",
  area:       "border-green-300 bg-green-50",
  diacono:    "border-amber-300 bg-amber-50",
};

function AvatarPessoa({ nome, foto, size = "sm" }: { nome: string; foto?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-10 h-10 text-xs";
  const iniciais = nome.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  if (foto) return (
    <img src={foto} alt={nome}
      className={`${sz} rounded-full object-cover border border-border shrink-0`} />
  );
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
  const primeiroNome = nome.split(" ")[0];
  return (
    <button
      onClick={() => onClick(id)}
      className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs bg-background hover:bg-muted transition-colors"
      title={nome}
    >
      <AvatarPessoa nome={nome} foto={foto} size="sm" />
      <span className="font-medium truncate max-w-[80px]">{primeiroNome}</span>
      {funcao && (
        <Badge variant="outline" className="text-[9px] h-3.5 px-1 hidden sm:flex">
          {funcao}
        </Badge>
      )}
    </button>
  );
}

// ── Componente: Nó de Ministério ──────────────────────────────

function MinisterioNode({ min, onClick }: { min: Ministerio; onClick: (id: string) => void }) {
  const [expandido, setExpandido] = useState(false);
  const cor = min.cor ?? "#6B7280";

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden">
      {/* Cabeçalho do ministério */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        style={{ borderLeft: `4px solid ${cor}` }}
        onClick={() => setExpandido(!expandido)}
      >
        <Church className="w-4 h-4 shrink-0" style={{ color: cor }} />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{min.nome}</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {min.lider && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                {min.lider.nome_completo.split(" ")[0]}
              </span>
            )}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {min.membros_count} {min.membros_count === 1 ? "pessoa" : "pessoas"}
            </Badge>
            {min.areas.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {min.areas.length} {min.areas.length === 1 ? "área" : "áreas"}
              </Badge>
            )}
          </div>
        </div>
        {expandido
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="px-4 pb-4 pt-2 space-y-4 bg-muted/10 border-t">

          {/* Liderança */}
          {(min.lider || min.vice_lider) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Liderança</p>
              <div className="flex flex-wrap gap-2">
                {min.lider && (
                  <PessoaPill id={min.lider.id} nome={min.lider.nome_completo}
                    foto={min.lider.foto_url} funcao="Líder" onClick={onClick} />
                )}
                {min.vice_lider && (
                  <PessoaPill id={min.vice_lider.id} nome={min.vice_lider.nome_completo}
                    foto={min.vice_lider.foto_url} funcao="Co-líder" onClick={onClick} />
                )}
              </div>
            </div>
          )}

          {/* Áreas */}
          {min.areas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Áreas</p>
              <div className="space-y-2">
                {min.areas.map(area => (
                  <div key={area.id} className="rounded-lg border bg-background px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-medium">{area.nome}</span>
                      {area.lider && (
                        <PessoaPill id={area.lider.id} nome={area.lider.nome_completo}
                          foto={area.lider.foto_url} funcao="Líder de Área" onClick={onClick} />
                      )}
                    </div>
                    {area.setores.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-1">
                        {area.setores.map(s => (
                          <Badge key={s.id} variant="outline" className="text-[10px]">
                            {s.nome}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Membros do ministério */}
          {min.membros.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pessoas ({min.membros.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {min.membros.slice(0, 16).map(m => (
                  <PessoaPill key={m.id} id={m.id} nome={m.nome_completo}
                    funcao={m.funcao ?? undefined} onClick={onClick} />
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

// ── Componente Principal ──────────────────────────────────────

export default function Organograma() {
  const [ministerios, setMinerios]   = useState<Ministerio[]>([]);
  const [diretoria, setDiretoria]    = useState<CargoEstatutario[]>([]);
  const [conselho, setConselho]      = useState<ConselhoMembro[]>([]);
  const [stats, setStats]            = useState({ total: 0, membros: 0, congregados: 0, visitantes: 0 });
  const [loading, setLoading]        = useState(true);
  const [pessoaId, setPessoaId]      = useState<string | null>(null);
  // Estrutura derivada dos documentos
  const [estDoc, setEstDoc]          = useState<any[]>([]);
  const [loadingEst, setLoadingEst]  = useState(false);

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);

      // Stats globais
      const { data: todos } = await supabase
        .from("membros")
        .select("id,tipo_pessoa,status")
        .eq("status", "ativo");
      if (todos) {
        setStats({
          total:       todos.length,
          membros:     todos.filter(p => p.tipo_pessoa === "membro").length,
          congregados: todos.filter(p => p.tipo_pessoa === "congregado").length,
          visitantes:  todos.filter(p => p.tipo_pessoa === "visitante").length,
        });
      }

      // Diretoria estatutária
      const { data: ce } = await supabase
        .from("pessoa_cargo_estatutario")
        .select("id,mandato,pessoa_id,cargos_estatutarios(nome,nivel),membros(nome_completo,foto_url)")
        .eq("ativo", true)
        .order("created_at");
      setDiretoria((ce ?? []).map((r: any) => ({
        id: r.id,
        cargo:       r.cargos_estatutarios?.nome ?? "–",
        nivel:       r.cargos_estatutarios?.nivel ?? 9,
        pessoa_id:   r.pessoa_id,
        pessoa_nome: r.membros?.nome_completo ?? "–",
        pessoa_foto: r.membros?.foto_url ?? null,
        mandato:     r.mandato,
      })));

      // Conselho (view)
      const { data: cv } = await supabase
        .from("v_conselho_da_igreja")
        .select("*");
      setConselho((cv ?? []) as ConselhoMembro[]);

      // Ministérios com líderes
      const { data: mins } = await supabase
        .from("ministerios")
        .select(`
          id, nome, sigla, cor, tipo,
          lider_id, vice_lider_id,
          lider:membros!ministerios_lider_id_fkey(id, nome_completo, foto_url),
          vice_lider:membros!ministerios_vice_lider_id_fkey(id, nome_completo, foto_url)
        `)
        .eq("ativo", true)
        .order("nome");

      // Áreas com líderes
      const { data: allAreas } = await supabase
        .from("areas")
        .select("id,ministerio_id,nome,lider:membros(id,nome_completo,foto_url)")
        .eq("ativo", true);

      // Setores
      const { data: allSetores } = await supabase
        .from("setores")
        .select("id,area_id,nome,lider:membros(id,nome_completo,foto_url)")
        .eq("ativo", true);

      // Membros por ministério
      const { data: membMin } = await supabase
        .from("ministerio_membros")
        .select("ministerio_id,funcao,membros(id,nome_completo)")
        .eq("ativo", true);

      // Montar estrutura
      const areasMap: Record<string, Area[]> = {};
      for (const a of (allAreas ?? [])) {
        const setores = (allSetores ?? [])
          .filter(s => s.area_id === a.id)
          .map(s => ({
            id: s.id, nome: s.nome,
            lider: s.lider as unknown as Lider | null,
          }));
        const aid = (a as any).ministerio_id;
        if (!areasMap[aid]) areasMap[aid] = [];
        areasMap[aid].push({
          id: a.id, nome: a.nome,
          lider: (a as any).lider as unknown as Lider | null,
          setores,
          membros_count: 0,
        });
      }

      const membrosMap: Record<string, MembroMinisterio[]> = {};
      for (const mm of (membMin ?? [])) {
        const mid = (mm as any).ministerio_id;
        if (!membrosMap[mid]) membrosMap[mid] = [];
        membrosMap[mid].push({
          id: (mm as any).membros?.id,
          nome_completo: (mm as any).membros?.nome_completo ?? "–",
          funcao: (mm as any).funcao,
        });
      }

      const lista: Ministerio[] = (mins ?? []).map((m: any) => ({
        id:          m.id,
        nome:        m.nome,
        sigla:       m.sigla,
        cor:         m.cor,
        tipo:        m.tipo ?? "operacional",
        lider:       m.lider as unknown as Lider | null,
        vice_lider:  m.vice_lider as unknown as Lider | null,
        areas:       areasMap[m.id] ?? [],
        membros:     membrosMap[m.id] ?? [],
        membros_count: (membrosMap[m.id] ?? []).length,
      }));

      setMinerios(lista);
      setLoading(false);
    };
    carregar();
  }, []);

  const operacionais = ministerios.filter(m => m.tipo !== "governanca");
  const semLider     = operacionais.filter(m => !m.lider).length;

  return (
    <div>
      <PageHeader
        title="Organograma"
        description="Estrutura organizacional da Igreja"
      />

      <div className="p-4 md:p-8 space-y-6">

        {/* Cards de estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total de pessoas", value: stats.total,       icon: <Users className="w-4 h-4" />, cor: "text-primary" },
            { label: "Membros",          value: stats.membros,      icon: <Star className="w-4 h-4" />,  cor: "text-blue-600" },
            { label: "Congregados",      value: stats.congregados,  icon: <Church className="w-4 h-4" />,cor: "text-emerald-600" },
            { label: "Ministérios",      value: operacionais.length,icon: <Building2 className="w-4 h-4" />,cor: "text-purple-600" },
          ].map(s => (
            <Card key={s.label} className="shadow-card-soft">
              <CardContent className="p-4">
                <div className={`${s.cor} mb-1`}>{s.icon}</div>
                <div className="text-2xl font-bold">{loading ? "–" : s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerta: ministérios sem líder */}
        {!loading && semLider > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-sm text-warning" translate="no">
              <span className="font-bold">{semLider}</span>{" "}
              {semLider === 1 ? "ministério sem líder definido" : "ministérios sem líder definido"}
            </p>
          </div>
        )}

        {/* Abas principais */}
        <Tabs defaultValue="estrutura" onValueChange={(v) => {
          if (v === "regimento" && estDoc.length === 0) {
            setLoadingEst(true);
            supabase
              .from("documento_estrutura")
              .select("*")
              .eq("ativo", true)
              .order("nivel").order("ordem").order("nome")
              .then(({ data }) => { setEstDoc(data ?? []); setLoadingEst(false); });
          }
        }}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="estrutura" translate="no">
              <Building2 className="w-4 h-4 mr-1.5" /> Estrutura
            </TabsTrigger>
            <TabsTrigger value="regimento" translate="no">
              <Network className="w-4 h-4 mr-1.5" /> Regimento
            </TabsTrigger>
            <TabsTrigger value="diretoria" translate="no">
              <Crown className="w-4 h-4 mr-1.5" /> Diretoria
            </TabsTrigger>
            <TabsTrigger value="conselho" translate="no">
              <Shield className="w-4 h-4 mr-1.5" /> Conselho
            </TabsTrigger>
          </TabsList>

          {/* ── ABA: Do Regimento (documento_estrutura) ── */}
          <TabsContent value="regimento" className="mt-4">
            {loadingEst ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Carregando estrutura do regimento…</span>
              </div>
            ) : estDoc.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma estrutura derivada cadastrada.</p>
                <p className="text-xs text-muted-foreground/70">
                  Acesse Documentos → aba Estrutura Derivada para cadastrar elementos do estatuto/regimento.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Diretoria/Institucional */}
                {(["institucional", "ministerial", "area"] as const).map(nivel => {
                  const itens = estDoc.filter((e: any) => e.nivel === nivel);
                  if (!itens.length) return null;
                  const labelNivel: Record<string, string> = {
                    institucional: "Diretoria & Conselhos",
                    ministerial:   "Ministérios",
                    area:          "Áreas & Setores",
                  };
                  const corNivel: Record<string, string> = {
                    institucional: "border-purple-200 bg-purple-50/50",
                    ministerial:   "border-blue-200 bg-blue-50/50",
                    area:          "border-green-200 bg-green-50/50",
                  };
                  const iconeNivel: Record<string, string> = {
                    institucional: "👔", ministerial: "⛪", area: "📂",
                  };
                  return (
                    <div key={nivel}>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                        <span>{iconeNivel[nivel]}</span> {labelNivel[nivel]} ({itens.length})
                      </h3>
                      <div className="space-y-2">
                        {itens.map((item: any) => (
                          <div key={item.id}
                            className={`rounded-xl border px-4 py-3 ${corNivel[nivel] ?? "border-border bg-background"}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold">{item.nome}</span>
                                  {item.base_institucional && (
                                    <span className="text-[10px] bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded">
                                      📄 {item.base_institucional}
                                    </span>
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
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── ABA: Estrutura (organograma de ministérios) ── */}
          <TabsContent value="estrutura" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Carregando estrutura…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {operacionais.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Nenhum ministério cadastrado.
                  </div>
                ) : (
                  operacionais.map(m => (
                    <MinisterioNode key={m.id} min={m} onClick={setPessoaId} />
                  ))
                )}
              </div>
            )}
          </TabsContent>

          {/* ── ABA: Diretoria Estatutária ── */}
          <TabsContent value="diretoria" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : diretoria.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Crown className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Nenhum cargo estatutário cadastrado ainda.</p>
                <p className="text-xs text-muted-foreground/70">
                  Atribua cargos em Pessoas → editar → Cargo Estatutário.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Agrupa por nível */}
                {[1, 2, 3, 4].map(nivel => {
                  const deste = diretoria.filter(d => d.nivel === nivel);
                  if (deste.length === 0) return null;
                  const labels: Record<number, string> = {
                    1: "Presidência", 2: "Vice-presidência",
                    3: "Secretaria", 4: "Tesouraria",
                  };
                  return (
                    <div key={nivel}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">{NIVEL_EMOJI[nivel]}</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {labels[nivel]}
                        </h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {deste.map(d => (
                          <button
                            key={d.id}
                            onClick={() => setPessoaId(d.pessoa_id)}
                            className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-left hover:bg-purple-50 transition-colors w-full"
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

          {/* ── ABA: Conselho da Igreja ── */}
          <TabsContent value="conselho" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : conselho.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Shield className="w-12 h-12 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Conselho calculado automaticamente.</p>
                <p className="text-xs text-muted-foreground/70">
                  Composição: Diretoria + Líderes de Ministério + Líderes de Área + Diáconos
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Conselho composto automaticamente por {conselho.length} participantes.
                </p>
                {(["diretoria", "ministerio", "area", "diacono"] as const).map(tipo => {
                  const grupo = conselho.filter(c => c.tipo_participacao === tipo);
                  if (grupo.length === 0) return null;
                  const tipoLabel: Record<string, string> = {
                    diretoria:  "Diretoria",
                    ministerio: "Líderes de Ministério",
                    area:       "Líderes de Área",
                    diacono:    "Diáconos",
                  };
                  return (
                    <div key={tipo}>
                      <h3 className={`text-[10px] font-semibold uppercase tracking-wider mb-2 px-1 ${
                        tipo === "diretoria" ? "text-purple-600" :
                        tipo === "ministerio" ? "text-blue-600" :
                        tipo === "area" ? "text-green-600" : "text-amber-600"
                      }`}>
                        {tipoLabel[tipo]} ({grupo.length})
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {grupo.map(c => (
                          <button
                            key={`${c.pessoa_id}-${c.tipo_participacao}`}
                            onClick={() => setPessoaId(c.pessoa_id)}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:opacity-90 transition-opacity w-full ${NIVEL_COR[tipo] ?? ""}`}
                          >
                            <AvatarPessoa nome={c.nome_completo} foto={c.foto_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.nome_completo}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {c.cargo}
                                {c.ministerio_nome ? ` · ${c.ministerio_nome}` : ""}
                              </p>
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
        </Tabs>
      </div>

      {/* Card de pessoa (modal) */}
      <PessoaCard
        pessoaId={pessoaId}
        open={!!pessoaId}
        onClose={() => setPessoaId(null)}
      />
    </div>
  );
}
