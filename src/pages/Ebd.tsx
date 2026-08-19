// ─── Ebd.tsx — Listagem de classes ─────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, GraduationCap, ChevronRight, Users, Plus, Pencil, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarClasses, moverParaClasse, type EbdClasse } from "@/services/ebdService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  qtd_esperados: number;
}

interface AlunoForaFaixa {
  pessoa_id: string;
  nome_completo: string;
  idade_atual: number;
  classe_atual: string;
  classe_sugerida_id: string | null;
}

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  // ── Alunos fora da faixa etária (ação em lote) ─────────────────────────
  const [alunosForaFaixa, setAlunosForaFaixa] = useState<AlunoForaFaixa[]>([]);
  const [todasClasses, setTodasClasses] = useState<EbdClasse[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [moveBusy, setMoveBusy] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativas]);
  useEffect(() => { carregarAlertasIdade(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const cs = await listarClasses(mostrarInativas);
      const enriched: ClasseCard[] = [];
      for (const c of cs) {
        const { count: qtdMat } = await supabase
          .from("ebd_matriculas")
          .select("id", { count: "exact", head: true })
          .eq("classe_id", c.id)
          .eq("ativo", true);
        const { data: esps } = await supabase.rpc("esperados_da_classe", { p_classe_id: c.id });
        enriched.push({
          ...c,
          qtd_matriculados: qtdMat ?? 0,
          qtd_esperados: (esps as any[] | null)?.length ?? 0,
        });
      }
      setClasses(enriched);
    } finally {
      setLoading(false);
    }
  }

  async function carregarAlertasIdade() {
    try {
      const [{ data: alertas }, todas] = await Promise.all([
        supabase.from("vw_ebd_alertas_idade")
          .select("pessoa_id, nome_completo, idade_atual, classe_atual, classe_sugerida_id")
          .limit(50),
        listarClasses(true),
      ]);
      setAlunosForaFaixa((alertas ?? []) as AlunoForaFaixa[]);
      setTodasClasses(todas);
      setSelecionados(new Set());
    } catch (e: any) {
      // Não bloqueia a tela de classes se o alerta falhar
      console.warn("Erro ao carregar alertas de idade EBD:", e?.message);
    }
  }

  const nomeClassePorId = useMemo(() => {
    const map: Record<string, string> = {};
    todasClasses.forEach(c => { map[c.id] = c.nome; });
    return map;
  }, [todasClasses]);

  const elegiveisLote = alunosForaFaixa.filter(a => !!a.classe_sugerida_id);
  const todosElegiveisSelecionados =
    elegiveisLote.length > 0 && elegiveisLote.every(a => selecionados.has(a.pessoa_id));

  function alternarSelecao(pessoaId: string, marcado: boolean) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (marcado) next.add(pessoaId); else next.delete(pessoaId);
      return next;
    });
  }

  function alternarSelecionarTodos(marcado: boolean) {
    setSelecionados(marcado ? new Set(elegiveisLote.map(a => a.pessoa_id)) : new Set());
  }

  async function confirmarMoverLote() {
    const alvos = alunosForaFaixa.filter(a => selecionados.has(a.pessoa_id) && a.classe_sugerida_id);
    if (alvos.length === 0) return;
    if (!confirm(`Mover ${alvos.length} ${alvos.length === 1 ? "aluno" : "alunos"} para a classe sugerida?`)) return;
    setMoveBusy(true);
    let sucesso = 0;
    let falhas = 0;
    for (const a of alvos) {
      try {
        await moverParaClasse(a.pessoa_id, a.classe_sugerida_id as string);
        sucesso++;
      } catch {
        falhas++;
      }
    }
    setMoveBusy(false);
    if (sucesso > 0) {
      toast.success(
        falhas === 0
          ? `${sucesso} ${sucesso === 1 ? "aluno movido" : "alunos movidos"} de classe!`
          : `${sucesso} movidos, ${falhas} falharam.`
      );
    } else {
      toast.error("Não foi possível mover os alunos selecionados.");
    }
    await Promise.all([carregar(), carregarAlertasIdade()]);
  }

  function faixaTexto(c: EbdClasse) {
    if (c.idade_min == null && c.idade_max == null) return "Sem faixa";
    if (c.idade_max == null) return `${c.idade_min}+ anos`;
    if (c.idade_min == null) return `até ${c.idade_max} anos`;
    return `${c.idade_min}–${c.idade_max} anos`;
  }

  function generoTexto(g: string) {
    return g === "masculino" ? "Homens"
         : g === "feminino"  ? "Mulheres"
         : "Misto";
  }

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-gold" />
            Escola Bíblica Dominical
          </h1>
          <p className="text-sm text-muted-foreground">
            Classes, matrículas, presenças e campanhas — uma classe por vez.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer mr-2">
          <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
          Mostrar desativadas
        </label>
        {podeCriar && (
          <Button onClick={() => { setClasseEditando(null); setFormOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Nova classe
          </Button>
        )}
      </header>

      {alunosForaFaixa.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 dark:text-amber-400" />
                Alunos fora da faixa etária
                <Badge variant="outline" className="text-xs bg-amber-100 border-amber-300">
                  {alunosForaFaixa.length}
                </Badge>
              </span>
              {elegiveisLote.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={todosElegiveisSelecionados}
                    onCheckedChange={(v) => alternarSelecionarTodos(!!v)}
                  />
                  Selecionar todos com classe sugerida
                </label>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-1">
              A idade atual não bate mais com a faixa da classe matriculada. Considere mover para a classe sugerida.
            </p>

            {selecionados.size > 0 && (
              <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                <span className="text-xs font-medium text-amber-800">
                  {selecionados.size} {selecionados.size === 1 ? "aluno selecionado" : "alunos selecionados"}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button" size="sm" variant="ghost"
                    className="text-xs h-7"
                    onClick={() => setSelecionados(new Set())}
                    disabled={moveBusy}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="button" size="sm"
                    className="gap-1.5 text-xs h-7"
                    onClick={confirmarMoverLote}
                    disabled={moveBusy}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> {moveBusy ? "Movendo..." : "Mover selecionados"}
                  </Button>
                </div>
              </div>
            )}

            {alunosForaFaixa.slice(0, 15).map(a => {
              const temSugestao = !!a.classe_sugerida_id;
              const checked = selecionados.has(a.pessoa_id);
              const nomeSugerida = a.classe_sugerida_id ? (nomeClassePorId[a.classe_sugerida_id] ?? "outra classe") : null;
              return (
                <div key={a.pessoa_id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-amber-50/40 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {temSugestao && (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => alternarSelecao(a.pessoa_id, !!v)}
                        aria-label={`Selecionar ${a.nome_completo}`}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.nome_completo}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        {a.idade_atual} anos em <strong>{a.classe_atual}</strong>
                        {nomeSugerida && (
                          <Badge variant="outline" className="text-xs ml-1 border-emerald-300 text-emerald-700 dark:text-emerald-400">
                            → {nomeSugerida}
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {alunosForaFaixa.length > 15 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                ... e mais {alunosForaFaixa.length - 15} alunos
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => {
          const taxa = c.qtd_esperados > 0
            ? Math.round((c.qtd_matriculados / c.qtd_esperados) * 100)
            : 0;
          return (
            <Card key={c.id} className={`rounded-2xl shadow hover:shadow-md transition-shadow ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor ?? "#cfa451" }} />
                    {c.nome}
                  </span>
                  <span className="flex items-center gap-1">
                    {!c.ativo && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:text-amber-400 border-amber-300">
                        Desativada
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {generoTexto(c.genero)}
                    </Badge>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{faixaTexto(c)}</p>

                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400" />
                    <strong>{c.qtd_matriculados}</strong> matriculados
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    <strong>{c.qtd_esperados}</strong> esperados
                  </span>
                </div>

                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gold/80 transition-all"
                    style={{ width: `${Math.min(100, taxa)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {taxa}% da faixa etária matriculada
                </p>

                <div className="flex gap-1.5 mt-1">
                  <Button asChild variant="outline" size="sm" className="w-full gap-1.5"><Link to={`/ebd/${c.id}`} className="flex-1">
                      Abrir <ChevronRight className="w-3.5 h-3.5" />
                    </Link></Button>
                  {podeCriar && (
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={(e) => { e.preventDefault(); setClasseEditando(c); setFormOpen(true); }}
                      title="Editar classe"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ClasseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        classe={classeEditando}
        onSaved={carregar}
      />
    </div>
  );
}
