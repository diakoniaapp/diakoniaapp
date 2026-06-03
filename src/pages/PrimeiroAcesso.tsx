// ============================================================
// PrimeiroAcesso.tsx — Troca de Senha Obrigatória (1º Acesso)
// DiakoniaApp — padrão institucional v2
// Rota: /primeiro-acesso
// Fluxo: Login → PrimeiroAcesso → AceiteLgpd → Dashboard
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AuthShell, AuthCard, AuthCampo, AuthErro,
} from "@/components/AuthShell";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from "lucide-react";

export default function PrimeiroAcesso() {
  const navigate       = useNavigate();
  const { user, loading } = useAuth();

  const [novaSenha, setNovaSenha]       = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [verSenha, setVerSenha]         = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [erroMsg, setErroMsg]           = useState<string | null>(null);

  // Sem sessão → login
  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  // Se não precisa mais trocar → avança
  useEffect(() => {
    if (!loading && user) {
      const meta = user.user_metadata as Record<string, unknown>;
      if (!meta?.must_change_password) navigate("/aceite-lgpd", { replace: true });
    }
  }, [user, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    if (novaSenha.length < 6) {
      setErroMsg("A nova senha precisa ter no mínimo 6 caracteres."); return;
    }
    if (novaSenha !== confirmSenha) {
      setErroMsg("As senhas não coincidem. Verifique e tente novamente."); return;
    }
    setBusy(true);

    // 1. Atualiza a senha
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) {
      setBusy(false);
      setErroMsg("Não foi possível salvar a nova senha. Tente novamente."); return;
    }

    // 2. Remove a flag must_change_password
    await supabase.auth.updateUser({ data: { must_change_password: false } });

    // 3. Log de auditoria — TROCA_SENHA
    await supabase.from("log_auditoria").insert({
      tabela: "auth",
      acao: "TROCA_SENHA",
      usuario_email: user?.email ?? null,
      registro_id: user?.id ?? null,
      campos_alt: { motivo: "primeiro_acesso", canal: "web_app" },
    });

    setBusy(false);
    toast.success("Senha criada com sucesso! Bem-vindo(a) ao Diakonia 🙏");
    navigate("/aceite-lgpd", { replace: true });
  };

  if (loading || !user) {
    return (
      <AuthShell semVersiculo>
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  const BotaoVer = (
    <button
      type="button" onClick={() => setVerSenha(v => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
    >
      {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <AuthShell>
      <AuthCard>

        {/* Cabeçalho */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gold/15 dark:bg-gold/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-gold" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold/80">
              Primeiro Acesso
            </span>
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-wide">
            Crie sua senha ✝️
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Por segurança, você precisa criar uma senha pessoal antes de continuar.
            Escolha algo que só você saiba.
          </p>
        </div>

        <div className="divider-gold" />

        {/* Aviso de confidencialidade */}
        <div className="bg-gold/8 dark:bg-gold/10 border border-gold/25 dark:border-gold/20 rounded-xl px-4 py-3">
          <p className="text-xs text-foreground/70 dark:text-foreground/60 leading-relaxed">
            🔒 Sua senha é <strong>confidencial</strong> e nunca será solicitada por telefone
            ou mensagem. Não a compartilhe com ninguém.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <AuthCampo
            id="nova" label="Nova senha"
            type={verSenha ? "text" : "password"}
            value={novaSenha}
            onChange={(v) => { setNovaSenha(v); setErroMsg(null); }}
            icon={<Lock className="w-4 h-4" />}
            placeholder="mínimo 6 caracteres"
            autoFocus required sufixo={BotaoVer}
          />
          <AuthCampo
            id="confirm" label="Confirmar nova senha"
            type={verSenha ? "text" : "password"}
            value={confirmSenha}
            onChange={(v) => { setConfirmSenha(v); setErroMsg(null); }}
            icon={<Lock className="w-4 h-4" />}
            placeholder="repita a nova senha"
            required
          />

          <AuthErro mensagem={erroMsg} />

          <Button
            type="submit" disabled={busy}
            className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md transition-all active:scale-[0.98]"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar e continuar"}
          </Button>
        </form>

        {/* Indicador de etapa */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <div className="w-2 h-2 rounded-full bg-gold" />
          <div className="w-2 h-2 rounded-full bg-muted" />
          <p className="text-[10px] text-muted-foreground ml-1">Passo 1 de 2</p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
