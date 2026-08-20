// ============================================================
// EstruturaDaIgreja.tsx
// Tela unificada da estrutura organizacional da Igreja
// Uma tela, um assunto: o que o estatuto e o regimento preveem.
// Le: pessoa_cargo_estatutario + ministerios + documento_estrutura
// ============================================================

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, supabaseRel } from "@/integrations/supabase/client";
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
import { carregarDiretoria, ocupantesDoCargo, type CargoDiretoria } from "@/services/diretoriaService";
import { SELECT_AREA_COM_LIDER } from "@/services/estruturaService";

// -- Tipos ---------------------------------------------------

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

// Foto de verdade identifica uma pessoa no organograma. Iniciais nao:
// no lugar da foto ficava um circulo com as duas letras que ja abrem o
// nome escrito ao lado. Sem foto, nao entra nada — a pilula fica so com
// o nome, que e a informacao.
function AvatarPessoa({ nome, foto, size = "sm" }: {
  nome: string; foto?: string | null; size?: "sm" | "md" | "lg";
}) {
  if (!foto) return null;
  const sz =
    size === "lg" ? "w-12 h-12 text-sm" :
    size === "md" ? "w-9 h-9 text-xs" : "w-7 h-7 text-xs";
  return <img src={foto} alt={nome} className={`${sz} rounded-full object-cover border border-border shrink-0`} />;
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
        <Badge variant="outline" className="text-xs h-3.5 px-1 hidden sm:flex">
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
              <Badge variant="outline" className="text-xs h-4 px-1">{min.sigla}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {min.lider_nome && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                {min.lider_nome.split(" ")[0]}
              </span>
            )}
            <Badge variant="outline" className="text-xs h-4 px-1.5">
              {min.membros_count} {min.membros_count === 1 ? "pessoa" : "pessoas"}
            </Badge>
            {min.areas.length > 0 && (
              <Badge variant="outline" className="text-xs h-4 px-1.5">
                {min.areas.length} {min.areas.length === 1 ? "area" : "areas"}
              </Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Gerenciar ministério"
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lideranca</p>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Areas</p>
              <div className="space-y-1.5">
                {min.areas.map((area) => (
                  <div key={area.id} className="rounded-lg border bg-background px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-success-text" />
                      <span className="text-xs font-medium">{area.nome}</span>
                      {area.lider_id && area.lider_nome && (
                        <PessoaPill id={area.lider_id} nome={area.lider_nome} funcao="Líder de Área" onClick={onPessoa} />
                      )}
                    </div>
                    {area.setores.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-1">
                        {area.setores.map((s) => (
                          <Badge key={s.id} variant="outline" className="text-xs">{s.nome}</Badge>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pessoas ({min.membros.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {min.membros.slice(0, 16).map((m) => (
                  <PessoaPill key={m.id} id={m.id} nome={m.nome_completo}
                    funcao={m.funcao ?? undefined} onClick={onPessoa} />
                ))}
                {min.membros.length > 16 && (
                  <span className="text-xs text-muted-foreground self-center">
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
  const [diretoria, setDiretoria] = useState<CargoDiretoria[]>([]);
  const [estDoc, setEstDoc] = useState<{
    institucional: EstruturaItem[];
    ministerial: EstruturaItem[];
    area: EstruturaItem[];
  }>({ institucional: [], ministerial: [], area: [] });
  const [stats, setStats] = useState({ membros: 0, ministerios: 0, semLider: 0, estTotal: 0 });
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);

  /**
   * Cargo previsto no documento × cargo com gente na ficha.
   *
   * É a única comparação que só esta tela consegue fazer: as outras mostram
   * quem está lá; aqui dá para ver o que o regimento prevê e ninguém ocupa.
   * Foi assim que a linha "Auditoria" ficou vazia por meses — prevista no
   * documento, sem função correspondente em ficha nenhuma.
   *
   * Conta só os itens institucionais: ministério e área não são cargo de uma
   * pessoa, e entrariam sempre como "sem ocupante" sem querer dizer nada.
   */
  const cargos = useMemo(() => {
    const itens = estDoc.institucional;
    const ocupados = itens.filter(i => ocupantesDoCargo(i.nome, diretoria).length > 0).length;
    return { ocupados, vagos: itens.length - ocupados };
  }, [estDoc.institucional, diretoria]);

  const carregar = useCallback(async () => {
    setLoading(true);

    // Membros ativos
    const { data: membrosData } = await supabase
      .from("membros").select("id,tipo_pessoa").eq("status", "ativo");

    // Diretoria — lida da função na ficha da pessoa. Ver diretoriaService.ts.
    setDiretoria(await carregarDiretoria());

    // Ministerios com lideres
    const { data: mins } = await supabase
      .from("ministerios")
      .select(`id,nome,sigla,cor,tipo,lider_id,vice_lider_id,
        lider:membros!ministerios_lider_id_fkey(id,nome_completo,foto_url),
        vice_lider:membros!ministerios_vice_lider_id_fkey(id,nome_completo,foto_url)`)
      .eq("ativo", true)
      .order("nome");

    const { data: allAreas } = await supabase
      .from("areas").select(SELECT_AREA_COM_LIDER).eq("ativo", true);
    const { data: allSetores } = await supabase
      .from("setores").select("id,area_id,nome").eq("ativo", true);
    // area_voluntarios, e não ministerio_membros: esta tem ZERO linhas em
    // produção. A tela vinha desenhando todo ministério sem gente, enquanto
    // o Organograma — que lê a tabela certa — mostrava 15, 35, 10 pessoas.
    // Duas telas sobre a mesma coisa, discordando.
    //
    // Sem embed porque area_voluntarios não declara chave estrangeira: os
    // nomes vêm numa segunda consulta.
    const { data: vinculos } = await supabase
      .from("area_voluntarios")
      .select("ministerio_id, membro_id, funcao")
      .eq("status", "ativa");

    const idsDeMembro = [...new Set((vinculos ?? []).map((v: any) => v.membro_id).filter(Boolean))];
    const { data: nomes } = idsDeMembro.length
      ? await supabase.from("membros").select("id, nome_completo").in("id", idsDeMembro)
      : { data: [] as any[] };
    const nomePorId = new Map((nomes ?? []).map((m: any) => [m.id, m.nome_completo]));

    // Um voluntário pode servir em duas áreas do mesmo ministério; na lista
    // do ministério ele é uma pessoa só.
    const vistos = new Set<string>();
    const membMin = (vinculos ?? []).filter((v: any) => {
      const chave = v.ministerio_id + "|" + v.membro_id;
      if (vistos.has(chave) || !nomePorId.has(v.membro_id)) return false;
      vistos.add(chave); return true;
    }).map((v: any) => ({
      ministerio_id: v.ministerio_id,
      funcao: v.funcao,
      membros: { id: v.membro_id, nome_completo: nomePorId.get(v.membro_id) },
    }));

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
        description="O que o estatuto e o regimento preveem, e quanto disso a ficha das pessoas confirma"
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
            // Os cartões respondem à pergunta da tela: o que o documento
            // prevê, e quanto disso a igreja de fato tem ocupado. "Sem
            // ocupante" é a única lacuna que este lugar consegue enxergar — o
            // regimento prevê um cargo e a ficha de ninguém o preenche.
            { label: "No regimento", value: stats.estTotal, icon: <Network className="w-4 h-4" />, cor: "text-warning-text" },
            { label: "Ligados à ficha", value: cargos.ocupados, icon: <Crown className="w-4 h-4" />, cor: "text-primary" },
            // "Fora da ficha" e não "sem ocupante": Pastoral e Jurídico
            // Parlamentar TÊM nomes no documento, digitados como texto. O que
            // falta é a função correspondente no cadastro de alguém — e é isso
            // que dá para agir, não a ausência de gente.
            { label: "Fora da ficha", value: cargos.vagos, icon: <AlertTriangle className="w-4 h-4" />, cor: cargos.vagos > 0 ? "text-warning-text" : "text-muted-foreground" },
            { label: "Membros ativos", value: stats.membros, icon: <Star className="w-4 h-4" />, cor: "text-info-text" },
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
            <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />
            <p className="text-sm text-warning-text">
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

        {/* ── Só o Regimento ─────────────────────────────────────────────
            Diretoria, Conselho e Diaconia foram para o Organograma, onde a
            igreja aparece como gente: quem serve onde e quem ocupa o quê.

            Aqui fica o documento — o que o estatuto e o regimento preveem,
            com a base institucional de cada item. O ocupante de cada cargo
            continua vindo da ficha, mas a pergunta desta tela é outra: não
            "quem é o tesoureiro" e sim "o que a igreja declarou ter".

            Sem abas, porque sobrou uma coisa só. */}
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
                  institucional: { label: "Diretoria e Conselhos", icon: <Crown className="w-4 h-4 text-primary" />, border: "border-primary/30", bg: "bg-primary/10/50" },
                  ministerial: { label: "Ministerios", icon: <Church className="w-4 h-4 text-info-text" />, border: "border-info-line", bg: "bg-info-soft/50" },
                  area: { label: "Áreas e Setores", icon: <MapPin className="w-4 h-4 text-success-text" />, border: "border-success-line", bg: "bg-success-soft/50" },
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
                                <Badge variant="outline" className="text-xs h-4 px-1.5">
                                  📄 {item.base_institucional}
                                </Badge>
                              )}
                            </div>
                            {/* Mesma regra da aba Regimento do organograma: o cargo
                                vem do documento, o ocupante vem da ficha. Ver o
                                cabeçalho de diretoriaService.ts. */}
                            {(() => {
                              const ocupantes = ocupantesDoCargo(item.nome, diretoria);
                              if (ocupantes.length) {
                                return (
                                  <div className="text-xs text-muted-foreground">
                                    {ocupantes.map(o => (
                                      <p key={o.id}>
                                        {o.pessoa_nome}
                                        {o.mandato && ` · mandato ${o.mandato}`}
                                      </p>
                                    ))}
                                  </div>
                                  );
                                }
                              return item.descricao ? (
                                <p className="text-xs text-muted-foreground whitespace-pre-line">{item.descricao}</p>
                              ) : null;
                            })()}
                            {item.responsabilidades && (
                              <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
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
      </div>

      <PessoaCard pessoaId={pessoaId} open={!!pessoaId} onClose={() => setPessoaId(null)} />
    </div>
  );
}
