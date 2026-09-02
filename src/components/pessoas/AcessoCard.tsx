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
  aguardando: { label: "Aguardando 1º acesso",    cor: "text-warning-text border-warning-line",  icone: RefreshCw  },
  ativo:      { label: "Ativo",                   cor: "text-success-text border-success-line",  icone: ShieldCheck },
};

// Roles disponíveis para convite, em ordem de menor → maior privilégio
//
// `diakonia` ("Pastor titular") vem depois de `pastor` porque alcança mais:
// medido em 26/08/2026, `pastor` sozinho não enxerga famílias, vínculos,
// visitas, histórico de membresia nem acompanhamento de visitante — e
// `diakonia` enxerga. Ver o comentário em `types/usuario.ts`.
const ROLES_CONVITE: RoleOption[] = ["membro", "voluntario", "lideranca", "secretaria", "tesouraria", "pastor", "admin"];

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

  /**
   * Papel escolhido no menu, ainda NÃO confirmado.
   *
   * Antes, clicar em "Liderança" no menu já criava o convite no banco e abria
   * o WhatsApp na mesma batida — sem tela nenhuma no meio. Quem quisesse
   * conferir a ficha antes de conceder acesso não tinha onde parar, e escolher
   * o papel errado por um milímetro de mouse virava convite enviado.
   */
  const [confirmando, setConfirmando] = useState<{ role: RoleOption; motivo: "novo" | "reenvio" } | null>(null);

  /**
   * Convite criado, esperando ser enviado.
   *
   * Gerar e enviar viraram dois momentos. O link fica aqui, com botão para
   * abrir o WhatsApp e botão para copiar — porque nem todo convite sai por
   * WhatsApp, e abrir uma aba sozinho tira da pessoa a decisão de quando
   * mandar.
   */
  const [convitePronto, setConvitePronto] = useState<{ url: string; expira: string; mensagem: string; role: RoleOption } | null>(null);

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

    // A aba do WhatsApp NÃO abre aqui. O convite existe; enviar é o passo
    // seguinte, e quem decide é quem está na tela.
    setConvitePronto({ url, expira, mensagem, role });

    toast.success(`Convite criado para ${primeiroNome} como ${ROLE_LABEL[role]}. Link copiado.`);

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
              <p className="text-xs text-warning-text">
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
                {/* Escolher no menu não cria nada: abre a confirmação. */}
                {ROLES_CONVITE.map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setConfirmando({ role: r, motivo: "novo" })}>
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
                <DropdownMenuItem onClick={() => setConfirmando({ role: (roleAtual ?? "voluntario") as RoleOption, motivo: "reenvio" })}>
                  <Send className="w-3.5 h-3.5 mr-2" /> Reenviar link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfirmReset(true)} className="text-warning-text focus:text-warning-text">
                  <KeyRound className="w-3.5 h-3.5 mr-2" /> Resetar senha
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mudar perfil</DropdownMenuLabel>
                {ROLES_CONVITE.filter(r => r !== roleAtual).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setConfirmando({ role: r, motivo: "reenvio" })}>
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
                className="gap-1.5 text-xs text-success-text hover:text-success-text hover:bg-success-soft"
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
              O link antigo deixa de valer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setConfirmando({ role: (roleAtual ?? "voluntario") as RoleOption, motivo: "reenvio" })}
              className="gap-2 bg-warning hover:bg-warning text-white"
            >
              <KeyRound className="w-4 h-4" /> Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 1. Confirmar ANTES de criar ──────────────────────────────────
          O menu escolhe; esta tela concede. Entre uma coisa e outra cabe
          conferir de quem se trata e que permissão está sendo dada — que era
          exatamente o que não existia quando o clique no menu já criava o
          convite e abria o WhatsApp. */}
      <AlertDialog open={!!confirmando} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmando?.motivo === "reenvio" ? "Gerar novo convite?" : "Conceder acesso ao sistema?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>{nomeCompleto}</strong> vai poder entrar no sistema como{" "}
                  <strong>{confirmando ? ROLE_LABEL[confirmando.role] : ""}</strong>.
                </p>
                {telefone && (
                  <p className="text-muted-foreground">
                    O convite será preparado para {formatarTelefone(telefone)}.
                  </p>
                )}
                {/* Admin é o único que administra outros acessos. Dizer isso na
                    hora, e não num manual, é o que separa o clique certo do
                    clique de um milímetro para o lado. */}
                {confirmando?.role === "admin" && (
                  <p className="text-warning-text bg-warning-soft border border-warning-line rounded px-2 py-1.5 text-xs">
                    Administrador enxerga o sistema inteiro e pode conceder acesso a
                    outras pessoas.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Nada é enviado agora: o link aparece na tela seguinte, para você
                  mandar quando quiser.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
              onClick={() => {
                const escolha = confirmando;
                setConfirmando(null);
                if (escolha) gerarConvite(escolha.role, escolha.motivo);
              }}
            >
              <UserPlus className="w-4 h-4" /> Gerar convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 2. Convite criado: enviar é escolha, não consequência ──────── */}
      <AlertDialog open={!!convitePronto} onOpenChange={(o) => !o && setConvitePronto(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Convite criado</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {nomeCompleto.split(" ")[0]} como{" "}
                  <strong>{convitePronto ? ROLE_LABEL[convitePronto.role] : ""}</strong>.
                  {" "}Válido até {convitePronto?.expira}.
                </p>
                <p className="text-xs text-muted-foreground">
                  O link já está na área de transferência.
                </p>
                {/* A mensagem inteira à vista antes de sair. Ela leva o nome da
                    pessoa e um link que dá acesso ao sistema da igreja: é o tipo
                    de texto que se lê antes de mandar, não depois. */}
                <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-sans">
                  {convitePronto?.mensagem}
                </pre>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="sm:mr-auto">Fechar</AlertDialogCancel>
            <Button
              type="button" variant="outline" className="gap-2"
              onClick={() => {
                if (!convitePronto) return;
                try { navigator.clipboard.writeText(convitePronto.url); toast.info("Link copiado!"); } catch {}
              }}
            >
              <KeyRound className="w-4 h-4" /> Copiar link
            </Button>
            <Button
              type="button" className="gap-2"
              onClick={() => {
                if (!convitePronto) return;
                const wa = telefone
                  ? `https://wa.me/${normalizarTelefone(telefone)}?text=${encodeURIComponent(convitePronto.mensagem)}`
                  : `https://wa.me/?text=${encodeURIComponent(convitePronto.mensagem)}`;
                window.open(wa, "_blank", "noopener,noreferrer");
                setConvitePronto(null);
              }}
            >
              <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
