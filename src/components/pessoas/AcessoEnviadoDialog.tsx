// AcessoEnviadoDialog.tsx — Modal pós reset/criação de acesso.
// Mostra telefone, senha e botão WhatsApp clicável (gesto humano direto).
import { useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  primeiroNome: string;
  telefone: string;
  senha: string;
  urlWhatsApp: string;
  acao: "criado" | "reenviado";
}

export function AcessoEnviadoDialog({
  open, onClose, primeiroNome, telefone, senha, urlWhatsApp, acao,
}: Props) {
  useEffect(() => {
    if (open && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(senha).catch(() => {});
    }
  }, [open, senha]);

  function copiar(texto: string, label: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(texto).then(
      () => toast.success(`${label} copiado!`),
      () => toast.error("Falha ao copiar"),
    );
  }

  function abrirWhatsApp() {
    window.open(urlWhatsApp, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>✅ Acesso {acao} para {primeiroNome}</DialogTitle>
          <DialogDescription>
            Envie estas credenciais via WhatsApp. A senha já foi copiada para sua área de transferência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Telefone (login)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded select-all">
                {telefone}
              </code>
              <Button variant="outline" size="icon" onClick={() => copiar(telefone, "Telefone")} title="Copiar telefone">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Senha temporária
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-base font-semibold bg-amber-50 border border-amber-200 px-3 py-2 rounded select-all">
                {senha}
              </code>
              <Button variant="outline" size="icon" onClick={() => copiar(senha, "Senha")} title="Copiar senha">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="sm:flex-1">
            Fechar
          </Button>
          <Button
            onClick={abrirWhatsApp}
            className="sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
