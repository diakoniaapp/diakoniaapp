import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, DollarSign, Plus, Loader2, Trash2,
  TrendingUp, Sparkles, Calendar, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarCampanha, resumoCampanha, listarEntradas, excluirEntrada,
  carregarClasse,
  type CampanhaEbd, type ResumoCampanha, type EntradaEbd, type EbdClasse,
} from "@/services/ebdService";
import { CampanhaForm } from "@/components/ebd/CampanhaForm";
import { EntradaForm } from "@/components/ebd/EntradaForm";

const TIPO_LABEL: Record<string, string> = { oferta: "Oferta", evento: "Evento", produto: "Produto" };
const FORMA_LABEL: Record<string, string> = { pix: "PIX", envelope: "Envelope", outro: "Outro" };
const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  meta_atingida: { texto: "🎉 Meta atingida!", cor: "text-emerald-700" },
  acima_esperado: { texto: "👏 Acima do esperado", cor: "text-emerald-700" },
  no_ritmo: { texto: "✓ No ritmo", cor: "text-blue-700" },
  abaixo_esperado: { texto: "⚠ Abaixo do esperado", cor: "text-amber-700" },
  muito_abaixo: { texto: "❗ Muito abaixo", cor: "text-rose-700" },
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EbdCampanha() {
  const { classeId = "", campanhaId = "" } = useParams();
  const navigate = useNavigate();
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [campanha, setCampanha] = useState<CampanhaEbd | null>(null);
  const [resumo, setResumo] = useState<ResumoCampanha | null>(null);
  const [entradas, setEntradas] = useState<EntradaEbd[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [novaEntradaOpen, setNovaEntradaOpen] = useState(false);

  useEffect(() => { carregar(); }, [classeId, campanhaId]);

  async function carregar() {
    if (!campanhaId) return;
    setLoading(true);
    try {
      const [c, cl, r, es] = await Promise.all([
        carregarCampanha(campanhaId),
        carregarClasse(classeId),
        resumoCampanha(campanhaId),
        listarEntradas(campanhaId),
      ]);
      setCampanha(c);
      setClasse(cl);
      setResumo(r);
      setEntradas(es);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setLoading(false); }
  }

  async function deletarEntrada(id: string) {
    if (!confirm("Excluir esta entrada?")) return;
    try {
      await excluirEntrada(id);
      toast.success("Entrada removida");
      carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }
  if (!campanha) {
    return <div className="p-8 text-center text-muted-foreground">
      Campanha não encontrada. <Link to={`/ebd/${classeId}`} className="text-primary underline">Voltar</Link>
    </div>;
  }

  const statusInfo = resumo ? STATUS_LABEL[resumo.status] : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Link to={`/ebd/${classeId}/campanhas`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 text-gold" />
            {campanha.nome}
          </h1>
          <p className="text-xs text-muted-foreground">
            {classe?.nome} · {new Date(campanha.data_inicio + "T00:00").toLocaleDateString("pt-BR")} → {new Date(campanha.data_fim + "T00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Button>
      </div>

      {campanha.descricao && (
        <p className="text-sm text-muted-foreground italic">"{campanha.descricao}"</p>
      )}

      {/* Resumo + Barra de progresso */}
      {resumo && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-semibold">{brl(resumo.arrecadado)}</p>
                <p className="text-xs text-muted-foreground">
                  de <strong>{brl(resumo.meta)}</strong> · meta {Math.round(resumo.percentual)}% alcançada
                </p>
              </div>
              {statusInfo && (
                <Badge variant="outline" className={`${statusInfo.cor} border-current bg-current/5`}>
                  {statusInfo.texto}
                </Badge>
              )}
            </div>

            {/* Barra principal */}
            <div className="space-y-1">
              <div className="h-4 rounded-full bg-muted overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-gold via-amber-500 to-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, resumo.percentual)}%` }}
                />
                {/* Marca do esperado_ate_hoje */}
                {resumo.dias_decorridos > 0 && resumo.dias_decorridos < resumo.dias_totais && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/60"
                    style={{ left: `${(resumo.esperado_ate_hoje / resumo.meta) * 100}%` }}
                    title={`Esperado até hoje: ${brl(resumo.esperado_ate_hoje)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>R$ 0</span>
                {resumo.dias_decorridos > 0 && resumo.dias_decorridos < resumo.dias_totais && (
                  <span title="Esperado até hoje">
                    Esperado hoje: {brl(resumo.esperado_ate_hoje)}
                  </span>
                )}
                <span>{brl(resumo.meta)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="border rounded-md py-1.5">
                <p className="text-muted-foreground">Decorrido</p>
                <p className="font-semibold">{resumo.dias_decorridos}/{resumo.dias_totais} dias</p>
              </div>
              <div className="border rounded-md py-1.5">
                <p className="text-muted-foreground">Meta diária</p>
                <p className="font-semibold">{brl(resumo.meta_diaria)}</p>
              </div>
              <div className="border rounded-md py-1.5">
                <p className="text-muted-foreground">Entradas</p>
                <p className="font-semibold">{entradas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão registrar */}
      <Button onClick={() => setNovaEntradaOpen(true)} className="w-full gap-1.5">
        <Plus className="w-4 h-4" /> Registrar entrada
      </Button>

      {/* Lista de entradas */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Entradas registradas ({entradas.length})
        </h3>
        {entradas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Ainda sem entradas. Comece registrando a primeira.
            </CardContent>
          </Card>
        ) : (
          entradas.map(e => {
            const valorMostra = e.valor;
            const tinhaSimbolico = (Math.round(e.valor * 100) % 10) === 0; // 0.10 sempre múltiplo de 10
            return (
              <div key={e.id} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{brl(valorMostra)}</span>
                    <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[e.tipo]}</Badge>
                    <Badge variant="outline" className="text-[10px]">{FORMA_LABEL[e.forma]}</Badge>
                    {tinhaSimbolico && (
                      <Sparkles className="w-3 h-3 text-gold" title="Inclui R$0,10 simbólicos" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {new Date(e.data + "T00:00").toLocaleDateString("pt-BR")}
                    {e.descricao && ` · ${e.descricao}`}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => deletarEntrada(e.id)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      <CampanhaForm
        classeId={classeId}
        open={editOpen}
        onOpenChange={setEditOpen}
        campanha={campanha}
        onSaved={() => { carregar(); if (!campanha) navigate(`/ebd/${classeId}/campanhas`); }}
      />
      <EntradaForm
        campanhaId={campanhaId}
        open={novaEntradaOpen}
        onOpenChange={setNovaEntradaOpen}
        onSaved={carregar}
      />
    </div>
  );
}
