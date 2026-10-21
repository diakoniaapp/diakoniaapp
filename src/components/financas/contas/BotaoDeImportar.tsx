// ─── BotaoDeImportar — A porta única para trazer um arquivo para a conta ───────────────────────────────────────────────────────────────────────────────
// 21/10/2026 (análise da redundância Importações × Importar OFX): o mesmo diálogo tinha três portas (cabeçalho do Extrato, aba Conciliação e aba Importações). Agora há UM botão no cabeçalho
// da conta, em qualquer aba: "Importar OFX" na conta de banco, "Importar fatura" no cartão (as outras contas não importam arquivo). Quem o desenha dá o `onSaved` para recarregar o que estiver na tela.
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { ImportacaoFaturaDialog } from "@/components/financas/ImportacaoFaturaDialog";
import type { FinContaTipo } from "@/services/finService";

/** Só banco (OFX) e cartão (fatura) importam arquivo. */
export const importaArquivo = (tipo: FinContaTipo | undefined) => tipo === "banco" || tipo === "cartao";

export function BotaoDeImportar({ contaId, contaNome, tipo, onSaved, compacto }: {
  contaId: string; contaNome: string; tipo: FinContaTipo | undefined; onSaved?: () => void;
  /** celular: só o ícone (o texto aparece a partir de `sm`) */
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  if (!importaArquivo(tipo)) return null;
  const banco = tipo === "banco";
  const rotulo = banco ? "Importar OFX" : "Importar fatura";
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)} title={rotulo} aria-label={rotulo}
        className={`gap-1.5 ${compacto ? "w-8 px-0 sm:w-auto sm:px-3" : ""}`}>
        <FileUp className="h-3.5 w-3.5" /> <span className={compacto ? "hidden sm:inline" : ""}>{rotulo}</span>
      </Button>
      {banco
        ? <ConciliacaoOFXDialog open={aberto} onOpenChange={setAberto} contaId={contaId} contaNome={contaNome} onSaved={() => onSaved?.()} />
        : <ImportacaoFaturaDialog open={aberto} onOpenChange={setAberto} contaId={contaId} contaNome={contaNome} onSaved={() => onSaved?.()} />}
    </>
  );
}
