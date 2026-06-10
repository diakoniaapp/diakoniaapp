// ─── PainelPastoral.tsx — Painel "Ações do dia" + Inteligência ─────────────
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cake, Heart, MessageCircle, CalendarCheck, Loader2,
  Sparkles, AlertCircle, UserPlus, Users, ChevronRight, Calendar, Crown,
} from "lucide-react";
import { toast } from "sonner";
import {
  proximosDias, linkWhatsApp,
  familiasSemResponsavel, pessoasSemFamiliaSugerida, resumoPainel,
  type EventoPastoral, type FamiliaSemResponsavel, type PessoaSemFamilia,
  type ResumoPastoral,
} from "@/services/agendaPastoralService";

export default function PainelPastoral() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [resumo, setResumo] = useState<ResumoPastoral | null>(null);
  const [familiasSemResp, setFamiliasSemResp] = useState<FamiliaSemResponsavel[]>([]);
  const [pessoasSugeridas, setPessoasSugeridas] = useState<PessoaSemFamilia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [ev, r, fs, ps] = await Promise.all([
        proximosDias(7),
        resumoPainel(),
        familiasSemResponsavel(),
        pessoasSemFamiliaSugerida(),
      ]);
      setEventos(ev);
      setResumo(r);
      setFamiliasSemResp(fs);
      setPessoasSugeridas(ps);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar painel");
    } finally {
      setLoading(false);
    }
  }

  function abrirWhats(ev: EventoPastoral) {
    window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando painel...
    </div>;
  }

  const eventosHoje    = eventos.filter(e => e.dias_ate_evento === 0);
  const eventosSemana  = eventos.filter(e => (e.dias_ate_evento ?? 0) > 0 && (e.dias_ate_evento ?? 0) <= 7);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="font-serif text-2xl flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-gold" />
          Painel Pastoral
        </h1>
        <p className="text-sm text-muted-foreground">
          Ações do dia e alertas para a liderança pastoral
        </p>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <ResumoCard label="Aniv. hoje" value={resumo.aniversarios_hoje} cor="bg-pink-50 text-pink-700 border-pink-200" />
          <ResumoCard label="Bodas hoje" value={resumo.bodas_hoje} cor="bg-rose-50 text-rose-700 border-rose-200" />
          <ResumoCard label="Aniv. (7d)" value={resumo.aniversarios_semana} cor="bg-pink-50/40 text-pink-700 border-pink-200" />
          <ResumoCard label="Bodas (7d)" value={resumo.bodas_semana} cor="bg-rose-50/40 text-rose-700 border-rose-200" />
          <ResumoCard label="Fam. sem resp." value={resumo.familias_sem_resp} cor="bg-amber-50 text-amber-700 border-amber-200" />
          <ResumoCard label="Sugestões família" value={resumo.pessoas_sem_familia_sugerida} cor="bg-blue-50 text-blue-700 border-blue-200" />
        </div>
      )}

      {/* HOJE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-gold" />
            Ações de hoje
            <Badge variant="outline" className="text-[10px]">{eventosHoje.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {eventosHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum aniversário ou casamento hoje. Bom dia tranquilo 🙏
            </p>
          ) : (
            eventosHoje.map(ev => <LinhaEvento key={ev.ref_id} ev={ev} onWhats={abrirWhats} />)
          )}
        </CardContent>
      </Card>

      {/* Próximos 7 dias */}
      {eventosSemana.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Próximos 7 dias
              <Badge variant="outline" className="text-[10px]">{eventosSemana.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eventosSemana.map(ev => <LinhaEvento key={ev.ref_id} ev={ev} onWhats={abrirWhats} />)}
          </CardContent>
        </Card>
      )}

      {/* Famílias sem responsável */}
      {familiasSemResp.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Famílias sem responsável
              <Badge variant="outline" className="text-[10px] bg-amber-100 border-amber-300">
                {familiasSemResp.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-1">
              Defina quem é o responsável de cada família para receber comunicações pastorais.
            </p>
            {familiasSemResp.map(f => (
              <div key={f.familia_id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-amber-50/40">
                <div className="min-w-0">
                  <p className="font-medium text-sm">Família {f.nome_familia}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.qtd_membros} membro{f.qtd_membros > 1 ? "s" : ""} · Mais antigo: {f.primeiro_membro_nome}
                  </p>
                </div>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => navigate("/familias")}
                  className="gap-1.5 text-xs shrink-0"
                >
                  <Crown className="w-3.5 h-3.5" /> Definir
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pessoas com sobrenome em comum mas sem família */}
      {pessoasSugeridas.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Possíveis vínculos familiares
              <Badge variant="outline" className="text-[10px] bg-blue-100 border-blue-300">
                {pessoasSugeridas.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-1">
              Pessoas com sobrenome em comum com alguém já cadastrado. Considere vincular à mesma família.
            </p>
            {pessoasSugeridas.slice(0, 15).map(p => (
              <div key={p.pessoa_id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-blue-50/40">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{p.nome_completo}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                    Sobrenome: <strong>{p.sobrenome}</strong>
                    {p.familia_sugerida_nome && (
                      <Badge variant="outline" className="text-[9px] ml-1 border-rose-300 text-rose-700">
                        → Família {p.familia_sugerida_nome}
                      </Badge>
                    )}
                    {!p.familia_sugerida_nome && p.qtd_pessoas_mesmo_sobrenome > 1 && (
                      <span>· {p.qtd_pessoas_mesmo_sobrenome - 1} outras com mesmo sobrenome</span>
                    )}
                  </p>
                </div>
                <Link to={`/membros?abrir=${p.pessoa_id}`}>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs shrink-0">
                    <UserPlus className="w-3.5 h-3.5" /> Vincular
                  </Button>
                </Link>
              </div>
            ))}
            {pessoasSugeridas.length > 15 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                ... e mais {pessoasSugeridas.length - 15} pessoas
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-center pt-2">
        <Link to="/agenda-pastoral">
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            Ver agenda do mês completa <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────
function ResumoCard({ label, value, cor }: { label: string; value: number; cor: string }) {
  return (
    <div className={`rounded-md border p-2 text-center ${cor}`}>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide mt-1 leading-tight">{label}</p>
    </div>
  );
}

function LinhaEvento({ ev, onWhats }: { ev: EventoPastoral; onWhats: (e: EventoPastoral) => void }) {
  const ehAnis = ev.tipo === "aniversario";
  const Icon = ehAnis ? Cake : Heart;
  const corIcon = ehAnis ? "text-pink-500" : "text-rose-500";

  let quando = "hoje";
  if (ev.dias_ate_evento === 1) quando = "amanhã";
  else if ((ev.dias_ate_evento ?? 0) > 1) {
    const d = new Date(ev.data_evento + "T00:00");
    quando = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
  }

  return (
    <div className="flex items-center justify-between border rounded-md px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${corIcon}`} />
        <div className="min-w-0">
          <p className="font-medium truncate text-sm">{ev.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {quando} · {(ev.anos_completar ?? ev.anos_vai_completar) > 0 
              ? `${ev.anos_completar ?? ev.anos_vai_completar} ${ehAnis ? "anos" : "anos de casados"}`
              : "—"}
          </p>
        </div>
      </div>
      {(ev.telefone || ev.telefone_secundario) && (
        <Button
          type="button" size="sm" variant="ghost"
          className="h-8 px-2 gap-1 text-xs text-emerald-700 hover:bg-emerald-50 shrink-0"
          onClick={() => onWhats(ev)}
          title="WhatsApp"
        >
          <MessageCircle className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
