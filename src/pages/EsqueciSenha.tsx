// ─── EsqueciSenha.tsx — solicita reset por telefone ─────────────────────────
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, AuthCard, AuthCampo, AuthErro } from "@/components/AuthShell";
import { Phone, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { formatarTelefone, limparTelefone, validarTelefone } from "@/lib/telefone";
import { toast } from "sonner";

export default function EsqueciSenha() {
  const navigate = useNavigate();
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const v = validarTelefone(telefone);
    if (!v.ok) { setErro(v.erro ?? "Telefone inválido"); return; }

    setEnviando(true);
    const { data, error } = await supabase.rpc("solicitar_reset_senha", {
      p_telefone: limparTelefone(telefone),
    });
    setEnviando(false);

    // Por segurança a RPC sempre retorna ok=true (não revela se telefone existe)
    setEnviado(true);
    if (data && data[0]?.token) {
      // Em produção, o link seria enviado por WhatsApp para o telefone.
      // Por enquanto mostramos na tela (próxima fase: integração WhatsApp).
      const url = `${window.location.origin}/reset/${data[0].token}`;
      setLink(url);
    }
  }

  return (
    <AuthShell>
      <AuthCard titulo="Recuperar acesso">
        {!enviado ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Digite o telefone cadastrado na igreja. Você receberá um link no WhatsApp para criar uma nova senha.
            </p>
            <form onSubmit={solicitar} className="space-y-4">
              <AuthCampo
                label="Telefone (com DDD)"
                type="tel"
                value={formatarTelefone(telefone)}
                onChange={(v) => setTelefone(limparTelefone(v))}
                placeholder="(11) 91234-5678"
                icon={<Phone className="w-4 h-4" />}
                inputMode="tel"
                autoFocus
              />
              {erro && <AuthErro mensagem={erro} />}
              <Button type="submit" disabled={enviando} className="w-full gap-2">
                {enviando
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                  : "Enviar link de recuperação"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate("/auth")} className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar para login
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-emerald-600 mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <p className="font-medium">Solicitação enviada</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Se o telefone estiver cadastrado, você receberá um link de recuperação no WhatsApp em alguns segundos.
              O link expira em 1 hora.
            </p>
            {link && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-xs">
                <p className="font-medium mb-1">Link de teste (clique para abrir):</p>
                <a href={link} className="text-primary break-all underline">{link}</a>
                <p className="text-muted-foreground mt-2">
                  Em produção este link será enviado automaticamente via WhatsApp.
                </p>
              </div>
            )}
            <Button variant="outline" onClick={() => navigate("/auth")} className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" /> Voltar para login
            </Button>
          </>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Não tem cadastro? <Link to="/auth" className="text-primary underline">Fale com a secretaria</Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
