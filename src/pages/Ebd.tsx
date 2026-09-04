// ─── Ebd.tsx — Listagem de classes ─────────────────────────────────────────
import { useEffect, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, GraduationCap, ChevronRight, Users, Plus, Pencil, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarClasses, type EbdClasse } from "@/services/ebdService";
import { ebdPorClasse, type EbdClasseLinha } from "@/services/ebdPainelService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  qtd_esperados: number;
  /** Quantas aulas desta classe nunca tiveram chamada lançada — sinal de
   *  atenção, não julgamento (a classe pode ter aula marcada sem ter
   *  acontecido ainda). */
  aulasSemChamada: number;
}

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativas]);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, porClasse] = await Promise.all([
        listarClasses(mostrarInativas),
        // Uma chamada só, pra todas as classes — não N+1. Sem tentar/pegar:
        // um cartão sem esse dado ainda mostra tudo o mais, só sem o aviso.
        ebdPorClasse().catch((): EbdClasseLinha[] => []),
      ]);
      const semChamadaPorClasse = new Map<string, number>(
        porClasse.map(p => [p.classe_id, p.aulas_sem_chamada]),
      );
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
          aulasSemChamada: semChamadaPorClasse.get(c.id) ?? 0,
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

                {c.aulasSemChamada > 0 && (
                  <p className="text-xs text-warning-text flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {c.aulasSemChamada} {c.aulasSemChamada === 1 ? "aula" : "aulas"} sem chamada lançada
                  </p>
                )}

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

                {/* Chamada em destaque — pedido dela: "dar mais ênfase ao
                    fazer chamada". É o gesto que se repete toda semana; o
                    resto ("Abrir" pra matrículas/professores, "Editar") é
                    trabalho ocasional e fica menor, por baixo. */}
                <div className="space-y-1.5 mt-1">
                  <Button asChild size="sm" className="w-full gap-1.5 bg-gold hover:bg-gold/90 text-white border-0">
                    <Link to={`/ebd/${c.id}/chamada`}>
                      <GraduationCap className="w-3.5 h-3.5" /> Fazer chamada
                    </Link>
                  </Button>
                  <div className="flex gap-1.5">
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
