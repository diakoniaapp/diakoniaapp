// ─── Ebd.tsx — Listagem de classes ─────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, GraduationCap, ChevronRight, Users, Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listarClasses, type EbdClasse } from "@/services/ebdService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  qtd_esperados: number;
}

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const cs = await listarClasses();
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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando classes...
      </div>
    );
  }

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
            <Card key={c.id} className="rounded-2xl shadow hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor ?? "#cfa451" }} />
                    {c.nome}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {generoTexto(c.genero)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{faixaTexto(c)}</p>

                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
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
                <p className="text-[10px] text-muted-foreground text-right">
                  {taxa}% da faixa etária matriculada
                </p>

                <div className="flex gap-1.5 mt-1">
                  <Link to={`/ebd/${c.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      Abrir <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
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
