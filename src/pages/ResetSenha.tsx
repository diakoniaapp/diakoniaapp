// ============================================================
// ResetSenha.tsx — Redefinição de Senha via Link de E-mail
// Diakonia App — Sistema de Gestão da Igreja
// Rota: /auth/reset
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/Brand";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function ResetSenha() {
  const navigate = useNavigate();

  const [novaSenha, setNovaSenha]       = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [verSenha, setVerSenha]         = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [erroMsg, setErroMsg]           = useState<string | null>(null);
  const [sessaoOk, setSessaoOk]         = useState<boolean | null>(null);
  const [concluido, setConcluido]       = useState(false);

  // O Supabase injeta a sessão via hash na URL após o clique no link.
  // onAuthStateChange captura o evento PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessaoOk(true);
      }
    });

    // Verifica se já há sessão ativa (caso o usuário recarregue a página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessaoOk(true);
      else if (sessaoOk === null) setSessaoOk(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    if (novaSenha.length < 6) {
      setErroMsg("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmSenha) {
      setErroMsg("As senhas não coincidem. Verifique e tente novamente.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setBusy(false);

    if (error) {
      setErroMsg("Não foi possível redefinir a senha. O link pode ter expirado. Solicite um novo.");
      return;
    }

    // Marca must_change_password como false caso ainda esteja ativo
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
    }

    toast.success("Senha redefinida com sucesso! Faça login para continuar.");
    setConcluido(true);
  };

  // ── Estado: verificando link ──────────────────────────────
  if (sessaoOk === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  // ── Estado: link inválido / expirado ──────────────────────
  if (sessaoOk === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero p-4">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-elevated border border-border/50 p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-xl font-semibold">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Este link de redefinição não é mais válido. Solicite um novo link através da tela de login.
            </p>
          </div>
          <Button className="w-full bg-gold hover:bg-gold/90 text-white" onClick={() => navigate("/auth")}>
            Voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  // ── Estado: concluído ─────────────────────────────────────
  if (concluido) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero p-4">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-elevated border border-border/50 p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-xl font-semibold">Senha redefinida!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sua nova senha está ativa. Faça login para continuar acessando o sistema.
            </p>
          </div>
          <Button className="w-full bg-gold hover:bg-gold/90 text-white" onClick={() => navigate("/auth")}>
            Ir para o login
          </Button>
        </div>
      </div>
    );
  }

  // ── Formulário principal ──────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
              <BrandMark className="text-[4rem] text-foreground" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-[11px] tracking-[0.20em] uppercase font-semibold text-foreground/60 leading-relaxed">
                Conectando Pessoas,
              </p>
              <p className="text-[11px] tracking-[0.20em] uppercase font-semibold text-foreground/60 leading-relaxed">
                Organizando o Propósito
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
          <div className="space-y-1">
            <h1 className="font-serif text-2xl font-bold tracking-wide">Nova Senha</h1>
            <p className="text-sm text-muted-foreground">
              Escolha uma senha segura para continuar acessando o sistema.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Nova senha */}
            <div className="space-y-1.5">
              <Label htmlFor="nova" className="text-sm font-medium text-foreground/80">
                Nova senha
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                </span>
                <Input
                  id="nova"
                  type={verSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                  minLength={6}
                  required
                  autoFocus
                  className="pl-9 pr-10 h-11 bg-background/80 border-border/70 focus:border-gold/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar senha */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-sm font-medium text-foreground/80">
                Confirmar nova senha
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-4 h-4" />
                </span>
                <Input
                  id="confirm"
                  type={verSenha ? "text" : "password"}
                  value={confirmSenha}
                  onChange={(e) => setConfirmSenha(e.target.value)}
                  placeholder="repita a nova senha"
                  minLength={6}
                  required
                  className="pl-9 h-11 bg-background/80 border-border/70 focus:border-gold/60 transition-colors"
                />
              </div>
            </div>

            {erroMsg && (
              <div className="bg-destructive/8 border border-destructive/25 rounded-lg px-3 py-2.5 text-sm text-destructive">
                {erroMsg}
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nova senha"}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-foreground/30 tracking-wide leading-relaxed">
          DiakoniaApp — Sistema de Gestão Ministerial
        </p>
      </div>
    </div>
  );
}
