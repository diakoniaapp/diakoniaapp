// ─── AcessoCard.tsx — Bloco de acesso na ficha de uma Pessoa ─────────────────
//
// A4: substituiu Switch + Select + Botão por um botão único "Convidar como..."
// com dropdown de roles, e ações dentro de um menu coeso quando já há acesso.
//
// Fluxos:
//   • Sem acesso  → Botão "Convidar como ▾" abre dropdown com roles
//   • Aguardando  → Badge "Aguardando 1º acesso" + dropdown "Ações ▾"
//   • Ativo       → Badge "Ativo (role)" + dropdown "Ações ▾"

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound, MessageCircle, RefreshCw, Send,
  ShieldCheck, ShieldOff, UserPlus, ChevronDown,
} from "lucide-react";

import {
  buscarAcessoPorPessoa,
  type AcessoPessoa,
  type StatusAcesso,
} from "@/services/acessoService";
import { ROLE_LABEL, type RoleOption } from "@/types/usuario";
import { formatarTelefone, normalizarTelefone } from "@/lib/telefone";
import { supabase } from "@/integrations/supabase/client";

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusAcesso, { label: string; cor: string; icone: typeof ShieldCheck }> = {
  sem_acesso: { label: "Sem acesso",              cor: "text-slate-500 border-slate-300",  icone: ShieldOff  },
  aguardando: { label: "Aguardando 1º acesso",    cor: "text-amber-600 border-amber-400",  icone: RefreshCw  },
  ativo:      { label: "Ativo",                   cor: "text-green-600 border-green-400",  icone: ShieldCheck },
};

// Roles disponíveis para convite, em ordem de menor → maior privilégio
const ROLES_CONVITE: RoleOption[] = ["voluntario", "lideranca", "secretaria", "pastor", "admin"];

interface AcessoCardProps {
  pessoaId:     string;
  nomeCompleto: string;
  telefone:     string | null;
}

export function AcessoCard({ pessoaId, nomeCompleto, telefone }: AcessoCardProps) {
  const [acesso,     setAcesso]     = useState<AcessoPessoa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agindo,     setAgindo]     = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function carregar() {
    setCarregando(true);
    const dados = await buscarAcessoPorPessoa(pessoaId);
    setAcesso(dados);
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [pessoaId]);

  // ── Lógica única de gerar convite + abrir WhatsApp ───────────────────────
  async function gerarConvite(role: RoleOption, motivo: "novo" | "reenvio") {
    if (!pessoaId) { toast.error("ID da pessoa não encontrado"); return; }

    setAgindo(true);
    let data: any = null, error: any = null;
    try {
      const r = await supabase.rpc("criar_convite_acesso", {
        p_pessoa_id: pessoaId,
        p_role:      role,
      });
      data = r.data; error = r.error;
    } catch (e: any) {
      error = e;
    } finally {
      setAgindo(false);
    }

    if (error || !data || data.length === 0) {
      toast.error(error?.message ?? "Erro ao gerar convite");
      return;
    }

    const tokenRow = data[0] as { token: string; expires_at: string };
    const url = `${window.location.origin}/convite/${tokenRow.token}`;
    const expira = new Date(tokenRow.expires_at).toLocaleDateString("pt-BR");
    const primeiroNome = nomeCompleto.split(" ")[0];

    const titulo = motivo === "novo"
      ? `*Diakonia — Convite de acesso*`
      : `*Diakonia — Novo convite de acesso*`;
    const corpo = motivo === "novo"
      ? [`Olá, ${primeiroNome}!`, `Você foi convidada(o) a acessar o sistema da igreja como *${ROLE_LABEL[role]}*.`]
      : [`Olá, ${primeiroNome}!`, `Aqui está seu novo link para entrar:`];

    const mensagem = [
      titulo, ``,
      ...corpo, ``,
      `Crie sua senha em:`, url, ``,
      `Link válido até ${expira}.`,
    ].join("\n");

    try { await navigator.clipboard.writeText(url); } catch {}

    const waUrl = telefone
      ? `https://wa.me/${(telefone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    toast.success(
      `Convite ${motivo === "novo" ? "criado" : "reenviado"} para ${primeiroNome} como ${ROLE_LABEL[role]}. Link copiado.`,
      {
        duration: 12000,
        action: { label: "Copiar link", onClick: () => { try { navigator.clipboard.writeText(url); toast.info("Link copiado!"); } catch {} } },
      }
    );

    await carregar();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <Card className="rounded-2xl shadow border-dashed">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Verificando acesso...
        </CardContent>
      </Card>
    );
  }

  const status: StatusAcesso = acesso?.status ?? "sem_acesso";
  const cfg = STATUS_CONFIG[status];
  const Icone = cfg.icone;
  const roleAtual = acesso?.role as RoleOption | undefined;

  return (
    <Card className="rounded-2xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Acesso ao Sistema
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Status atual */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`gap-1.5 text-xs ${cfg.cor}`}>
            <Icone className="w-3 h-3" />
            {cfg.label}
            {roleAtual && status !== "sem_acesso" && <> · {ROLE_LABEL[roleAtual] ?? roleAtual}</>}
          </Badge>
          {acesso && (
            <span className="text-xs text-muted-foreground">
              Login: {formatarTelefone(acesso.telefone || telefone || "") || "—"}
            </span>
          )}
        </div>

        {/* Sem acesso → botão único "Convidar como" */}
        {status === "sem_acesso" && (
          <div className="space-y-2">
            {!telefone && (
              <p className="text-xs text-amber-600">
                ⚠️ Cadastre um telefone antes de convidar.
              </p>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  disabled={agindo || !telefone}
                  className="w-full gap-2"
                >
                  {agindo
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Enviando...</>
                    : <><UserPlus className="w-4 h-4" /> Convidar como… <ChevronDown className="w-3.5 h-3.5 ml-auto" /></>
                  }
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Perfil de acesso</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ROLES_CONVITE.map((r) => (
                  <DropdownMenuItem key={r} onClick={() => gerarConvite(r, "novo")}>
                    {ROLE_LABEL[r]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Com acesso → menu de ações */}
        {status !== "sem_acesso" && acesso && (
          <div className="flex gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={agindo}
                  className="gap-1.5 text-xs flex-1"
                >
                  {agindo
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                  }
                  Ações de acesso
                  <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Convite</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => gerarConvite((roleAtual ?? "voluntario") as RoleOption, "reenvio")}>
                  <Send className="w-3.5 h-3.5 mr-2" /> Reenviar link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfirmReset(true)} className="text-orange-600 focus:text-orange-700">
                  <KeyRound className="w-3.5 h-3.5 mr-2" /> Resetar senha
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mudar perfil</DropdownMenuLabel>
                {ROLES_CONVITE.filter(r => r !== roleAtual).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => gerarConvite(r, "reenvio")}>
                    Promover/mover para {ROLE_LABEL[r]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* WhatsApp direto */}
            {(acesso.telefone || telefone) && (
              <Button
                type="button"
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

      {/* Confirmação de reset */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
            <AlertDialogDescription>
              Será gerado um novo link de convite mantendo o perfil atual.
              O link será copiado e o WhatsApp aberto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => gerarConvite((roleAtual ?? "voluntario") as RoleOption, "reenvio")}
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
            >
              <KeyRound className="w-4 h-4" /> Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
