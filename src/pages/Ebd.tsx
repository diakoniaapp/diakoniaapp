// ─── Ebd.tsx — Listagem de classes ─────────────────────────────────────────
//
// Redesenhado a partir do feedback dela sobre a primeira versão dos
// cartões: grandes demais, "150% do perfil" sem sentido, sem dizer quem
// leciona, botões ocupando espaço. E um pedido novo: uma faixa fixa acima
// dos cartões, com os números do mês e link pro relatório — "onde a
// pessoa responsável pela área vai trabalhar".
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, ChevronRight, Plus, Pencil, AlertCircle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listarClasses, professoresPorClasse, type EbdClasse, type EbdProfessor } from "@/services/ebdService";
import { ebdPorClasse, relatorioMensalGeralResumo, type EbdClasseLinha, type RelatorioMensalGeralResumo } from "@/services/ebdPainelService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  /** Todo mundo que cabe no perfil (idade/gênero), matriculado ou não —
   *  o denominador certo da cobertura. Não confundir com "livres"
   *  (quem ainda pode ser convidado), que é outra pergunta. */
  qtd_elegiveis: number;
  /** Quantas aulas desta classe nunca tiveram chamada lançada. */
  aulasSemChamada: number;
  professores: EbdProfessor[];
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [resumoMes, setResumoMes] = useState<RelatorioMensalGeralResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativas]);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const [cs, porClasse, professores, resumo] = await Promise.all([
        listarClasses(mostrarInativas),
        // Cada uma, uma chamada só pra todas as classes — não N+1 por cartão.
        ebdPorClasse().catch((): EbdClasseLinha[] => []),
        professoresPorClasse().catch(() => new Map<string, EbdProfessor[]>()),
        relatorioMensalGeralResumo(hoje.getFullYear(), hoje.getMonth() + 1).catch(() => null),
      ]);
      const semChamadaPorClasse = new Map<string, number>(
        porClasse.map(p => [p.classe_id, p.aulas_sem_chamada]),
      );
      setResumoMes(resumo);

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
          // Todo mundo que cabe no perfil, matriculado em QUALQUER lugar ou
          // em lugar nenhum — o total, não só quem ainda falta convidar.
          // Achado dela: dividir matriculados pela sobra ("livres") dava
          // 150% em Crianças, porque a sobra não é o total.
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

  const hoje = new Date();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
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

      {/* A faixa de trabalho de quem responde pela EBD inteira — pedido
          dela: "onde a pessoa responsável pela área vai trabalhar". Os
          cartões abaixo respondem por UMA classe; isto responde pelo
          ministério. Fica acima, sempre visível ao abrir a tela, sem
          precisar entrar em cada classe pra montar o quadro geral. */}
      <div className="rounded-xl border border-gold/30 bg-gradient-verse p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium flex items-center gap-1.5">
            Este mês · <span className="capitalize text-muted-foreground font-normal">{MESES[hoje.getMonth()]}</span>
          </p>
          <Button asChild size="sm" variant="outline" className="gap-1.5 h-7 text-xs bg-background/60">
            <Link to="/ebd/relatorio-mensal">
              <FileText className="w-3.5 h-3.5" /> Relatório completo
            </Link>
          </Button>
        </div>
        {resumoMes && resumoMes.aulas_total > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <FaixaStat label="Classes" valor={resumoMes.classes_ativas} />
            <FaixaStat label="Matriculados" valor={resumoMes.matriculados} />
            <FaixaStat label="Aulas c/ chamada" valor={`${resumoMes.aulas_com_chamada}/${resumoMes.aulas_total}`} />
            <FaixaStat label="Presença média" valor={resumoMes.taxa_presenca !== null ? `${resumoMes.taxa_presenca}%` : "—"} highlight />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma aula registrada ainda este mês, em nenhuma classe.</p>
        )}
      </div>

      {/* `grid-cols-1` explícito, e não só a ausência de `md:`/`lg:` — sem
          ele, o grid não tinha `grid-template-columns` nenhum no celular e
          caía no auto do navegador, que mede pelo MAIOR conteúdo (aqui, o
          nome do professor) em vez do espaço disponível. O `truncate` do
          nome não fazia nada porque a coluna nunca ficava estreita o
          bastante pra precisar truncar — ela crescia pra caber o nome
          inteiro, e o cartão vazava da tela. */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => {
          const cobertura = c.qtd_elegiveis > 0
            ? Math.round((c.qtd_matriculados / c.qtd_elegiveis) * 100)
            : 0;
          const nomesProf = nomesDosProfessores(c.professores);
          return (
            <Card key={c.id} className={`rounded-xl ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
              <CardContent className="p-3.5 space-y-2">
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

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span><strong>{c.qtd_matriculados}</strong> matriculado{c.qtd_matriculados === 1 ? "" : "s"}</span>
                  <span className="text-muted-foreground">{cobertura}% do perfil</span>
                </div>
                <div className="h-1.5 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gold/80 transition-all"
                    style={{ width: `${Math.min(100, cobertura)}%` }}
                  />
                </div>

                {/* Chamada em destaque, mas numa linha só — pedido dela: os
                    botões estavam ocupando espaço demais. O peso vem da cor
                    e do tamanho relativo, não de uma linha inteira própria. */}
                <div className="flex gap-1.5 pt-1">
                  <Button asChild size="sm" className="flex-1 gap-1.5 h-8 bg-gold hover:bg-gold/90 text-white border-0">
                    <Link to={`/ebd/${c.id}/chamada`}>
                      <GraduationCap className="w-3.5 h-3.5" /> Chamada
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 px-2.5" title="Abrir classe">
                    <Link to={`/ebd/${c.id}`}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                  {podeCriar && (
                    <Button
                      type="button" variant="ghost" size="sm" className="h-8 px-2.5"
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

function FaixaStat({ label, valor, highlight }: { label: string; valor: number | string; highlight?: boolean }) {
  return (
    <div>
      <p className={`font-semibold tabular-nums ${highlight ? "text-lg text-gold" : "text-base"}`}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
