// ============================================================
// Auth.tsx — Tela de Login com UX humanizada
// Diakonia App — Sistema Ministerial
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BrandMark } from "@/components/Brand";
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowLeft, CheckCircle2, User } from "lucide-react";

// ── Tipos de tela ─────────────────────────────────────────────
type Tela = "login" | "cadastro" | "recuperar" | "recuperar_ok";

// ── Mensagens amigáveis ───────────────────────────────────────
const ERROS: Record<string, string> = {
  "Invalid login credentials":    "E-mail ou senha incorretos 😕 Tente novamente.",
  "Email not confirmed":          "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "User already registered":      "Este e-mail já está cadastrado. Tente entrar.",
  "Password should be at least 6 characters": "A senha precisa ter no mínimo 6 caracteres.",
  "Unable to validate email address: invalid format": "Digite um e-mail válido.",
  "For security purposes, you can only request this once every 60 seconds":
    "Aguarde 1 minuto antes de solicitar novamente.",
};

function traduzirErro(msg: string): string {
  for (const [chave, traduzido] of Object.entries(ERROS)) {
    if (msg.includes(chave)) return traduzido;
  }
  return "Algo deu errado 😕 Verifique seus dados ou peça ajuda à equipe.";
}

// ── Componente de campo com ícone ─────────────────────────────
function Campo({
  id, label, type, value, onChange, icon, placeholder, autoFocus, required, minLength,
  sufixo,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; icon: React.ReactNode; placeholder?: string;
  autoFocus?: boolean; required?: boolean; minLength?: number; sufixo?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          className="pl-9 pr-10 h-11"
        />
        {sufixo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {sufixo}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────
export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Estado geral
  const [tela, setTela]           = useState<Tela>("login");
  const [email, setEmail]         = useState(() => localStorage.getItem("diakonia_email") ?? "");
  const [senha, setSenha]         = useState("");
  const [nome, setNome]           = useState("");
  const [verSenha, setVerSenha]   = useState(false);
  const [lembrar, setLembrar]     = useState(!!localStorage.getItem("diakonia_email"));
  const [busy, setBusy]           = useState(false);
  const [erroMsg, setErroMsg]     = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Redirecionar se já logado
  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  // Limpar erro ao trocar campo
  useEffect(() => { setErroMsg(null); }, [email, senha]);

  // ── Login ────────────────────────────────────────────────────
  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setBusy(false);

    if (error) {
      setErroMsg(traduzirErro(error.message));
      return;
    }

    if (lembrar) {
      localStorage.setItem("diakonia_email", email.trim());
    } else {
      localStorage.removeItem("diakonia_email");
    }

    toast.success("Bem-vindo(a)! 🙏");
    navigate("/");
  };

  // ── Cadastro ─────────────────────────────────────────────────
  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    setBusy(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome: nome.trim() },
      },
    });
    setBusy(false);

    if (error) {
      setErroMsg(traduzirErro(error.message));
      return;
    }

    toast.success("Conta criada! Verifique seu e-mail para confirmar o acesso.");
    setSenha("");
    setTela("login");
  };

  // ── Recuperação de senha ──────────────────────────────────────
  const onRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    if (!email.trim()) {
      setErroMsg("Digite seu e-mail para continuar.");
      return;
    }
    setBusy(true);

    // 1. Dispara reset via Supabase
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

    // 2. Registra solicitação na tabela (mesmo se o email não existir,
    //    para não revelar se o cadastro existe)
    const { data: pessoa } = await supabase
      .from("membros")
      .select("id, nome_completo")
      .eq("email", email.trim())
      .maybeSingle();

    await supabase.from("recuperacao_senha").insert({
      email:     email.trim(),
      nome:      pessoa?.nome_completo ?? null,
      pessoa_id: pessoa?.id ?? null,
      status:    "pendente",
    });

    setBusy(false);

    if (error && !error.message.includes("For security purposes")) {
      setErroMsg(traduzirErro(error.message));
      return;
    }

    setTela("recuperar_ok");
  };

  // ── Renderização ──────────────────────────────────────────────

  // Ícone de ver/ocultar senha
  const BotaoSenha = (
    <button
      type="button"
      onClick={() => setVerSenha(v => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1}
      aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
    >
      {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <BrandMark className="text-5xl text-foreground" />
          <p className="text-foreground/60 mt-2 text-xs tracking-[0.18em] uppercase">
            Conectando pessoas, organizando o propósito
          </p>
        </div>

        {/* ── TELA: Login ── */}
        {tela === "login" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <div>
              <h1 className="font-serif text-xl font-semibold">Bem-vindo(a) de volta 🙏</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Entre com seu e-mail e senha para continuar.
              </p>
            </div>

            <form onSubmit={onSignIn} className="space-y-4">
              <Campo
                id="email" label="E-mail" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com"
                autoFocus required
              />
              <Campo
                id="senha" label="Senha" type={verSenha ? "text" : "password"}
                value={senha} onChange={setSenha}
                icon={<Lock className="w-4 h-4" />}
                placeholder="sua senha"
                required sufixo={BotaoSenha}
              />

              {/* Lembrar email */}
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={e => setLembrar(e.target.checked)}
                  className="rounded border-border w-3.5 h-3.5"
                />
                Lembrar meu e-mail
              </label>

              {/* Erro */}
              {erroMsg && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-base gap-2" disabled={busy}>
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando…</>
                  : "Entrar"}
              </Button>
            </form>

            {/* Links */}
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setTela("recuperar"); setErroMsg(null); setSenha(""); }}
                className="text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
              >
                Esqueci minha senha
              </button>
              <button
                type="button"
                onClick={() => { setTela("cadastro"); setErroMsg(null); setSenha(""); }}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Criar conta →
              </button>
            </div>
          </div>
        )}

        {/* ── TELA: Cadastro ── */}
        {tela === "cadastro" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <button
              type="button"
              onClick={() => { setTela("login"); setErroMsg(null); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o login
            </button>

            <div>
              <h1 className="font-serif text-xl font-semibold">Criar conta 💙</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Novas contas começam com acesso básico. Um administrador poderá ampliar seu perfil.
              </p>
            </div>

            <form onSubmit={onSignUp} className="space-y-4">
              <Campo
                id="nome" label="Seu nome completo" type="text"
                value={nome} onChange={setNome}
                icon={<User className="w-4 h-4" />}
                placeholder="Nome como aparece na igreja"
                autoFocus required
              />
              <Campo
                id="email2" label="E-mail" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com" required
              />
              <Campo
                id="senha2" label="Senha (mínimo 6 caracteres)" type={verSenha ? "text" : "password"}
                value={senha} onChange={setSenha}
                icon={<Lock className="w-4 h-4" />}
                placeholder="escolha uma senha"
                required minLength={6} sufixo={BotaoSenha}
              />

              {erroMsg && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" className="w-full h-11 gap-2" disabled={busy}>
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando…</>
                  : "Criar minha conta"}
              </Button>
            </form>
          </div>
        )}

        {/* ── TELA: Recuperar senha ── */}
        {tela === "recuperar" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <button
              type="button"
              onClick={() => { setTela("login"); setErroMsg(null); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o login
            </button>

            <div>
              <h1 className="font-serif text-xl font-semibold">Recuperar acesso 🔑</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Digite o e-mail cadastrado. Enviaremos um link para criar uma nova senha e nossa equipe ficará ciente.
              </p>
            </div>

            <form onSubmit={onRecuperar} className="space-y-4">
              <Campo
                id="email3" label="E-mail cadastrado" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com"
                autoFocus required
              />

              {erroMsg && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" className="w-full h-11 gap-2" disabled={busy}>
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                  : "Enviar link de recuperação"}
              </Button>
            </form>
          </div>
        )}

        {/* ── TELA: Confirmação de recuperação ── */}
        {tela === "recuperar_ok" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            <div className="space-y-2">
              <h1 className="font-serif text-xl font-semibold">Solicitação enviada! 💙</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Enviamos um link de recuperação para{" "}
                <span className="font-medium text-foreground">{email}</span>.<br />
                Verifique sua caixa de entrada (e o spam 😊).
              </p>
              <p className="text-xs text-muted-foreground bg-muted rounded-lg px-4 py-3 leading-relaxed mt-3">
                Nossa equipe também foi notificada e poderá te ajudar caso o link não chegue.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setTela("login"); setSenha(""); setErroMsg(null); }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao login
            </Button>
          </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-[11px] text-foreground/40 mt-6">
          Sistema ministerial · Diakonia App
        </p>
      </div>
    </div>
  );
}
