// AcessoEnviadoDialog.tsx — Modal pós reset/criação de acesso
// Mostra telefone, senha gerada e botão WhatsApp clicável (gesto direto).
import { useEffect } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  primeiroNome: string;
  telefone: string;        // telefone limpo (com DDI 55)
  senha: string;
  urlWhatsApp: string;
  acao: "criado" | "reenviado";
}

export function AcessoEnviadoDialog({
  open, onClose, primeiroNome, telefone, senha, urlWhatsApp, acao,
}: Props) {
  // Copia senha pro clipboard ao abrir (útil pra colar depois no WhatsApp se preferir)
  useEffect(() => {
    if (open && navigator.clipboard) {
      navigator.clipboard.writeText(senha).catch(() => {});
    }
  }, [open, senha]);

  function copiar(texto: string, label: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(texto).then(
      () => toast.success(`${label} copiado!`),
      () => toast.error("Falha ao copiar"),
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            ✅ Acesso {acao} para {primeiroNome}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Envie estas credenciais via WhatsApp. A senha já foi copiada para sua área de transferência.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Telefone (login)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded select-all">{telefone}</code>
              <Button variant="outline" size="icon" onClick={() => copiar(telefone, "Telefone")} title="Copiar telefone">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Senha temporária</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-base font-semibold bg-amber-50 border border-amber-200 px-3 py-2 rounded select-all">{senha}</code>
              <Button variant="outline" size="icon" onClick={() => copiar(senha, "Senha")} title="Copiar senha">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Fechar
          </Button>
          <AlertDialogAction asChild>
            <a
              href={urlWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-semibold flex-1"
            >
              <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
            </a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
