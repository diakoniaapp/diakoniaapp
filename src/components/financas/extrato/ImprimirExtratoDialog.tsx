// ─── ImprimirExtratoDialog — escolher o modelo (e os campos) antes de gerar o PDF ────────────────────────────────────────────────────────────────────────────
// Quatro modelos prontos (Tesouraria, Contabilidade, Diretoria, Simplificado) e a escolha campo a campo; mexer em um campo vira "Personalizado". A escolha fica guardada neste navegador.
// Valor e situação saem sempre, e o selo de "quitada por terceiro"/"reembolso" também: o que mais importa no papel não é opcional.
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CAMPOS_DE_IMPRESSAO, MODELOS_DE_IMPRESSAO, modeloDosCampos, perfilDoModelo, type CampoDeImpressao, type ModeloDeImpressao, type PerfilDeImpressao,
} from "@/lib/perfilDeImpressaoDoExtrato";

export function ImprimirExtratoDialog({ aberto, onFechar, perfil, onMudar, onImprimir }: {
  aberto: boolean; onFechar: () => void; perfil: PerfilDeImpressao; onMudar: (p: PerfilDeImpressao) => void; onImprimir: () => void;
}) {
  const alternar = (campo: CampoDeImpressao) => {
    const campos = { ...perfil.campos, [campo]: !perfil.campos[campo] };
    onMudar({ modelo: modeloDosCampos(campos), campos });
  };
  const modelos = Object.entries(MODELOS_DE_IMPRESSAO) as [Exclude<ModeloDeImpressao, "personalizado">, (typeof MODELOS_DE_IMPRESSAO)[keyof typeof MODELOS_DE_IMPRESSAO]][];
  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Imprimir extrato</DialogTitle>
          <DialogDescription>Escolha o modelo e ajuste o que sai no papel. Valor e situação saem sempre.</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Modelo" className="flex flex-wrap gap-1.5">
          {modelos.map(([chave, m]) => (
            <button key={chave} type="button" role="radio" aria-checked={perfil.modelo === chave} onClick={() => onMudar(perfilDoModelo(chave))}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${perfil.modelo === chave ? "border-gold bg-gold font-semibold text-gold-foreground" : "bg-card hover:bg-muted"}`}>
              {m.rotulo}
            </button>
          ))}
          <span aria-hidden={perfil.modelo !== "personalizado"} className={`rounded-full border px-3 py-1 text-sm ${perfil.modelo === "personalizado" ? "border-gold bg-gold font-semibold text-gold-foreground" : "border-dashed text-muted-foreground"}`}>Personalizado</span>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">{perfil.modelo === "personalizado" ? "Os campos abaixo não coincidem com nenhum modelo." : MODELOS_DE_IMPRESSAO[perfil.modelo].descricao}</p>

        <fieldset className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          <legend className="sr-only">Campos do papel</legend>
          {CAMPOS_DE_IMPRESSAO.map(c => (
            <label key={c.campo} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-gold" checked={perfil.campos[c.campo]} onChange={() => alternar(c.campo)} />
              <span>{c.rotulo}{c.soExcecao && <span className="text-muted-foreground">*</span>}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">* só aparece na obrigação em que não foi a igreja quem pagou (terceiro ou reembolso).</p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button variant="gold" className="gap-1.5" onClick={onImprimir}><Printer className="h-4 w-4" /> Gerar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
