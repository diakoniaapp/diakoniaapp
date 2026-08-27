// ─── Ebd.tsx — Listagem de classes ─────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, GraduationCap, ChevronRight, Users, Plus, Pencil, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarClasses, moverParaClasse, manterNaClasse, type EbdClasse } from "@/services/ebdService";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  /** O aniversário em que a pessoa passou do teto da classe. */
  passou_da_faixa_em?: string | null;
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
        // ── Só quem está SEM classe ──────────────────────────────────────
        //
        // A função passou a devolver também quem cabe aqui mas já estuda ou
        // ensina em outra classe (migration 20260828220000), para a
        // professora não sentir falta de um nome sem saber onde ele está.
        //
        // O cartão do índice, porém, responde outra pergunta: quantos ainda
        // precisam ser acolhidos. Contar a lista inteira aqui somaria gente
        // já acomodada e inflaria o número — na Classe Professora Edna
        // seriam 94 no lugar de 81.
        const livres = ((esps as any[] | null) ?? [])
          .filter(e => !e.ja_matriculado && !e.outra_classe_id);
        enriched.push({
          ...c,
          qtd_matriculados: qtdMat ?? 0,
          qtd_esperados: livres.length,
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
          .select("pessoa_id, nome_completo, idade_atual, classe_atual, classe_sugerida_id, passou_da_faixa_em")
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

  // O `confirm()` do navegador NÃO funciona aqui.
  //
  // Em navegador embarcado — e é onde o sistema é usado no celular — as
  // caixas nativas são bloqueadas: `confirm()` devolve valor falso sem
  // perguntar nada. O código lia isso como "a pessoa cancelou" e não fazia
  // nada. Clicava-se em "Mover selecionados" e não acontecia NADA: sem
  // movimento, sem erro, sem aviso.
  //
  // Trocado pelo AlertDialog do próprio sistema, que é o que o resto das
  // telas já usa.
  const [confirmarMover, setConfirmarMover] = useState(false);
  const [mantendo, setMantendo] = useState<string | null>(null);
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

  async function handleManter(a: AlunoForaFaixa) {
    setMantendo(a.pessoa_id);
    const r = await manterNaClasse(a.pessoa_id);
    setMantendo(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível registrar a decisão.");
    toast.success(`${a.nome_completo} continua em ${a.classe_atual}.`);
    carregarAlertasIdade();
  }

  async function confirmarMoverLote() {
    const alvos = alunosForaFaixa.filter(a => selecionados.has(a.pessoa_id) && a.classe_sugerida_id);
    if (alvos.length === 0) return;
    setConfirmarMover(false);
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
        <Card className="border-warning-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning-text" />
                Alunos prontos para mudar de classe
                <Badge variant="outline" className="text-xs bg-warning-soft border-warning-line">
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
              {/* O texto antigo dizia "a idade não bate mais com a faixa" e valia
                  para os dois lados — incluindo quem ainda era novo demais para a
                  classe. A Kaila, 11 anos em Adolescentes (12–17), aparecia aqui
                  com sugestão de DESCER para Juniores; ela entra na faixa sozinha
                  no próximo aniversário, e não havia nada a corrigir. */}
              Passaram da idade máxima da classe onde estão. A data é o aniversário em que isso aconteceu.
            </p>

            {selecionados.size > 0 && (
              <div className="flex items-center justify-between rounded-md border border-warning-line bg-warning-soft px-3 py-2">
                <span className="text-xs font-medium text-warning-text">
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
                    onClick={() => setConfirmarMover(true)}
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
                <div key={a.pessoa_id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-warning-soft/40 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {temSugestao && (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => alternarSelecao(a.pessoa_id, !!v)}
                        aria-label={`Selecionar ${a.nome_completo}`}
                      />
                    )}
                    <div className="min-w-0">
                      <NomePessoa id={a.pessoa_id} nome={a.nome_completo} className="font-medium text-sm truncate block" />
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        {a.idade_atual} anos em <strong>{a.classe_atual}</strong>
                        {a.passou_da_faixa_em && (
                          <>
                            {" · passou em "}
                            {new Date(a.passou_da_faixa_em + "T00:00:00").toLocaleDateString("pt-BR")}
                          </>
                        )}
                        {/* A idade é regra, não sentença: há o adolescente que
                            fica mais um ano com a turma onde tem amigos, o aluno
                            que acompanha melhor a classe mais nova. Sem uma forma
                            de dizer "este fica", o alerta reaparece para sempre —
                            e alerta que não some vira paisagem, até o dia em que
                            aparece alguém que precisa mudar e ninguém repara. */}
                        <button
                          type="button"
                          onClick={() => handleManter(a)}
                          disabled={mantendo === a.pessoa_id}
                          className="ml-2 text-xs underline text-muted-foreground hover:text-foreground"
                        >
                          {mantendo === a.pessoa_id ? "Mantendo..." : "Manter nesta classe"}
                        </button>
                        {nomeSugerida && (
                          <Badge variant="outline" className="text-xs ml-1 border-success-line text-success-text">
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
                      <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">
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
                    <Users className="w-3.5 h-3.5 text-success-text" />
                    <strong>{c.qtd_matriculados}</strong> matriculados
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {/* "no perfil", e não "esperados": na ficha da classe
                        "Esperados" passou a ser quem AINDA FALTA matricular,
                        e este número é o total que cabe — dentro e fora.
                        A mesma palavra com dois sentidos em duas telas é o
                        tipo de coisa que faz alguém desconfiar do sistema */}
                    <strong>{c.qtd_esperados}</strong> no perfil
                  </span>
                </div>

                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gold/80 transition-all"
                    style={{ width: `${Math.min(100, taxa)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {taxa}% do perfil da classe matriculado
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

      {/* Confirmação de mover em lote.

          Era um `confirm()` do navegador, e em navegador embarcado — que é
          onde o sistema é usado no celular — as caixas nativas são
          bloqueadas: a função devolve valor falso sem perguntar nada, o
          código entende "cancelou" e não faz nada. Clicava-se em "Mover
          selecionados" e não acontecia NADA: sem movimento, sem erro. */}
      <AlertDialog open={confirmarMover} onOpenChange={setConfirmarMover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mover {selecionados.size} {selecionados.size === 1 ? "aluno" : "alunos"} de classe?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Cada um vai para a classe sugerida pela idade:</p>
                <ul className="space-y-0.5">
                  {alunosForaFaixa
                    .filter(a => selecionados.has(a.pessoa_id) && a.classe_sugerida_id)
                    .map(a => (
                      <li key={a.pessoa_id}>
                        <strong>{a.nome_completo}</strong>: {a.classe_atual} →{" "}
                        {todasClasses.find(c => c.id === a.classe_sugerida_id)?.nome ?? "?"}
                      </li>
                    ))}
                </ul>
                <p className="text-muted-foreground">
                  A matrícula na classe atual é encerrada e uma nova é aberta. As presenças
                  já registradas continuam onde estão.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moveBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarMoverLote(); }}
              disabled={moveBusy}
            >
              {moveBusy ? "Movendo..." : "Mover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
