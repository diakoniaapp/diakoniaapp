// ─── Convite.tsx — primeiro acesso via token de convite ─────────────────────
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthShell, AuthCard, AuthCampo, AuthErro } from "@/components/AuthShell";
import { Loader2, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface DadosConvite {
  valido: boolean;
  motivo?: string | null;
  pessoa_id?: string;
  nome_completo?: string;
  telefone?: string;
  role?: string;
  tipo?: string;
}

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState<DadosConvite | null>(null);
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setDados({ valido: false, motivo: "Link inválido" });
      setCarregando(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("validar_convite", { p_token: token });
      setCarregando(false);
      if (error || !data || data.length === 0) {
        setDados({ valido: false, motivo: error?.message ?? "Não foi possível validar o convite" });
        return;
      }
      setDados(data[0] as DadosConvite);
    })();
  }, [token]);

  async function aceitar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) { setErro("Senha precisa ter pelo menos 6 caracteres"); return; }
    if (senha !== conf) { setErro("As senhas não conferem"); return; }

    setEnviando(true);
    const { data, error } = await supabase.rpc("aceitar_convite", {
      p_token: token,
      p_senha: senha,
    });
    setEnviando(false);

    if (error || !data || data.length === 0 || !data[0].ok) {
      setErro((data?.[0]?.erro ?? error?.message) || "Erro ao criar acesso");
      return;
    }

    // Faz login com a senha que acabou de criar
    const email = data[0].email;
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (loginErr) {
      toast.error("Conta criada mas o login automático falhou. Vá para /auth e entre.");
      navigate("/auth", { replace: true });
      return;
    }
    toast.success(`Bem-vinda, ${dados?.nome_completo?.split(" ")[0]}!`);
    navigate("/", { replace: true });
  }

  if (carregando) {
    return (
      <AuthShell>
        <AuthCard titulo="Validando convite…">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (!dados?.valido) {
    return (
      <AuthShell>
        <AuthCard titulo="Convite inválido">
          <p className="text-sm text-muted-foreground mb-4">
            {dados?.motivo ?? "Este convite não é mais válido."}
          </p>
          <p className="text-sm">
            Solicite um novo convite à secretaria da igreja, ou{" "}
            <Link to="/esqueci-senha" className="text-primary underline">
              recupere sua senha
            </Link>{" "}
            se você já tem acesso.
          </p>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard titulo={`Olá, ${dados.nome_completo?.split(" ")[0]} ✝️`}>
        <p className="text-sm text-muted-foreground mb-4">
          Você foi convidada(o) a acessar o Diakonia como{" "}
          <strong className="text-foreground capitalize">{dados.role}</strong>.
          Crie uma senha que você vá lembrar.
        </p>

        <form onSubmit={aceitar} className="space-y-4">
          <AuthCampo
            label="Telefone (login)"
            type="text"
            value={dados.telefone ?? ""}
            onChange={() => {}}
            disabled
            icon={<Lock className="w-4 h-4" />}
          />

          <AuthCampo
            label="Crie sua senha"
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
            placeholder="Repita a mesma senha"
            icon={<Lock className="w-4 h-4" />}
          />

          {erro && <AuthErro mensagem={erro} />}

          <Button type="submit" disabled={enviando} className="w-full gap-2">
            {enviando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando acesso…</>
              : <><CheckCircle2 className="w-4 h-4" /> Criar conta e entrar</>}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
