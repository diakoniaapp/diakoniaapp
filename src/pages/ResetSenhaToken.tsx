// ─── ResetSenhaToken.tsx — redefinir senha via token ─────────────────────────
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, AuthCard, AuthCampo, AuthErro } from "@/components/AuthShell";
import { Loader2, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetSenhaToken() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [valido, setValido] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nome, setNome] = useState<string>("");
  const [telefone, setTelefone] = useState<string>("");
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) { setMotivo("Link inválido"); setCarregando(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc("validar_convite", { p_token: token });
      setCarregando(false);
      if (error || !data || data.length === 0) {
        setMotivo(error?.message ?? "Link inválido");
        return;
      }
      const d = data[0];
      if (!d.valido) { setMotivo(d.motivo); return; }
      setValido(true);
      setNome(d.nome_completo);
      setTelefone(d.telefone);
    })();
  }, [token]);

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) { setErro("Senha precisa ter pelo menos 6 caracteres"); return; }
    if (senha !== conf) { setErro("As senhas não conferem"); return; }

    setEnviando(true);
    const { data, error } = await supabase.rpc("redefinir_senha", {
      p_token: token,
      p_senha: senha,
    });
    setEnviando(false);

    if (error || !data || data.length === 0 || !data[0].ok) {
      setErro((data?.[0]?.erro ?? error?.message) || "Erro ao redefinir senha");
      return;
    }

    const email = data[0].email;
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (loginErr) {
      toast.success("Senha redefinida! Faça login.");
      navigate("/auth", { replace: true });
      return;
    }
    toast.success(`Bem-vinda de volta, ${nome.split(" ")[0]}!`);
    navigate("/", { replace: true });
  }

  if (carregando) {
    return (
      <AuthShell>
        <AuthCard titulo="Validando link…">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (!valido) {
    return (
      <AuthShell>
        <AuthCard titulo="Link inválido">
          <p className="text-sm text-muted-foreground mb-4">
            {motivo ?? "Este link de recuperação não é mais válido."}
          </p>
          <p className="text-sm">
            <Link to="/esqueci-senha" className="text-primary underline">
              Solicitar novo link
            </Link>
          </p>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard titulo={`Olá, ${nome.split(" ")[0]}`}>
        <p className="text-sm text-muted-foreground mb-4">
          Crie uma nova senha para sua conta no Diakonia.
        </p>
        <form onSubmit={redefinir} className="space-y-4">
          <AuthCampo
            label="Telefone (login)"
            type="text"
            value={telefone}
            onChange={() => {}}
            disabled
            icon={<Lock className="w-4 h-4" />}
          />
          <AuthCampo
            label="Nova senha"
            type={verSenha ? "text" : "password"}
            value={senha}
            onChange={(v) => setSenha(v)}
            placeholder="Mínimo 6 caracteres"
            autoFocus
            icon={<Lock className="w-4 h-4" />}
            sufixo={
              <button type="button" onClick={() => setVerSenha((v) => !v)} className="text-muted-foreground">
                {verSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <AuthCampo
            label="Confirme a senha"
            type={verSenha ? "text" : "password"}
            value={conf}
            onChange={(v) => setConf(v)}
            icon={<Lock className="w-4 h-4" />}
          />
          {erro && <AuthErro mensagem={erro} />}
          <Button type="submit" disabled={enviando} className="w-full gap-2">
            {enviando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Redefinindo…</>
              : <><CheckCircle2 className="w-4 h-4" /> Redefinir e entrar</>}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
