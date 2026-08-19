// ============================================================
// Organograma.tsx
// Estrutura organizacional completa da Igreja
// Igreja → Diretoria / Ministérios → Áreas → Setores → Pessoas
// ============================================================

import { useEffect, useState } from "react";
import { supabase, supabaseRel } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PessoaCard from "@/components/membros/PessoaCard";
import {
  ChevronDown, ChevronRight, Users, Crown, Church, MapPin,
  Building2, Star, Loader2, AlertTriangle, Shield, HandHeart,
} from "lucide-react";
import { contarVoluntarios, SELECT_AREA_COM_LIDER } from "@/services/estruturaService";
import { carregarDiretoria, carregarDiaconato, type CargoDiretoria } from "@/services/diretoriaService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DiretoriaQuadro, ConselhoQuadro, DiaconiaQuadro,
  type ConselhoMembro, type Diacono,
} from "@/components/estrutura/QuadrosInstitucionais";

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
  /** Cinco áreas têm co-líder, e ele não aparecia em lugar nenhum. */
  co_lider: Lider | null;
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

// ── Helpers ───────────────────────────────────────────────────

// Mesma regra da EstruturaDaIgreja: foto sim, iniciais nao.
function AvatarPessoa({ nome, foto, size = "sm" }: { nome: string; foto?: string | null; size?: "sm" | "md" }) {
  if (!foto) return null;
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-10 h-10 text-xs";
  return (
    <img src={foto} alt={nome}
      className={`${sz} rounded-full object-cover border border-border shrink-0`} />
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
        <Badge variant="outline" className="text-xs h-3.5 px-1 hidden sm:flex">
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
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                {min.lider.nome_completo.split(" ")[0]}
              </span>
            )}
            <Badge variant="outline" className="text-xs h-4 px-1.5">
              {min.membros_count} {min.membros_count === 1 ? "pessoa" : "pessoas"}
            </Badge>
            {min.areas.length > 0 && (
              <Badge variant="outline" className="text-xs h-4 px-1.5">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liderança</p>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Áreas</p>
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
                      {/* Quem co-lidera, lidera. A coluna existia no cadastro e a
                          pessoa não aparecia em lugar nenhum do organograma. */}
                      {area.co_lider && (
                        <PessoaPill id={area.co_lider.id} nome={area.co_lider.nome_completo}
                          foto={area.co_lider.foto_url} funcao="Co-líder" onClick={onClick} />
                      )}
                      {/* Quantos servem NESTA área. O ministério mostra o total de
                          pessoas distintas; a área mostra a sua parte, que é onde o
                          líder de área precisa olhar. */}
                      {area.membros_count > 0 && (
                        <Badge variant="outline" className="text-xs h-4 px-1.5 ml-auto shrink-0">
                          {area.membros_count} {area.membros_count === 1 ? "pessoa" : "pessoas"}
                        </Badge>
                      )}
                    </div>
                    {area.setores.length > 0 && (
                      <div className="ml-5 flex flex-wrap gap-1">
                        {area.setores.map(s => (
                          <Badge key={s.id} variant="outline" className="text-xs">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pessoas ({min.membros.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {min.membros.slice(0, 16).map(m => (
                  <PessoaPill key={m.id} id={m.id} nome={m.nome_completo}
                    funcao={m.funcao ?? undefined} onClick={onClick} />
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

// ── Componente Principal ──────────────────────────────────────

export default function Organograma() {
  const [ministerios, setMinerios]   = useState<Ministerio[]>([]);
  const [stats, setStats]            = useState({ total: 0, membros: 0, congregados: 0, visitantes: 0 });
  const [loading, setLoading]        = useState(true);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [diretoria, setDiretoria] = useState<CargoDiretoria[]>([]);
  const [conselho, setConselho]   = useState<ConselhoMembro[]>([]);
  const [diaconos, setDiaconos]   = useState<Diacono[]>([]);
  // Estrutura derivada dos documentos

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


      // Os três quadros de governança. Todos saem da mesma fonte que o resto
      // do sistema — a função na ficha da pessoa —, e por isso mudam junto com
      // ela: trocar o cargo de alguém muda o organograma na próxima abertura,
      // sem um segundo cadastro para lembrar de atualizar.
      setDiretoria(await carregarDiretoria());
      setDiaconos(await carregarDiaconato());
      const { data: cons } = await supabase.from("v_conselho_da_igreja").select("*");
      setConselho((cons ?? []) as ConselhoMembro[]);

      // Ministérios com líderes
      const { data: mins } = await supabaseRel
        .from("ministerios")
        .select(`
          id, nome, sigla, cor, tipo,
          lider_id, vice_lider_id,
          lider:membros!ministerios_lider_id_fkey(id, nome_completo, foto_url),
          vice_lider:membros!ministerios_vice_lider_id_fkey(id, nome_completo, foto_url)
        `)
        .eq("ativo", true)
        .order("nome");

      // Áreas com líderes. O embed diz QUAL chave usa: `areas` passou a ter
      // duas para `membros` (líder e co-líder), e sem o nome da restrição o
      // PostgREST responde 300 em vez de escolher. Ver estruturaService.ts.
      const { data: allAreas } = await supabaseRel
        .from("areas")
        .select(SELECT_AREA_COM_LIDER)
        .eq("ativo", true);

      // Setores
      // TABELA AUSENTE EM PRODUCAO — ver migration 20260528_estrutura_organizacional.sql
      const { data: allSetores } = await supabase
        .from("setores")
        .select("id,area_id,nome,lider:membros(id,nome_completo,foto_url)")
        .eq("ativo", true);

      // Quantas pessoas servem em cada ministério e em cada área.
      //
      // Vinha de `ministerio_membros`, que tem ZERO linhas — e por isso esta
      // tela dizia "0 pessoas" nos onze ministérios enquanto a tela de
      // Ministérios, contando por `area_voluntarios`, dizia "35 integrantes"
      // no mesmo ministério, no mesmo instante. Uma implementação só, agora.
      const contagem = await contarVoluntarios();

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
          co_lider: (a as any).co_lider as unknown as Lider | null,
          setores,
          membros_count: contagem.porArea[a.id] ?? 0,
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
        membros:     [],
        membros_count: contagem.porMinisterio[m.id] ?? 0,
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

        {/* ── Quatro quadros, uma fonte ──────────────────────────────────
            Estrutura responde "quem serve onde"; os outros três respondem
            "quem ocupa o quê". São perguntas diferentes e por isso abas
            diferentes, mas todas saem da função na ficha da pessoa — trocar
            o cargo de alguém muda os quatro na próxima abertura, sem um
            segundo cadastro para lembrar de atualizar.

            A tela de Estrutura fica com o Regimento: lá é o documento, aqui
            são as pessoas. */}
        <Tabs defaultValue="estrutura">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="estrutura" translate="no">
              <Building2 className="w-4 h-4 mr-1.5" /> Estrutura
            </TabsTrigger>
            <TabsTrigger value="diretoria" translate="no">
              <Crown className="w-4 h-4 mr-1.5" /> Diretoria
            </TabsTrigger>
            <TabsTrigger value="conselho" translate="no">
              <Shield className="w-4 h-4 mr-1.5" /> Conselho
            </TabsTrigger>
            <TabsTrigger value="diaconia" translate="no">
              <HandHeart className="w-4 h-4 mr-1.5" /> Diaconia
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="diretoria" className="mt-4">
            <DiretoriaQuadro diretoria={diretoria} loading={loading} onPessoa={setPessoaId} />
          </TabsContent>

          <TabsContent value="conselho" className="mt-4">
            <ConselhoQuadro conselho={conselho} loading={loading} onPessoa={setPessoaId} />
          </TabsContent>

          <TabsContent value="diaconia" className="mt-4">
            <DiaconiaQuadro diaconos={diaconos} loading={loading} onPessoa={setPessoaId} />
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
