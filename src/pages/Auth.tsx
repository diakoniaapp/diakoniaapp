// ============================================================
// Auth.tsx — Tela de Login Ministerial
// Diakonia App — Sistema de Gestão da Igreja
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

// ── Versículos de boas-vindas ──────────────────────────────────
const VERSICULOS = [
  { texto: "Porque sou eu que conheço os planos que tenho para vocês — planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro.", ref: "Jeremias 29:11" },
  { texto: "O Senhor é o meu pastor; nada me faltará.", ref: "Salmos 23:1" },
  { texto: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
  { texto: "Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.", ref: "Mateus 11:28" },
  { texto: "Pois Deus não nos deu um espírito de covardia, mas de poder, de amor e de equilíbrio.", ref: "2 Timóteo 1:7" },
  { texto: "Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento.", ref: "Provérbios 3:5" },
  { texto: "O Senhor está perto de todos os que o invocam, de todos os que o invocam em verdade.", ref: "Salmos 145:18" },
  { texto: "Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.", ref: "Salmos 91:1" },
  { texto: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.", ref: "João 3:16" },
  { texto: "Buscai primeiro o Reino de Deus e a sua justiça, e todas as demais coisas vos serão acrescentadas.", ref: "Mateus 6:33" },
  { texto: "O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti.", ref: "Números 6:24-25" },
  { texto: "Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.", ref: "1 Tessalonicenses 5:18" },
];

function getVersiculo() {
  const idx = Math.floor(Math.random() * VERSICULOS.length);
  return VERSICULOS[idx];
}

// ── Saudação por horário ───────────────────────────────────────
function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Mensagem de recuperação por horário ───────────────────────
function getMensagemRecuperacao(): string {
  const h = new Date().getHours();
  const saudacao = getSaudacao();
  const periodo = h >= 5 && h < 18 ? "hoje" : "nessa noite";
  return `${saudacao}! A Equipe Diakonia enviou um link de redefinição para o seu e-mail. Caso não encontre, verifique a pasta de spam — estamos aqui para ajudar ${periodo} 💙`;
}

// ── Mensagens de erro humanizadas ─────────────────────────────
const ERROS: Record<string, string> = {
  "Invalid login credentials":    "E-mail ou senha incorretos 😕 Verifique seus dados.",
  "Email not confirmed":          "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "User already registered":      "Este e-mail já possui uma conta. Tente entrar.",
  "Password should be at least 6 characters": "A senha precisa ter no mínimo 6 caracteres.",
  "Unable to validate email address: invalid format": "Digite um e-mail válido.",
  "For security purposes, you can only request this once every 60 seconds":
    "Aguarde 1 minuto antes de solicitar novamente.",
};

function traduzirErro(msg: string): string {
  for (const [chave, traduzido] of Object.entries(ERROS)) {
    if (msg.includes(chave)) return traduzido;
  }
  return "Algo deu errado 😕 Tente novamente ou fale com a equipe.";
}

// ── Campo com ícone ────────────────────────────────────────────
function Campo({
  id, label, type, value, onChange, icon, placeholder,
  autoFocus, required, minLength, sufixo,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; icon: React.ReactNode; placeholder?: string;
  autoFocus?: boolean; required?: boolean; minLength?: number; sufixo?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground/80">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          id={id} type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          required={required} minLength={minLength}
          className="pl-9 pr-10 h-11 bg-background/80 border-border/70 focus:border-gold/60 transition-colors"
        />
        {sufixo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{sufixo}</span>
        )}
      </div>
    </div>
  );
}

// ── Componente Principal ───────────────────────────────────────
export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [tela, setTela]         = useState<Tela>("login");
  const [email, setEmail]       = useState(() => localStorage.getItem("diakonia_email") ?? "");
  const [senha, setSenha]       = useState("");
  const [nome, setNome]         = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar]   = useState(!!localStorage.getItem("diakonia_email"));
  const [busy, setBusy]         = useState(false);
  const [erroMsg, setErroMsg]   = useState<string | null>(null);
  const [versiculo]             = useState(getVersiculo);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => { setErroMsg(null); }, [email, senha]);

  // ── Login ──────────────────────────────────────────────────
  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: senha,
    });
    setBusy(false);
    if (error) { setErroMsg(traduzirErro(error.message)); return; }
    if (lembrar) localStorage.setItem("diakonia_email", email.trim());
    else         localStorage.removeItem("diakonia_email");
    toast.success(`${getSaudacao()}! Seja bem-vindo(a) 🙏`);
    navigate("/");
  };

  // ── Cadastro ───────────────────────────────────────────────
  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome: nome.trim() },
      },
    });
    setBusy(false);
    if (error) { setErroMsg(traduzirErro(error.message)); return; }
    toast.success("Conta criada! Verifique seu e-mail para confirmar o acesso.");
    setSenha(""); setTela("login");
  };

  // ── Recuperação de senha ───────────────────────────────────
  const onRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);
    if (!email.trim()) { setErroMsg("Digite seu e-mail para continuar."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    const { data: pessoa } = await supabase
      .from("membros").select("id, nome_completo")
      .eq("email", email.trim()).maybeSingle();
    await supabase.from("recuperacao_senha").insert({
      email: email.trim(),
      nome: pessoa?.nome_completo ?? null,
      pessoa_id: pessoa?.id ?? null,
      status: "pendente",
    });
    setBusy(false);
    if (error && !error.message.includes("For security purposes")) {
      setErroMsg(traduzirErro(error.message)); return;
    }
    setTela("recuperar_ok");
  };

  // ── Botão ver/ocultar senha ────────────────────────────────
  const BotaoSenha = (
    <button type="button" onClick={() => setVerSenha(v => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>
      {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-hero p-4">

      <div className="w-full max-w-sm">

        {/* ── Logo ── */}
        <div className="text-center mb-10">
          {/* Container com sombra sutil para destacar a logo */}
          <div className="inline-flex flex-col items-center gap-3">
            <div className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
              <BrandMark className="text-[4rem] text-foreground" />
            </div>
            {/* Tagline em 2 linhas — legível e elegante */}
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

        {/* ── TELA: Login ── */}
        {tela === "login" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <div className="space-y-0.5">
              <h1 className="font-serif text-2xl font-bold tracking-wide">
                Graça e Paz ✝️
              </h1>
              <p className="text-sm text-muted-foreground font-medium">
                Que Deus abençoe sua jornada hoje 🙏
              </p>
              <p className="text-xs text-muted-foreground/70 pt-1">
                Entre com seu e-mail e senha para continuar.
              </p>
            </div>

            <form onSubmit={onSignIn} className="space-y-4">
              <Campo id="email" label="E-mail" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com" autoFocus required />
              <Campo id="senha" label="Senha"
                type={verSenha ? "text" : "password"}
                value={senha} onChange={setSenha}
                icon={<Lock className="w-4 h-4" />}
                placeholder="sua senha" required sufixo={BotaoSenha} />

              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={lembrar}
                  onChange={e => setLembrar(e.target.checked)}
                  className="rounded border-border w-3.5 h-3.5 accent-gold" />
                Lembrar meu e-mail
              </label>

              {erroMsg && (
                <div className="bg-destructive/8 border border-destructive/25 rounded-lg px-3 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" disabled={busy}
                className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>

            <div className="flex flex-col gap-2 pt-1">
              <button onClick={() => { setTela("recuperar"); setErroMsg(null); setSenha(""); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline text-center">
                Esqueci minha senha
              </button>
              <button onClick={() => { setTela("cadastro"); setErroMsg(null); setSenha(""); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline text-center">
                Criar nova conta
              </button>
            </div>
          </div>
        )}

        {/* ── TELA: Cadastro ── */}
        {tela === "cadastro" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => { setTela("login"); setErroMsg(null); }}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-serif text-xl font-semibold">Criar conta</h1>
                <p className="text-sm text-muted-foreground">Preencha seus dados para solicitar acesso.</p>
              </div>
            </div>

            <form onSubmit={onSignUp} className="space-y-4">
              <Campo id="nome" label="Seu nome completo" type="text"
                value={nome} onChange={setNome}
                icon={<User className="w-4 h-4" />}
                placeholder="Nome Sobrenome" autoFocus required />
              <Campo id="email2" label="E-mail" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com" required />
              <Campo id="senha2" label="Senha (mínimo 6 caracteres)"
                type={verSenha ? "text" : "password"}
                value={senha} onChange={setSenha}
                icon={<Lock className="w-4 h-4" />}
                placeholder="crie uma senha segura"
                required minLength={6} sufixo={BotaoSenha} />

              {/* Aviso de permissão */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  ℹ️ Novas contas iniciam com acesso básico. Um administrador poderá ampliar seu perfil após a confirmação.
                </p>
              </div>

              {erroMsg && (
                <div className="bg-destructive/8 border border-destructive/25 rounded-lg px-3 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" disabled={busy}
                className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar conta"}
              </Button>
            </form>
          </div>
        )}

        {/* ── TELA: Esqueci senha ── */}
        {tela === "recuperar" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => { setTela("login"); setErroMsg(null); }}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-serif text-xl font-semibold">Recuperar acesso</h1>
                <p className="text-sm text-muted-foreground">Informe seu e-mail e enviaremos um link.</p>
              </div>
            </div>

            {/* Mensagem institucional */}
            <div className="bg-gold/8 border border-gold/25 rounded-xl px-4 py-3 text-center">
              <p className="text-sm text-foreground/80 leading-relaxed">
                <span className="font-medium text-gold">{getSaudacao()}!</span> A Equipe Diakonia
                enviará um link de redefinição para o seu e-mail.
                Nossa equipe também será notificada para garantir que você recupere o acesso 💙
              </p>
            </div>

            <form onSubmit={onRecuperar} className="space-y-4">
              <Campo id="email3" label="Seu e-mail cadastrado" type="email"
                value={email} onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                placeholder="seu@email.com" autoFocus required />

              {erroMsg && (
                <div className="bg-destructive/8 border border-destructive/25 rounded-lg px-3 py-2.5 text-sm text-destructive">
                  {erroMsg}
                </div>
              )}

              <Button type="submit" disabled={busy}
                className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar link de redefinição"}
              </Button>
            </form>
          </div>
        )}

        {/* ── TELA: Confirmação ── */}
        {tela === "recuperar_ok" && (
          <div className="bg-card rounded-2xl shadow-elevated border border-border/50 p-7 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="space-y-2">
              <h1 className="font-serif text-xl font-semibold">Link enviado!</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {getMensagemRecuperacao()}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Não encontrou o e-mail? Verifique a pasta de <strong>spam</strong> ou aguarde alguns minutos.
              </p>
            </div>
            <Button variant="outline" className="w-full"
              onClick={() => { setTela("login"); setErroMsg(null); }}>
              Voltar ao login
            </Button>
          </div>
        )}

        {/* ── Rodapé institucional ── */}
        <p className="text-center text-[10px] text-foreground/30 mt-6 tracking-wide leading-relaxed">
          DiakoniaApp — Sistema de Gestão Ministerial
          <br />
          CNPJ: 34.926.658/0001-40
        </p>
      </div>
    </div>
  );
}
