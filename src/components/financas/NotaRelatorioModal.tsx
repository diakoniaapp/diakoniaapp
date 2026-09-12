// ─── NotaRelatorioModal.tsx ──────────────────────────────────────────────
//
// Fase 4 do projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
// §8.4) — o modal que abre a partir do ícone 💬 da futura tela de
// Prestação de Contas Trimestral (Fase 5). Autocontido: carrega a nota
// existente da linha (categoria × centro × mês) ao abrir, e salva via
// relatorioNotasService — nenhuma tela ainda o invoca.
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  buscarNota, salvarNota, type FinRelatorioNota,
} from "@/services/relatorioNotasService";

interface NotaRelatorioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ex.: "Sustento Pastoral · Junho/2026" — quem chama monta o rótulo, o modal não sabe nomes de categoria/centro. */
  titulo: string;
  ano: number;
  mes: number;
  categoriaId?: string | null;
  centroCustoId?: string | null;
  onSalvo?: () => void;
}

export function NotaRelatorioModal({
  open, onOpenChange, titulo, ano, mes,
  categoriaId = null, centroCustoId = null, onSalvo,
}: NotaRelatorioModalProps) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [notaExistente, setNotaExistente] = useState<FinRelatorioNota | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (!open) return;
    setCarregando(true);
    buscarNota(ano, mes, categoriaId, centroCustoId)
      .then(n => { setNotaExistente(n); setTexto(n?.nota ?? ""); })
      .catch(() => toast.error("Não foi possível carregar a nota deste período."))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ano, mes, categoriaId, centroCustoId]);

  async function onSalvar() {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      await salvarNota({
        id: notaExistente?.id,
        ano, mes, categoriaId, centroCustoId,
        nota: texto.trim(),
      });
      toast.success("Nota salva.");
      onOpenChange(false);
      onSalvo?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a nota.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Nota — {titulo}</DialogTitle>
          <DialogDescription>
            Contexto que explica um número fora do padrão — vai junto quando o
            trimestre for exportado para a diretoria.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <Textarea
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: Abril e Maio com impacto do Dissídio; Junho com adiantamento de salário..."
              autoFocus
            />
            {notaExistente && (
              <p className="text-xs text-muted-foreground">
                Última edição: {new Date(notaExistente.updated_at).toLocaleString("pt-BR")}
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={onSalvar} disabled={carregando || salvando || !texto.trim()} className="gap-1.5">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
