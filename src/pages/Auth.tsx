// ============================================================
// Auth.tsx — Tela de Login Ministerial
// DiakoniaApp — padrão institucional v2
// Login via telefone → {digitos}@app.diakonia
// Fluxo: Login → PrimeiroAcesso → AceiteLgpd → Dashboard
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  AuthShell, AuthCard, AuthCampo, AuthErro,
  getVersiculoAleatorio, getSaudacao,
} from "@/components/AuthShell";
import {
  Eye, EyeOff, Loader2, Phone, Lock, ArrowLeft, CheckCircle2,
} from "lucide-react";

// ── Tipos de tela ──────────────────────────────────────────
type Tela = "login" | "recuperar" | "recuperar_ok";

// ── Utilitários ────────────────────────────────────────────
function telefoneParaEmail(tel: string): string {
  return `${tel.replace(/\D/g, "")}@app.diakonia`;
}

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : "";
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}


const ERROS: Record<string, string> = {
  "Invalid login credentials":    "Telefone ou senha incorretos 😕 Verifique seus dados.",
  "Email not confirmed":          "Acesso não confirmado. Fale com a secretaria da Igreja.",
  "Password should be at least 6 characters": "A senha precisa ter no mínimo 6 caracteres.",
  "For security purposes, you can only request this once every 60 seconds":
    "Aguarde 1 minuto antes de solicitar novamente.",
};

function traduzirErro(msg: string): string {
  for (const [k, v] of Object.entries(ERROS)) {
    if (msg.includes(k)) return v;
  }
  return "Algo deu errado 😕 Tente novamente ou fale com a secretaria.";
}

// ── Componente Principal ───────────────────────────────────
export default function Auth() {
  const navigate       = useNavigate();
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tela, setTela]         = useState<Tela>("login");
  const [telefone, setTelefone] = useState(() => localStorage.getItem("diakonia_tel") ?? "");
  const [senha, setSenha]       = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar]   = useState(!!localStorage.getItem("diakonia_tel"));
  const [busy, setBusy]         = useState(false);
  const [erroMsg, setErroMsg]   = useState<string | null>(null);
  const [versiculo]             = useState(getVersiculoAleatorio);

  // ── Auto-login via params do link (Opção C) ──────────────────────────────
  useEffect(() => {
    const t = searchParams.get("t");
    const p = searchParams.get("p");
    if (!t || !p || loading || user) return;

    // Pré-preenche campos para feedback visual
    setTelefone(mascaraTelefone(t));
    setSenha(p);

    // Faz login automaticamente
    const email = telefoneParaEmail(t);
    setBusy(true);
    supabase.auth.signInWithPassword({ email, password: p }).then(({ error }) => {
      setBusy(false);
      if (error) {
        setErroMsg("Link de acesso inválido ou expirado. Digite sua senha manualmente.");
      }
      // Limpa params sensíveis da URL após tentativa
      setSearchParams({}, { replace: true });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redireciona se já logado — respeitando fluxo obrigatório
  useEffect(() => {
    if (!loading && user) {
      const meta = user.user_metadata as Record<string, unknown>;
      if (meta?.must_change_password) {
        navigate("/primeiro-acesso", { replace: true });
      } else {
        const lgpdOk = sessionStorage.getItem(`lgpd_ok_${user.id}`);
        navigate(lgpdOk ? "/" : "/aceite-lgpd", { replace: true });
      }
    }
  }, [user, loading, navigate]);

  useEffect(() => { setErroMsg(null); }, [telefone, senha]);

  const onTelefoneChange = (v: string) => setTelefone(mascaraTelefone(v));

  // ── Login ────────────────────────────────────────────────
  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    if (telefone.replace(/\D/g, "").length < 10) {
      setErroMsg("Digite um número de telefone válido com DDD."); return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: telefoneParaEmail(telefone), password: senha,
    });
    setBusy(false);
    if (error) { setErroMsg(traduzirErro(error.message)); return; }
    if (lembrar) localStorage.setItem("diakonia_tel", telefone);
    else         localStorage.removeItem("diakonia_tel");
    toast.success(`${getSaudacao()}! Seja bem-vindo(a) 🙏`);
  };

  // ── Recuperação ──────────────────────────────────────────
  const onRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) { setErroMsg("Digite seu número de telefone cadastrado."); return; }
    setBusy(true);
    const email = telefoneParaEmail(telefone);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    // Registra solicitação administrativa
    const { data: membro } = await supabase
      .from("membros").select("id, nome_completo")
      .eq("telefone", digits).maybeSingle();
    await supabase.from("recuperacao_senha").insert({
      email, nome: membro?.nome_completo ?? null,
      pessoa_id: membro?.id ?? null, status: "pendente",
    }).maybeSingle();
    setBusy(false);
    if (error && !error.message.includes("For security purposes")) {
      setErroMsg(traduzirErro(error.message)); return;
    }
    setTela("recuperar_ok");
  };

  const BotaoSenha = (
    <button
      type="button" onClick={() => setVerSenha(v => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
    >
      {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <AuthShell versiculoFixo={versiculo}>

      {/* ══════ TELA LOGIN ══════ */}
      {tela === "login" && (
        <AuthCard>
          {/* Cabeçalho */}
          <div className="space-y-1">
            <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">
              Graça e Paz ✝️
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Que Deus abençoe sua jornada, {getSaudacao().toLowerCase()}! 🙏
            </p>
            <p className="text-xs text-muted-foreground/60 pt-0.5">
              Entre com seu telefone e senha para continuar.
            </p>
          </div>

          {/* Divisor dourado */}
          <div className="divider-gold" />

          <form onSubmit={onSignIn} className="space-y-4">
            <AuthCampo
              id="telefone" label="Telefone (com DDD)" type="tel"
              value={telefone} onChange={onTelefoneChange}
              icon={<Phone className="w-4 h-4" />}
              placeholder="(11) 91234-5678" autoFocus required inputMode="tel"
            />
            <AuthCampo
              id="senha" label="Senha"
              type={verSenha ? "text" : "password"}
              value={senha} onChange={setSenha}
              icon={<Lock className="w-4 h-4" />}
              placeholder="sua senha" required sufixo={BotaoSenha}
            />

            {/* Lembrar telefone */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none group">
              <input
                type="checkbox" checked={lembrar}
                onChange={e => setLembrar(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5 accent-gold"
              />
              <span className="group-hover:text-foreground transition-colors">
                Lembrar meu telefone
              </span>
            </label>

            <AuthErro mensagem={erroMsg} />

            <Button
              type="submit" disabled={busy}
              className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 dark:hover:bg-gold/80 text-white shadow-md transition-all active:scale-[0.98]"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          {/* Link recuperar */}
          <button
            onClick={() => { setTela("recuperar"); setErroMsg(null); setSenha(""); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline text-center"
          >
            Esqueci minha senha
          </button>

          {/* Aviso de convite */}
          <div className="bg-muted/50 dark:bg-muted/30 rounded-xl px-4 py-3 border border-border/40 dark:border-border/30">
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              📱 O acesso é concedido pela secretaria via convite por WhatsApp.
              <br />Não possui acesso? Fale com a liderança da Igreja.
            </p>
          </div>
        </AuthCard>
      )}

      {/* ══════ TELA RECUPERAR ══════ */}
      {tela === "recuperar" && (
        <AuthCard>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTela("login"); setErroMsg(null); }}
              className="w-8 h-8 rounded-full hover:bg-muted dark:hover:bg-muted/50 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-serif text-xl font-semibold">Recuperar acesso</h1>
              <p className="text-sm text-muted-foreground">Informe seu telefone cadastrado.</p>
            </div>
          </div>

          <div className="bg-gold/8 dark:bg-gold/10 border border-gold/25 dark:border-gold/20 rounded-xl px-4 py-3">
            <p className="text-sm text-foreground/80 leading-relaxed text-center">
              <span className="font-semibold text-gold">{getSaudacao()}!</span> A equipe enviará
              um link de redefinição e será notificada para garantir seu acesso 💙
            </p>
          </div>

          <form onSubmit={onRecuperar} className="space-y-4">
            <AuthCampo
              id="tel2" label="Seu telefone cadastrado" type="tel"
              value={telefone} onChange={onTelefoneChange}
              icon={<Phone className="w-4 h-4" />}
              placeholder="(11) 91234-5678" autoFocus required inputMode="tel"
            />
            <AuthErro mensagem={erroMsg} />
            <Button
              type="submit" disabled={busy}
              className="w-full h-11 font-semibold bg-gold hover:bg-gold/90 text-white shadow-md"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Solicitar redefinição"}
            </Button>
          </form>
        </AuthCard>
      )}

      {/* ══════ TELA CONFIRMAÇÃO ══════ */}
      {tela === "recuperar_ok" && (
        <AuthCard>
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-pulse-gold">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-xl font-semibold">Solicitação enviada!</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A Equipe Diakonia foi notificada e entrará em contato
                para ajudá-lo(a) a recuperar o acesso 💙
              </p>
            </div>
            <div className="w-full bg-muted/50 dark:bg-muted/30 rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Se você tiver e-mail cadastrado, verifique também a caixa
                de entrada e a pasta de <strong>spam</strong>.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full dark:border-border/60 dark:hover:bg-muted/40"
              onClick={() => { setTela("login"); setErroMsg(null); }}
            >
              Voltar ao login
            </Button>
          </div>
        </AuthCard>
      )}
    </AuthShell>
  );
}
