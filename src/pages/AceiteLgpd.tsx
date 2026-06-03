// ============================================================
// AceiteLgpd.tsx — Aceite Obrigatório LGPD
// DiakoniaApp — persiste APENAS no banco (sem fallback local)
// Pré-requisito: SQL 20260603_lgpd_fix_definitivo.sql aplicado
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AuthShell, AuthCard } from "@/components/AuthShell";
import { toast } from "sonner";
import { ShieldCheck, Loader2, ScrollText, CheckCircle2, AlertTriangle } from "lucide-react";

const POLITICA_PADRAO = `**1. Quais dados coletamos?**
O DiakoniaApp coleta dados pessoais fornecidos voluntariamente pelos membros e lideranças da Igreja, como nome completo, telefone, e-mail, endereço, data de nascimento e informações de participação ministerial.

**2. Para que usamos seus dados?**
Os dados são utilizados exclusivamente para fins ministeriais e administrativos internos: gestão de membros, comunicação pastoral, organização de eventos e relatórios institucionais. Não compartilhamos informações com terceiros sem consentimento expresso.

**3. Base legal — LGPD (Lei 13.709/2018)**
O tratamento fundamenta-se no consentimento do titular (Art. 7, I) e no legítimo interesse da instituição religiosa (Art. 7, IX), em conformidade com a finalidade ministerial.

**4. Seus direitos**
Você tem direito a acessar, corrigir, portar, anonimizar ou solicitar a exclusão dos seus dados. Para exercer qualquer direito, entre em contato com a secretaria da Igreja.

**5. Segurança**
Seus dados são armazenados com criptografia e acesso restrito aos responsáveis autorizados pelo sistema.

**6. Contato**
Dúvidas sobre privacidade: secretaria@qibrj.org.br`;

export default function AceiteLgpd() {
  const navigate          = useNavigate();
  const { user, loading } = useAuth();

  const [politica, setPolitica]       = useState(POLITICA_PADRAO);
  const [versao, setVersao]           = useState("1.0");
  const [lido, setLido]               = useState(false);
  const [busy, setBusy]               = useState(false);
  const [erroMsg, setErroMsg]         = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);

  // Sem sessão → login
  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  // Verifica aceite existente e carrega política
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Verifica aceite existente pelo auth_user_id
        const { data: aceite, error: errSelect } = await supabase
          .from("consentimento")
          .select("id")
          .eq("auth_user_id", user.id)
          .eq("aceito", true)
          .maybeSingle();

        if (errSelect) {
          console.error("Erro ao verificar aceite:", errSelect.message);
        }

        if (aceite) {
          sessionStorage.setItem("lgpd_ok_" + user.id, "1");
          navigate("/", { replace: true });
          return;
        }

        // Carrega política vigente
        const { data: pol } = await supabase
          .from("politica_privacidade")
          .select("versao, conteudo")
          .eq("vigente", true)
          .order("publicado_em", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pol) { setPolitica(pol.conteudo); setVersao(pol.versao); }

      } catch (e: unknown) {
        console.error("Erro ao carregar LGPD:", e);
      } finally {
        setVerificando(false);
      }
    })();
  }, [user, navigate]);

  const onAceitar = async () => {
    if (!user) return;
    setBusy(true);
    setErroMsg(null);

    // Insert com auth_user_id — FK válida para auth.users (sempre existe)
    const { error } = await supabase.from("consentimento").insert({
      auth_user_id: user.id,
      tipo:         "politica_privacidade",
      base_legal:   "consentimento",
      aceito:       true,
      texto_versao: versao,
      canal:        "web_app",
    });

    if (error) {
      console.error("Erro ao registrar consentimento:", error);
      setBusy(false);
      setErroMsg(
        error.code === "42501"
          ? "Permissão negada pelo banco. Contate o administrador do sistema."
          : error.code === "23503"
          ? "Usuário não encontrado na base. Faça logout e login novamente."
          : `Erro: ${error.message}`
      );
      return;
    }

    // Log de auditoria (falha silenciosa — não bloqueia)
    await supabase.from("log_auditoria").insert({
      tabela:        "consentimento",
      acao:          "ACEITE_LGPD",
      usuario_email: user.email ?? null,
      campos_alt:    { versao_politica: versao, canal: "web_app", auth_user_id: user.id },
    }).then(({ error: logErr }) => {
      if (logErr) console.warn("Log de auditoria falhou (não crítico):", logErr.message);
    });

    sessionStorage.setItem("lgpd_ok_" + user.id, "1");
    setBusy(false);
    toast.success("Obrigado! Seu aceite foi registrado com segurança 🙏");
    navigate("/", { replace: true });
  };

  if (loading || verificando) {
    return (
      <AuthShell semVersiculo>
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      </AuthShell>
    );
  }

  const renderPolitica = () =>
    politica.trim().split("\n").filter(Boolean).map((linha, i) => {
      const ehTitulo = linha.startsWith("**") && linha.endsWith("**");
      return ehTitulo
        ? <p key={i} className="font-semibold text-foreground dark:text-foreground/90 pt-2">
            {linha.replace(/\*\*/g, "")}
          </p>
        : <p key={i} className="text-foreground/65 dark:text-foreground/55 leading-relaxed">
            {linha}
          </p>;
    });

  return (
    <AuthShell wide>
      <AuthCard>

        {/* Cabeçalho */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gold/15 dark:bg-gold/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-gold" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold/80">
              Privacidade e LGPD
            </span>
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-wide">
            Política de Privacidade ✝️
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Antes de acessar o sistema, leia nossa Política de Privacidade e, se concordar,
            clique em <strong className="text-foreground">Aceitar e continuar</strong>.
          </p>
        </div>

        <div className="divider-gold" />

        {/* Texto da política */}
        <div className="relative">
          <div
            className="h-64 overflow-y-auto rounded-xl border border-border/60 dark:border-border/40 bg-muted/30 dark:bg-muted/20 p-4 space-y-2 text-sm scroll-smooth"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setLido(true);
            }}
          >
            <div className="flex items-center gap-2 text-gold mb-3">
              <ScrollText className="w-4 h-4" />
              <span className="font-bold text-xs uppercase tracking-widest">
                Versão {versao}
              </span>
            </div>
            {renderPolitica()}
            <div className="flex items-center gap-2 pt-3 border-t border-border/40 dark:border-border/30 mt-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs text-muted-foreground">Fim — Versão {versao}</span>
            </div>
          </div>
          {!lido && (
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-muted/80 dark:from-card/80 to-transparent rounded-b-xl pointer-events-none flex items-end justify-center pb-1">
              <span className="text-[10px] text-muted-foreground animate-bounce-subtle">
                ▼ role para ler
              </span>
            </div>
          )}
        </div>

        {/* Checkbox */}
        <label className={"flex items-start gap-3 cursor-pointer select-none rounded-xl px-3 py-2.5 border transition-colors " + (
          lido
            ? "bg-gold/8 dark:bg-gold/10 border-gold/25 dark:border-gold/20"
            : "bg-muted/30 dark:bg-muted/20 border-border/40 dark:border-border/30"
        )}>
          <input
            type="checkbox" checked={lido}
            onChange={(e) => setLido(e.target.checked)}
            className="mt-0.5 rounded border-border w-4 h-4 accent-gold shrink-0"
          />
          <span className="text-sm text-foreground/80 dark:text-foreground/70 leading-snug">
            Li e concordo com a <strong>Política de Privacidade</strong> do DiakoniaApp,
            conforme a LGPD (Lei nº 13.709/2018). Autorizo o uso dos meus dados para
            fins ministeriais e administrativos internos.
          </span>
        </label>

        {/* Erro de banco */}
        {erroMsg && (
          <div className="flex items-start gap-2 bg-destructive/8 dark:bg-destructive/15 border border-destructive/25 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive dark:text-red-400">{erroMsg}</p>
          </div>
        )}

        <Button
          onClick={onAceitar}
          disabled={!lido || busy}
          className="w-full h-11 text-base font-semibold bg-gold hover:bg-gold/90 text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aceitar e continuar"}
        </Button>

        <p className="text-[11px] text-muted-foreground/60 dark:text-muted-foreground/50 text-center leading-relaxed">
          Seu consentimento será registrado no banco de dados com data, hora
          e versão do documento, conforme exige a LGPD.
        </p>

        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-muted" />
          <div className="w-2 h-2 rounded-full bg-gold" />
          <p className="text-[10px] text-muted-foreground ml-1">Passo 2 de 2</p>
        </div>

      </AuthCard>
    </AuthShell>
  );
}
