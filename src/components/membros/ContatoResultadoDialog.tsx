import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

const OPCOES = [
  { valor: "Não respondeu",           emoji: "📵" },
  { valor: "Respondeu",               emoji: "✅" },
  { valor: "Conversou brevemente",    emoji: "💬" },
  { valor: "Demonstrou interesse",    emoji: "🌟" },
  { valor: "Pediu para não contatar", emoji: "🚫" },
] as const;

type Opcao = (typeof OPCOES)[number]["valor"];

interface Props {
  open:             boolean;
  onOpenChange:     (v: boolean) => void;
  nomeVisitante:    string;
  saving:           boolean;
  onConfirm:        (tipo: string, observacao: string) => Promise<void>;
}

export default function ContatoResultadoDialog({
  open,
  onOpenChange,
  nomeVisitante,
  saving,
  onConfirm,
}: Props) {
  const [selecionado, setSelecionado] = useState<Opcao | null>(null);
  const [observacao, setObservacao]   = useState("");

  const primeiro = nomeVisitante.split(" ")[0] || nomeVisitante;

  const handleConfirm = async () => {
    if (!selecionado) return;
    await onConfirm(selecionado, observacao.trim());
    handleReset();
  };

  const handleReset = () => {
    setSelecionado(null);
    setObservacao("");
  };

  const handleClose = () => {
    if (saving) return;
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-base">
            O que aconteceu com {primeiro}?
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registre o resultado para que a equipe saiba o contexto.
          </DialogDescription>
        </DialogHeader>

        {/* Opções rápidas */}
        <div className="grid gap-2 py-1">
          {OPCOES.map((op) => {
            const ativo = selecionado === op.valor;
            return (
              <button
                key={op.valor}
                type="button"
                onClick={() => setSelecionado(op.valor as Opcao)}
                className={[
                  "flex items-center gap-3 w-full rounded-lg border px-4 py-2.5 text-sm text-left transition-colors",
                  ativo
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:border-primary/40 hover:bg-muted/50",
                ].join(" ")}
              >
                <span className="text-base leading-none" aria-hidden>{op.emoji}</span>
                <span>{op.valor}</span>
                {ativo && (
                  <CheckCircle2 className="w-4 h-4 ml-auto text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Observação opcional */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Observação{" "}
            <span className="font-normal">(opcional)</span>
          </label>
          <Textarea
            placeholder="Ex: vai tentar vir no próximo domingo..."
            className="resize-none text-base md:text-sm"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleConfirm}
            disabled={!selecionado || saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {saving ? "Salvando..." : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
