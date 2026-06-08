// ─── AcessoCard.tsx — Bloco de acesso na ficha de uma Pessoa ─────────────────
//
// Exibe o estado do acesso e permite criar, reenviar ou resetar senha.
// Usado dentro do MembroForm / ficha da pessoa.
//
// Estados:
//   • sem_acesso   → botão "Criar acesso"
//   • aguardando   → badge + ações (reenviar, resetar)
//   • ativo        → badge + ações (reenviar, resetar)

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  KeyRound, MessageCircle, RefreshCw, Send,
  ShieldCheck, ShieldOff, UserPlus,
} from "lucide-react";

import {
  buscarAcessoPorPessoa,
  criarAcessoPessoa,
  reenviarAcessoPessoa,
  type AcessoPessoa,
  type StatusAcesso,
} from "@/services/acessoService";
import { enviarWhatsApp, montarMensagemWhatsApp } from "@/services/userService";
import { ROLE_LABEL } from "@/types/usuario";
import type { RoleOption } from "@/types/usuario";
import { formatarTelefone, normalizarTelefone } from "@/lib/telefone";
import { AcessoEnviadoDialog } from "@/components/pessoas/AcessoEnviadoDialog";

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusAcesso, { label: string; cor: string; icone: typeof ShieldCheck }> = {
  sem_acesso: { label: "Sem acesso",              cor: "text-slate-500 border-slate-300",  icone: ShieldOff  },
  aguardando: { label: "Aguardando 1º acesso",    cor: "text-amber-600 border-amber-400",  icone: RefreshCw  },
  ativo:      { label: "Ativo",                   cor: "text-green-600 border-green-400",  icone: ShieldCheck },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AcessoCardProps {
  pessoaId:     string;
  nomeCompleto: string;
  telefone:     string | null;        // telefone da pessoa (pré-preenche o login)
  roleInicial?: RoleOption;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AcessoCard({
  pessoaId,
  nomeCompleto,
  telefone,
  roleInicial = "voluntario",
}: AcessoCardProps) {
  const [acesso,     setAcesso]     = useState<AcessoPessoa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [criando,    setCriando]    = useState(false);
  const [agindo,     setAgindo]     = useState(false);
  const [role,       setRole]       = useState<RoleOption>(roleInicial);
  const [dialogAcesso, setDialogAcesso] = useState<{
    open: boolean;
    primeiroNome: string;
    telefone: string;
    senha: string;
    url: string;
    acao: "criado" | "reenviado";
  }>({ open: false, primeiroNome: "", telefone: "", senha: "", url: "", acao: "criado" });

  // ── Carregar estado atual ──────────────────────────────────────────────────

  async function carregar() {
    setCarregando(true);
    const dados = await buscarAcessoPorPessoa(pessoaId);
    setAcesso(dados);
    if (dados) setRole(dados.role as RoleOption);
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [pessoaId]);

  // ── Criar acesso ───────────────────────────────────────────────────────────

  async function handleCriarAcesso() {
    if (!telefone) {
      toast.error("Cadastre um telefone na ficha da pessoa antes de criar o acesso.");
      return;
    }
    setCriando(true);
    const resultado = await criarAcessoPessoa({
      pessoaId, nomeCompleto, telefone, role,
    });
    setCriando(false);

    if (!resultado.ok) {
      toast.error(resultado.erro ?? "Erro ao criar acesso.");
      if (resultado.senha && resultado.tel) {
        // Auth criado mas profile falhou — não perder a senha
        const wa = enviarWhatsApp(resultado.tel, nomeCompleto, resultado.senha, false);
        if (wa.url && !wa.abertaAutomaticamente) {
          toast.warning("Pop-up bloqueado — clique para abrir o WhatsApp", {
            duration: 20000,
            action: { label: "Abrir", onClick: () => window.open(wa.url!, "_blank", "noopener,noreferrer") },
          });
        }
      }
      return;
    }

    await carregar();
    {
      const wa = montarMensagemWhatsApp(resultado.tel!, nomeCompleto, resultado.senha!, false);
      const primeiroNome = nomeCompleto.split(" ")[0];
      if (wa.url) {
        setDialogAcesso({
          open: true,
          primeiroNome,
          telefone: resultado.tel,
          senha: resultado.senha!,
          url: wa.url,
          acao: "criado",
        });
      } else {
        toast.success(`Acesso criado para ${primeiroNome}! Senha: ${resultado.senha} (envie manualmente)`, { duration: 20000 });
      }
    }
  }

  // ── Reenviar / Resetar ─────────────────────────────────────────────────────

  async function handleReenviar() {
    if (!acesso) {
      toast.error("Acesso ainda não carregou. Aguarde um instante e tente novamente.");
      return;
    }
    toast.info(`Reenviando acesso para ${nomeCompleto.split(" ")[0]}…`, { duration: 4000 });
    setAgindo(true);
    const resultado = await reenviarAcessoPessoa({
      userId:       acesso.userId,
      pessoaId,
      nomeCompleto,
      telefone:     acesso.telefone || telefone,
    });
    setAgindo(false);
    await carregar();

    if (!resultado.ok) {
      toast.error(resultado.erro ?? "Erro ao reenviar acesso.");
      return;
    }

    const primeiroNome = nomeCompleto.split(" ")[0];

    if (resultado.tel) {
      const wa = montarMensagemWhatsApp(resultado.tel, nomeCompleto, resultado.senha!, true);
      if (wa.url) {
        setDialogAcesso({
          open: true,
          primeiroNome,
          telefone: resultado.tel,
          senha: resultado.senha!,
          url: wa.url,
          acao: "reenviado",
        });
      } else {
        toast.success(`Nova senha: ${resultado.senha} (envie manualmente)`, { duration: 20000 });
      }
    } else {
      toast.success(
        `Nova senha: ${resultado.senha}  (sem telefone — copie e envie manualmente)`,
        { duration: 20000 }
      );
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const status: StatusAcesso = acesso?.status ?? "sem_acesso";
  const cfg = STATUS_CONFIG[status];
  const Icone = cfg.icone;

  if (carregando) {
    return (
      <Card className="rounded-2xl shadow border-dashed">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Verificando acesso...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card className="rounded-2xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Acesso ao Sistema
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Status atual */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`gap-1.5 text-xs ${cfg.cor}`}>
            <Icone className="w-3 h-3" />
            {cfg.label}
          </Badge>
          {acesso && (
            <span className="text-xs text-muted-foreground">
              Login: {formatarTelefone(acesso.telefone || telefone || "") || "—"}
            </span>
          )}
        </div>

        {/* Sem acesso → formulário de criação */}
        {status === "sem_acesso" && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil de acesso</Label>
              <Select value={role} onValueChange={(v) => setRole(v as RoleOption)} disabled={criando}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Enum app_role após migration Fase C: voluntario, lideranca, secretaria, pastor, admin */}
                  <SelectItem value="voluntario">Voluntário</SelectItem>
                  <SelectItem value="lideranca">Liderança</SelectItem>
                  <SelectItem value="secretaria">Secretaria</SelectItem>
                  <SelectItem value="pastor">Pastor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!telefone && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                ⚠️ Cadastre um telefone antes de criar o acesso.
              </p>
            )}

            <Button
              size="sm"
              onClick={handleCriarAcesso}
              disabled={criando || !telefone}
              className="w-full gap-2"
            >
              {criando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Criando...</>
                : <><UserPlus className="w-4 h-4" /> Criar acesso e enviar WhatsApp</>
              }
            </Button>
          </div>
        )}

        {/* Com acesso → ações */}
        {status !== "sem_acesso" && acesso && (
          <div className="flex gap-2 flex-wrap">
            {/* Reenviar */}
            <Button
              variant="outline" size="sm"
              onClick={handleReenviar}
              disabled={agindo}
              className="gap-1.5 text-xs flex-1"
            >
              {agindo
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
              Reenviar acesso
            </Button>

            {/* Resetar senha */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline" size="sm"
                  disabled={agindo}
                  className="gap-1.5 text-xs flex-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Resetar senha
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Uma nova senha será gerada e o usuário precisará trocá-la no próximo login.
                    A nova senha será enviada via WhatsApp.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReenviar}
                    className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <KeyRound className="w-4 h-4" /> Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* WhatsApp direto */}
            {(acesso.telefone || telefone) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  const tel = (acesso.telefone || telefone!).replace(/\D/g, "");
                  window.open(`https://wa.me/${normalizarTelefone(tel)}`, "_blank", "noopener,noreferrer");
                }}
                className="gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Abrir WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>

      <AcessoEnviadoDialog
        open={dialogAcesso.open}
        onClose={() => setDialogAcesso({ ...dialogAcesso, open: false })}
        primeiroNome={dialogAcesso.primeiroNome}
        telefone={dialogAcesso.telefone}
        senha={dialogAcesso.senha}
        urlWhatsApp={dialogAcesso.url}
        acao={dialogAcesso.acao}
      />
    </>
  );
}
