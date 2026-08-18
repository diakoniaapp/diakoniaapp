// ============================================================
// LgpdAdmin.tsx — Painel de Conformidade LGPD
// Diakonia App — Sistema Ministerial
// Visível apenas para: admin, secretaria
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldCheck, FileText, Clock, CheckCircle2, RefreshCw,
  AlertTriangle, User, XCircle, Search, FileSearch,
  ScrollText, Eye, BookOpen, ClipboardList,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Tipos ─────────────────────────────────────────────────────
interface Solicitacao {
  id: string;
  email_solicitante: string;
  tipo: "acesso" | "correcao" | "exclusao" | "anonimizacao" | "portabilidade" | "revogacao";
  descricao: string | null;
  status: "pendente" | "em_analise" | "concluido" | "negado";
  resposta: string | null;
  solicitado_em: string;
  concluido_em: string | null;
  atendido_por: string | null;
  prazo_legal: string;
  prazo_vencido: boolean;
}

interface Consentimento {
  id: string;
  pessoa_id: string;
  tipo: string;
  base_legal: string;
  aceito: boolean;
  texto_versao: string;
  finalidade: string | null;
  canal: string;
  registrado_em: string;
  revogado_em: string | null;
}

interface LogAuditoria {
  id: string;
  tabela: string;
  registro_id: string | null;
  acao: string;
  usuario_email: string | null;
  campos_alt: Record<string, unknown> | null;
  created_at: string;
}

interface Politica {
  versao: string;
  titulo: string;
  conteudo: string;
  vigente: boolean;
  publicado_em: string;
}

// ── Helpers ───────────────────────────────────────────────────
const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const diasPrazo = (prazo: string) => {
  const diff = new Date(prazo).getTime() - Date.now();
  const dias = Math.ceil(diff / 86_400_000);
  if (dias < 0) return `venceu há ${Math.abs(dias)}d`;
  if (dias === 0) return "vence hoje";
  return `${dias}d restantes`;
};

const tipoLabel: Record<string, string> = {
  acesso: "Acesso", correcao: "Correção", exclusao: "Exclusão",
  anonimizacao: "Anonimização", portabilidade: "Portabilidade", revogacao: "Revogação",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendente:   { label: "Pendente",    variant: "secondary" },
  em_analise: { label: "Em análise",  variant: "default" },
  concluido:  { label: "Concluído",   variant: "outline" },
  negado:     { label: "Negado",      variant: "destructive" },
};

const baseLegalLabel: Record<string, string> = {
  consentimento: "Consentimento",
  legitimo_interesse: "Legítimo Interesse",
  contrato: "Contrato",
  obrigacao_legal: "Obrigação Legal",
  institucional: "Institucional",
};

// ── Componente principal ───────────────────────────────────────
export default function LgpdAdmin() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [consentimentos, setConsentimentos] = useState<Consentimento[]>([]);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const podeAcessar = hasRole(["admin", "secretaria"]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sols }, { data: cons }, { data: lg }, { data: pol }] = await Promise.all([
        supabase
          .from("v_solicitacoes_lgpd")
          .select("*")
          .order("solicitado_em", { ascending: false })
          .limit(100),
        supabase
          .from("consentimento")
          .select("*")
          .order("registrado_em", { ascending: false })
          .limit(100),
        supabase
          .from("log_auditoria")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("politica_privacidade")
          .select("*")
          .order("publicado_em", { ascending: false }),
      ]);
      setSolicitacoes((sols ?? []) as Solicitacao[]);
      setConsentimentos((cons ?? []) as Consentimento[]);
      setLogs((lg ?? []) as LogAuditoria[]);
      setPoliticas((pol ?? []) as Politica[]);
    } catch (e) {
      toast.error("Erro ao carregar dados LGPD");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!podeAcessar) {
      navigate("/", { replace: true });
      return;
    }
    carregar();
  }, [podeAcessar, carregar, navigate]);

  const atualizarStatus = async (
    id: string,
    status: "em_analise" | "concluido" | "negado",
    resposta?: string,
  ) => {
    setAtualizandoId(id);
    const { error } = await supabase
      .from("solicitacoes_lgpd")
      .update({
        status,
        resposta: resposta ?? null,
        concluido_em: ["concluido", "negado"].includes(status) ? new Date().toISOString() : null,
        atendido_por: user?.email ?? null,
      })
      .eq("id", id);
    setAtualizandoId(null);
    if (error) {
      toast.error("Erro ao atualizar solicitação");
    } else {
      toast.success("Solicitação atualizada");
      carregar();
    }
  };

  if (!podeAcessar) return null;

  // Filtragem por busca
  const solsFiltradas = busca
    ? solicitacoes.filter(
        (s) =>
          s.email_solicitante.toLowerCase().includes(busca.toLowerCase()) ||
          tipoLabel[s.tipo]?.toLowerCase().includes(busca.toLowerCase()),
      )
    : solicitacoes;

  const pendentes = solicitacoes.filter((s) => s.status === "pendente").length;
  const vencidas  = solicitacoes.filter((s) => s.prazo_vencido).length;

  return (
    <div>
      <PageHeader
        title="Painel LGPD"
        description="Conformidade com a Lei Geral de Proteção de Dados"
      />

      <div className="p-4 md:p-8 space-y-6">

        {/* ── Cards de resumo ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Solicitações", value: solicitacoes.length, icon: ClipboardList, sub: "total" },
            { label: "Pendentes",    value: pendentes,            icon: Clock,         sub: "aguardando resposta", alert: pendentes > 0 },
            { label: "Vencidas",     value: vencidas,             icon: AlertTriangle, sub: "prazo 15 dias", alert: vencidas > 0 },
            { label: "Consentimentos", value: consentimentos.filter(c => c.aceito).length, icon: ShieldCheck, sub: "ativos" },
          ].map((c) => (
            <Card key={c.label} className="shadow-card-soft border border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs tracking-wider uppercase text-muted-foreground">{c.label}</p>
                    {loading ? (
                      <Skeleton className="h-10 w-12 mt-2" />
                    ) : (
                      <p className={`text-4xl font-serif mt-2 ${c.alert && c.value > 0 ? "text-destructive" : "text-primary"}`}>
                        {c.value}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${c.alert && c.value > 0 ? "bg-destructive/15 ring-1 ring-destructive/30" : "bg-gold/15 ring-1 ring-gold/30"}`}>
                    <c.icon className={`w-5 h-5 ${c.alert && c.value > 0 ? "text-destructive" : "text-gold"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="solicitacoes">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="solicitacoes" className="gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Solicitações</span>
              {pendentes > 0 && (
                <span className="ml-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full px-1.5 py-0.5">
                  {pendentes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="consentimentos" className="gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Consentimentos</span>
            </TabsTrigger>
            <TabsTrigger value="auditoria" className="gap-1.5">
              <FileSearch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auditoria</span>
            </TabsTrigger>
            <TabsTrigger value="politica" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Política</span>
            </TabsTrigger>
          </TabsList>

          {/* ── ABA: Solicitações ── */}
          <TabsContent value="solicitacoes" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por e-mail ou tipo…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={carregar} className="gap-2 shrink-0">
                <RefreshCw className="w-4 h-4" /> Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : solsFiltradas.length === 0 ? (
              <Card className="shadow-card-soft">
                <CardContent className="py-12 text-center">
                  <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">{busca ? "Nenhuma solicitação encontrada" : "Nenhuma solicitação LGPD registrada"}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {solsFiltradas.map((s) => (
                  <Card key={s.id} className={`shadow-card-soft border ${s.prazo_vencido && s.status === "pendente" ? "border-destructive/40" : "border-border/60"}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs font-semibold">
                              {tipoLabel[s.tipo] ?? s.tipo}
                            </Badge>
                            <Badge variant={statusConfig[s.status]?.variant ?? "secondary"}>
                              {statusConfig[s.status]?.label ?? s.status}
                            </Badge>
                            {s.prazo_vencido && s.status !== "concluido" && s.status !== "negado" && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="w-3 h-3" /> Prazo vencido
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium flex items-center gap-1.5 mt-1">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {s.email_solicitante}
                          </p>
                          {s.descricao && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.descricao}</p>
                          )}
                          <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {fmtData(s.solicitado_em)}
                            </span>
                            {!s.prazo_vencido && s.status !== "concluido" && (
                              <span className="text-amber-600 font-medium">{diasPrazo(s.prazo_legal)}</span>
                            )}
                            {s.atendido_por && (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-green-500" /> {s.atendido_por}
                              </span>
                            )}
                          </div>
                          {s.resposta && (
                            <p className="mt-2 text-xs bg-muted rounded p-2 text-muted-foreground">
                              <strong>Resposta:</strong> {s.resposta}
                            </p>
                          )}
                        </div>

                        {/* Ações */}
                        {(s.status === "pendente" || s.status === "em_analise") && (
                          <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                            {s.status === "pendente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs h-8"
                                disabled={atualizandoId === s.id}
                                onClick={() => atualizarStatus(s.id, "em_analise")}
                              >
                                <Eye className="w-3.5 h-3.5" /> Em análise
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="gap-1.5 text-xs h-8 bg-green-600 hover:bg-green-700"
                              disabled={atualizandoId === s.id}
                              onClick={() => atualizarStatus(s.id, "concluido", "Solicitação atendida.")}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5 text-xs h-8"
                              disabled={atualizandoId === s.id}
                              onClick={() => atualizarStatus(s.id, "negado", "Solicitação negada.")}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Negar
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ABA: Consentimentos ── */}
          <TabsContent value="consentimentos" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={carregar} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Atualizar
              </Button>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : consentimentos.length === 0 ? (
              <Card className="shadow-card-soft">
                <CardContent className="py-12 text-center">
                  <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum consentimento registrado</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card-soft">
                <CardHeader>
                  <CardTitle className="font-serif text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-gold" />
                    Consentimentos Registrados ({consentimentos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {consentimentos.map((c) => (
                      <div key={c.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant={c.aceito ? "default" : "secondary"} className="text-xs">
                              {c.aceito ? "✓ Aceito" : "✗ Revogado"}
                            </Badge>
                            <span className="text-sm font-medium capitalize">{c.tipo}</span>
                            <span className="text-xs text-muted-foreground">v{c.texto_versao}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{baseLegalLabel[c.base_legal] ?? c.base_legal}</span>
                            <span>Canal: {c.canal}</span>
                            {c.finalidade && <span className="truncate max-w-[200px]">{c.finalidade}</span>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {fmtData(c.registrado_em)}
                          </div>
                          {c.revogado_em && (
                            <div className="text-destructive mt-0.5">Revogado: {fmtData(c.revogado_em)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── ABA: Auditoria ── */}
          <TabsContent value="auditoria" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Últimos 50 registros de auditoria</p>
              <Button variant="outline" size="sm" onClick={carregar} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Atualizar
              </Button>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : logs.length === 0 ? (
              <Card className="shadow-card-soft">
                <CardContent className="py-12 text-center">
                  <FileSearch className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum log de auditoria</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card-soft">
                <CardContent className="p-0">
                  <div className="divide-y">
                    {logs.map((l) => (
                      <div key={l.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge
                              variant={l.acao === "DELETE" ? "destructive" : l.acao === "INSERT" ? "default" : "secondary"}
                              className="text-xs font-mono"
                            >
                              {l.acao}
                            </Badge>
                            <span className="text-sm font-mono text-muted-foreground">{l.tabela}</span>
                          </div>
                          {l.usuario_email && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <User className="w-3 h-3" /> {l.usuario_email}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmtData(l.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── ABA: Política ── */}
          <TabsContent value="politica" className="space-y-4 mt-4">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : politicas.length === 0 ? (
              <Card className="shadow-card-soft">
                <CardContent className="py-12 text-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma política de privacidade cadastrada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {politicas.map((p) => (
                  <Card key={p.versao} className={`shadow-card-soft ${p.vigente ? "border-gold/40 bg-gold/5" : "border-border/60"}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-serif text-base flex items-center gap-2">
                          <ScrollText className="w-4 h-4 text-gold" />
                          {p.titulo}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">v{p.versao}</Badge>
                          {p.vigente && (
                            <Badge className="text-xs bg-green-600">Vigente</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" /> Publicada em {fmtData(p.publicado_em)}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{p.conteudo}</p>
                    </CardContent>
                  </Card>
                ))}

                <Card className="shadow-card-soft border border-dashed border-muted-foreground/30">
                  <CardContent className="py-6 text-center">
                    <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Para publicar uma nova versão da política, acesse o Supabase e insira na tabela{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">politica_privacidade</code>.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
