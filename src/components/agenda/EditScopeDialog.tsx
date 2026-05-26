import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type EditScope = "este" | "futuros" | "serie";

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (s: EditScope) => void;
  action?: "editar" | "cancelar" | "mover";
}

export function EditScopeDialog({ open, onClose, onChoose, action = "editar" }: Props) {
  const verbo = action === "cancelar" ? "cancelar" : action === "mover" ? "mover" : "alterar";
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">O que deseja {verbo}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={() => onChoose("este")}>
            Apenas este evento
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => onChoose("futuros")}>
            Este e os próximos
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => onChoose("serie")}>
            Toda a série
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}