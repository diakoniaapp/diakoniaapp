// ─── PainelPastoral.tsx — Painel "Ações do dia" + Inteligência ─────────────
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import {
  vincularPessoa, PARENTESCO_LABEL, type ParentescoTipo,
} from "@/services/familiaService";

export default function PainelPastoral() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [resumo, setResumo] = useState<ResumoPastoral | null>(null);
  const [familiasSemResp, setFamiliasSemResp] = useState<FamiliaSemResponsavel[]>([]);
  const [pessoasSugeridas, setPessoasSugeridas] = useState<PessoaSemFamilia[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  // ── Seleção múltipla / ação em lote (só pessoas com família sugerida concreta) ──
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteOpen, setLoteOpen] = useState(false);
  const [loteParentesco, setLoteParentesco] = useState<ParentescoTipo>("outro");
  const [loteBusy, setLoteBusy] = useState(false);

  useEffect(() => { carregar(); }, []);

  // Força um re-render a cada minuto só para o texto "Atualizado há X" continuar fresco
  const [, forcarAtualizacaoRelogio] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forcarAtualizacaoRelogio(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

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
      setSelecionados(new Set());
      setAtualizadoEm(new Date());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar painel");
    } finally {
      setLoading(false);
    }
  }

  function abrirWhats(ev: EventoPastoral) {
    window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer");
  }

  // Só pessoas com uma família sugerida concreta podem entrar na seleção em lote
  // (as demais só têm "sobrenome em comum" sem família existente pra vincular).
  const elegiveisLote = pessoasSugeridas.filter(p => !!p.familia_sugerida_id);
  const todosElegiveisSelecionados =
    elegiveisLote.length > 0 && elegiveisLote.every(p => selecionados.has(p.pessoa_id));

  function alternarSelecao(pessoaId: string, marcado: boolean) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (marcado) next.add(pessoaId); else next.delete(pessoaId);
      return next;
    });
  }

  function alternarSelecionarTodos(marcado: boolean) {
    if (marcado) {
      setSelecionados(new Set(elegiveisLote.map(p => p.pessoa_id)));
    } else {
      setSelecionados(new Set());
    }
  }

  async function confirmarVinculoLote() {
    const alvos = pessoasSugeridas.filter(
      p => selecionados.has(p.pessoa_id) && p.familia_sugerida_id
    );
    if (alvos.length === 0) return;
    setLoteBusy(true);
    let sucesso = 0;
    let falhas = 0;
    for (const p of alvos) {
      try {
        await vincularPessoa(p.familia_sugerida_id as string, p.pessoa_id, loteParentesco, false, false);
        sucesso++;
      } catch {
        falhas++;
      }
    }
    setLoteBusy(false);
    setLoteOpen(false);
    if (sucesso > 0) {
      toast.success(
        falhas === 0
          ? `${sucesso} ${sucesso === 1 ? "pessoa vinculada" : "pessoas vinculadas"} à família sugerida!`
          : `${sucesso} vinculadas, ${falhas} falharam.`
      );
    } else {
      toast.error("Não foi possível vincular as pessoas selecionadas.");
    }
    await carregar();
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

      {/* Resumo em linguagem natural, inspirado no card "Visão geral" do Omie */}
      {resumo && (
        <div className="text-sm text-muted-foreground bg-muted/40 border rounded-md px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
            {resumoNatural(resumo)}
          </span>
          {atualizadoEm && (
            <span className="text-[10px] text-muted-foreground/70 shrink-0">
              Atualizado {formatarAtualizadoHa(atualizadoEm)}
            </span>
          )}
        </div>
      )}

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
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Possíveis vínculos familiares
                <Badge variant="outline" className="text-[10px] bg-blue-100 border-blue-300">
                  {pessoasSugeridas.length}
                </Badge>
              </span>
              {elegiveisLote.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={todosElegiveisSelecionados}
                    onCheckedChange={(v) => alternarSelecionarTodos(!!v)}
                  />
                  Selecionar todos com família sugerida
                </label>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-1">
              Pessoas com sobrenome em comum com alguém já cadastrado. Considere vincular à mesma família.
            </p>

            {selecionados.size > 0 && (
              <div className="flex items-center justify-between rounded-md border border-blue-300 bg-blue-50 px-3 py-2">
                <span className="text-xs font-medium text-blue-800">
                  {selecionados.size} {selecionados.size === 1 ? "pessoa selecionada" : "pessoas selecionadas"}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button" size="sm" variant="ghost"
                    className="text-xs h-7"
                    onClick={() => setSelecionados(new Set())}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="button" size="sm"
                    className="gap-1.5 text-xs h-7"
                    onClick={() => setLoteOpen(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Vincular selecionados
                  </Button>
                </div>
              </div>
            )}

            {pessoasSugeridas.slice(0, 15).map(p => {
              const temFamiliaConcreta = !!p.familia_sugerida_id;
              const checked = selecionados.has(p.pessoa_id);
              return (
                <div key={p.pessoa_id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-blue-50/40 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {temFamiliaConcreta && (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => alternarSelecao(p.pessoa_id, !!v)}
                        aria-label={`Selecionar ${p.nome_completo}`}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.nome_completo}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        Sobrenome: <strong>{p.sobrenome}</strong>
                        {p.familia_sugerida_nome && (
                          <Badge variant="outline" className="text-[9px] ml-1 border-rose-300 text-rose-700">
                            → Família {p.familia_sugerida_nome ?? "sugerida"}
                          </Badge>
                        )}
                        {!p.familia_sugerida_nome && p.qtd_pessoas_mesmo_sobrenome > 1 && (
                          <span>· {p.qtd_pessoas_mesmo_sobrenome - 1} outras com mesmo sobrenome</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Link to={`/membros?abrir=${p.pessoa_id}`}>
                    <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs shrink-0">
                      <UserPlus className="w-3.5 h-3.5" /> Vincular
                    </Button>
                  </Link>
                </div>
              );
            })}
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

      {/* Dialog: vínculo em lote */}
      <Dialog open={loteOpen} onOpenChange={setLoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Vincular {selecionados.size} {selecionados.size === 1 ? "pessoa" : "pessoas"} à família sugerida
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cada pessoa selecionada será vinculada à família já sugerida ao lado do nome dela
              (sobrenome em comum). O parentesco abaixo será aplicado a todas — ajuste depois,
              individualmente, se algum caso precisar de um parentesco diferente.
            </p>
            <div>
              <Select value={loteParentesco} onValueChange={(v) => setLoteParentesco(v as ParentescoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PARENTESCO_LABEL) as ParentescoTipo[]).map(k => (
                    <SelectItem key={k} value={k}>{PARENTESCO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5 border rounded-md p-2">
              {pessoasSugeridas
                .filter(p => selecionados.has(p.pessoa_id))
                .map(p => (
                  <li key={p.pessoa_id} className="truncate">
                    {p.nome_completo} → Família {p.familia_sugerida_nome ?? "sugerida"}
                  </li>
                ))}
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoteOpen(false)} disabled={loteBusy}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarVinculoLote} disabled={loteBusy}>
              {loteBusy ? "Vinculando..." : `Vincular ${selecionados.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────

// Resumo em linguagem natural do estado do dia, inspirado no card
// "Visão geral" do painel inicial do Omie.
function resumoNatural(r: ResumoPastoral): string {
  const celebra: string[] = [];
  if (r.aniversarios_hoje > 0) {
    celebra.push(`${r.aniversarios_hoje} ${r.aniversarios_hoje === 1 ? "aniversariante" : "aniversariantes"} hoje`);
  }
  if (r.bodas_hoje > 0) {
    celebra.push(`${r.bodas_hoje} ${r.bodas_hoje === 1 ? "casal em bodas" : "casais em bodas"} hoje`);
  }

  const pendencias: string[] = [];
  if (r.familias_sem_resp > 0) {
    pendencias.push(`${r.familias_sem_resp} ${r.familias_sem_resp === 1 ? "família sem responsável" : "famílias sem responsável"}`);
  }
  if (r.pessoas_sem_familia_sugerida > 0) {
    pendencias.push(`${r.pessoas_sem_familia_sugerida} ${r.pessoas_sem_familia_sugerida === 1 ? "vínculo familiar" : "vínculos familiares"} para revisar`);
  }

  const partes: string[] = [];
  if (celebra.length > 0) partes.push(`Hoje: ${celebra.join(" e ")}.`);
  if (pendencias.length > 0) partes.push(`Pendências: ${pendencias.join(" e ")}.`);

  if (partes.length === 0) return "Nenhuma celebração hoje e nenhuma pendência no momento — tudo em dia! 🙏";
  return partes.join(" ");
}

// "Atualizado há X", no mesmo espírito do timestamp que o Omie mostra
// perto de números importantes.
function formatarAtualizadoHa(data: Date | null): string {
  if (!data) return "";
  const diffMs = Date.now() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin === 1) return "há 1 minuto";
  if (diffMin < 60) return `há ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "há 1 hora";
  return `há ${diffH} horas`;
}

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
