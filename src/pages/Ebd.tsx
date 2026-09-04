// ─── Ebd.tsx — Painel da EBD ────────────────────────────────────────────────
//
// Pedido dela, depois de ver a primeira versão dos cartões: "transforme
// esse módulo em painel da EBD, será a tela de trabalho da pessoa
// responsável por esta área" — e "uma faixa fixa, como temos no painel
// pastoral... que seja os filtros para levar para as classes".
//
// Mesmo desenho do Painel Pastoral (ver PainelPastoral.tsx,
// components/painel/blocos.tsx): cabeçalho `sticky`, uma faixa de
// `Indicador`es SEM número — cada um só leva a uma seção — e as seções em
// si, cada uma com `TituloDaSecao`. **Sem número na faixa é decisão dela
// mesma, de 27/08/2026, registrada em PainelPastoral.tsx**: um algarismo
// solto no topo compete com o conteúdo e não diz nada sozinho — "292" não
// explica, a seção explica.
//
// Três seções, pedidas em duas mensagens seguidas: "classes" (os cartões,
// já existiam), "aniversariantes" e "alunos" ("todos os matriculados em
// classes, devem aparecer no painel da EBD" — o rol completo, não classe
// por classe).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GraduationCap, ChevronRight, Plus, Pencil, AlertCircle, FileText, Cake, Users2, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listarClasses, professoresPorClasse, todosOsMatriculados,
  type EbdClasse, type EbdProfessor, type AlunoMatriculado,
} from "@/services/ebdService";
import { ebdPorClasse, type EbdClasseLinha } from "@/services/ebdPainelService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";
import { Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao } from "@/components/painel/blocos";
import { idadeEm } from "@/lib/idade";

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  /** Todo mundo que cabe no perfil (idade/gênero), matriculado ou não —
   *  denominador certo da cobertura. */
  qtd_elegiveis: number;
  aulasSemChamada: number;
  professores: EbdProfessor[];
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const scrollMt = "scroll-mt-[190px] sm:scroll-mt-[150px]";

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [alunos, setAlunos] = useState<AlunoMatriculado[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [buscaAluno, setBuscaAluno] = useState("");

  useEffect(() => { carregar(); }, [mostrarInativas]);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, porClasse, professores, mat] = await Promise.all([
        listarClasses(mostrarInativas),
        ebdPorClasse().catch((): EbdClasseLinha[] => []),
        professoresPorClasse().catch(() => new Map<string, EbdProfessor[]>()),
        todosOsMatriculados().catch(() => []),
      ]);
      const semChamadaPorClasse = new Map<string, number>(
        porClasse.map(p => [p.classe_id, p.aulas_sem_chamada]),
      );
      setAlunos(mat);

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
          qtd_elegiveis: ((esps as any[] | null) ?? []).length,
          aulasSemChamada: semChamadaPorClasse.get(c.id) ?? 0,
          professores: professores.get(c.id) ?? [],
        });
      }
      setClasses(enriched);
    } finally {
      setLoading(false);
    }
  }

  const aniversariantes = useMemo(() => {
    const mesAtual = new Date().getMonth();
    return alunos
      .filter(a => a.data_nascimento && new Date(a.data_nascimento + "T00:00").getMonth() === mesAtual)
      .sort((a, b) =>
        new Date(a.data_nascimento! + "T00:00").getDate() - new Date(b.data_nascimento! + "T00:00").getDate(),
      );
  }, [alunos]);

  const alunosFiltrados = useMemo(() => {
    const termo = buscaAluno.trim().toLowerCase();
    if (!termo) return alunos;
    return alunos.filter(a =>
      a.nome_completo.toLowerCase().includes(termo) || a.classe_nome.toLowerCase().includes(termo),
    );
  }, [alunos, buscaAluno]);

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

  function nomesDosProfessores(profs: EbdProfessor[]): string | null {
    if (profs.length === 0) return null;
    return profs.map(p => p.membros?.nome_completo).filter(Boolean).join(", ");
  }

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Cabeçalho fixo — mesmo padrão do Painel Pastoral ────────────── */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-gold shrink-0" />
            Painel da EBD
          </h1>
          {podeCriar && (
            <Button size="sm" onClick={() => { setClasseEditando(null); setFormOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Nova classe
            </Button>
          )}
        </div>

        <FaixaDeIndicadores colunas={3}>
          <Indicador
            rotulo="Classes" tom="gold" icone={GraduationCap}
            onClick={() => irParaSecao("classes")} descricao="Ir para as classes"
          />
          <Indicador
            rotulo="Alunos" tom="violeta" icone={Users2}
            onClick={() => irParaSecao("alunos")} descricao="Ir para todos os alunos"
          />
          <Indicador
            rotulo="Aniversariantes" tom="celebracao" icone={Cake}
            onClick={() => irParaSecao("aniversariantes")} descricao="Ir para aniversariantes do mês"
          />
        </FaixaDeIndicadores>
      </div>

      {/* ── Classes ──────────────────────────────────────────────────────── */}
      <section id="classes" className={scrollMt}>
        <TituloDaSecao icone={GraduationCap}>Classes</TituloDaSecao>

        <div className="flex items-center justify-between gap-2 mb-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
            Mostrar desativadas
          </label>
          <Button asChild size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
            <Link to="/ebd/relatorio-mensal">
              <FileText className="w-3.5 h-3.5" /> Relatório mensal
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const cobertura = c.qtd_elegiveis > 0
              ? Math.round((c.qtd_matriculados / c.qtd_elegiveis) * 100)
              : 0;
            const nomesProf = nomesDosProfessores(c.professores);
            return (
              <Card key={c.id} className={`rounded-lg ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor ?? "#cfa451" }} />
                      <span className="font-medium text-sm truncate">{c.nome}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {!c.ativo && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-warning-soft text-warning-text border-warning-line">
                          Desativada
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {generoTexto(c.genero)}
                      </Badge>
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {faixaTexto(c)}{nomesProf ? ` · ${nomesProf}` : ""}
                  </p>

                  {c.aulasSemChamada > 0 && (
                    <p className="text-xs text-warning-text flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {c.aulasSemChamada} {c.aulasSemChamada === 1 ? "aula" : "aulas"} sem chamada
                    </p>
                  )}

                  <p className="text-xs">
                    <strong>{c.qtd_matriculados}</strong> matriculado{c.qtd_matriculados === 1 ? "" : "s"}
                    <span className="text-muted-foreground"> · {cobertura}% do perfil</span>
                  </p>

                  <div className="flex gap-1.5 pt-0.5">
                    <Button asChild size="sm" className="flex-1 gap-1.5 h-7 text-xs bg-gold hover:bg-gold/90 text-white border-0">
                      <Link to={`/ebd/${c.id}/chamada`}>
                        <GraduationCap className="w-3.5 h-3.5" /> Chamada
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-7 w-7 p-0" title="Abrir classe">
                      <Link to={`/ebd/${c.id}`}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                    {podeCriar && (
                      <Button
                        type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
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
      </section>

      {/* ── Alunos ───────────────────────────────────────────────────────── */}
      <section id="alunos" className={scrollMt}>
        <TituloDaSecao icone={Users2} tom="violeta" contagem={alunos.length}>
          Todos os alunos
        </TituloDaSecao>

        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou classe…"
            value={buscaAluno}
            onChange={(e) => setBuscaAluno(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {alunosFiltrados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {alunos.length === 0 ? "Nenhum aluno matriculado ainda." : "Ninguém encontrado com esse termo."}
          </p>
        ) : (
          <div className="rounded-lg border bg-card divide-y max-h-[420px] overflow-y-auto">
            {alunosFiltrados.map(a => {
              const idade = idadeEm(a.data_nascimento);
              return (
                <div key={a.pessoa_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate">{a.nome_completo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {a.classe_nome}{idade !== null ? ` · ${idade} anos` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Aniversariantes do mês ──────────────────────────────────────── */}
      <section id="aniversariantes" className={scrollMt}>
        <TituloDaSecao icone={Cake} tom="celebracao" contagem={aniversariantes.length}>
          Aniversariantes de {MESES[new Date().getMonth()]}
        </TituloDaSecao>

        {aniversariantes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum aluno matriculado faz aniversário este mês.
          </p>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {aniversariantes.map(a => {
              const dia = new Date(a.data_nascimento! + "T00:00").getDate();
              return (
                <div key={a.pessoa_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-celebracao-text tabular-nums w-14 shrink-0">
                    {dia} {MESES_ABREV[new Date().getMonth()]}
                  </span>
                  <span className="truncate flex-1">{a.nome_completo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{a.classe_nome}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ClasseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        classe={classeEditando}
        onSaved={carregar}
      />
    </div>
  );
}
