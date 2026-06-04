// ─── VisitanteDetalhe.tsx — Ficha completa de acolhimento pastoral ────────────
// Rota: /visitantes/:id

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  ArrowLeft, Phone, MessageCircle, CheckCircle2, Clock,
  UserCheck, RefreshCw, Save, ChevronRight, ChevronLeft,
  Heart, Star, Sparkles, AlertTriangle, User, TriangleAlert,
} from "lucide-react";

import { AcolhimentoPanel } from "@/components/membros/AcolhimentoPanel";
import VisitanteTimeline   from "@/components/membros/VisitanteTimeline";

import {
  buscarVisitante,
  atualizarStatusAcolhimento,
  salvarObservacoes,
  tornarCongregadoIntegrado,
  enviarMensagemPastoral,
  buscarNomeResponsavel,
} from "@/services/visitanteService";

import {
  STATUS_ACOLHIMENTO_CONFIG,
  TRILHA_ACOLHIMENTO,
} from "@/types/visitante";
import type { Visitante, StatusAcolhimento } from "@/types/visitante";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diasSemContato(ultimoContato: string | null): number {
  if (!ultimoContato) return 9999;
  return Math.floor((Date.now() - new Date(ultimoContato).getTime()) / 86_400_000);
}

// ─── Sub: Alerta de inatividade ───────────────────────────────────────────────

function AlertaInatividade({ visitante }: { visitante: Visitante }) {
  const dias = diasSemContato(visitante.ultimo_contato_em);
  const diasCad = Math.floor((Date.now() - new Date(visitante.created_at).getTime()) / 86_400_000);

  // Sem contato há mais de 15 dias OU cadastrado há mais de 7 dias sem nenhum contato
  const critico = dias >= 15;
  const atencao = !critico && (dias >= 7 || (diasCad >= 7 && !visitante.ultimo_contato_em));

  if (!critico && !atencao) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${
      critico
        ? "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800/40"
        : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/40"
    }`}>
      <TriangleAlert className={`w-5 h-5 shrink-0 mt-0.5 ${critico ? "text-red-500" : "text-amber-500"}`} />
      <div className="text-sm">
        <p className={`font-semibold ${critico ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
          {critico ? "Atenção urgente necessária" : "Contato pendente"}
        </p>
        <p className={`mt-0.5 ${critico ? "text-red-600 dark:text-red-500" : "text-amber-600 dark:text-amber-500"}`}>
          {visitante.ultimo_contato_em
            ? `Sem contato há ${dias} ${dias === 1 ? "dia" : "dias"} (último: ${format(new Date(visitante.ultimo_contato_em), "dd/MM/yyyy", { locale: ptBR })})`
            : `Nunca foi contatado — cadastrado há ${diasCad} ${diasCad === 1 ? "dia" : "dias"}`
          }
        </p>
      </div>
    </div>
  );
}

// ─── Sub: Trilha visual ───────────────────────────────────────────────────────

function TrilhaAcolhimento({
  statusAtual, onAvancar, onVoltar, salvando,
}: {
  statusAtual: StatusAcolhimento | null;
  onAvancar:   () => void;
  onVoltar:    () => void;
  salvando:    boolean;
}) {
  const idx = TRILHA_ACOLHIMENTO.indexOf(statusAtual ?? "novo");

  return (
    <Card className="rounded-2xl shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-400" />
          Trilha de Acolhimento
          <span className="ml-auto text-xs font-normal">
            Etapa {Math.max(idx + 1, 1)} de {TRILHA_ACOLHIMENTO.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Barra de progresso com etiquetas */}
        <div className="space-y-2">
          <div className="flex gap-1">
            {TRILHA_ACOLHIMENTO.map((s, i) => {
              const feito = i < idx;
              const ativo = i === idx;
              return (
                <div
                  key={s}
                  className={`flex-1 h-2 rounded-full transition-all duration-300 ${
                    feito ? "bg-emerald-400" : ativo ? "bg-primary" : "bg-muted"
                  }`}
                  title={STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === s)?.label}
                />
              );
            })}
          </div>
          {/* Etiquetas das etapas */}
          <div className="flex justify-between px-0.5">
            {TRILHA_ACOLHIMENTO.map((s, i) => {
              const cfg   = STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === s)!;
              const ativo = i === idx;
              return (
                <span
                  key={s}
                  className={`text-[9px] hidden sm:block truncate max-w-[60px] text-center ${
                    ativo ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Status atual */}
        {(() => {
          const cfg = STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === (statusAtual ?? "novo"))!;
          return (
            <div className={`rounded-xl px-4 py-3 border ${cfg.cor} ${cfg.corTexto} border-current/20`}>
              <p className="font-semibold text-sm">{cfg.label}</p>
              <p className="text-xs opacity-80 mt-0.5">{cfg.descricao}</p>
            </div>
          );
        })()}

        {/* Navegação */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={onVoltar}
            disabled={salvando || idx <= 0}
            className="gap-1 flex-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar etapa
          </Button>
          <Button
            size="sm"
            onClick={onAvancar}
            disabled={salvando || idx >= TRILHA_ACOLHIMENTO.length - 1}
            className="gap-1 flex-1"
          >
            {salvando
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
            Próxima etapa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VisitanteDetalhe() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [visitante,      setVisitante]      = useState<Visitante | null>(null);
  const [nomeResp,       setNomeResp]       = useState<string | null>(null);
  const [carregando,     setCarregando]     = useState(true);
  const [observacoes,    setObservacoes]    = useState("");
  const [salvandoObs,    setSalvandoObs]    = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [tornandoCong,   setTornandoCong]   = useState(false);

  // ── Carregar ────────────────────────────────────────────────────────────────

  async function carregar() {
    if (!id) return;
    setCarregando(true);
    const dados = await buscarVisitante(id);
    setVisitante(dados);
    setObservacoes(dados?.observacoes_pastorais ?? "");

    if (dados?.responsavel_id) {
      const nome = await buscarNomeResponsavel(dados.responsavel_id);
      setNomeResp(nome);
    }
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [id]);

  // ── Avançar / voltar status ──────────────────────────────────────────────────

  async function handleAvancarStatus() {
    if (!visitante) return;
    const idx = TRILHA_ACOLHIMENTO.indexOf(visitante.status_acolhimento ?? "novo");
    if (idx >= TRILHA_ACOLHIMENTO.length - 1) return;
    const novo = TRILHA_ACOLHIMENTO[idx + 1];
    setSalvandoStatus(true);
    const res = await atualizarStatusAcolhimento(visitante.id, novo, visitante.status_acolhimento);
    setSalvandoStatus(false);
    if (!res.ok) { toast.error(res.erro ?? "Erro ao atualizar status."); return; }
    toast.success(`✅ ${STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === novo)?.label}`);
    carregar();
  }

  async function handleVoltarStatus() {
    if (!visitante) return;
    const idx = TRILHA_ACOLHIMENTO.indexOf(visitante.status_acolhimento ?? "novo");
    if (idx <= 0) return;
    const novo = TRILHA_ACOLHIMENTO[idx - 1];
    setSalvandoStatus(true);
    const res = await atualizarStatusAcolhimento(visitante.id, novo, visitante.status_acolhimento);
    setSalvandoStatus(false);
    if (!res.ok) { toast.error(res.erro ?? "Erro ao atualizar status."); return; }
    toast.success(`Status: ${STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === novo)?.label}`);
    carregar();
  }

  // ── Salvar observações ───────────────────────────────────────────────────────

  async function handleSalvarObservacoes() {
    if (!visitante) return;
    setSalvandoObs(true);
    const res = await salvarObservacoes(visitante.id, observacoes);
    setSalvandoObs(false);
    if (!res.ok) { toast.error(res.erro ?? "Erro ao salvar."); return; }
    toast.success("Observações salvas!");
    carregar();
  }

  // ── Tornar Congregado (versão integrada e segura) ────────────────────────────

  async function handleTornarCongregado() {
    if (!visitante) return;
    setTornandoCong(true);
    const res = await tornarCongregadoIntegrado(visitante);
    setTornandoCong(false);

    if (!res.ok) {
      toast.error(res.erro ?? "Erro ao promover.");
      return;
    }

    toast.success(`🎉 ${visitante.nome_completo} agora é congregado! Abrindo ficha...`);
    // Navega para Membros e abre a ficha da pessoa via query param
    setTimeout(() => navigate(`/membros?abrir=${res.pessoaId}`), 1200);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!visitante) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center text-muted-foreground">
        <p>Visitante não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/visitantes")}>
          Voltar
        </Button>
      </div>
    );
  }

  const statusCfg            = STATUS_ACOLHIMENTO_CONFIG.find(c => c.value === (visitante.status_acolhimento ?? "novo"))!;
  const tel                  = visitante.telefone_celular?.replace(/\D/g, "") ?? "";
  const diasCadastro         = Math.floor((Date.now() - new Date(visitante.created_at).getTime()) / 86_400_000);
  const isCongregadoOuMembro = ["congregado", "membro"].includes(visitante.tipo_pessoa);
  const diasUltimoContato    = diasSemContato(visitante.ultimo_contato_em);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">

      {/* Navegação */}
      <Button
        variant="ghost" size="sm"
        onClick={() => navigate("/visitantes")}
        className="gap-1 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Visitantes
      </Button>

      {/* ── Alerta de inatividade ─────────────────────────────────────────────── */}
      {!isCongregadoOuMembro && (
        <AlertaInatividade visitante={visitante} />
      )}

      {/* ── Card identidade ───────────────────────────────────────────────────── */}
      <Card className="rounded-2xl shadow">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold truncate">{visitante.nome_completo}</h1>

              {/* Badges de estado */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge className={`${statusCfg.cor} ${statusCfg.corTexto} border-0 text-xs`}>
                  {statusCfg.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {diasCadastro === 0 ? "Cadastrado hoje" : `Há ${diasCadastro} ${diasCadastro === 1 ? "dia" : "dias"}`}
                </span>
                {visitante.numero_visitas && visitante.numero_visitas > 1 && (
                  <span className="text-xs text-muted-foreground">
                    · {visitante.numero_visitas} visitas
                  </span>
                )}
                {diasUltimoContato < 9999 && (
                  <span className={`text-xs ${diasUltimoContato > 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                    · Contato {diasUltimoContato === 0 ? "hoje" : `há ${diasUltimoContato}d`}
                  </span>
                )}
              </div>

              {/* Responsável */}
              {nomeResp && (
                <div className="flex items-center gap-1.5 mt-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Responsável: <strong className="text-foreground">{nomeResp}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Ações rápidas */}
            <div className="flex gap-2 flex-wrap shrink-0">
              {tel && (
                <>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => window.open(`tel:${tel}`)}
                    className="gap-1"
                  >
                    <Phone className="w-3.5 h-3.5" /> Ligar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => enviarMensagemPastoral(visitante)}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Info básica */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm border-t pt-3">
            {visitante.telefone_celular && (
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="font-medium">{visitante.telefone_celular}</p>
              </div>
            )}
            {visitante.bairro && (
              <div>
                <p className="text-xs text-muted-foreground">Bairro</p>
                <p className="font-medium">{visitante.bairro}</p>
              </div>
            )}
            {visitante.created_at && (
              <div>
                <p className="text-xs text-muted-foreground">Primeira visita</p>
                <p className="font-medium">
                  {format(new Date(visitante.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            )}
            {visitante.como_conheceu && (
              <div>
                <p className="text-xs text-muted-foreground">Como conheceu</p>
                <p className="font-medium capitalize">{visitante.como_conheceu.replace(/_/g, " ")}</p>
              </div>
            )}
            {visitante.ultimo_contato_em && (
              <div>
                <p className="text-xs text-muted-foreground">Último contato</p>
                <p className="font-medium">
                  {formatDistanceToNow(new Date(visitante.ultimo_contato_em), { locale: ptBR, addSuffix: true })}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Trilha de acolhimento — só para visitantes ────────────────────────── */}
      {!isCongregadoOuMembro && (
        <TrilhaAcolhimento
          statusAtual={visitante.status_acolhimento}
          onAvancar={handleAvancarStatus}
          onVoltar={handleVoltarStatus}
          salvando={salvandoStatus}
        />
      )}

      {/* ── Painel de acolhimento (tarefas, próxima ação) ─────────────────────── */}
      <AcolhimentoPanel
        pessoa={visitante as any}
        onUpdated={carregar}
      />

      {/* ── Observações pastorais ─────────────────────────────────────────────── */}
      <Card className="rounded-2xl shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Observações pastorais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Registre observações pastorais, pedidos de oração, situações especiais..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <Button
            size="sm" onClick={handleSalvarObservacoes}
            disabled={salvandoObs}
            className="gap-2"
          >
            {salvandoObs
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />
            }
            Salvar
          </Button>
        </CardContent>
      </Card>

      {/* ── Histórico ─────────────────────────────────────────────────────────── */}
      <VisitanteTimeline pessoaId={visitante.id} />

      {/* ── Ação: Tornar Congregado ────────────────────────────────────────────── */}
      {visitante.tipo_pessoa === "visitante" && (
        <Card className="rounded-2xl shadow border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-800/40">
          <CardContent className="py-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">
                  Pronto para o próximo passo?
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 leading-relaxed">
                  Ao confirmar, <strong>{visitante.nome_completo.split(" ")[0]}</strong> passa
                  para o grupo de <strong>Congregados</strong>. Todo o histórico é preservado
                  e você será direcionado para a ficha onde poderá criar o acesso ao sistema.
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={tornandoCong}
                >
                  {tornandoCong
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <UserCheck className="w-4 h-4" />
                  }
                  Tornar Congregado
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-emerald-500" />
                    Confirmar: Tornar Congregado
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm leading-relaxed space-y-2">
                    <span className="block">
                      <strong>{visitante.nome_completo}</strong> será movido para{" "}
                      <strong>Congregados</strong>.
                    </span>
                    <span className="block text-muted-foreground">
                      ✅ Histórico de acolhimento preservado<br />
                      ✅ Telefone e nome mantidos<br />
                      ✅ Você será direcionado para criar o acesso ao sistema
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleTornarCongregado}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
