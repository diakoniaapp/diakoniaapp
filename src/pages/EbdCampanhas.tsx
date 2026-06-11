import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, DollarSign, Plus, Loader2, ChevronRight, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarCampanhas, carregarClasse, resumoCampanha,
  type CampanhaEbd, type ResumoCampanha, type EbdClasse,
} from "@/services/ebdService";
import { CampanhaForm } from "@/components/ebd/CampanhaForm";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface CampanhaComResumo extends CampanhaEbd {
  resumo: ResumoCampanha | null;
}

export default function EbdCampanhas() {
  const { classeId = "" } = useParams();
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [campanhas, setCampanhas] = useState<CampanhaComResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaOpen, setNovaOpen] = useState(false);

  useEffect(() => { carregar(); }, [classeId]);

  async function carregar() {
    if (!classeId) return;
    setLoading(true);
    try {
      const [cl, lista] = await Promise.all([
        carregarClasse(classeId),
        listarCampanhas(classeId),
      ]);
      setClasse(cl);
      // Carrega resumos em paralelo
      const enriched: CampanhaComResumo[] = await Promise.all(
        lista.map(async (c) => {
          const r = await resumoCampanha(c.id).catch(() => null);
          return { ...c, resumo: r };
        })
      );
      setCampanhas(enriched);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setLoading(false); }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }

  const ativas = campanhas.filter(c => c.ativo);
  const arquivadas = campanhas.filter(c => !c.ativo);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to={`/ebd/${classeId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 text-gold" />
            Campanhas — {classe?.nome}
          </h1>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Nova
        </Button>
      </div>

      {campanhas.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma campanha ainda. Crie a primeira clicando em "Nova".
          </CardContent>
        </Card>
      )}

      {ativas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
            Ativas ({ativas.length})
          </h2>
          {ativas.map(c => <CampanhaCard key={c.id} c={c} classeId={classeId} />)}
        </section>
      )}

      {arquivadas.length > 0 && (
        <section className="space-y-2 pt-4">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
            Encerradas ({arquivadas.length})
          </h2>
          {arquivadas.map(c => <CampanhaCard key={c.id} c={c} classeId={classeId} />)}
        </section>
      )}

      <CampanhaForm
        classeId={classeId}
        open={novaOpen}
        onOpenChange={setNovaOpen}
        campanha={null}
        onSaved={carregar}
      />
    </div>
  );
}

function CampanhaCard({ c, classeId }: { c: CampanhaComResumo; classeId: string }) {
  const r = c.resumo;
  return (
    <Link to={`/ebd/${classeId}/campanhas/${c.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium truncate">{c.nome}</h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(c.data_inicio + "T00:00").toLocaleDateString("pt-BR")} → {new Date(c.data_fim + "T00:00").toLocaleDateString("pt-BR")}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>

          {r && (
            <>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-sm">{brl(r.arrecadado)}</span>
                <span className="text-muted-foreground">de {brl(r.meta)} · {Math.round(r.percentual)}%</span>
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, r.percentual)}%` }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
