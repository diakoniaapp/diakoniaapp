// ============================================================
// RecuperacaoSenhaAdmin.tsx — Painel de solicitações de senha
// Diakonia App — Sistema Ministerial
// Visível apenas para: admin, secretaria
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  KeyRound, Mail, Clock, CheckCircle2, RefreshCw,
  AlertTriangle, User, ShieldAlert, Send,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────
interface Solicitacao {
  id:           string;
  email:        string;
  nome:         string | null;
  pessoa_id:    string | null;
  status:       "pendente" | "resolvido";
  solicitado_em: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  observacao:   string | null;
}

// ── Helpers ───────────────────────────────────────────────────
const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const diasDesde = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
};

// ── Componente principal ───────────────────────────────────────
export default function RecuperacaoSenhaAdmin() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();

  const [lista, setLista]       = useState<Solicitacao[]>([]);
  const [loading, setLoading]   = useState(true);
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);

  // Guard: apenas admin ou secretaria
  const podeAcessar = hasRole(["admin", "secretaria"]);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("recuperacao_senha")
      .select("*")
      .order("solicitado_em", { ascending: false });
    setLista((data ?? []) as Solicitacao[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!podeAcessar) {
      navigate("/", { replace: true });
      return;
    }
    carregar();
  }, [podeAcessar]);

  // ── Marcar como resolvido ─────────────────────────────────────
  const resolver = async (item: Solicitacao) => {
    setResolvendo(item.id);
    const { error } = await supabase
      .from("recuperacao_senha")
      .update({
        status:        "resolvido",
        resolvido_em:  new Date().toISOString(),
        resolvido_por: user?.email ?? null,
      })
      .eq("id", item.id);

    setResolvendo(null);

    if (error) {
      toast.error("Erro ao atualizar. Tente novamente.");
      return;
    }
    toast.success(`Solicitação de ${item.nome ?? item.email} marcada como resolvida ✅`);
    carregar();
  };

  // ── Reenviar link de reset ────────────────────────────────────
  const reenviarLink = async (item: Solicitacao) => {
    setReenviando(item.id);
    const { error } = await supabase.auth.resetPasswordForEmail(item.email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setReenviando(null);

    if (error) {
      toast.error("Não foi possível reenviar o link. Verifique o e-mail.");
      return;
    }
    toast.success(`Link de redefinição reenviado para ${item.email} 📧`);
  };

  // ── Contadores ────────────────────────────────────────────────
  const pendentes  = lista.filter(s => s.status === "pendente");
  const resolvidos = lista.filter(s => s.status === "resolvido");

  // ── Skeleton de carregamento ──────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader title="Recuperação de Senhas" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── Bloqueio de acesso ────────────────────────────────────────
  if (!podeAcessar) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Recuperação de Senhas"
        description="Solicitações de redefinição enviadas pelos usuários"
      />

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={`border ${pendentes.length > 0 ? "border-warning-line bg-warning-soft/20" : "border-border"}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
              ${pendentes.length > 0 ? "bg-warning-soft/40" : "bg-muted"}`}>
              <AlertTriangle className={`w-5 h-5 ${pendentes.length > 0 ? "text-warning-text" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{pendentes.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Pendentes</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-success-soft/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-success-text" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{resolvidos.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Resolvidos</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Sem solicitações ── */}
      {lista.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <KeyRound className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">Nenhuma solicitação ainda</p>
            <p className="text-xs text-center">
              Quando um usuário clicar em "Esqueci minha senha",<br />
              a solicitação aparecerá aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Pendentes ── */}
      {pendentes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning-text" />
            <h2 className="text-sm font-semibold text-warning-text uppercase tracking-wide">
              Aguardando resolução
            </h2>
          </div>

          {pendentes.map(item => (
            <Card key={item.id} className="border-warning-line/50 bg-warning-soft/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-warning-soft/40 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-warning-text" />
                    </div>
                    <div className="min-w-0">
                      {item.nome && (
                        <p className="font-semibold text-sm truncate">{item.nome}</p>
                      )}
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.email}</span>
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{fmtData(item.solicitado_em)} — {diasDesde(item.solicitado_em)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Badge */}
                  <Badge variant="outline" className="border-warning-line text-warning-text bg-warning-soft shrink-0 text-xs">
                    Pendente
                  </Badge>
                </div>

                {/* Ações */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-warning-line/60">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs gap-1.5"
                    onClick={() => reenviarLink(item)}
                    disabled={reenviando === item.id || resolvendo === item.id}
                  >
                    {reenviando === item.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />
                    }
                    Reenviar link
                  </Button>

                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1.5 bg-success hover:bg-success"
                    onClick={() => resolver(item)}
                    disabled={resolvendo === item.id || reenviando === item.id}
                  >
                    {resolvendo === item.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <CheckCircle2 className="w-3.5 h-3.5" />
                    }
                    Resolver
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* ── Resolvidos ── */}
      {resolvidos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success-text" />
            <h2 className="text-sm font-semibold text-success-text uppercase tracking-wide">
              Resolvidos
            </h2>
          </div>

          {resolvidos.map(item => (
            <Card key={item.id} className="border-border opacity-75">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-success-soft/30 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-success-text" />
                    </div>
                    <div className="min-w-0">
                      {item.nome && (
                        <p className="font-semibold text-sm truncate">{item.nome}</p>
                      )}
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.email}</span>
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Solicitado {diasDesde(item.solicitado_em)}</span>
                      </p>
                      {item.resolvido_por && (
                        <p className="text-xs text-success-text mt-0.5">
                          ✓ Resolvido por {item.resolvido_por}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-success-line text-success-text bg-success-soft/20 shrink-0 text-xs">
                    Resolvido
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* ── Atualizar lista ── */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={carregar} className="text-xs gap-1.5 text-muted-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar lista
        </Button>
      </div>
    </div>
  );
}
