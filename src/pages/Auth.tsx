// ============================================================
// Auth.tsx — Tela de Login Ministerial
// DiakoniaApp — padrão institucional v2
// Login via telefone → {digitos}@app.diakonia
// Fluxo: Login → PrimeiroAcesso → AceiteLgpd → Dashboard
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rotaInicialPorPapel } from "@/components/layout/navConfig";
import { toast } from "sonner";
import {
  AuthShell, AuthCard, AuthCampo, AuthErro, getSaudacao,
} from "@/components/AuthShell";
import {
  Eye, EyeOff, Loader2, Phone, Lock, ArrowLeft, CheckCircle2, MessageCircle,
} from "lucide-react";

// ── Tipos de tela ──────────────────────────────────────────
type Tela = "login" | "recuperar" | "recuperar_ok";

// ── Utilitários ────────────────────────────────────────────
function telefoneParaEmail(tel: string): string {
  // Normaliza para o formato canônico do banco: 55DDDNNNNNNNNN.
  // Se vier sem DDI (10-11 dígitos), prefixa 55. Se vier com (12-13), mantém.
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) {
    // já tem DDI
  } else if (d.length === 10 || d.length === 11) {
    d = "55" + d;
  }
  return `${d}@app.diakonia`;
}

function mascaraTelefone(valor: string): string {
  let d = valor.replace(/\D/g, "");
  // Remove DDI 55 se vier no inicio (input do usuario deve ser DDD+numero)
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
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
  const { user, loading, roles, rolesCarregados } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tela, setTela]         = useState<Tela>("login");
  const [telefone, setTelefone] = useState(() => localStorage.getItem("diakonia_tel") ?? "");
  const [senha, setSenha]       = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar]   = useState(!!localStorage.getItem("diakonia_tel"));
  const [busy, setBusy]         = useState(false);
  const [erroMsg, setErroMsg]   = useState<string | null>(null);

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
  //
  // `rolesCarregados` no lugar de olhar `roles.length`: vazio quer dizer tanto
  // "ainda não respondeu" quanto "não tem papel", e num login novo o comum é
  // navegar antes da consulta voltar. Sem esta espera, a secretária cairia na
  // Home quase sempre e no painel dela de vez em quando — pior que não ter a
  // funcionalidade, porque ninguém confia no que funciona às vezes.
  //
  // A espera é curta e invisível: acontece com o botão de entrar já em
  // "Entrando…". Quem troca de senha ou não aceitou a LGPD nem passa por
  // aqui — esses dois fluxos vêm antes e não dependem de papel.
  useEffect(() => {
    if (!loading && user) {
      const meta = user.user_metadata as Record<string, unknown>;
      if (meta?.must_change_password) {
        navigate("/primeiro-acesso", { replace: true });
        return;
      }
      const lgpdOk = sessionStorage.getItem(`lgpd_ok_${user.id}`);
      if (!lgpdOk) { navigate("/aceite-lgpd", { replace: true }); return; }
      if (!rolesCarregados) return;
      navigate(rotaInicialPorPapel(roles), { replace: true });
    }
  }, [user, loading, roles, rolesCarregados, navigate]);

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
      // membros nao tem coluna `telefone`; o celular fica em telefone_celular,
      // gravado so com digitos (ver ebdService). Consultando o nome errado, a
      // query falhava e a solicitacao era registrada sem nome nem pessoa_id.
      .from("membros").select("id, nome_completo")
      .eq("telefone_celular", digits).maybeSingle();
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

  // Sem versículo abaixo do card: a tela de entrada tem uma tarefa só, e
  // o texto solto embaixo competia com ela pela atenção. O versículo
  // continua em VERSICULOS_AUTH, para as demais telas do fluxo.
  return (
    <AuthShell semVersiculo>

      {/* ══════ TELA LOGIN ══════ */}
      {tela === "login" && (
        <AuthCard>
          {/* Cabeçalho */}
          <div className="space-y-1">
            {/* A cruz era o emoji ✝️, que o Windows desenha num quadrado
                ROXO — a única mancha fria de uma tela toda quente. O mesmo
                sinal existe como caractere de texto (U+271D, sem o seletor
                de emoji), e como texto ele herda a cor que se mandar. */}
            <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">
              Graça e Paz{" "}
              <span className="text-dourado-text/90 font-normal align-baseline" aria-hidden>
                ✝
              </span>
            </h1>
            {/* Media 2,66:1 no claro e 2,81:1 no escuro com
                `muted-foreground/60`. Ver o comentário sobre o token. */}
            <p className="text-sm text-foreground/65 pt-0.5">
              Entre com seu telefone e senha para continuar.
            </p>
          </div>

          {/* Divisor dourado — agora dourado de verdade. O `divider-gold`
              que estava aqui é terracota, como toda a família `gold`. */}
          <div className="divider-dourado" />

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
            <label className="flex items-center gap-2 text-sm text-foreground/75 cursor-pointer select-none group">
              <input
                type="checkbox" checked={lembrar}
                onChange={e => setLembrar(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5 accent-dourado"
              />
              <span className="group-hover:text-foreground transition-colors">
                Lembrar meu telefone
              </span>
            </label>

            <AuthErro mensagem={erroMsg} />

            {/* ── O botão principal, em ouro ────────────────────────────
                Era `bg-gold`, que neste sistema é TERRACOTA — daí o botão
                cor de tijolo na primeira captura.

                Quatro camadas fazem o metal, e nenhuma delas sozinha:

                  · o gradiente de quatro paradas — a luz entra depressa,
                    o meio-tom demora, a sombra fecha;
                  · o RISCO DE LUZ no topo (`inset 0 1px`), que é o que
                    dá espessura à peça: sem ele o botão é um retângulo
                    pintado, com ele é uma chapa;
                  · a base escura de 2px, a espessura vista de lado;
                  · o halo dourado difuso, a luz que o metal devolve.

                E a tinta é MARROM ESCURO, não branca: branco sobre ouro
                mede 2:1 e foi o que fez o primeiro botão parecer mostarda.
                Escuro sobre ouro mede 4,8:1 no pior ponto do gradiente e
                lê como letra gravada no metal. */}
            <Button
              type="submit" disabled={busy}
              className="w-full h-11 text-base font-semibold tracking-wide
                         text-dourado-tinta bg-gradient-dourado-botao
                         border border-dourado-escuro/45
                         shadow-[inset_0_1px_0_hsl(0_0%_100%/0.55),0_2px_0_hsl(var(--dourado-escuro)/0.55),0_10px_24px_-8px_hsl(var(--dourado)/0.6)]
                         hover:brightness-[1.05]
                         active:scale-[0.985] active:brightness-95
                         active:shadow-[inset_0_1px_2px_hsl(38_60%_20%/0.35),0_1px_0_hsl(var(--dourado-escuro)/0.55)]
                         transition-all"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>

          {/* Link recuperar */}
          <Link
            to="/esqueci-senha"
            className="block w-full text-center text-sm text-foreground/75 hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>

          {/* ── Aviso de convite ────────────────────────────────────────
              Era um bloco cinza com duas frases centralizadas do mesmo
              tamanho e um emoji no lugar do ícone. Três defeitos juntos:
              texto centralizado de duas linhas obriga o olho a procurar o
              começo de cada uma; sem hierarquia, a PERGUNTA de quem está
              travado ("não tenho acesso") ficava enterrada na segunda
              linha; e cinza sobre cinza dizia "rodapé", não "leia isto".

              Agora a pergunta vem primeiro, em dourado, porque é ela que
              identifica quem precisa da caixa — quem já tem acesso passa
              direto. */}
          <div className="rounded-xl border border-dourado-line bg-dourado-soft px-4 py-3 flex items-start gap-3 text-left">
            {/* O mesmo metal do botão, em miniatura — inclusive o risco
                de luz no topo. Um quadrado dourado chapado ao lado de um
                botão com relevo denuncia os dois. */}
            <span className="mt-px shrink-0 w-7 h-7 rounded-md bg-gradient-dourado-botao
                             border border-dourado-escuro/40 flex items-center justify-center
                             shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5),0_1px_3px_hsl(var(--dourado-escuro)/0.35)]">
              <MessageCircle className="w-3.5 h-3.5 text-dourado-tinta" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold text-dourado-text">
                Ainda não tem acesso?
              </p>
              <p className="text-xs text-foreground/65 dark:text-foreground/60 leading-relaxed">
                Fale com a liderança da sua igreja.
              </p>
            </div>
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

          <div className="bg-dourado-soft border border-dourado-line rounded-xl px-4 py-3">
            <p className="text-sm text-foreground/80 leading-relaxed text-center">
              <span className="font-semibold text-dourado-text">{getSaudacao()}!</span> A equipe enviará
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
              className="w-full h-11 font-semibold tracking-wide
                         text-dourado-tinta bg-gradient-dourado-botao
                         border border-dourado-escuro/45
                         shadow-[inset_0_1px_0_hsl(0_0%_100%/0.55),0_2px_0_hsl(var(--dourado-escuro)/0.55),0_10px_24px_-8px_hsl(var(--dourado)/0.6)]
                         hover:brightness-[1.05] active:scale-[0.985] active:brightness-95 transition-all"
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
            <div className="w-16 h-16 rounded-full bg-success-soft/30 flex items-center justify-center animate-pulse-gold">
              <CheckCircle2 className="w-8 h-8 text-success-text" />
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
