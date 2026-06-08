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
    // Abre janela em branco sincronamente para evitar bloqueio de pop-up
    const waWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
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
      if (waWindow && !waWindow.closed && wa.url) {
        try { waWindow.location.href = wa.url; } catch { /* ignore */ }
        setTimeout(() => {
          try {
            if (waWindow.location.href === "about:blank" || waWindow.document.body.children.length === 0) {
              waWindow.document.open();
              waWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diakonia — Acesso ${primeiroNome}</title><style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:24px;background:#faf7f2}.card{background:white;padding:24px;border-radius:12px;margin-bottom:16px}.val{font-family:monospace;background:#fff7ed;padding:8px 12px;border-radius:6px;display:inline-block;user-select:all}a.btn{display:block;background:#25D366;color:white;padding:18px;border-radius:12px;text-align:center;font-size:18px;font-weight:600;text-decoration:none;margin-top:16px}</style></head><body><h1>📲 Acesso criado para ${primeiroNome}</h1><div class="card"><p>Telefone: <span class="val">${resultado.tel}</span></p><p>Senha: <span class="val">${resultado.senha}</span></p></div><a class="btn" href="${wa.url}" target="_blank">💬 Abrir WhatsApp</a></body></html>`);
              waWindow.document.close();
            }
          } catch {}
        }, 800);
        toast.success(`Acesso criado para ${primeiroNome}! WhatsApp aberto.`);
      } else if (wa.url) {
        toast.success(`Acesso criado para ${primeiroNome}!`, {
          duration: 20000,
          action: {
            label: "Abrir WhatsApp",
            onClick: () => window.open(wa.url!, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        if (waWindow && !waWindow.closed) waWindow.close();
        toast.success(`Acesso criado para ${primeiroNome}! (sem telefone — envie senha manualmente: ${resultado.senha})`, { duration: 20000 });
      }
    }
  }

  // ── Reenviar / Resetar ─────────────────────────────────────────────────────

  async function handleReenviar() {
    if (!acesso) return;

    // ⚡ CRÍTICO: abre uma janela em branco SINCRONAMENTE no gesto do user.
    // Depois do await, mudar location dessa janela NÃO é bloqueado pelo browser.
    // Se o user já permitiu pop-ups, vamos direto pro wa.me com a senha quando chegar.
    const waWindow = window.open("about:blank", "_blank", "noopener,noreferrer");

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
      if (waWindow && !waWindow.closed) waWindow.close();
      toast.error(resultado.erro ?? "Erro ao reenviar acesso.");
      return;
    }

    const primeiroNome = nomeCompleto.split(" ")[0];

    if (resultado.tel) {
      // Monta URL SEM abrir janela nova — usa a janela waWindow já aberta no clique.
      const wa = montarMensagemWhatsApp(resultado.tel, nomeCompleto, resultado.senha!, true);

      if (waWindow && !waWindow.closed && wa.url) {
        // Estratégia tripla: location.href → HTML inline fallback → toast com action
        let navegou = false;
        try {
          waWindow.location.href = wa.url;
          navegou = true;
        } catch (e) {
          console.warn("[AcessoCard] location.href falhou:", e);
        }

        // Fallback: se em 800ms ainda for about:blank, escrever HTML com link
        setTimeout(() => {
          try {
            const stillBlank = waWindow.location.href === "about:blank" ||
              waWindow.document.body.children.length === 0;
            if (stillBlank) {
              waWindow.document.open();
              waWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diakonia — Acesso ${primeiroNome}</title><style>
                body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:24px;background:#faf7f2;color:#2a1810}
                h1{color:#b45309;margin:0 0 16px}
                .card{background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px}
                .label{font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
                .val{font-size:18px;font-weight:600;font-family:ui-monospace,monospace;background:#fff7ed;padding:8px 12px;border-radius:6px;display:inline-block;margin-bottom:12px;user-select:all}
                a.btn{display:block;background:#25D366;color:white;padding:18px;border-radius:12px;text-align:center;font-size:18px;font-weight:600;text-decoration:none;margin-top:24px}
                a.btn:hover{background:#1ea952}
                p{line-height:1.6}
              </style></head><body>
                <h1>📲 Acesso reenviado para ${primeiroNome}</h1>
                <div class="card">
                  <div class="label">Telefone (login)</div>
                  <div class="val">${resultado.tel}</div>
                  <div class="label">Senha temporária</div>
                  <div class="val">${resultado.senha}</div>
                </div>
                <a class="btn" href="${wa.url}" target="_blank" rel="noopener">💬 Abrir WhatsApp com a mensagem</a>
                <p style="margin-top:20px;color:#78716c;font-size:13px">A senha já foi copiada para sua área de transferência. Cole-a no WhatsApp se preferir digitar manualmente.</p>
              </body></html>`);
              waWindow.document.close();
              try { navigator.clipboard.writeText(resultado.senha || ""); } catch {}
            }
          } catch (e) {
            console.warn("[AcessoCard] HTML fallback falhou:", e);
          }
        }, 800);

        toast.success(`Acesso reenviado para ${primeiroNome}!`);
      } else if (wa.url) {
        // Janela inicial foi bloqueada — toast com action clicável.
        toast.success(`Acesso reenviado para ${primeiroNome}!`, {
          duration: 20000,
          action: {
            label: "Abrir WhatsApp",
            onClick: () => window.open(wa.url!, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.success(`Nova senha: ${resultado.senha} (envie manualmente)`, { duration: 20000 });
      }
    } else {
      if (waWindow && !waWindow.closed) waWindow.close();
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
  );
}
