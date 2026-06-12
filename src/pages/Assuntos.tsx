import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckSquare, Plus, Loader2, ChevronRight, Search,
  Calendar, AlertTriangle, Clock, MessageCircle, Users as UsersIcon,
} from "lucide-react";
import {
  listarAssuntos, carregarAssunto, montarLembreteAssuntoIndividual,
  PRIORIDADE_LABEL, PRIORIDADE_COR, PRIORIDADE_ICONE,
  STATUS_LABEL, STATUS_COR, SITUACAO_COR,
  type AssuntoDashboard, type AssuntoPrioridade, type AssuntoStatus,
} from "@/services/assuntosService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AssuntoForm } from "@/components/assuntos/AssuntoForm";

export default function Assuntos() {
  const [lista, setLista] = useState<AssuntoDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<AssuntoStatus | "abertos" | "todos">("abertos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<AssuntoPrioridade | "todas">("todas");
  const [novoOpen, setNovoOpen] = useState(false);

  useEffect(() => { carregar(); }, [filtroStatus, filtroPrioridade, busca]);

  async function enviarLembreteWhats(assuntoId: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    try {
      const assunto = await carregarAssunto(assuntoId);
      if (!assunto) { toast.error("Assunto não encontrado"); return; }
      if (!assunto.responsavel_id) {
        toast.error("Assunto sem responsável definido"); return;
      }
      // Buscar telefone do responsável
      const { data: pessoa } = await supabase
        .from("membros")
        .select("telefone")
        .eq("id", assunto.responsavel_id)
        .maybeSingle();
      const { url } = montarLembreteAssuntoIndividual(assunto, pessoa?.telefone ?? null);
      window.open(url, "_blank");
    } catch (err: any) {
      toast.error("Erro ao montar lembrete: " + (err?.message ?? "desconhecido"));
    }
  }

  async function cobrarTodosAtrasados() {
    const atrasados = lista.filter(a => a.situacao === "atrasado" && a.responsavel_id);
    if (atrasados.length === 0) {
      toast.info("Nenhum assunto atrasado com responsável definido"); return;
    }
    if (!confirm(`Vai abrir o WhatsApp em ${atrasados.length} aba(s) — uma por responsável. Continuar?`)) return;

    // Agrupa por responsável (pode haver mais de um assunto por responsável)
    const porResp = new Map<string, typeof atrasados>();
    atrasados.forEach(a => {
      if (!a.responsavel_id) return;
      const key = a.responsavel_id;
      if (!porResp.has(key)) porResp.set(key, []);
      porResp.get(key)!.push(a);
    });

    for (const [respId, lista] of porResp) {
      const { data: pessoa } = await supabase
        .from("membros")
        .select("telefone, nome_completo")
        .eq("id", respId)
        .maybeSingle();
      if (!pessoa) continue;

      // Mensagem coletiva: lembra de todos os assuntos atrasados desse responsável
      const linhas = [
        `Olá *${pessoa.nome_completo}*! 👋`,
        "",
        `Você tem *${lista.length}* assunto(s) atrasado(s):`,
        "",
      ];
      lista.forEach(a => {
        linhas.push(`🔴 *${a.titulo}*`);
        if (a.prazo) linhas.push(`   Vencia ${new Date(a.prazo+"T00:00").toLocaleDateString("pt-BR")}`);
        linhas.push("");
      });
      linhas.push("_Por gentileza, sinaliza pra mim como anda cada um?_", "", "_Secretaria · QIBRJ_");
      const mensagem = linhas.join("\n");
      const tel = (pessoa.telefone ?? "").replace(/\D/g, "");
      const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}` : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
      window.open(url, "_blank");
      // Pequena pausa pra navegador não bloquear pop-ups
      await new Promise(r => setTimeout(r, 400));
    }
    toast.success(`WhatsApp aberto para ${porResp.size} responsável(is)`);
  }


  async function carregar() {
    setLoading(true);
    try {
      const r = await listarAssuntos({
        status: filtroStatus,
        prioridade: filtroPrioridade,
        busca: busca.length >= 2 ? busca : undefined,
      });
      setLista(r);
    } finally { setLoading(false); }
  }

  const stats = useMemo(() => {
    const abertos = lista.filter(a => a.status === "aberto" || a.status === "em_andamento").length;
    const atrasados = lista.filter(a => a.situacao === "atrasado" && a.status !== "concluido").length;
    const proximos = lista.filter(a => a.situacao === "vence_em_breve").length;
    const concluidos = lista.filter(a => a.status === "concluido").length;
    return { abertos, atrasados, proximos, concluidos };
  }, [lista]);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-gold" /> Assuntos
          </h1>
          <p className="text-xs text-muted-foreground">
            Reuniões Administração + Pastoral · cada decisão vira ação com responsável e prazo.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Novo assunto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-muted-foreground">Em aberto</p>
            <p className="text-base font-semibold">{stats.abertos}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50/30 border-rose-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-rose-700">Atrasados</p>
            <p className="text-base font-semibold text-rose-700">{stats.atrasados}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/30 border-amber-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-amber-700">Vencem em breve</p>
            <p className="text-base font-semibold text-amber-700">{stats.proximos}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/30 border-emerald-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-emerald-700">Concluídos</p>
            <p className="text-base font-semibold text-emerald-700">{stats.concluidos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="relative md:col-span-1">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs pl-6" placeholder="Buscar..." />
          </div>
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertos">Em aberto (todos)</SelectItem>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(Object.entries(STATUS_LABEL) as [AssuntoStatus, string][]).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroPrioridade} onValueChange={(v) => setFiltroPrioridade(v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Toda prioridade</SelectItem>
              <SelectItem value="alta">🔴 Alta</SelectItem>
              <SelectItem value="media">🟡 Média</SelectItem>
              <SelectItem value="baixa">🟢 Baixa</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lista */}
      {lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <CheckSquare className="w-10 h-10 mx-auto opacity-30" />
            <p>Nenhum assunto encontrado.</p>
            <Button onClick={() => setNovoOpen(true)} variant="outline" className="gap-1.5">
              <Plus className="w-4 h-4" /> Criar primeiro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {lista.map(a => (
            <Link key={a.id} to={`/assunto/${a.id}`} className="block">
              <div className={`border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-2 ${SITUACAO_COR[a.situacao]}`}>
                <span className="text-base shrink-0">{PRIORIDADE_ICONE[a.prioridade]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{a.titulo}</span>
                    <Badge variant="outline" className={`text-[9px] ${STATUS_COR[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                    {a.vezes_discutido >= 3 && (
                      <Badge variant="outline" className="text-[9px] bg-purple-100 text-purple-700 border-purple-300">
                        {a.vezes_discutido}× discutido
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                    {a.responsavel_nome && <>👤 {a.responsavel_nome}</>}
                    {a.prazo && (
                      <span className={a.situacao === "atrasado" ? "text-rose-700 font-medium" : ""}>
                        <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
                        {a.situacao === "atrasado" ? "Atrasado · " : ""}
                        {a.dias_para_prazo != null && a.dias_para_prazo >= 0
                          ? `vence em ${a.dias_para_prazo}d`
                          : `há ${Math.abs(a.dias_para_prazo ?? 0)}d`}
                      </span>
                    )}
                    {a.situacao === "parado" && (
                      <span className="text-purple-700">
                        <Clock className="w-2.5 h-2.5 inline mr-0.5" /> Parado
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.responsavel_id && (
                    <button
                      type="button"
                      onClick={(e) => enviarLembreteWhats(a.id, e)}
                      title="Lembrar via WhatsApp"
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-emerald-50 text-emerald-600 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AssuntoForm open={novoOpen} onOpenChange={setNovoOpen} onSaved={carregar} />
    </div>
  );
}
